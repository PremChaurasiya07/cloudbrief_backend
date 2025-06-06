import { NextResponse } from "next/server";
import { deleteGmailAndRecord } from "../../../../../../lib/gmail/deleteGmailAndRecord";

export async function POST(req) {
  try {
    const body = await req.json();
    const { userId, refreshToken, gmailMessageId } = body;

    await deleteGmailAndRecord({ userId, refreshToken, gmailMessageId });

    return NextResponse.json(
      { success: true, message: "Email and record deleted successfully" },
      { status: 200 }
    );
  } catch (err) {
    console.error("Delete error:", err);
    return NextResponse.json(
      {
        error: "Failed to delete email or record",
        details: err instanceof Error ? err.message : JSON.stringify(err),
      },
      { status: 500 }
    );
  }
}
