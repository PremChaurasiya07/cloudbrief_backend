import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { supabase } from '../../../../../../lib/supabase';

export async function POST(req) {
  try {
    const body = await req.json();
    const { accessToken, refreshToken, gmailMessageId, supabaseId } = body;

    // Validate required parameters
    if (!accessToken || !refreshToken || !gmailMessageId || !supabaseId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // Refresh the access token if necessary
    try {
      await oauth2Client.getAccessToken(); // Will refresh if expired
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
      console.log('Gmail message deleted:', response.status);
    } catch (err) {
      console.error('Gmail API error:', err);
      return NextResponse.json(
        { error: 'Failed to delete email from Gmail', details: err },
        { status: 500 }
      );
    }

    // **Hard delete from Supabase** - Removing the record completely
    const { error: supabaseError } = await supabase
      .from('memory_entries')
      .delete()
      .eq('id', supabaseId);

    if (supabaseError) {
      console.error('Supabase delete error:', supabaseError);
      return NextResponse.json(
        { error: 'Failed to delete record from Supabase', details: supabaseError },
        { status: 500 }
      );
    }

    // Successfully deleted both email and Supabase record
    return NextResponse.json({ success: true, message: 'Email and record deleted successfully' }, { status: 200 });

  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : err },
      { status: 500 }
    );
  }
}
