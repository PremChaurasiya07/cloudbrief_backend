// server.js

// import next from 'next';
// import http from 'http';
// import cors from 'cors';
// import pino from 'pino'; // Import pino for consistent logging in server.js

// import { initializeWebSocketServer, closeWebSocketServer } from './lib/websocketServer.js';
// import { shutdownWhatsAppClients, createWhatsAppClient } from './lib/whatsappSessionManager.js'; // Import createWhatsAppClient
// import { verifySupabaseConnection, supabaseServer } from './lib/supabase.js'; // Import supabaseServer for DB queries

// // Configuration
// const dev = process.env.NODE_ENV !== 'production';
// const HTTP_PORT = process.env.PORT || 3000; // HTTP server port for Next.js
// const WS_PORT = process.env.WS_PORT || 8081; // WebSocket server port

// const logger = pino({ level: 'info' }).child({ module: 'MAIN-SERVER' }); // Dedicated logger for server.js

// // Initialize Next.js
// const app = next({ dev });
// const handle = app.getRequestHandler();

// class MainServer {
//     constructor() {
//         this.httpServer = null;
//     }

//     async start() {
//         try {
//             // 1. Verify dependencies (Supabase)
//             await verifySupabaseConnection();
//             logger.info('✅ Supabase connection verified.');

//             // 2. Prepare Next.js app
//             await app.prepare();
//             logger.info('✅ Next.js app prepared.');

//             // 3. Initialize HTTP server for Next.js
//             this.httpServer = http.createServer((req, res) => {
//                 // Apply CORS middleware
//                 cors({
//                     origin: dev ? '*' : process.env.ALLOWED_ORIGINS?.split(',') || [],
//                     methods: ['GET', 'POST', 'DELETE', 'PUT'],
//                     credentials: true, // If you need to send cookies with CORS
//                 })(req, res, () => handle(req, res)); // Let Next.js handle the request
//             });

//             // 4. Start the WebSocket server
//             initializeWebSocketServer(WS_PORT);
//             logger.info(`🚀 WebSocket server running on ws://localhost:${WS_PORT}`);


//             // 5. Start HTTP server
//             this.httpServer.listen(HTTP_PORT, async () => { // Made this async to await initialization
//                 logger.info(`🚀 Next.js HTTP server running on http://localhost:${HTTP_PORT}`);
//                 logger.info(`   Environment: ${dev ? 'Development' : 'Production'}`);
                
//                 // 6. IMPORTANT: Initialize all active WhatsApp clients after other services are ready
//                 await this.initializeAllWhatsAppClients();
//             });

//             // 7. Setup graceful shutdown handlers
//             this.setupShutdownHandlers();

//         } catch (error) {
//             logger.error('❌ Fatal error during server startup:', error);
//             await this.cleanup(); // Attempt cleanup on startup failure
//             process.exit(1);
//         }
//     }

//     // NEW FUNCTION: To initialize WhatsApp clients from DB on startup
//     async initializeAllWhatsAppClients() {
//         logger.info('Initializing WhatsApp clients from DB...');
//         try {
//             const { data: activeSessions, error } = await supabaseServer
//                 .from('app_user_platformid')
//                 .select('user_id, session_status')
//                 .eq('platform', 'whatsapp')
//                 .in('session_status', ['connected', 'reconnecting']); // Only re-initialize these statuses

//             if (error) {
//                 logger.error({ error }, 'Error fetching active WhatsApp sessions from DB on startup.');
//                 return;
//             }

//             if (activeSessions && activeSessions.length > 0) {
//                 logger.info(`Found ${activeSessions.length} active WhatsApp sessions to re-establish.`);
//                 for (const session of activeSessions) {
//                     logger.info(`Attempting to re-create WhatsApp client for user: ${session.user_id} (status: ${session.session_status})`);
//                     // Call createWhatsAppClient for each user
//                     // The .catch() ensures that if one client fails, it doesn't stop others from trying.
//                     createWhatsAppClient(session.user_id)
//                         .catch(err => logger.error({ err, userId: session.user_id }, `Failed to re-create WhatsApp client on startup for user ${session.user_id}`));
//                 }
//             } else {
//                 logger.info('No active WhatsApp sessions found in DB to re-establish on startup.');
//             }
//         } catch (e) {
//             logger.error({ e }, 'Exception during initial WhatsApp client setup on server startup.');
//         }
//     }

//     setupShutdownHandlers() {
//         const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

//         shutdownSignals.forEach(signal => {
//             process.on(signal, async () => {
//                 logger.warn(`\n🛑 Received ${signal}, initiating graceful shutdown...`);
//                 await this.cleanup();
//                 process.exit(0);
//             });
//         });

//         // Handle uncaught exceptions
//         process.on('uncaughtException', async (err) => {
//             logger.error('⚠️ Uncaught Exception:', err);
//             await this.cleanup();
//             process.exit(1);
//         });

//         // Handle unhandled rejections
//         process.on('unhandledRejection', async (reason, promise) => {
//             logger.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
//             await this.cleanup();
//             process.exit(1);
//         });
//     }

//     async cleanup() {
//         try {
//             logger.info('🧹 Cleaning up resources...');

//             // 1. Gracefully shut down all active WhatsApp clients
//             await shutdownWhatsAppClients();
//             logger.info('✅ All WhatsApp clients gracefully shut down.');

