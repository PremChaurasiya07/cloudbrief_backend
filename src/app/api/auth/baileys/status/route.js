// src/app/api/auth/baileys/status/route.js
import { getWhatsAppSessionStatus } from '../../../../../../lib/whatsappSessionManager'; // Adjust path as needed
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    // Get userId from query params, headers, or session
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId'); // Assuming userId is passed as a query param
    // In a real app, you'd get userId from session or JWT

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const status = await getWhatsAppSessionStatus(userId);
    return NextResponse.json(status);
  } catch (error) {
    console.error('API Error /api/auth/baileys/status:', error);
    return NextResponse.json({ error: 'Failed to get WhatsApp status', details: error.message }, { status: 500 });
  }
}