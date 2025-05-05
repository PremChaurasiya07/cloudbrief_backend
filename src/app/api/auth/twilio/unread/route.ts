import { NextRequest } from "next/server";
import { supabase } from "../../../../../../lib/supabase";
export async function GET(req: NextRequest) {
    const userId = "00000000-0000-0000-0000-000000000001"; // Replace with auth token logic
  
    const { data, error } = await supabase
      .from("memory_entries")
      .select("*")
      .eq("user_id", userId)
      .eq("source", "whatsapp")
      .eq("is_read", false);
  
    if (error) {
      console.error(error);
      return new Response("Error fetching messages", { status: 500 });
    }
  
    return Response.json(data);
  }
  