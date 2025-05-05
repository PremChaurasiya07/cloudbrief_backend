import { spawn } from 'child_process';
import { startWhatsAppClient, stopWhatsAppClient } from '../lib/whatsapp-client.js';

async function startDev() {
    try {
        // Start WhatsApp client
        await startWhatsAppClient();

        // Start Next.js with Turbopack
        const nextProcess = spawn('npx', ['next', 'dev', '--turbopack'], {
            stdio: 'inherit',
            shell: true,
        });

        nextProcess.on('error', (error) => {
            console.error('❌ Failed to start Next.js:', error.message);
            process.exit(1);
        });

        nextProcess.on('close', (code) => {
            console.log(`🛑 Next.js process exited with code ${code}`);
        });

        // Graceful shutdown
        const shutdown = async () => {
            console.log('🛑 Shutting down...');
            await stopWhatsAppClient();
            nextProcess.kill('SIGTERM');
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

    } catch (error) {
        console.error('❌ Failed to start dev environment:', error.message);
        process.exit(1);
    }
}

startDev();