// pages/api/auth/gmail/refresh.js

import { google } from 'googleapis';
import { supabase } from '../../../../../../lib/supabase';

export async function POST(req) {
  const { refresh_token } = await req.json(); // Refresh token from request body
  console.log('Received refresh_token:', refresh_token); // Log the received refresh token

  if (!refresh_token) {
    return new Response(
      JSON.stringify({ error: 'Missing refresh_token' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Fetch the user's refresh token from Supabase
    const { data, error } = await supabase
      .from('email_auth')
      .select('refresh_token')
      .eq('refresh_token', refresh_token)
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: 'Refresh token not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const storedRefreshToken = data.refresh_token;

    // Initialize Google OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({ refresh_token: storedRefreshToken });

    // Refresh access token
    const { credentials } = await oauth2Client.refreshAccessToken();

    console.log('Fetched credentials:', credentials);

    // Calculate expiry_date in milliseconds
    let expiryDateMs;

    if (credentials.expiry_date) {
      expiryDateMs = credentials.expiry_date; // Already an absolute timestamp in ms
    } else if (credentials.expires_in) {
      expiryDateMs = Date.now() + credentials.expires_in * 1000; // expires_in is in seconds
    } else {
      // If none provided, default to 1 hour from now
      expiryDateMs = Date.now() + 3600 * 1000;
    }

    console.log('Calculated expiryDateMs:', expiryDateMs);

    // Update access token and expiry date in Supabase
    const { error: updateError } = await supabase
      .from('email_auth')
      .update({
        access_token: credentials.access_token,
        token_expiry: credentials.expiry_date, // Store expiry date as absolute ms timestamp
      })
      .eq('refresh_token', refresh_token);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to update access token' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Return new token
    return new Response(
      JSON.stringify({ access_token: credentials.access_token, token_expiry: expiryDateMs }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to refresh access token' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
