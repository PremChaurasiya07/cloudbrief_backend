import { google } from "googleapis";
import { supabase } from "../../../../../../lib/supabase";

// OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Function to refresh access token automatically
async function refreshAccessToken(userId, refreshToken) {
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    const newAccessToken = credentials.access_token;
    const newExpiryMillis = credentials.expiry_date || null;

    // Update the user's access_token and expiry_date in Supabase
    const { error } = await supabase
      .from('email_auth')
      .update({
        access_token: newAccessToken,
        token_expiry: newExpiryMillis,
      })
      .eq('user_id', userId);

    if (error) {
      console.error("Failed to update refreshed access token:", error);
    } else {
      console.log("Access token refreshed successfully.");
    }

    return newAccessToken;
  } catch (error) {
    console.error("Error refreshing access token:", error);
    return null;
  }
}

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("No authorization code provided", { status: 400 });
  }

  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    console.log("Tokens received:", tokens);

    // Fetch user's Gmail account (email)
    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const { data: userInfo } = await oauth2.userinfo.get();
    const gmailId = userInfo.email;

    // Use session or request context to identify your app's user
    const userId = '00000000-0000-0000-0000-000000000001'; // Replace this with actual app user ID

    // Check if this Gmail is already stored for the user
    const { data, error: fetchError } = await supabase
      .from('email_auth')
      .select('*')
      .eq('user_id', userId)
      .eq('gmail_id', gmailId)
      .maybeSingle();

    const scopesArray = tokens.scope?.split(' ') || [];

    if (fetchError || !data) {
      const { error } = await supabase.from('email_auth').insert([{
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
      }]);

      if (error) {
        console.error("Error inserting token data:", error);
        return new Response("Failed to insert token data", { status: 500 });
      }

      console.log("New Gmail account linked and tokens stored.");
    } else {
      const updateFields = {
        access_token: tokens.access_token,
        updated_at: new Date(),
      };
      if (tokens.refresh_token) {
        updateFields.refresh_token = tokens.refresh_token;
      }

      const { error: updateError } = await supabase
        .from('email_auth')
        .update(updateFields)
        .eq('user_id', userId)
        .eq('gmail_id', gmailId);

      if (updateError) {
        console.error("Error updating token data:", updateError);
        return new Response("Failed to update token data", { status: 500 });
      }

      console.log("Tokens updated for existing Gmail account.");
    }

    return Response.redirect("http://localhost:8080/gmail", 302);

  } catch (error) {
    console.error("OAuth error:", error);
    return new Response("Failed to authenticate with Google", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
