import { decryptMessage } from "../../../../../../lib/data_security"
import { supabase } from "../../../../../../lib/supabase";

export async function POST(req) {
    const {gmail_id,user_id} = await req.json();
    try {
        const { data: mails, error } = await supabase
            .from('memory_entries')
            .select('id,sender, content, created_at, metadata,chat_id,starred')
            .eq('user_id', user_id)
            .eq('receiver', gmail_id)
            .eq('type', 'email');

        if (error) {
            console.error("Supabase error:", error);
            return new Response("Error fetching emails", { status: 500 });
        }

        // Process mails and extract 'subject' and 'status' from metadata
        const processedMails = mails.map(mail => {
        const metadata = mail.metadata || {};
        let decryptedContent;

        try {
            decryptedContent = decryptMessage(mail.content,user_id);
        } catch {
            decryptedContent = "[Failed to decrypt]";
        }

        return {
            id: mail.id,
            sender: mail.sender,
            content: decryptedContent,
            created_at: mail.created_at,
            chat_id: mail.chat_id,
            subject: metadata.subject || "No Subject",
            status: metadata.status || "Unknown",
            starred: mail.starred
        };
        });


        return new Response(JSON.stringify(processedMails), { status: 200 });

    } catch (err) {
        console.error("Unexpected error:", err);
        return new Response("Internal server error", { status: 500 });
    }
}
