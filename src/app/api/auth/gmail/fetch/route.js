// // import { google } from "googleapis";
// // import { supabase } from "../../../../../../lib/supabase.js"; // .js extension
// // import { Buffer } from "buffer";
// // import embed from "../../embedding.js";

// // // Decode base64 encoded message body
// // function decodeBase64(data) {
// //   const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
// //   return Buffer.from(normalized, "base64").toString("utf-8");
// // }

// // // Extract the message from Gmail's payload
// // function extractMessage(payload) {
// //   if (payload?.body?.data) {
// //     return decodeBase64(payload.body.data);
// //   }

// //   if (payload?.parts?.length) {
// //     const textPart = payload.parts.find(
// //       (p) => p.mimeType === "text/plain" && p.body?.data
// //     );
// //     if (textPart?.body?.data) return decodeBase64(textPart.body.data);

// //     const htmlPart = payload.parts.find(
// //       (p) => p.mimeType === "text/html" && p.body?.data
// //     );
// //     if (htmlPart?.body?.data) {
// //       const rawHtml = decodeBase64(htmlPart.body.data);
// //       return rawHtml.replace(/<[^>]+>/g, " "); // Remove HTML tags
// //     }
// //   }

// //   return "";
// // }

// // export async function POST(req) {
// //   try {
// //     const { accessToken, user_id } = await req.json(); // only accessToken and user_id

// //     const auth = new google.auth.OAuth2();
// //     auth.setCredentials({ access_token: accessToken });

// //     const gmail = google.gmail({ version: "v1", auth });

// //     // Fetch unread Gmail messages
// //     const res = await gmail.users.messages.list({ userId: "me", q: "is:unread", maxResults: 20 });
// //     const messages = res.data.messages || [];

// //     const entriesToInsert = [];

// //     for (const msg of messages) {
// //       const messageId = msg.id;

// //       // Check if message already exists in Supabase by chat_id
// //       const { data: existing } = await supabase
// //         .from("memory_entries")
// //         .select("id")
// //         .eq("chat_id", messageId) // Checking with chat_id (Gmail message ID)
// //         .maybeSingle();

// //       if (existing) {
// //         console.log(`✅ Skipping duplicate message ${messageId}`);
// //         continue; // Skip duplicate
// //       }

// //       const detail = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
// //       const payload = detail.data.payload;
// //       const receiver= detail.data.payload?.headers?.find((h) => h.name === "To")?.value || "";
// //       const subject = detail.data.payload?.headers?.find((h) => h.name === "Subject")?.value || "";
// //       const from = detail.data.payload?.headers?.find((h) => h.name === "From")?.value || "";
// //       const decoded = extractMessage(payload).trim();

// //       if (decoded) {
// //         const status = detail.data.labelIds.includes("UNREAD") ? "unread" : "read";

// //         entriesToInsert.push({
// //           user_id,
// //           content: decoded,
// //           type: "email",
// //           source: "gmail",
// //           chat_id: messageId,
// //           sender: from,
// //           receiver: receiver,
// //           metadata: {
// //             sender: from,
// //             created_at: new Date().toISOString(),
// //             type: "email",
// //             source: "gmail",
// //             subject: subject,
// //             status: status,
// //           },
// //         });
// //       }
// //     }

// //     // Batch insert all new entries at once
// //     if (entriesToInsert.length > 0) {
// //       const { error } = await supabase.from("memory_entries").upsert(entriesToInsert);
// //       if (error) {
// //         console.error("Error inserting messages:", error.message);
// //       }
// //     }

// //     await embed(); // Perform embedding or post-processing after insertion

// //     return new Response(
// //       JSON.stringify({
// //         inserted: entriesToInsert.length,
// //         totalFetched: messages.length,
// //       }),
// //       {
// //         status: 200,
// //         headers: { "Content-Type": "application/json" },
// //       }
// //     );
// //   } catch (error) {
// //     console.error("Error in POST handler:", error);
// //     return new Response(
// //       JSON.stringify({
// //         error: "Internal server error",
// //         details: error.message,
// //       }),
// //       {
// //         status: 500,
// //         headers: { "Content-Type": "application/json" },
// //       }
// //     );
// //   }
// // }


