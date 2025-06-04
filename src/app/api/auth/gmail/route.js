import { google } from "googleapis";
import CryptoJS from 'crypto-js';
// Initialize OAuth2 client with additional configuration
const oauth2Client = new google.auth.OAuth2({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});

export async function GET(req) {
    const url = new URL(req.url);
    const encrypted_userId = url.searchParams.get("state");
    const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY;
  
    if (!encrypted_userId || !ENCRYPTION_SECRET) {
      return new Response("Missing parameters", { status: 400 });
    }
  
      const key = CryptoJS.enc.Utf8.parse(ENCRYPTION_SECRET);
  
      // ✅ Decode and parse encrypted user ID
      const base64 = decodeURIComponent(encrypted_userId);
      const combinedWordArray = CryptoJS.enc.Base64.parse(base64);
  
      const iv = CryptoJS.lib.WordArray.create(
        combinedWordArray.words.slice(0, 4),
        16
      );
      const ciphertext = CryptoJS.lib.WordArray.create(
        combinedWordArray.words.slice(4),
        combinedWordArray.sigBytes - 16
      );
  
      const decrypted = CryptoJS.AES.decrypt({ ciphertext }, key, { iv });
      const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
  
      if (!decryptedText) {
        throw new Error("Failed to decrypt");
      }
  
      const { userId } = JSON.parse(decryptedText);
  
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !process.env.GOOGLE_REDIRECT_URI
  ) {
    throw new Error("Missing Google OAuth configuration");
  }

  const authUrl = oauth2Client.generateAuthUrl({
  state:userId,
  access_type: "offline",
  prompt: "consent",
  scope: [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid'
  ],
  include_granted_scopes: true,
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


