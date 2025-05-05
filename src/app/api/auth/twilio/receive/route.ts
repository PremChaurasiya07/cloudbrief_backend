// /app/api/twilio/receive/route.ts
import { NextRequest } from "next/server";
import { supabase } from "../../../../../../lib/supabase";
import embed from "../../embedding.js"

export async function POST(req: NextRequest) {
  const body = await req.formData();

  const messageBody = body.get("Body")?.toString();
  const from = body.get("From")?.toString(); // format: whatsapp:+1234567890
  const messageSid = body.get("MessageSid")?.toString(); 
  // Optional: Map WhatsApp number to a user_id if needed
  const user_id = "00000000-0000-0000-0000-000000000001"
  console.log("Received message:", { messageBody, from, user_id });
  if (!messageBody || !from) {
    return new Response("Missing message or sender", { status: 400 });
  }

  // Insert into Supabase
  const { error } = await supabase.from("memory_entries").insert({
    user_id,
    content: messageBody,
    sender: from,
    source: "whatsapp",
    type: "message",
    delivery_status: "received", // default status
    platform_message_id: messageSid ?? null,
    is_read: false,
    metadata: {   
      source: "whatsapp",
      messageSid: messageSid ?? null,
      from: from,
      delivery_status: "received",
      sender: from,
      timestamp: new Date().toISOString(),
    }
  });
  embed()
  if (error) {
    console.error("Supabase error:", error);
    return new Response("DB Error", { status: 500 });
  }

  return new Response("Message received", { status: 200 });
}