// import { google } from "googleapis";
// import { supabase } from "../../../../../../lib/supabase.js"; // .js extension
// import { Buffer } from "buffer";
// import embed from "../../embedding.js"; // Import the embedding function

// function decodeBase64(data) {
//   const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
//   return Buffer.from(normalized, "base64").toString("utf-8");
// }

// function extractMessage(payload) {
//   if (payload?.body?.data) {
//     return decodeBase64(payload.body.data);
//   }

//   if (payload?.parts?.length) {
//     const textPart = payload.parts.find(
//       (p) => p.mimeType === "text/plain" && p.body?.data
//     );
//     if (textPart?.body?.data) return decodeBase64(textPart.body.data);

//     const htmlPart = payload.parts.find(
//       (p) => p.mimeType === "text/html" && p.body?.data
//     );
//     if (htmlPart?.body?.data) {
//       const rawHtml = decodeBase64(htmlPart.body.data);
//       return rawHtml.replace(/<[^>]+>/g, " ");
//     }
//   }

//   return "";
// }

// export async function POST(req) {
//   try {
//     const { accessToken, user_id } = await req.json();

//     const auth = new google.auth.OAuth2();
//     auth.setCredentials({
//       access_token: accessToken,
//       expiry_date: Date.now() + 3600 * 24 * 30 * 1000, // ⚡ Extend expiry: 30 days
//     });

//     const gmail = google.gmail({ version: "v1", auth });

//     let res;
//     try {
//       res = await gmail.users.messages.list({
//         userId: "me",
//         q: "is:unread",
//         maxResults: 20,
//       });
//     } catch (gmailError) {
//       if (gmailError?.response?.status === 401) {
//         console.error("🔴 Access token expired or invalid!");

//         return new Response(
//           JSON.stringify({
//             error: "AccessTokenExpired",
//             message: "Your Gmail access token has expired. Please reconnect your account.",
//           }),
//           {
//             status: 401,
//             headers: {
//               "Content-Type": "application/json",
//             },
//           }
//         );
//       } else {
//         throw gmailError; // Other errors will be caught below
//       }
//     }

//     const messages = res.data.messages || [];
//     let insertedCount = 0;

//     for (const msg of messages) {
//       const messageId = msg.id; // Gmail's unique ID

//       // 🛡️ Check if message with same messageId already exists based on chat_id
//       const { data: existing, error: fetchError } = await supabase
//         .from("memory_entries")
//         .select("id")
//         .eq("chat_id", messageId) // Now using chat_id
//         .maybeSingle();

//       if (existing) {
//         console.log(`✅ Skipping duplicate message ${messageId}`);
//         continue; // Skip duplicate
//       }

//       if (fetchError) {
//         console.error("Supabase fetch error:", fetchError.message);
//         continue;
//       }

//       const detail = await gmail.users.messages.get({
//         userId: "me",
//         id: messageId,
//         format: "full",
//       });

//       const payload = detail.data.payload;
//       const headers = detail.data.payload?.headers || [];
//       const receiver= detail.data.payload?.headers?.find((h) => h.name === "To")?.value || "";
//       const subject = headers.find((h) => h.name === "Subject")?.value || "";
//       const from = headers.find((h) => h.name === "From")?.value || "";

//       const decoded = extractMessage(payload).trim();
//       if (decoded) {
//         const labels = detail.data.labelIds || [];
//         const isUnread = labels.includes("UNREAD"); // Check if "UNREAD" label exists
//         const status = isUnread ? "unread" : "read"; // Determine message status

//         const { error } = await supabase.from("memory_entries").insert({
//           user_id,
//           content: decoded,
//           type: "email",
//           source: "gmail",
//           chat_id: messageId, // 🌟 Save Gmail message ID into chat_id
//           sender: from,
//           receiver: receiver,
//           metadata: {
//             id: messageId,
//             sender: from,
//             created_at: new Date().toISOString(),
//             type: "email",
//             source: "gmail",
//             subject: subject,
//             status: status, // Include status (read/unread)
//           },
//         });

//         if (!error) {
//           insertedCount++;
//         } else {
//           console.error("Supabase insert error:", error.message);
//         }
//       } else {
//         console.warn(`⚠️ No body found for message: ${messageId}`);
//       }
//     }

