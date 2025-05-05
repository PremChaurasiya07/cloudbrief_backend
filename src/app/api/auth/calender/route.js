import { google } from 'googleapis';
import { supabase } from '../../../../../lib/supabase';
import { NextResponse } from 'next/server';

const authorize = async (user_id,gmail) => {
  // console.log('Authorizing gmail:', gmail); // Log the user ID for debugging
  try {
    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Fetch user credentials from Supabase
    const { data, error } = await supabase
      .from('email_auth')
      .select('access_token, refresh_token')
      .eq('user_id', user_id)
      .eq('gmail_id', gmail) // Use the provided Gmail address to filter
      .order('created_at', { ascending: true }) // fetch oldest Gmail ID first
      .limit(1)
      .single();
      // console.log('Fetched credentials:', data); // Log the fetched credentials for debugging

    if (error || !data) {
      throw new Error('No Gmail found for the user or error fetching credentials.');
    }

    // Set OAuth2 credentials
    oauth2Client.setCredentials({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });

    // Return the Google Calendar API client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    return calendar;

  } catch (error) {
    console.error('Error during authorization:', error);
    // Return an error response in case of failure
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export default authorize;
