
import { refreshAccessToken } from "../../../../../../lib/google/refreshAccessToken";
import { NextResponse } from "next/server";

export async function POST(req) {
  const { to, subject, body, refreshToken, userId } = await req.json();

  if (!refreshToken || !userId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // ✅ Step 1: Get new access token
  const gmail = await refreshAccessToken(userId, refreshToken);

  // ✅ Step 3: Create the raw email content
  const rawMessage = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  try {
    // ✅ Step 4: Save draft
    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw: rawMessage,
        },
      },
    });
    console.log("Draft saved successfully:", draft.data.id);
    
    return NextResponse.json({ draftId: draft.data.id }, { status: 200 });
  } catch (error) {
    console.error("Error saving draft:", error);
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }
}
