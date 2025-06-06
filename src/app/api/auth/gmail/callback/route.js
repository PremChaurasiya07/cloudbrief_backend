import { google } from "googleapis";
import { supabase } from "../../../../../../lib/supabase";
import { NextResponse } from "next/server";

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const userId = url.searchParams.get("state");

  try {
    if (!code) {
      return new NextResponse("No authorization code provided", { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    const { data: userInfo } = await oauth2.userinfo.get();
    const gmailId = userInfo.email;

    const { data, error: fetchError } = await supabase
      .from("email_auth")
      .select("*")
      .eq("user_id", userId)
      .eq("gmail_id", gmailId)
      .maybeSingle();

    const scopesArray = tokens.scope?.split(" ") || [];

    if (fetchError || !data) {
      const { error } = await supabase.from("email_auth").insert([
        {
          user_id: userId,
          gmail_id: gmailId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          refresh_expiry: Date.now() + 1000 * 60 * 60 * 24 * 60,
          token_expiry: tokens.expiry_date,
          scopes: scopesArray,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      if (error) {
        console.error("Error inserting token data:", error);
        return new NextResponse("Failed to insert token data", { status: 500 });
      }

      console.log("✅ New Gmail account linked.");
    } else {
      const updateFields = {
        access_token: tokens.access_token,
        updated_at: new Date(),
      };
      if (tokens.refresh_token) {
        updateFields.refresh_token = tokens.refresh_token;
      }

      const { error: updateError } = await supabase
        .from("email_auth")
        .update(updateFields)
        .eq("user_id", userId)
        .eq("gmail_id", gmailId);

      if (updateError) {
        console.error("Error updating token data:", updateError);
        return new NextResponse("Failed to update token data", { status: 500 });
      }

      console.log("✅ Tokens updated for existing Gmail account.");
    }

    return NextResponse.redirect("http://localhost:8080/gmail", 302);
  } catch (error) {
    console.error("OAuth callback error:", error);
    return new NextResponse("Failed to authenticate with Google", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
