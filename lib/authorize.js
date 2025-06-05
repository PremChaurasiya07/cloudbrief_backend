import { google } from 'googleapis';
import { supabase } from '../lib/supabase';

export const authorize = async (user_id, gmail) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { data, error } = await supabase
      .from('email_auth')
      .select('access_token, refresh_token')
      .eq('user_id', user_id)
      .eq('gmail_id', gmail)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error || !data) {
      throw new Error('No Gmail found for the user or error fetching credentials.');
    }

    oauth2Client.setCredentials({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });

  } catch (error) {
    console.error('Error during authorization:', error);
    throw error; // Let the calling route handle the error
  }
};
