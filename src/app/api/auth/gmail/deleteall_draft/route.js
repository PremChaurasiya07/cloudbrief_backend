import { refreshAccessToken } from "../callback/route";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { refreshToken, userId } = await req.json();

    if (!refreshToken || !userId) {
      return NextResponse.json({ error: "Missing refreshToken or userId" }, { status: 400 });
    }

    const gmail = await refreshAccessToken(userId, refreshToken);

    // Get list of all drafts
    const draftsResponse = await gmail.users.drafts.list({
      userId: "me",
    });

    const drafts = draftsResponse.data.drafts;

    if (!drafts || drafts.length === 0) {
      return NextResponse.json({ message: "No drafts found" }, { status: 200 });
    }

    // Delete each draft
    for (const draft of drafts) {
      await gmail.users.drafts.delete({
        userId: "me",
        id: draft.id,
      });
    }

    return NextResponse.json({ message: `Deleted ${drafts.length} drafts` }, { status: 200 });

  } catch (error) {
    console.error("Failed to delete all drafts:", error);
    return NextResponse.json({ error: "Failed to delete drafts" }, { status: 500 });
  }
}
