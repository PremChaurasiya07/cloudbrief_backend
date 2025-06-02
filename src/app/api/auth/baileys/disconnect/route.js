// src/app/api/auth/baileys/disconnect/route.js
import { stopWhatsAppClient } from '../../../../../lib/whatsappSessionManager'; // Adjust path as needed
import { NextResponse } from 'next/server';

export async function POST(req) {
    const { userId } = await req.json();

    if (!userId) {
        return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    try {
        await stopWhatsAppClient(userId);
        return NextResponse.json({
            status: 'success',
            message: 'WhatsApp session disconnected successfully.'
        }, { status: 200 });
    } catch (error) {
        console.error(`[API Disconnect ERROR] Error disconnecting WhatsApp for user ${userId}:`, error);
        return NextResponse.json({
            status: 'error',
            message: 'Failed to disconnect WhatsApp session.',
            details: error.message
        }, { status: 500 });
    }
}