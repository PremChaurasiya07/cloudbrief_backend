import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { supabase } from '../../../../../../lib/supabase';

export async function POST(req) {
  try {
    const body = await req.json();
    const { accessToken, refreshToken, gmailMessageId } = body;
    const supabaseId=process.env.SUPABASE_ID;
    // Validate required parameters
    if (!accessToken || !refreshToken || !gmailMessageId || !supabaseId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Ensure environment variables are set
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({ error: 'Missing Google OAuth credentials' }, { status: 500 });
    }

    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // Refresh the access token
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
    } catch (err) {
      console.error('Token refresh error:', err);
      return NextResponse.json({ error: 'Failed to refresh access token' }, { status: 401 });
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Delete the message from Gmail
    try {
      const response = await gmail.users.messages.delete({
        userId: 'me',
        id: gmailMessageId,
      });

      if (response.status !== 204) {
        console.warn('Unexpected Gmail API delete response:', response.status);
      }
      console.log('Gmail message deleted:', gmailMessageId);
    } catch (err) {
      console.error('Gmail API error:', err);
      return NextResponse.json(
        { error: 'Failed to delete email from Gmail', details: err },
        { status: 500 }
      );
    }

    // Hard delete from Supabase
    try {
      const { error: supabaseError } = await supabase
        .from('memory_entries')
        .delete()
        .eq('chat_id', gmailMessageId);

      if (supabaseError) {
        throw supabaseError;
      }

      console.log('Supabase record deleted:', supabaseId);
    } catch (err) {
      console.error('Supabase delete error:', err);
      return NextResponse.json(
        { error: 'Failed to delete record from Supabase', details: err },
        { status: 500 }
      );
    }

    // Return success
    return NextResponse.json(
      { success: true, message: 'Email and record deleted successfully' },
      { status: 200 }
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: err instanceof Error ? err.message : JSON.stringify(err),
      },
      { status: 500 }
    );
  }
}
