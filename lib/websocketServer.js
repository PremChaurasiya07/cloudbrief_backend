// lib/websocketServer.js (No changes needed)
import { WebSocketServer } from 'ws';
import {
    createWhatsAppClient,
    getWhatsAppSessionStatus,
    shutdownWhatsAppClient,
    logoutWhatsAppClient
} from './whatsappSessionManager.js';

const userWebSockets = new Map();
let wss = null;

export const initializeWebSocketServer = (port) => {
    if (wss) {
        console.warn('WebSocket server already initialized.');
        return wss;
    }

    wss = new WebSocketServer({ port });

    wss.on('listening', () => {
        console.log(`✅ WebSocket server listening on port ${port}`);
    });

    wss.on('connection', async (ws, req) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const userId = url.searchParams.get('userId');

        if (!userId) {
            console.warn('WebSocket connection attempt without userId. Closing.');
            ws.close(1008, 'User ID required');
            return;
        }

        console.log(`WebSocket client connected for user: ${userId}`);
        userWebSockets.set(userId, ws);

        const initialStatusInfo = await getWhatsAppSessionStatus(userId);
        sendWebSocketMessage(userId, 'status', initialStatusInfo);
        console.log(`Sent initial status to user ${userId}: ${initialStatusInfo.status}`);

        if (initialStatusInfo.status === 'logged_out') {
            console.log(`User ${userId} is logged out. Automatically initiating WhatsApp client creation to get QR.`);
            await createWhatsAppClient(userId);
        }

        ws.on('message', async (message) => {
            console.log(`Received message from user ${userId}: ${message.toString()}`);
            try {
                const parsedMessage = JSON.parse(message.toString());

                switch (parsedMessage.type) {
                    case 'request_status':
                        console.log(`Handling request_status for user ${userId}`);
                        const sessionStatusInfo = await getWhatsAppSessionStatus(userId);
                        sendWebSocketMessage(userId, 'status', sessionStatusInfo);
                        console.log(`Sent status response to user ${userId}: ${sessionStatusInfo.status}`);
                        break;

                    case 'connect_whatsapp':
                        console.log(`Handling connect_whatsapp for user ${userId}`);
                        await createWhatsAppClient(userId);
                        break;

                    case 'logout_whatsapp':
                        console.log(`Handling logout_whatsapp for user ${userId}`);
                        await logoutWhatsAppClient(userId);
                        break;

                    default:
                        console.warn(`Unknown message type from user ${userId}: ${parsedMessage.type}`);
                        sendWebSocketMessage(userId, 'error', { message: `Unknown message type: ${parsedMessage.type}` });
                }
            } catch (e) {
                console.error(`Failed to parse or process WS message from user ${userId}:`, e);
                sendWebSocketMessage(userId, 'error', { message: `Failed to process message: ${e.message}` });
            }
        });

        ws.on('close', () => {
            console.log(`WebSocket client disconnected for user: ${userId}`);
            userWebSockets.delete(userId);
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error for user ${userId}:`, error);
        });
    });

    wss.on('error', (error) => {
        console.error('❌ WebSocket server error:', error);
    });

    return wss;
};

export const sendWebSocketMessage = (userId, type, payload) => {
    const ws = userWebSockets.get(userId);
    if (ws && ws.readyState === ws.OPEN) {
        try {
            ws.send(JSON.stringify({ type, payload }));
            console.log(`Sent WS message to user ${userId}: type=${type}`);
            return true;
        } catch (error) {
            console.error(`Failed to send WS message to user ${userId}:`, error);
            return false;
        }
    }
    console.log(`No active WebSocket for user ${userId} to send message of type ${type}.`);
    return false;
};

export const closeWebSocketServer = () => {
    if (wss) {
        console.log('Closing WebSocket server...');
        wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
                client.close(1001, 'Server is shutting down');
            }
        });
        wss.close(() => {
            console.log('WebSocket server closed.');
        });
        wss = null;
        userWebSockets.clear();
    }
};