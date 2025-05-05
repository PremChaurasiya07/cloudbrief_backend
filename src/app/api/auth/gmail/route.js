import { google } from "googleapis";

// Initialize OAuth2 client with additional configuration
const oauth2Client = new google.auth.OAuth2({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});

export async function GET() {
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !process.env.GOOGLE_REDIRECT_URI
  ) {
    throw new Error("Missing Google OAuth configuration");
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline", // Needed for refresh tokens
    prompt: "consent",      // Always show consent (for updated scopes)
    scope: [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar.readonly", // 👈 Calendar read
      "https://www.googleapis.com/auth/calendar.events"     // 👈 Calendar create/edit
    ],
    include_granted_scopes: true,  // Allow incremental auth
    response_type: "code",
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