//     await embed(); // embed everything after inserting

//     return new Response(
//       JSON.stringify({
//         inserted: insertedCount,
//         totalFetched: messages.length,
//       }),
//       {
//         status: 200,
//         headers: {
//           "Content-Type": "application/json",
//         },
//       }
//     );
//   } catch (error) {
//     console.error("Error in POST handler:", error);
//     return new Response(
//       JSON.stringify({
//         error: "Internal server error",
//         details: error.message,
//       }),
//       {
//         status: 500,
//         headers: {
//           "Content-Type": "application/json",
//         },
//       }
//     );
//   }
// }


// import { google } from "googleapis";
// import { supabase } from "../../../../../../lib/supabase.js"; // .js extension
// import { Buffer } from "buffer";
// import { htmlToText } from "html-to-text"; // Import html-to-text for better formatting
// import embed from "../../embedding.js"; // Import the embedding function

// // Decode base64 encoded message body
// function decodeBase64(data) {
//   const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
//   return Buffer.from(normalized, "base64").toString("utf-8");
// }

// // Extract the message from Gmail's payload and convert HTML to text
// function extractMessage(payload) {
//   if (payload?.body?.data) {
//     return decodeBase64(payload.body.data); // For simple text content
//   }

//   if (payload?.parts?.length) {
//     // Look for a plain text part first
//     const textPart = payload.parts.find(
//       (p) => p.mimeType === "text/plain" && p.body?.data
//     );
//     if (textPart?.body?.data) return decodeBase64(textPart.body.data);

//     // If no plain text, look for HTML part
//     const htmlPart = payload.parts.find(
//       (p) => p.mimeType === "text/html" && p.body?.data
//     );
//     if (htmlPart?.body?.data) {
//       const rawHtml = decodeBase64(htmlPart.body.data);
//       // Convert HTML to clean readable text using html-to-text
//       return htmlToText(rawHtml, {
//         wordwrap: 130, // Prevent word wrapping issues
//         selectors: [
//           { selector: 'a', options: { hideLinkHrefIfSameAsText: true } }, // Clean up links
//         ],
//       });
//     }
//   }

//   return ""; // Return empty string if no message content found
// }

// // Main POST function to fetch Gmail messages and insert into Supabase
// export async function POST(req) {
//   try {
//     const { accessToken, user_id } = await req.json(); // Extract access token and user ID

//     const auth = new google.auth.OAuth2();
//     auth.setCredentials({
//       access_token: accessToken,
//       expiry_date: Date.now() + 3600 * 24 * 30 * 1000, // ⚡ Extend expiry: 30 days
//     });

//     const gmail = google.gmail({ version: "v1", auth });

//     let res;
//     try {
//       res = await gmail.users.messages.list({
//         userId: "me",
//         q: "is:unread", // Fetch only unread messages
//         maxResults: 20, // Limit to 20 unread messages
//       });
//     } catch (gmailError) {
//       if (gmailError?.response?.status === 401) {
//         console.error("🔴 Access token expired or invalid!");

//         return new Response(
//           JSON.stringify({
//             error: "AccessTokenExpired",
//             message: "Your Gmail access token has expired. Please reconnect your account.",
//           }),
//           {
//             status: 401,
//             headers: {
//               "Content-Type": "application/json",
//             },
//           }
//         );
//       } else {
//         throw gmailError; // Other errors will be caught below
//       }
//     }

//     const messages = res.data.messages || [];
//     const messageIds = messages.map(msg => msg.id);

//     // Fetch all existing message IDs at once (to reduce queries)
//     const { data: existingMessages, error: fetchError } = await supabase
//       .from("memory_entries")
//       .select("chat_id")
//       .in("chat_id", messageIds); // Batch query for all existing messages by their chat_id

//     if (fetchError) {
//       console.error("Supabase fetch error:", fetchError.message);
//       return new Response(
//         JSON.stringify({
//           error: "Internal server error",
//           details: fetchError.message,
//         }),
//         {
//           status: 500,
//           headers: {
//             "Content-Type": "application/json",
//           },
//         }
//       );
//     }

//     // Extract existing message IDs from the response
//     const existingMessageIds = existingMessages.map((entry) => entry.chat_id);
//     const messagesToInsert = [];

