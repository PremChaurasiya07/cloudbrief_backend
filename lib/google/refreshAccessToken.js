import { google } from "googleapis";
import { supabase } from "../../lib/supabase";

export async function refreshAccessToken(userId, refreshToken) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    const newAccessToken = credentials.access_token;
    const newExpiryMillis = credentials.expiry_date || null;

    const { error } = await supabase
      .from("email_auth")
      .update({
        access_token: newAccessToken,
        token_expiry: newExpiryMillis,
      })
      .eq("user_id", userId);

    if (error) {
      console.error("Failed to update refreshed access token:", error);
    } else {
      console.log("Access token refreshed successfully.");
    }

    oauth2Client.setCredentials({ access_token: newAccessToken });

    return google.gmail({ version: "v1", auth: oauth2Client });
  } catch (error) {
    console.error("Error refreshing access token:", error);
    return null;
  }
}
