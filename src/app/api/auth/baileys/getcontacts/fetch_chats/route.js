import { supabase } from "../../../../../../../lib/supabase";

export async function POST(req) {
    // Log the entire request body to check how the sender is being passed
    const { sender } = await req.json();
    console.log("Request Body:", req.body);  // Log the full body
    console.log("Sender:", sender);  // Log the sender value

    // If sender is undefined, return an error
    if (!sender) {
        return new Response(
            JSON.stringify({ message: 'Sender not provided' }),
            { status: 400 }
        );
    }

    // Fetch chat_id based on sender and source
    const { data: chatData, error: chatError, count } = await supabase
        .from('memory_entries')
        .select('chat_id', { count: 'exact' })
        .eq('chat_id', sender)
        .eq('source', 'whatsapp');

    // Log the raw data for debugging
    console.log("Chat Data:", chatData);

    if (count === 0) {
        console.error('No chat found for the specified sender and source');
        return new Response(
            JSON.stringify({ message: 'No chat found for the specified sender and source' }),
            { status: 404 }
        );
    }

    if (chatError) {
        console.error('Error fetching chat_id:', chatError);
        return new Response(
            JSON.stringify({ message: 'Failed to fetch chat_id', error: chatError }),
            { status: 500 }
        );
    }

    const chat_id = chatData?.[0]?.chat_id;
    if (!chat_id) {
        return new Response(
            JSON.stringify({ message: 'Chat ID not found' }),
            { status: 404 }
        );
    }

    // Fetch the last 5 messages based on chat_id
    const { data: messages, error: messagesError } = await supabase
        .from('memory_entries')
        .select('content, created_at,sender,chat_id')
        .eq('chat_id', chat_id)
        .order('created_at', { ascending: true })
        .limit(20);

    if (messagesError) {
        console.error('Error fetching messages:', messagesError);
        return new Response(
            JSON.stringify({ message: 'Failed to fetch messages', error: messagesError }),
            { status: 500 }
        );
    }

    return new Response(
        JSON.stringify({ messages }),
        { status: 200 }
    );
}
