import { supabase } from "../../../../../../lib/supabase.js";

export async function POST(request) {
    const { userId } = await request.json();

    if (!userId) {
        return Response.json({ error: "User ID is required" }, { status: 400 });
    }

    try {
        // Step 1: Get current user's WhatsApp ID
        const { data: platformData, error: platformError } = await supabase
            .from("app_user_platformid")
            .select("current_platform_id")
            .eq("user_id", userId)
            .eq("platform", "whatsapp")
            .single();

        if (platformError || !platformData) {
            console.error("Failed to get WhatsApp ID:", platformError?.message);
            return Response.json({ error: "WhatsApp ID not found for user" }, { status: 500 });
        }

        const myWaFullId = platformData.current_platform_id; // e.g. '919511293718@s.whatsapp.net'

        // Step 2: Fetch WhatsApp messages
        const { data, error } = await supabase
            .from("memory_entries")
            .select("sender, created_at, chat_name, content, source, chat_id, metadata")
            .eq("source", "whatsapp")
            .eq("user_id",userId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Supabase error:", error);
            return Response.json({ error: error.message }, { status: 500 });
        }

        if (!data || data.length === 0) {
            return Response.json([], { status: 200 });
        }

        // Step 3: Group messages by chat_id
        const contacts = new Map();

        for (const entry of data) {
            const { chat_id, chat_name, created_at, sender, metadata } = entry;

            if (chat_id === "status@broadcast") continue;

            const isGroup = chat_id.endsWith("@g.us");
            const existing = contacts.get(chat_id);

            if (!existing || new Date(created_at) > new Date(existing.timestamp)) {
                let displayName = chat_id;

                if (isGroup) {
                    displayName = chat_name?.trim() || chat_id;
                } else {
                    const fromMe = metadata?.from_me;

                    const isSelfChat = chat_id === myWaFullId;

                    if (isSelfChat) {
                        displayName = "You (Saved Messages)";
                    } else if (chat_name && chat_name.trim()) {
                        displayName = chat_name.trim();
                    } else {
                        const senderId = sender?.split("@")[0];
                        const receiverId = chat_id?.split("@")[0];
                        displayName = fromMe ? receiverId : senderId;
                    }
                }

                contacts.set(chat_id, {
                    id: chat_id,
                    name: displayName,
                    timestamp: created_at,
                    isGroup,
                    chat_id
                });
            }
        }

        // Step 4: Sort by timestamp descending
        const result = Array.from(contacts.values()).sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );
    
        return Response.json(result);
    } catch (error) {
        console.error("Unexpected error:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