//     for (const msg of messages) {
//       const messageId = msg.id; // Gmail's unique ID

//       if (existingMessageIds.includes(messageId)) {
//         console.log(`✅ Skipping duplicate message ${messageId}`);
//         continue; // Skip duplicate
//       }

//       const detail = await gmail.users.messages.get({
//         userId: "me",
//         id: messageId,
//         format: "full",
//       });

//       const payload = detail.data.payload;
//       const headers = detail.data.payload?.headers || [];

//       // Safely get the header fields
//       const getHeader = (name) => {
//         const header = headers.find((h) => h.name === name);
//         return header ? header.value : '';
//       };

//       const receiver = getHeader("To");
//       const subject = getHeader("Subject");
//       const from = getHeader("From");

//       const decoded = extractMessage(payload).trim(); // Cleaned-up message
//       if (decoded) {
//         const labels = detail.data.labelIds || [];
//         const isUnread = labels.includes("UNREAD"); // Check if "UNREAD" label exists
//         const status = isUnread ? "unread" : "read"; // Determine message status

//         // Prepare the message for batch insert
//         messagesToInsert.push({
//           user_id,
//           content: decoded, // Cleaned content
//           type: "email",
//           source: "gmail",
//           chat_id: messageId, // 🌟 Save Gmail message ID into chat_id
//           sender: from,
//           receiver: receiver,
//           metadata: {
//             id: messageId,
//             sender: from,
//             created_at: new Date().toISOString(),
//             type: "email",
//             source: "gmail",
//             subject: subject,
//             status: status, // Include status (read/unread)
//           },
//         });
//       } else {
//         console.warn(`⚠️ No body found for message: ${messageId}`);
//       }
//     }

//     // Perform a single batch insert
//     if (messagesToInsert.length > 0) {
//       const { error } = await supabase.from("memory_entries").insert(messagesToInsert);

//       if (error) {
//         console.error("Supabase batch insert error:", error.message);
//         return new Response(
//           JSON.stringify({
//             error: "Internal server error",
//             details: error.message,
//           }),
//           {
//             status: 500,
//             headers: {
//               "Content-Type": "application/json",
//             },
//           }
//         );
//       }
//     }

//     await embed(); // Embed everything after inserting into memory entries

//     return new Response(
//       JSON.stringify({
//         inserted: messagesToInsert.length,
//         totalFetched: messages.length,
//       }),
//       {
//         status: 200,
//         headers: {
//           "Content-Type": "application/json",
//         },
//       }
//     );
//   } catch (error) {
//     console.error("Error in POST handler:", error);
//     return new Response(
//       JSON.stringify({
//         error: "Internal server error",
//         details: error.message,
//       }),
//       {
//         status: 500,
//         headers: {
//           "Content-Type": "application/json",
//         },
//       }
//     );
//   }
// }





import { google } from "googleapis";
import { supabase } from "../../../../../../lib/supabase.js"; // .js extension
import { Buffer } from "buffer";
import { htmlToText } from "html-to-text"; // Import html-to-text for better formatting
import embed from "../../embedding.js"; // Import the embedding function

// Decode base64 encoded message body
function decodeBase64(data) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

// Clean up message content by stripping unwanted characters and excessive line breaks
function cleanText(content) {
  // Replace multiple spaces with a single space
  content = content.replace(/\s+/g, " ").trim();

  // Remove unwanted characters like extra newlines, etc.
  content = content.replace(/[\r\n]+/g, "\n");

  // Optionally, remove any HTML tags if they remain after html-to-text conversion
  content = content.replace(/<\/?[^>]+(>|$)/g, "");

  // Clean up any remaining non-printable characters
  content = content.replace(/[^\x20-\x7E]/g, "");

  return content;
}

