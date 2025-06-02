// pages/api/gmail/send.js
import { refreshAccessToken } from "../callback/route";
import { NextResponse } from "next/server";

export async function POST(req) {
  const { to, subject, body, refreshToken,userId } = req.json();
  if (!to || !subject || !body || !refreshToken||!userId) return NextResponse.json({ error: "Missing fields" });

  const gmail = await refreshAccessToken(userId,refreshToken);

  const rawMessage = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`
  ).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

  try {
    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: rawMessage,
      },
    });
    NextResponse.json({ message: "Email sent successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
   NextResponse.json({ error: "Failed to send email" });
  }
}