//             // 2. Close the WebSocket server
//             closeWebSocketServer();
//             logger.info('✅ WebSocket server closed.');

//             // 3. Close HTTP server
//             if (this.httpServer) {
//                 await new Promise((resolve, reject) => {
//                     this.httpServer.close((err) => {
//                         if (err) {
//                             logger.error('❌ Error closing HTTP server:', err);
//                             return reject(err);
//                         }
//                         logger.info('✅ HTTP server closed.');
//                         resolve();
//                     });
//                 });
//             }
//         } catch (error) {
//             logger.error('❌ Error during cleanup:', error);
//         }
//     }
// }

// // Start the main server
// new MainServer().start().catch(err => {
//     logger.error('❌ Fatal error during MainServer startup:', err);
//     process.exit(1);
// });

// server.js
import next from 'next';
import http from 'http';
import cors from 'cors';
import { parse } from 'url';
import pino from 'pino';

import { initializeWebSocketServer, closeWebSocketServer } from './lib/websocketServer.js';
import { shutdownWhatsAppClients, createWhatsAppClient } from './lib/whatsappSessionManager.js';
import { verifySupabaseConnection, supabaseServer } from './lib/supabase.js';

const dev = process.env.NODE_ENV !== 'production';
const HTTP_PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8081;

const logger = pino({ level: 'info' }).child({ module: 'MAIN-SERVER' });

const app = next({ dev });
const handle = app.getRequestHandler();

class MainServer {
    constructor() {
        this.httpServer = null;
    }

    async start() {
        try {
            await verifySupabaseConnection();
            logger.info('✅ Supabase connection verified.');

            await app.prepare();
            logger.info('✅ Next.js app prepared.');

            const corsMiddleware = cors({
                origin: dev ? '*' : process.env.ALLOWED_ORIGINS?.split(',') || [],
                methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
                allowedHeaders: ['Content-Type'],
                credentials: true,
            });

            this.httpServer = http.createServer((req, res) => {
                corsMiddleware(req, res, () => {
                    if (req.method === 'OPTIONS') {
                        res.writeHead(204);
                        res.end();
                        return;
                    }

                    const parsedUrl = parse(req.url, true);
                    handle(req, res, parsedUrl);
                });
            });

            initializeWebSocketServer(WS_PORT);
            logger.info(`🚀 WebSocket server running on ws://localhost:${WS_PORT}`);

            this.httpServer.listen(HTTP_PORT, async () => {
                logger.info(`🚀 Next.js HTTP server running on http://localhost:${HTTP_PORT}`);
                logger.info(`   Environment: ${dev ? 'Development' : 'Production'}`);
                await this.initializeAllWhatsAppClients();
            });

            this.setupShutdownHandlers();

        } catch (error) {
            logger.error('❌ Fatal error during server startup:', error);
            await this.cleanup();
            process.exit(1);
        }
    }

    async initializeAllWhatsAppClients() {
        logger.info('Initializing WhatsApp clients from DB...');
        try {
            const { data: activeSessions, error } = await supabaseServer
                .from('app_user_platformid')
                .select('user_id, session_status')
                .eq('platform', 'whatsapp')
                .in('session_status', ['connected', 'reconnecting']);

            if (error) {
                logger.error({ error }, 'Error fetching active WhatsApp sessions from DB on startup.');
                return;
            }

            if (activeSessions && activeSessions.length > 0) {
                logger.info(`Found ${activeSessions.length} active WhatsApp sessions to re-establish.`);
                for (const session of activeSessions) {
                    logger.info(`Re-creating WhatsApp client for user: ${session.user_id}`);
                    createWhatsAppClient(session.user_id)
                        .catch(err => logger.error({ err, userId: session.user_id }, `Failed to re-create WhatsApp client`));
                }
            } else {
                logger.info('No active WhatsApp sessions found to re-establish.');
            }
        } catch (e) {
            logger.error({ e }, 'Exception during WhatsApp client setup.');
        }
    }

    setupShutdownHandlers() {
        const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
        shutdownSignals.forEach(signal => {
            process.on(signal, async () => {
                logger.warn(`\n🛑 Received ${signal}, initiating graceful shutdown...`);
                await this.cleanup();
                process.exit(0);
            });
        });

        process.on('uncaughtException', async (err) => {
            logger.error('⚠️ Uncaught Exception:', err);
            await this.cleanup();
            process.exit(1);
        });

        process.on('unhandledRejection', async (reason, promise) => {
            logger.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
            await this.cleanup();
            process.exit(1);
        });
    }

    async cleanup() {
        try {
            logger.info('🧹 Cleaning up resources...');
            await shutdownWhatsAppClients();
            logger.info('✅ WhatsApp clients shut down.');
            closeWebSocketServer();
            logger.info('✅ WebSocket server closed.');
            if (this.httpServer) {
                await new Promise((resolve, reject) => {
                    this.httpServer.close((err) => {
                        if (err) {
                            logger.error('❌ Error closing HTTP server:', err);
                            return reject(err);
                        }
                        logger.info('✅ HTTP server closed.');
                        resolve();
                    });
                });
            }
        } catch (error) {
            logger.error('❌ Error during cleanup:', error);
        }
    }
}

new MainServer().start().catch(err => {
    logger.error('❌ Fatal error during MainServer startup:', err);
    process.exit(1);
});
