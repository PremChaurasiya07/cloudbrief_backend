// src/app/api/gmail/fetch-emails/route.js

import { google } from "googleapis";
import { supabase } from "../../../../../../lib/supabase.js";
import { Buffer } from "buffer";
import { htmlToText } from "html-to-text";
import embed from "../../embedding.js";

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

// Advanced text cleaning function
function cleanText(content) {
  if (!content || typeof content !== 'string') return "";
  
  // Remove zero-width characters and other invisible Unicode characters
  content = content.replace(/[\u200B-\u200D\uFEFF\u00A0\u2028\u2029]/g, "");
  
  // Remove HTML entities that might remain
  content = content.replace(/&[#\w]+;/g, " ");
  
  // Replace multiple whitespace characters with single space
  content = content.replace(/[\s\t\r\n]+/g, " ");
  
  // Remove any remaining HTML/XML tags aggressively
  content = content.replace(/<[^>]*>/g, " ");
  
  // Remove email tracking pixels and hidden content
  content = content.replace(/\[.*?\]/g, " ");
  
  // Remove URLs that are not meaningful
  content = content.replace(/https?:\/\/[^\s]+/g, "[URL]");
  
  // Remove email addresses from content (keep meaningful text)
  content = content.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL]");
  
  // Remove excessive punctuation
  content = content.replace(/[.,;:!?]{2,}/g, ".");
  
  // Clean up remaining special characters but keep basic punctuation
  content = content.replace(/[^\w\s.,;:!?'"()-]/g, " ");
  
  // Final cleanup - normalize spaces and trim
  content = content.replace(/\s+/g, " ").trim();
  
  return content;
}

// Enhanced message extraction with better handling
function extractMessage(payload) {
  let extractedContent = "";
  
  try {
    // Direct body data (simple messages)
    if (payload?.body?.data) {
      extractedContent = decodeBase64(payload.body.data);
      return cleanText(extractedContent);
    }

    // Multi-part messages
    if (payload?.parts?.length) {
      // Priority 1: Look for text/plain
      const textPart = payload.parts.find(
        (part) => part.mimeType === "text/plain" && part.body?.data
      );
      
      if (textPart?.body?.data) {
        extractedContent = decodeBase64(textPart.body.data);
        return cleanText(extractedContent);
      }

      // Priority 2: Look for text/html and convert
      const htmlPart = payload.parts.find(
        (part) => part.mimeType === "text/html" && part.body?.data
      );
      
      if (htmlPart?.body?.data) {
        const rawHtml = decodeBase64(htmlPart.body.data);
        
        // Enhanced HTML to text conversion
        extractedContent = htmlToText(rawHtml, {
          wordwrap: false, // Don't wrap lines
          selectors: [
            // Skip common email elements
            { selector: 'style', format: 'skip' },
            { selector: 'script', format: 'skip' },
            { selector: 'noscript', format: 'skip' },
            { selector: 'head', format: 'skip' },
            { selector: '.email-signature', format: 'skip' },
            { selector: '.footer', format: 'skip' },
            { selector: '[style*="display:none"]', format: 'skip' },
            { selector: '[style*="visibility:hidden"]', format: 'skip' },
            
            // Handle links better
            { selector: 'a', options: { 
              ignoreHref: true, 
              hideLinkHrefIfSameAsText: true 
            }},
            
            // Skip images but keep alt text
            { selector: 'img', format: 'skip' },
            
            // Format tables as text
            { selector: 'table', format: 'dataTable' },
            
            // Add line breaks for block elements
            { selector: 'div', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 }},
            { selector: 'p', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 }},
            { selector: 'br', format: 'lineBreak' }
          ],
          
          // General options
          preserveNewlines: false,
          uppercaseHeadings: false,
          hideLinkHrefIfSameAsText: true,
          ignoreHref: true,
          ignoreImage: true,
          
          // Limits
          limits: {
            maxInputLength: 1000000,
            ellipsis: '...'
          }
        });
        
        return cleanText(extractedContent);
      }

      // Priority 3: Try to extract from nested parts (multipart/alternative, etc.)
      for (const part of payload.parts) {
        if (part.parts?.length) {
          const nestedContent = extractMessage(part);
          if (nestedContent.trim()) {
            return nestedContent;
          }
        }
      }
    }
  } catch (error) {
    console.error("Error extracting message content:", error);
  }

  return "";
}

// Create a unique hash for email content to prevent duplicates
function createEmailHash(messageId, from, subject, content) {
  const crypto = require('crypto');
  const uniqueString = `${messageId}-${from}-${subject}-${content.substring(0, 100)}`;
  return crypto.createHash('sha256').update(uniqueString).digest('hex');
}

// Enhanced duplicate checking
async function checkForDuplicates(messageIds, userFilter) {
  try {
    const { data: existingEntries, error } = await supabase
      .from("memory_entries")
      .select("chat_id, metadata")
      .in("chat_id", messageIds)
      .eq("user_id", userFilter.user_id)
      .eq("source", "gmail")
      .eq("type", "email");

    if (error) {
      console.error("Error checking duplicates:", error);
      return [];
    }

    return existingEntries.map(entry => entry.chat_id);
  } catch (error) {
    console.error("Error in duplicate check:", error);
    return [];
  }
}

// Main POST function
export async function POST(req) {
  try {
    const { accessToken, user_id } = await req.json();

    // Validation
    if (!accessToken || !user_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required parameters",
          message: "accessToken and user_id are required"
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Setup Gmail API
    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: accessToken,
      expiry_date: Date.now() + 3600 * 1000 * 24 * 30, // 30 days
    });

    const gmail = google.gmail({ version: "v1", auth });

    // Fetch messages with error handling
    let messagesResponse;
    try {
      messagesResponse = await gmail.users.messages.list({
        userId: "me",
        q: "is:unread",
        maxResults: 50, // Increased to get more emails
      });
    } catch (gmailError) {
      if (gmailError?.response?.status === 401) {
        return new Response(
          JSON.stringify({
            error: "AccessTokenExpired",
            message: "Gmail access token has expired. Please reconnect."
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
          totalFetched: 0
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const messageIds = messages.map(msg => msg.id);
    
    // Enhanced duplicate checking
    const existingMessageIds = await checkForDuplicates(messageIds, { user_id });
    
    console.log(`Found ${existingMessageIds.length} existing messages out of ${messageIds.length} fetched`);

    const messagesToInsert = [];
    const processedHashes = new Set(); // Additional hash-based duplicate prevention

    // Process each message
    for (const msg of messages) {
      const messageId = msg.id;

      // Skip if already exists in database
      if (existingMessageIds.includes(messageId)) {
        console.log(`Skipping existing message: ${messageId}`);
        continue;
      }

      try {
        // Get full message details
        const messageDetail = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });

        const payload = messageDetail.data.payload;
        const headers = payload?.headers || [];

        // Extract header information safely
        const getHeader = (name) => {
          const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
          return header?.value || '';
        };

        const from = getHeader("From");
        const to = getHeader("To");
        const subject = getHeader("Subject");
        const date = getHeader("Date");
        const messageIdHeader = getHeader("Message-ID");

        // Extract and clean content
        const cleanedContent = extractMessage(payload);
        
        if (!cleanedContent || cleanedContent.length < 10) {
          console.warn(`Skipping message with insufficient content: ${messageId}`);
          continue;
        }

        // Create hash for additional duplicate prevention
        const contentHash = createEmailHash(messageId, from, subject, cleanedContent);
        if (processedHashes.has(contentHash)) {
          console.log(`Skipping duplicate content hash: ${messageId}`);
          continue;
        }
        processedHashes.add(contentHash);

        // Determine read status
        const labels = messageDetail.data.labelIds || [];
        const isUnread = labels.includes("UNREAD");
        const status = isUnread ? "unread" : "read";

        // Parse date safely
        let parsedDate;
        try {
          parsedDate = date ? new Date(date).toISOString() : new Date().toISOString();
        } catch (dateError) {
          console.warn(`Invalid date format for message ${messageId}: ${date}`);
          parsedDate = new Date().toISOString();
        }

        // Prepare message for insertion
        const messageEntry = {
          user_id,
          content: cleanedContent,
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
            subject: subject,
            status: status,
            created_at: parsedDate,
            type: "email",
            source: "gmail",
            thread_id: messageDetail.data.threadId,
            label_ids: labels,
            content_hash: contentHash
          },
        };

        messagesToInsert.push(messageEntry);

      } catch (messageError) {
        console.error(`Error processing message ${messageId}:`, messageError);
        continue; // Skip this message and continue with others
      }
    }

    // Batch insert with final duplicate check
    let insertedCount = 0;
    if (messagesToInsert.length > 0) {
      console.log(`Attempting to insert ${messagesToInsert.length} new messages`);
      
      // Final duplicate check before insertion (using upsert to handle race conditions)
      const { data: insertedData, error: insertError } = await supabase
        .from("memory_entries")
        .upsert(messagesToInsert, { 
          onConflict: 'user_id,chat_id',
          ignoreDuplicates: true 
        })
        .select('id');

      if (insertError) {
        console.error("Database insertion error:", insertError);
        return new Response(
          JSON.stringify({
            error: "Failed to insert messages",
            details: insertError.message
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      insertedCount = insertedData?.length || 0;
      console.log(`Successfully inserted ${insertedCount} new messages`);
    }

    // Trigger embedding process
    try {
      await embed();
      console.log("Embedding process completed");
    } catch (embedError) {
      console.error("Error in embedding process:", embedError);
      // Don't fail the entire request if embedding fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted: insertedCount,
        totalFetched: messages.length,
        duplicatesSkipped: messages.length - messagesToInsert.length,
        message: `Successfully processed ${messages.length} emails, inserted ${insertedCount} new ones`
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unhandled error in Gmail fetch:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}