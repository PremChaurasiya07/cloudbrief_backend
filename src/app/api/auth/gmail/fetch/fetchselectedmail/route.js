import { supabase } from "../../../../../../../lib/supabase"; 
import { decryptMessage } from "@/app/api/data_security/route";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { id, userid } = await req.json();
    console.log(id,"userid",userid)

    if (!id) {
      return NextResponse.json({ message: 'No mail ID provided' }, { status: 400 });
    }

    const { data, error: supabaseError } = await supabase
      .from('memory_entries')
      .select('id, created_at, sender, content, metadata, raw_html')
      .eq('id', id)
      .single();

    if (supabaseError) {
      return NextResponse.json({ message: supabaseError.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ message: "Mail not found" }, { status: 404 });
    }

    const metadata = data.metadata || {};

    let decryptedBody = '';
    let decryptedHtml = '';

    try {
      decryptedBody = decryptMessage(data.content, userid);
    } catch (err) {
      decryptedBody = '[Failed to decrypt message body]';
      console.error("Decryption failed for body:", err);
    }

    // try {
    //   decryptedHtml = decryptMessage(data.raw_html, userid);
    // } catch (err) {
    //   decryptedHtml = '[Failed to decrypt HTML content]';
    //   console.error("Decryption failed for HTML:", err);
    // }

    return NextResponse.json({
      subject: metadata.subject || 'No Subject',
      from: data.sender,
      to: metadata.receiver || 'Unknown recipient',
      date: new Date(data.created_at).toLocaleString(),
      body: decryptedBody,
      originalHtml: data.raw_html,
      attachments: metadata.attachments || [],
    });

  } catch (err) {
    console.error("Unexpected server error:", err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
