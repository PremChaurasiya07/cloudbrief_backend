import { NextResponse } from "next/server";
import { supabase } from "../../../../../../lib/supabase";
import { refreshAccessToken } from "../../../../../../lib/google/refreshAccessToken"; // ✅ import reusable logic

export async function POST(req) {
  try {
    const { refresh_token } = await req.json();

    if (!refresh_token) {
      return NextResponse.json({ error: "Missing refresh_token" }, { status: 400 });
    }

    // 🔍 Look up userId using refresh_token
    const { data, error } = await supabase
      .from("email_auth")
      .select("user_id, refresh_token")
      .eq("refresh_token", refresh_token)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Refresh token not found" }, { status: 404 });
    }

    const { user_id, refresh_token: storedRefreshToken } = data;

    // 🔄 Use centralized function to refresh token and update Supabase
    const gmailClient = await refreshAccessToken(user_id, storedRefreshToken);

    if (!gmailClient) {
      return NextResponse.json({ error: "Failed to refresh token" }, { status: 500 });
    }

    // Get the new access_token and expiry from Supabase after update
    const { data: updatedData, error: fetchUpdated } = await supabase
      .from("email_auth")
      .select("access_token, token_expiry")
      .eq("user_id", user_id)
      .maybeSingle();

    if (fetchUpdated || !updatedData) {
      return NextResponse.json({ error: "Failed to fetch updated credentials" }, { status: 500 });
    }

    return NextResponse.json(
      {
        access_token: updatedData.access_token,
        token_expiry: updatedData.token_expiry,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Refresh error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err.message },
      { status: 500 }
    );
  }
}