// Extract the message from Gmail's payload and convert HTML to text
function extractMessage(payload) {
  if (payload?.body?.data) {
    return decodeBase64(payload.body.data); // For simple text content
  }

  if (payload?.parts?.length) {
    // Look for a plain text part first
    const textPart = payload.parts.find(
      (p) => p.mimeType === "text/plain" && p.body?.data
    );
    if (textPart?.body?.data) return decodeBase64(textPart.body.data);

    // If no plain text, look for HTML part
    const htmlPart = payload.parts.find(
      (p) => p.mimeType === "text/html" && p.body?.data
    );
    if (htmlPart?.body?.data) {
      const rawHtml = decodeBase64(htmlPart.body.data);
      // Convert HTML to clean readable text using html-to-text
      let rawText = htmlToText(rawHtml, {
        wordwrap: 130, // Prevent word wrapping issues
        selectors: [
          { selector: 'a', options: { hideLinkHrefIfSameAsText: true } }, // Clean up links
        ],
      });

      // Further clean the text content after converting from HTML
      return cleanText(rawText);
    }
  }

  return ""; // Return empty string if no message content found
}

// Main POST function to fetch Gmail messages and insert into Supabase
export async function POST(req) {
  try {
    const { accessToken, user_id } = await req.json(); // Extract access token and user ID

    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: accessToken,
      expiry_date: Date.now() + 3600 * 24 * 30 * 1000, // ⚡ Extend expiry: 30 days
    });

    const gmail = google.gmail({ version: "v1", auth });

    let res;
    try {
      res = await gmail.users.messages.list({
        userId: "me",
        q: "is:unread", // Fetch only unread messages
        maxResults: 20, // Limit to 20 unread messages
      });
    } catch (gmailError) {
      if (gmailError?.response?.status === 401) {
        console.error("🔴 Access token expired or invalid!");

        return new Response(
          JSON.stringify({
            error: "AccessTokenExpired",
            message: "Your Gmail access token has expired. Please reconnect your account.",
          }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      } else {
        throw gmailError; // Other errors will be caught below
      }
    }

    const messages = res.data.messages || [];
    const messageIds = messages.map(msg => msg.id);

    // Fetch all existing message IDs at once (to reduce queries)
    const { data: existingMessages, error: fetchError } = await supabase
      .from("memory_entries")
      .select("chat_id")
      .in("chat_id", messageIds); // Batch query for all existing messages by their chat_id

    if (fetchError) {
      console.error("Supabase fetch error:", fetchError.message);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          details: fetchError.message,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Extract existing message IDs from the response
    const existingMessageIds = existingMessages.map((entry) => entry.chat_id);
    const messagesToInsert = [];

    for (const msg of messages) {
      const messageId = msg.id; // Gmail's unique ID

      if (existingMessageIds.includes(messageId)) {
        console.log(`✅ Skipping duplicate message ${messageId}`);
        continue; // Skip duplicate
      }

      const detail = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const payload = detail.data.payload;
      const headers = detail.data.payload?.headers || [];

      // Safely get the header fields
      const getHeader = (name) => {
        const header = headers.find((h) => h.name === name);
        return header ? header.value : '';
      };

      const receiver = getHeader("To");
      const subject = getHeader("Subject");
      const from = getHeader("From");

      const decoded = extractMessage(payload).trim(); // Cleaned-up message
      if (decoded) {
        const labels = detail.data.labelIds || [];
        const isUnread = labels.includes("UNREAD"); // Check if "UNREAD" label exists
        const status = isUnread ? "unread" : "read"; // Determine message status

        // Prepare the message for batch insert
        messagesToInsert.push({
          user_id,
          content: decoded, // Cleaned content
          type: "email",
          source: "gmail",
          chat_id: messageId, // 🌟 Save Gmail message ID into chat_id
          sender: from,
          receiver: receiver,
          metadata: {
            id: messageId,
            sender: from,
            created_at: new Date().toISOString(),
            type: "email",
            source: "gmail",
            subject: subject,
            status: status, // Include status (read/unread)
          },
        });
      } else {
        console.warn(`⚠️ No body found for message: ${messageId}`);
      }
    }

    // Perform a single batch insert
    if (messagesToInsert.length > 0) {
      const { error } = await supabase.from("memory_entries").insert(messagesToInsert);

      if (error) {
        console.error("Supabase batch insert error:", error.message);
        return new Response(
          JSON.stringify({
            error: "Internal server error",
            details: error.message,
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }
    }

    await embed(); // Embed everything after inserting into memory entries

    return new Response(
      JSON.stringify({
        inserted: messagesToInsert.length,
        totalFetched: messages.length,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in POST handler:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
