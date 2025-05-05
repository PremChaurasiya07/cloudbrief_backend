import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// 1. Init Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// 2. Init Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Helper function to calculate byte length of a string
function getByteLength(str) {
  try {
    return new TextEncoder().encode(str).length;
  } catch (err) {
    console.error("Byte length calculation failed:", err);
    return Infinity; // Prevent processing if byte length can't be calculated
  }
}

// Helper function to truncate string to a specific byte limit
function truncateToByteLimit(str, maxBytes) {
  if (getByteLength(str) <= maxBytes) return str;

  // Use Buffer for precise UTF-8 byte slicing
  const buffer = Buffer.from(str, "utf8");
  let end = Math.min(buffer.length, maxBytes);

  // Ensure we don't split multi-byte characters
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) {
    end--;
  }

  // Convert back to string
  let result = buffer.slice(0, end).toString("utf8");

  // Double-check byte length
  while (getByteLength(result) > maxBytes && result.length > 0) {
    result = result.slice(0, -1);
  }

  return result;
}

async function embed() {
  // Fetch messages with null embeddings
  const { data: messages, error } = await supabase
    .from("memory_entries")
    .select("id, content")
    .is("embedding", null);

  if (error) {
    console.error("Error fetching contents:", error);
    return;
  }

  // Use the embedding model
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const MAX_BYTE_LIMIT = 30000; // Lowered to avoid any overhead

  for (const message of messages) {
    try {
      // Check and truncate content if necessary
      let content = message.content || ""; // Handle null/undefined
      const originalByteLength = getByteLength(content);

      if (originalByteLength === Infinity) {
        console.error(
          `❌ Skipping ID ${message.id}: Invalid content (byte length calculation failed).`
        );
        continue;
      }

      if (originalByteLength > MAX_BYTE_LIMIT) {
        console.warn(
          `⚠️ Content for ID ${message.id} exceeds ${MAX_BYTE_LIMIT} bytes (${originalByteLength} bytes, ${content.length} chars). Truncating.`
        );
        content = truncateToByteLimit(content, MAX_BYTE_LIMIT);
        const truncatedByteLength = getByteLength(content);

        console.log(
          `📏 ID ${message.id}: Original ${originalByteLength} bytes, Truncated to ${truncatedByteLength} bytes (${content.length} chars).`
        );

        if (truncatedByteLength > MAX_BYTE_LIMIT || truncatedByteLength === 0) {
          console.error(
            `❌ Skipping ID ${message.id}: Truncation failed or empty (${truncatedByteLength} bytes).`
          );
          continue;
        }
      }

      // Generate embedding
      const result = await model.embedContent(content);
      const vector = result.embedding.values; // Extract the embedding vector

      // Update the embedding in the correct table
      const { error: updateError } = await supabase
        .from("memory_entries")
        .update({ embedding: vector })
        .eq("id", message.id);

      if (updateError) {
        console.error(`❌ Failed to update ID ${message.id}:`, updateError);
      } else {
        console.log(`✅ Updated embedding for ID ${message.id}`);
      }
    } catch (err) {
      console.error(`❌ Embedding error for ID ${message.id}:`, err);
    }
  }
}

export default embed;