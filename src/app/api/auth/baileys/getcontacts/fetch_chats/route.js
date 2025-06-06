// import { supabase } from "../../../../../../../lib/supabase";
// export async function POST(req) {
//     const {userid, chat_id, name, isgroup } = await req.json();
//     // console.log("Incoming:", chat_id, name, isgroup);

//     if (!chat_id) {
//         return new Response(JSON.stringify({ message: "chat_id not provided" }), { status: 400 });
//     }

//     try {
//         // Check if the chat exists for the given chat_id
//         const { data: chatData, error: chatError, count } = await supabase
//             .from("memory_entries")
//             .select("chat_id", { count: "exact" })
//             .eq("chat_id", chat_id)
//             .eq("source", "whatsapp")
//             .eq("user_id",userid)

//         if (chatError) {
//             console.error("Error fetching chat:", chatError);
//             return new Response(JSON.stringify({ message: "Failed to fetch chat_id", error: chatError }), { status: 500 });
//         }

//         if (!chatData || count === 0) {
//             return new Response(JSON.stringify({ message: "No chat found for the specified chat_id" }), { status: 404 });
//         }

//         // Don't redeclare chat_id — use a different variable
//         const existingChatId = chatData[0].chat_id;

//         // Fetch messages for that chat_id
//         const { data: messages, error: messagesError } = await supabase
//             .from("memory_entries")
//             .select("content, created_at, sender, chat_id, metadata")
//             .eq("chat_id", chat_id)
//             .eq("source", "whatsapp")
//             .order("created_at", { ascending: true });

//         if (messagesError) {
//             console.error("Error fetching messages:", messagesError);
//             return new Response(JSON.stringify({ message: "Failed to fetch messages", error: messagesError }), { status: 500 });
//         }
//         // console.log(messages)
//         return new Response(JSON.stringify({ messages }), { status: 200 });
//     } catch (error) {
//         console.error("Unexpected error:", error);
//         return new Response(JSON.stringify({ message: "Internal server error", error }), { status: 500 });
//     }
// }


import { supabase } from "../../../../../../../lib/supabase";
import { decryptMessage } from "../../../../../../../lib/data_security"; // adjust path as needed

export async function POST(req) {
  const { userid, chat_id } = await req.json();

  if (!chat_id) {
    return new Response(JSON.stringify({ message: "chat_id not provided" }), { status: 400 });
  }

  try {
    // Check if the chat exists for the given chat_id
    const { data: chatData, error: chatError, count } = await supabase
      .from("memory_entries")
      .select("chat_id", { count: "exact" })
      .eq("chat_id", chat_id)
      .eq("source", "whatsapp")
      .eq("user_id", userid);

    if (chatError) {
      console.error("Error fetching chat:", chatError);
      return new Response(JSON.stringify({ message: "Failed to fetch chat_id", error: chatError }), { status: 500 });
    }

    if (!chatData || count === 0) {
      return new Response(JSON.stringify({ message: "No chat found for the specified chat_id" }), { status: 404 });
    }

    // Fetch messages for that chat_id
    const { data: messages, error: messagesError } = await supabase
      .from("memory_entries")
      .select("content, created_at, sender, chat_id, metadata")
      .eq("chat_id", chat_id)
      .eq("source", "whatsapp")
      .order("created_at", { ascending: true }).limit(50);

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return new Response(JSON.stringify({ message: "Failed to fetch messages", error: messagesError }), { status: 500 });
    }

    // Decrypt each message's content after parsing JSON string
    const decryptedMessages = messages.map((msg) => {
  try {
    const encryptedPayload = typeof msg.content === "string" ? JSON.parse(msg.content) : msg.content;
    const decryptedContent = decryptMessage(encryptedPayload, userid);

    return {
      ...msg,
      content: decryptedContent,
    };
  } catch (decryptErr) {
    console.error("Decryption failed for message:", decryptErr);
    return {
      ...msg,
      content: null,
      decryptError: true,
    };
  }
});


    return new Response(JSON.stringify({ messages: decryptedMessages }), { status: 200 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ message: "Internal server error", error }), { status: 500 });
  }
}
