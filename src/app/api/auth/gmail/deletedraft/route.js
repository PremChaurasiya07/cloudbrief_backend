import { refreshAccessToken } from "../callback/route";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { draftId, refreshToken, userId } = await req.json();

    if (!draftId || !refreshToken || !userId) {
      return NextResponse.json({ error: "Missing draftId, refreshToken, or userId" }, { status: 400 });
    }

    const gmail = await refreshAccessToken(userId, refreshToken); // Await this!

    await gmail.users.drafts.delete({
      userId: "me",
      id: draftId,
    });

    return NextResponse.json({ message: "Draft deleted successfully" }, { status: 200 });

  } catch (error) {
    console.error("Failed to delete draft:", error);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
}
