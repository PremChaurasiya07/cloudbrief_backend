import { supabase } from "../supabase.js";
import { refreshAccessToken } from "../google/refreshAccessToken.js" // ✅ adjust path as needed

export async function deleteGmailAndRecord({ userId, refreshToken, gmailMessageId }) {
    console.log(userId,refreshToken,gmailMessageId)
  if (!userId || !refreshToken || !gmailMessageId) {
    throw new Error("Missing required parameters.");
  }

  const gmail = await refreshAccessToken(userId, refreshToken); // ✅ reuse your helper

  if (!gmail) {
    throw new Error("Failed to authenticate Gmail client.");
  }

  // Delete Gmail message
  try {
    const response = await gmail.users.messages.delete({
      userId: "me",
      id: gmailMessageId,
    });

    if (response.status !== 204) {
      console.warn("Unexpected Gmail API delete response:", response.status);
    }
  } catch (err) {
    throw new Error("Failed to delete email from Gmail.");
  }

  // Delete from Supabase
  const { error: supabaseError } = await supabase
    .from("memory_entries")
    .delete()
    .eq("chat_id", gmailMessageId);

  if (supabaseError) {
    throw new Error("Failed to delete record from Supabase.");
  }

  return { success: true };
}
