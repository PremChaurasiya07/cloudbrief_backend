import { NextRequest } from "next/server";
import { supabase } from "../../../../../../lib/supabase";  
import { metadata } from "@/app/layout";

export async function POST(req: NextRequest) {
  const body = await req.formData();

  const messageSid = body.get("MessageSid")?.toString();
  const status = body.get("MessageStatus")?.toString(); // sent, delivered, read

  console.log("Status update:", { messageSid, status });

  if (!messageSid || !status) {
    return new Response("Missing fields", { status: 400 });
  }

  const { error } = await supabase
    .from("memory_entries")
    .update({
      delivery_status: status,
      is_read: status === "read",
      metadata:{
        ...metadata,
        delivery_status: status,
        timestamp: new Date().toISOString(),
      }
    })
    .eq("platform_message_id", messageSid);

  if (error) {
    console.error("Failed to update delivery status", error);
    return new Response("DB update failed", { status: 500 });
  }

  return new Response("Status updated", { status: 200 });
}
