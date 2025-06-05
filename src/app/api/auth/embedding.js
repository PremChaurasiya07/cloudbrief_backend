import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Init Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Init Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

// Byte helpers
function getByteLength(str) {
  try {
    return new TextEncoder().encode(str).length;
  } catch (err) {
    console.error("Byte length calculation failed:", err);
    return Infinity;
  }
}

function truncateToByteLimit(str, maxBytes) {
  if (getByteLength(str) <= maxBytes) return str;

  const buffer = Buffer.from(str, "utf8");
  let end = Math.min(buffer.length, maxBytes);

  while (end > 0 && (buffer[end] & 0xc0) === 0x80) {
    end--;
  }

  let result = buffer.slice(0, end).toString("utf8");

  while (getByteLength(result) > maxBytes && result.length > 0) {
    result = result.slice(0, -1);
  }

  return result;
}

// Main embed function
async function embed(content = null) {
  const MAX_BYTE_LIMIT = 30000;

  // Direct content embedding mode
  if (content) {
    try {
      let content = content;
      const byteLen = getByteLength(content);

      if (byteLen > MAX_BYTE_LIMIT) {
        console.warn(`⚠️ Input content exceeds ${MAX_BYTE_LIMIT} bytes. Truncating.`);
        content = truncateToByteLimit(content, MAX_BYTE_LIMIT);
      }

      const result = await model.embedContent(content);
      const vector = result.embedding.values;
      console.log("✅ Embedding generated for direct input.");
      return vector;
    } catch (err) {
      console.error("❌ Error embedding direct input content:", err);
      return null;
    }
  }

  // Supabase mode
  const { data: messages, error } = await supabase
    .from("memory_entries")
    .select("id, content")
    .is("embedding", null);

  if (error) {
    console.error("❌ Error fetching messages from Supabase:", error);
    return;
  }

  for (const message of messages) {
    try {
      let content = message.content || "";
      const byteLen = getByteLength(content);

      if (byteLen > MAX_BYTE_LIMIT) {
        console.warn(`⚠️ ID ${message.id} content too large. Truncating.`);
        content = truncateToByteLimit(content, MAX_BYTE_LIMIT);
      }

      const result = await model.embedContent(content);
      const vector = result.embedding.values;

      const { error: updateError } = await supabase
        .from("memory_entries")
        .update({ embedding: vector })
        .eq("id", message.id);

      if (updateError) {
        console.error(`❌ Failed to update ID ${message.id}:`, updateError);
      } else {
        console.log(`✅ Embedded and updated ID ${message.id}`);
      }
    } catch (err) {
      console.error(`❌ Embedding error for ID ${message.id}:`, err);
    }
  }
}

export default embed;
