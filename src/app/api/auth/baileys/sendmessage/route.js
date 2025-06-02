// src/app/api/auth/baileys/sendmessage/route.js
import { getWhatsAppClient } from '../../../../../../lib/whatsappSessionManager';
import { NextResponse } from 'next/server';
export async function POST(request) {
    try {
        const { userId, recipientId, messageContent } = await request.json();
        console.log('Received data:', { userId, recipientId, messageContent });

        if (!userId || !recipientId || !messageContent) {
            return NextResponse.json({ error: 'userId, recipientId, and messageContent are required' }, { status: 400 });
        }

        // This call must be awaited as getWhatsAppClient is now async
        const sock = await getWhatsAppClient(userId);

        // Now, crucially, check if the sock is not just present, but also fully connected
        if (!sock || !sock.user || sock.ws.readyState !== sock.ws.OPEN) {
            console.warn(`[Send Message API] WhatsApp client not found or not connected for userId: ${userId}`);
            return NextResponse.json({ error: 'WhatsApp client not found or not connected for this user' }, { status: 404 });
        }

        // Send the message
        const sentMsg = await sock.sendMessage(recipientId, { text: messageContent });

        return NextResponse.json({ success: true, messageId: sentMsg.key.id, timestamp: sentMsg.messageTimestamp });
    } catch (error) {
        console.error('API Error /api/auth/baileys/sendmessage:', error);
        return NextResponse.json({ error: 'Failed to send message', details: error.message }, { status: 500 });
    }
}