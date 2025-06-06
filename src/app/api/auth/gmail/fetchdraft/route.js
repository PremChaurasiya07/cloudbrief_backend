// app/api/gmail/drafts/route.js
import { refreshAccessToken } from "../../../../../../lib/google/refreshAccessToken";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { refreshToken, userId } = await req.json();

    if (!refreshToken || !userId) {
      return NextResponse.json({ error: "Missing refreshToken or userId" }, { status: 400 });
    }

    const gmail = await refreshAccessToken(userId, refreshToken);
    if (!gmail) {
      return NextResponse.json({ error: "Failed to create Gmail client" }, { status: 500 });
    }

    const listResult = await gmail.users.drafts.list({ userId: "me", maxResults: 10 });
    const drafts = listResult.data.drafts ?? [];

    const detailedDrafts = await Promise.all(
      drafts.map(async (draft) => {
        const draftDetail = await gmail.users.drafts.get({ userId: "me", id: draft.id });
        const message = draftDetail.data.message;

        // Extract subject
        const headers = message.payload.headers || [];
        const subjectHeader = headers.find(h => h.name === "Subject");
        const subject = subjectHeader?.value || "(No Subject)";

        // Extract body
        let body = "";
        if (message.payload.body?.data) {
          body = Buffer.from(message.payload.body.data, "base64").toString("utf-8");
        } else if (message.payload.parts) {
          const part = message.payload.parts.find(p => p.mimeType === "text/plain");
          if (part?.body?.data) {
            body = Buffer.from(part.body.data, "base64").toString("utf-8");
          }
        }

        // Extract creation time (internalDate is in ms)
        const createdAt = message.internalDate
          ? new Date(parseInt(message.internalDate)).toISOString()
          : null;

        return {
          id: draft.id,
          subject,
          body,
          createdAt,
        };
      })
    );

    return NextResponse.json({ drafts: detailedDrafts }, { status: 200 });

  } catch (error) {
    console.error("Error fetching drafts:", error);
    return NextResponse.json({ error: "Failed to fetch drafts" }, { status: 500 });
  }
}



