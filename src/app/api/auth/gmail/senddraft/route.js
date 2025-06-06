// pages/api/gmail/sendDraft.js
import { refreshAccessToken } from "../../../../../../lib/google/refreshAccessToken";

export default async function handler(req, res) {
  const { draftId, accessToken,userId } = req.json();
  if (!draftId || !accessToken||!userId) return res.status(400).json({ error: "Missing draftId or accessToken" });

  const gmail = refreshAccessToken(userId,accessToken);

  try {
    await gmail.users.drafts.send({
      userId: "me",
      requestBody: { id: draftId },
    });
    res.status(200).json({ message: "Draft sent successfully" });
  } catch (error) {
    console.error("Error sending draft:", error);
    res.status(500).json({ error: "Failed to send draft" });
  }
}
