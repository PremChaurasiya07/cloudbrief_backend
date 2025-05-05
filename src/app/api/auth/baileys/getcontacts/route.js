// import { supabase } from "../../../../../../lib/supabase.js";

// export async function GET() {
//     try {
//         // Fetch all messages with required fields
//         const { data, error } = await supabase
//             .from('memory_entries')
//             .select('sender, created_at, chat_name, content, source, chat_id')
//             .eq('source', 'whatsapp')
//             .order('created_at', { ascending: false });

//         if (error) {
//             console.error('Supabase error:', error);
//             return Response.json({ error: error.message }, { status: 500 });
//         }

//         if (!data || data.length === 0) {
//             return Response.json([], { status: 200 });
//         }

//         // Process contacts
//         const contacts = new Map();
//         const yourPhoneNumber = '95213121'; // Replace with your actual phone number without @s.whatsapp.net

//         data.forEach(entry => {
//             // Skip entries with chat_id = 'status@broadcast'
//             if (entry.chat_id === 'status@broadcast') {
//                 return;
//             }

//             const isGroup = entry.chat_id.endsWith('@g.us'); // Check if it's a group chat
//             const contactKey = entry.chat_id; // Use chat_id as the unique key

//             // If it's a group, store the group info (chat_name) or chat_id if no name is available
//             if (isGroup) {
//                 if (!contacts.has(contactKey) || new Date(entry.created_at) > new Date(contacts.get(contactKey).timestamp)) {
//                     contacts.set(contactKey, {
//                         id: entry.chat_id,
//                         name: entry.chat_name || entry.chat_id, // If no chat_name, fallback to chat_id
//                         timestamp: entry.created_at,
//                         isGroup: true
//                     });
//                 }
//             } else {
//                 // For individual contacts, we need to handle the case of unique senders
//                 if (!contacts.has(contactKey) || new Date(entry.created_at) > new Date(contacts.get(contactKey).timestamp)) {
//                     // If the sender is your own phone number, use the receiver's phone number as the name
//                     const contactName = entry.sender.split('@')[0] === yourPhoneNumber
//                         ? entry.chat_id.split('@')[0] // For your sent messages, get the receiver's number
//                         : entry.sender.split('@')[0]; // For incoming messages, get the sender's number

//                     contacts.set(contactKey, {
//                         id: entry.chat_id,
//                         name: contactName, // Assign the correct contact name
//                         timestamp: entry.created_at,
//                         isGroup: false
//                     });
//                 }
//             }
//         });

//         // Convert to array and sort by timestamp (newest first)
//         const result = Array.from(contacts.values()).sort((a, b) => 
//             new Date(b.timestamp) - new Date(a.timestamp)
//         );

//         return Response.json(result);

//     } catch (error) {
//         console.error('Unexpected error:', error);
//         return Response.json(
//             { error: "Internal server error" }, 
//             { status: 500 }
//         );
//     }
// }


import { supabase } from "../../../../../../lib/supabase.js";

export async function GET() {
    try {
        const currentUserId = '00000000-0000-0000-0000-000000000001'; // Replace with session-based user ID

        // Step 1: Get user's WhatsApp ID from app_user_platformid
        const { data: platformData, error: platformError } = await supabase
            .from('app_user_platformid')
            .select('current_platform_id')
            .eq('user_id', currentUserId)
            .eq('platform', 'whatsapp')
            .single();

        if (platformError || !platformData) {
            console.error('Failed to get WhatsApp ID:', platformError?.message);
            return Response.json({ error: "WhatsApp ID not found for user" }, { status: 500 });
        }

        const myWaId = platformData.current_platform_id;

        // Step 2: Fetch WhatsApp messages
        const { data, error } = await supabase
            .from('memory_entries')
            .select('sender, created_at, chat_name, content, source, chat_id, metadata')
            .eq('source', 'whatsapp')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase error:', error);
            return Response.json({ error: error.message }, { status: 500 });
        }

        if (!data || data.length === 0) {
            return Response.json([], { status: 200 });
        }

        const contacts = new Map();
        const chatMessagesMap = new Map();

        // Group messages by chat_id
        for (const entry of data) {
            if (entry.chat_id === 'status@broadcast') continue;

            if (!chatMessagesMap.has(entry.chat_id)) {
                chatMessagesMap.set(entry.chat_id, []);
            }
            chatMessagesMap.get(entry.chat_id).push(entry);
        }

        // Process each chat_id group
        for (const [chat_id, messages] of chatMessagesMap.entries()) {
            const isGroup = chat_id.endsWith('@g.us');
            const latest = messages[0];

            let contactName = null;
            let tempSenderName = null; // Temporary variable to store sender's name

            if (isGroup) {
                // For group chats, use any available chat_name
                const groupNameEntry = messages.find(m => m.chat_name && m.chat_name.trim() !== "");
                contactName = groupNameEntry?.chat_name?.trim() || chat_id;
            } else {
                // For individual chats
                const incomingMessage = messages.find(
                    m => m.metadata?.from_me === false && m.chat_name && m.chat_name.trim() == ""
                );

                // Save the sender's name temporarily if from_me is true
                const sentByMe = messages.find(m => m.metadata?.from_me === true);
                if (sentByMe) {
                    tempSenderName = sentByMe.sender.split('@')[0]; // Temporarily store sender's name
                }

                if (incomingMessage) {
                    contactName = incomingMessage.chat_name.trim();
                } else {
                    // Check all related messages and find contact names apart from sender's name
                    const names = new Set();

                    for (const msg of messages) {
                        if (msg.sender !== myWaId && msg.sender !== tempSenderName) {
                            names.add(msg.sender.split('@')[0]);
                        }
                    }

                    // If there's a name other than the sender's name, use that as the contact name
                    if (names.size > 0) {
                        contactName = Array.from(names)[0];
                    } else {
                        // Fallback to latest message's sender if no distinct name is found
                        contactName = latest.sender.split('@')[0] || chat_id;
                    }
                }
            }

            contacts.set(chat_id, {
                id: chat_id,
                name: contactName,
                timestamp: latest.created_at,
                isGroup
            });
        }

        // Sort by recent activity
        const result = Array.from(contacts.values()).sort((a, b) =>
            new Date(b.timestamp) - new Date(a.timestamp)
        );

        return Response.json(result);

    } catch (error) {
        console.error('Unexpected error:', error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
