// src/app/api/gmail/fetch-emails/route.js

import { google } from "googleapis";
import { supabase } from "../../../../../../lib/supabase.js";
import { Buffer } from "buffer";
import { htmlToText } from "html-to-text";
import embed from "../../embedding.js";
import crypto from "crypto"; // Ensure crypto is imported for createEmailHash

// Decode base64 encoded message body from Gmail API
function decodeBase64(data) {
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf-8");
  } catch (error) {
    console.error("Error decoding base64:", error);
    return "";
  }
}

// Advanced text cleaning function (for embedding/search)
function cleanText(content) {
  if (!content || typeof content !== "string") return "";

  content = content.replace(/[\u200B-\u200D\uFEFF\u00A0\u2028\u2029]/g, ""); // zero-width etc.
  content = content.replace(/&[#\w]+;/g, " "); // HTML entities
  content = content.replace(/[\s\t\r\n]+/g, " "); // whitespace normalize
  content = content.replace(/<[^>]*>/g, " "); // remove HTML/XML tags aggressively
  content = content.replace(/\[.*?\]/g, " "); // remove email tracking pixels and hidden
  content = content.replace(/https?:\/\/[^\s]+/g, "[URL]"); // replace URLs with placeholder
  content = content.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL]"); // mask emails
  content = content.replace(/[.,;:!?]{2,}/g, "."); // excessive punctuation
  content = content.replace(/[^\w\s.,;:!?'"()-]/g, " "); // special chars except basic punctuation
  content = content.replace(/\s+/g, " ").trim(); // final whitespace cleanup

  return content;
}

// Enhanced message extraction (now returns both cleaned text and raw HTML)
function extractMessageAndHtml(payload) {
  let extractedContent = "";
  let rawHtmlContent = ""; // To store the original HTML

  try {
    // Direct body (simple messages)
    if (payload?.body?.data) {
      extractedContent = decodeBase64(payload.body.data);
      // If it's a simple text body, rawHtmlContent is the same
      rawHtmlContent = extractedContent;
      return { cleaned: cleanText(extractedContent), rawHtml: rawHtmlContent };
    }

    // Multi-part messages
    if (payload?.parts?.length) {
      // Priority 1: Look for text/plain
      const textPart = payload.parts.find(
        (part) => part.mimeType === "text/plain" && part.body?.data
      );
      if (textPart?.body?.data) {
        extractedContent = decodeBase64(textPart.body.data);
        // If text part exists, assume it's the primary content for cleaning
        rawHtmlContent = extractedContent; // Or find a corresponding HTML part if available
        return { cleaned: cleanText(extractedContent), rawHtml: rawHtmlContent };
      }

      // Priority 2: Look for text/html and convert
      const htmlPart = payload.parts.find(
        (part) => part.mimeType === "text/html" && part.body?.data
      );
      if (htmlPart?.body?.data) {
        rawHtmlContent = decodeBase64(htmlPart.body.data); // Store raw HTML
        extractedContent = htmlToText(rawHtmlContent, { // Convert to plain text for cleaning
          wordwrap: false,
          selectors: [
            { selector: "style", format: "skip" },
            { selector: "script", format: "skip" },
            { selector: "noscript", format: "skip" },
            { selector: "head", format: "skip" },
            { selector: ".email-signature", format: "skip" },
            { selector: ".footer", format: "skip" },
            { selector: '[style*="display:none"]', format: "skip" },
            { selector: '[style*="visibility:hidden"]', format: "skip" },
            { selector: "a", options: { ignoreHref: true, hideLinkHrefIfSameAsText: true } },
            { selector: "img", format: "skip" },
            { selector: "table", format: "dataTable" },
            { selector: "div", options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
            { selector: "p", options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
            { selector: "br", format: "lineBreak" },
          ],
          preserveNewlines: false,
          uppercaseHeadings: false,
          hideLinkHrefIfSameAsText: true,
          ignoreHref: true,
          ignoreImage: true,
          limits: { maxInputLength: 1000000, ellipsis: "..." },
        });
        return { cleaned: cleanText(extractedContent), rawHtml: rawHtmlContent };
      }

      // Nested parts fallback
      for (const part of payload.parts) {
        if (part.parts?.length) {
          const nestedResult = extractMessageAndHtml(part);
          if (nestedResult.cleaned.trim()) return nestedResult;
        }
      }
    }
  } catch (error) {
    console.error("Error extracting message content:", error);
  }

  return { cleaned: "", rawHtml: "" };
}

// Create a unique hash for email content to prevent duplicates
function createEmailHash(messageId, sender, subject, content) {
  const uniqueString = `${messageId}-${sender}-${subject}-${content.substring(0, 100)}`;
  return crypto.createHash("sha256").update(uniqueString).digest("hex");
}

// Check duplicates by chat_id for this user and source/type
async function checkForDuplicates(messageIds, user_id) {
  try {
    const { data: existingEntries, error } = await supabase
      .from("memory_entries")
      .select("chat_id")
      .in("chat_id", messageIds)
      .eq("user_id", user_id)
      .eq("source", "gmail")
      .eq("type", "email");

    if (error) {
      console.error("Error checking duplicates:", error);
      return [];
    }
    return existingEntries.map((entry) => entry.chat_id);
  } catch (error) {
    console.error("Error in duplicate check:", error);
    return [];
  }
}

export async function POST(req) {
  try {
    const { accessToken, user_id } = await req.json();

    if (!accessToken || !user_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required parameters",
          message: "accessToken and user_id are required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Setup Gmail client
    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: accessToken,
      expiry_date: Date.now() + 3600 * 1000 * 24 * 30,
    });

    const gmail = google.gmail({ version: "v1", auth });

    // Fetch unread messages
    let messagesResponse;
    try {
      messagesResponse = await gmail.users.messages.list({
        userId: "me",
        q: "is:unread",
        maxResults: 30,
      });
    } catch (gmailError) {
      if (gmailError?.response?.status === 401) {
        return new Response(
          JSON.stringify({
            error: "AccessTokenExpired",
            message: "Gmail access token has expired. Please reconnect.",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      throw gmailError;
    }

    const messages = messagesResponse.data.messages || [];
    if (messages.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No unread messages found",
          inserted: 0,
          totalFetched: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const messageIds = messages.map((m) => m.id);
    const existingMessageIds = await checkForDuplicates(messageIds, user_id);
    console.log(`Found ${existingMessageIds.length} existing messages out of ${messageIds.length} fetched`);

    const messagesToInsert = [];
    const processedHashes = new Set();

    for (const msg of messages) {
      const messageId = msg.id;
      if (existingMessageIds.includes(messageId)) {
        console.log(`Skipping existing message: ${messageId}`);
        continue;
      }

      try {
        const messageDetail = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });

        const payload = messageDetail.data.payload;
        const headers = payload?.headers || [];

        const getHeader = (name) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

        const from = getHeader("From");
        const to = getHeader("To");
        const subject = getHeader("Subject");
        const date = getHeader("Date");
        const messageIdHeader = getHeader("Message-ID");

        // Use the new function that returns both cleaned text and raw HTML
        const { cleaned: cleanedContent, rawHtml: originalHtmlContent } = extractMessageAndHtml(payload);

        if (!cleanedContent || cleanedContent.length < 10) {
          console.warn(`Skipping message with insufficient content: ${messageId}`);
          continue;
        }

        const contentHash = createEmailHash(messageId, from, subject, cleanedContent);
        if (processedHashes.has(contentHash)) {
          console.log(`Skipping duplicate content hash: ${messageId}`);
          continue;
        }
        processedHashes.add(contentHash);

        const labels = messageDetail.data.labelIds || [];
        const isUnread = labels.includes("UNREAD");
        const status = isUnread ? "unread" : "read";

        let parsedDate;
        try {
          parsedDate = date ? new Date(date).toISOString() : new Date().toISOString();
        } catch {
          parsedDate = new Date().toISOString();
        }

        // Build message entry
        const messageEntry = {
          user_id,
          content: cleanedContent, // Cleaned text for search/embedding
          raw_html: originalHtmlContent, // NEW: Store original HTML for display
          type: "email",
          source: "gmail",
          chat_id: messageId,
          sender: from,
          receiver: to,
          metadata: {
            id: messageId,
            message_id_header: messageIdHeader,
            sender: from,
            receiver: to,
            subject,
            status,
            created_at: parsedDate,
            type: "email",
            source: "gmail",
            thread_id: messageDetail.data.threadId,
            label_ids: labels,
            content_hash: contentHash,
          },
        };

        messagesToInsert.push(messageEntry);
      } catch (messageError) {
        console.error(`Error processing message ${messageId}:`, messageError);
        continue;
      }
    }

    if (messagesToInsert.length === 0) {
      return new Response(
        JSON.stringify({ message: "No new messages to insert", inserted: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Upsert all new messages in one batch
    const { data: upsertedData, error: upsertError } = await supabase
      .from("memory_entries")
      .upsert(messagesToInsert, { onConflict: 'user_id,message_unique_id', ignoreDuplicates: true }); // Changed onConflict to chat_id as it's unique per message

    if (upsertError) {
      console.error("Supabase upsert error:", upsertError);
      return new Response(
        JSON.stringify({ error: upsertError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Trigger embedding process (assuming 'embed' handles the new 'raw_html' or just uses 'content')
    try {
      await embed();
      console.log("Embedding process completed");
    } catch (embedError) {
      console.error("Error in embedding process:", embedError);
      // Don't fail the entire request if embedding fails
    }

    return new Response(
      JSON.stringify({
        message: "Messages inserted successfully",
        inserted: upsertedData?.length || 0, // Use upsertedData.length for actual inserted count
        totalFetched: messages.length,
        duplicatesSkipped: messages.length - (upsertedData?.length || 0),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unhandled error in Gmail fetch:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
