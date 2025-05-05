import next from 'next';
import http from 'http';
import cors from 'cors';
import { startWhatsAppClient, stopWhatsAppClient } from './lib/whatsapp-client.js';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

async function startServer() {
    try {
        await app.prepare();
        const server = http.createServer((req, res) => {
            // Apply CORS headers
            cors({
                origin: '*',
                methods: ['GET', 'POST', 'DELETE', 'PUT'],
            })(req, res, () => {
                handle(req, res);
            });
        });

        // Start WhatsApp client for a specific user ID (e.g., user 1)
        const userId = "00000000-0000-0000-0000-000000000001";  // You can change this to the user ID you want to use
        await startWhatsAppClient(userId);

        // Start Next.js server
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`Next.js server running on http://localhost:${PORT}`);
        });

        // Handle graceful shutdown
        const shutdown = async () => {
            console.log('Shutting down server...');
            await stopWhatsAppClient();  // Make sure we stop the WhatsApp client when shutting down
            server.close(() => {
                console.log('Next.js server closed.');
                process.exit(0);
            });
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
}

startServer();
