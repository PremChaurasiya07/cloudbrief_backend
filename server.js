// import next from 'next';
// import http from 'http';
// import cors from 'cors';
// import { startWhatsAppClient, stopWhatsAppClient } from './lib/whatsapp-client.js';
// import { supabaseServer, verifySupabaseConnection } from './lib/supabase.js';

// const dev = process.env.NODE_ENV !== 'production';
// const app = next({ dev });
// const handle = app.getRequestHandler();

// async function startServer() {
//     try {
//         await app.prepare();
//         const server = http.createServer((req, res) => {
//             // Apply CORS headers
//             cors({
//                 origin: '*',
//                 methods: ['GET', 'POST', 'DELETE', 'PUT'],
//             })(req, res, () => {
//                 handle(req, res);
//             });
//         });

//         // Start WhatsApp client for a specific user ID (e.g., user 1)
//         const userId = "00000000-0000-0000-0000-000000000001";  // You can change this to the user ID you want to use
//         await startWhatsAppClient(userId);

//         // Start Next.js server
//         const PORT = process.env.PORT || 3000;
//         server.listen(PORT, () => {
//             console.log(`Next.js server running on http://localhost:${PORT}`);
//         });

//         // Handle graceful shutdown
//         const shutdown = async () => {
//             console.log('Shutting down server...');
//             await stopWhatsAppClient();  // Make sure we stop the WhatsApp client when shutting down
//             server.close(() => {
//                 console.log('Next.js server closed.');
//                 process.exit(0);
//             });
//         };

//         process.on('SIGINT', shutdown);
//         process.on('SIGTERM', shutdown);
//     } catch (error) {
//         console.error('Failed to start server:', error.message);
//         process.exit(1);
//     }
// }

// startServer();


import next from 'next';
import http from 'http';
import cors from 'cors';
import { startWhatsAppClient, stopWhatsAppClient } from './lib/whatsapp-client.js';
import { supabaseServer, verifySupabaseConnection } from './lib/supabase.js';

// Configuration
const dev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 3000;
const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"; // Default test user

// Initialize Next.js
const app = next({ dev });
const handle = app.getRequestHandler();

class WhatsAppServer {
  constructor() {
    this.server = null;
    this.currentUserId = null;
  }

  async start() {
    try {
      // Verify dependencies
      await verifySupabaseConnection();
      await app.prepare();

      // Create HTTP server with CORS
      this.server = http.createServer((req, res) => {
        cors({
          origin: dev ? '*' : process.env.ALLOWED_ORIGINS?.split(',') || [],
          methods: ['GET', 'POST', 'DELETE', 'PUT'],
        })(req, res, () => handle(req, res));
      });

      // Start WhatsApp client
      this.currentUserId = DEFAULT_USER_ID;
      await startWhatsAppClient(this.currentUserId);
      console.log(`✅ WhatsApp client started for user ${this.currentUserId}`);

      // Start HTTP server
      this.server.listen(PORT, () => {
        console.log(`🚀 Next.js server running on http://localhost:${PORT}`);
        console.log(`   Environment: ${dev ? 'Development' : 'Production'}`);
      });

      // Setup graceful shutdown
      this.setupShutdownHandlers();
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  setupShutdownHandlers() {
    const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    shutdownSignals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
        await this.cleanup();
        process.exit(0);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (err) => {
      console.error('⚠️ Uncaught Exception:', err);
      await this.cleanup();
      process.exit(1);
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
      await this.cleanup();
      process.exit(1);
    });
  }

async cleanup() {
  try {
    console.log('🧹 Cleaning up resources...');

    // ✅ Close WhatsApp connection without logout
    if (this.currentUserId) {
      await stopWhatsAppClient(this.currentUserId);
      console.log('✅ WhatsApp client closed (no logout)');
    }

    // ✅ Close HTTP server
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(() => {
          console.log('✅ HTTP server closed');
          resolve();
        });
      });
    }
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

}

// Start the server
new WhatsAppServer().start().catch(err => {
  console.error('❌ Fatal error during startup:', err);
  process.exit(1);
});