import { supabase } from "../../../../../../lib/supabase";

export async function POST(req) {
    const {gmail_id,user_id} = await req.json();
    try {
        const { data: mails, error } = await supabase
            .from('memory_entries')
            .select('id,sender, content, created_at, metadata')
            .eq('user_id', user_id)
            .eq('receiver', gmail_id)
            .eq('type', 'email');

        if (error) {
            console.error("Supabase error:", error);
            return new Response("Error fetching emails", { status: 500 });
        }

        // Process mails and extract 'subject' and 'status' from metadata
        const processedMails = mails.map(mail => {
            // Log the metadata to verify structure (remove this after debugging)
            // console.log(mail.metadata); 

            // Directly use 'metadata' without parsing
            const metadata = mail.metadata || {};

            return {
                id:mail.id,
                sender: mail.sender,
                content: mail.content,
                created_at: mail.created_at,
                subject: metadata.subject || "No Subject", // Extract subject from metadata
                status: metadata.status || "Unknown", // Extract status from metadata
            };
        });

        return new Response(JSON.stringify(processedMails), { status: 200 });

    } catch (err) {
        console.error("Unexpected error:", err);
        return new Response("Internal server error", { status: 500 });
    }
}
