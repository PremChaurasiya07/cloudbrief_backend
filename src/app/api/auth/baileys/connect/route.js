// src/app/api/auth/baileys/connect/route.js
import { createWhatsAppClient } from '../../../../../../lib/whatsappSessionManager'; // Adjust path as needed
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // You'll need to get the userId. This typically comes from your authentication system.
    // For a simple test, you might hardcode it or pass it in the request body for now,
    // but for a production app, it should be derived from the user's session/token.
    const { userId } = await request.json(); // Or retrieve from session/headers
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    await createWhatsAppClient(userId);
    return NextResponse.json({ message: 'WhatsApp connection initiated' });
  } catch (error) {
    console.error('API Error /api/auth/baileys/connect:', error);
    return NextResponse.json({ error: 'Failed to initiate WhatsApp connection', details: error.message }, { status: 500 });
  }
}