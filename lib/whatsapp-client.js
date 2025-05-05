// import pkg from '@whiskeysockets/baileys';
// import { fileURLToPath } from 'url';
// import path from 'path';
// import fs from 'fs';
// import { supabase } from './supabase.js';
// import pino from 'pino';
// import qrcode from 'qrcode-terminal';
// import embed from '../src/app/api/auth/embedding.js';

// const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = pkg;
// const logger = pino({ level: 'fatal' }); // Only show fatal errors

// let sock = null;
// let embedTimeout = null;

// function triggerEmbedDebounced(delay = 5000) {
//     if (embedTimeout) clearTimeout(embedTimeout);
//     embedTimeout = setTimeout(() => {
//         console.log('⚙️ Running embed batch...');
//         embed().catch(err => console.error('❌ Embedding error:', err));
//     }, delay);
// }

// // Get current directory path dynamically for auth folder
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// async function startWhatsAppClient(userId) {
//     const { version } = await fetchLatestBaileysVersion();
//     console.log(`Using Baileys version: ${version.join('.')}`);

//     // Create a user-specific auth folder
//     const authStatePath = path.join(__dirname, 'auth', userId.toString()); // User-specific folder
//     if (!fs.existsSync(authStatePath)) {
//         fs.mkdirSync(authStatePath, { recursive: true });
//     }

//     const { state, saveCreds } = await useMultiFileAuthState(authStatePath);

//     sock = makeWASocket({
//         version,
//         logger,
//         printQRInTerminal: false,
//         auth: state,
//         browser: ['CloudBrief-WhatsApp', 'Chrome', '1.0'],
//     });

//     sock.ev.on('creds.update', saveCreds);

//     sock.ev.on('connection.update', async (update) => {
//         const { connection, lastDisconnect, qr } = update;

//         if (qr) {
//             console.log('🖨️ QR code generated. Scan with WhatsApp to login:');
//             qrcode.generate(qr, { small: true });
//         }

//         if (connection === 'open') {
//             console.log('✅ Connected to WhatsApp successfully!');
//             const waId = sock.user.id;
//             const myName = sock.user.name;
//             console.log('My WhatsApp ID:', waId);
//             console.log('My Name:', myName);

//             const { error } = await supabase
//                 .from('app_user_platformid')
//                 .upsert([{
//                     user_id: userId,
//                     current_platform_id: waId,
//                     platform: 'whatsapp',
//                     session_status: 'active', // Added session_status
//                 }], { onConflict: ['user_id', 'platform'] });

//             if (error) {
//                 console.error('❌ Failed to save WhatsApp ID to Supabase:', error.message);
//             } else {
//                 console.log(`✅ WhatsApp ID ${waId} saved for user ${userId}`);
//             }
//         }

//         if (connection === 'close') {
//             const statusCode = lastDisconnect?.error?.output?.statusCode;
//             const errorMessage = lastDisconnect?.error?.message || 'Unknown error';

//             if (statusCode === 401) {
//                 console.error('⚠️ Session expired. Delete auth folder and restart.');
//                 await supabase
//                     .from('app_user_platformid')
//                     .update({ session_status: 'expired' })  // Update session status to expired
//                     .eq('user_id', userId)
//                     .eq('platform', 'whatsapp');
//                 process.exit(1);
//             } else {
//                 console.error('🔄 Connection closed:', errorMessage);
//                 console.log('🔁 Reconnecting in 10 seconds...');
//                 await supabase
//                     .from('app_user_platformid')
//                     .update({ session_status: 'inactive' })  // Update session status to inactive on disconnect
//                     .eq('user_id', userId)
//                     .eq('platform', 'whatsapp');
//                 setTimeout(() => startWhatsAppClient(userId), 10000);
//             }
//         }
//     });

//     sock.ev.on('messages.upsert', async (m) => {
//         const messages = m.messages;
//         for (const msg of messages) {
//             if (!msg.message) continue;

//             const from = msg.key.remoteJid;
//             const isGroup = from.endsWith('@g.us');
//             const senderJid = msg.key.participant || msg.key.remoteJid;
//             const senderName = msg.pushName || 'Unknown';
//             const isFromMe = msg.key.fromMe;
//             const timestamp = new Date(Number(msg.messageTimestamp) * 1000).toISOString();

//             const deliveryStatus = msg.status === 1 ? 'Sent' :
//                                     msg.status === 2 ? 'Delivered' :
//                                     msg.status === 3 ? 'Read' :
//                                     'Unknown';

//             let messageType = 'unknown';
//             let content = '';

//             if (msg.message.conversation) {
//                 messageType = 'text';
//                 content = msg.message.conversation;
//             } else if (msg.message.extendedTextMessage?.text) {
//                 messageType = 'text';
//                 content = msg.message.extendedTextMessage.text;
//             } else if (msg.message.imageMessage) {
//                 messageType = 'image';
//                 content = msg.message.imageMessage.caption || '';
//             } else if (msg.message.videoMessage) {
//                 messageType = 'video';
//                 content = msg.message.videoMessage.caption || '';
//             } else if (msg.message.audioMessage) {
//                 messageType = 'audio';
//                 content = '[Voice Message]';
//             } else if (msg.message.stickerMessage) {
//                 messageType = 'sticker';
//                 content = '[Sticker]';
//             }

//             if (!content && ['audio', 'sticker'].includes(messageType)) {
//                 content = `[${messageType.charAt(0).toUpperCase() + messageType.slice(1)}]`;
//             }

//             if (!content) {
//                 console.log('❌ Skipping empty message');
//                 continue;
//             }

//             let chatName = null;
//             if (isGroup) {
//                 try {
//                     const groupMetadata = await sock.groupMetadata(from);
//                     chatName = groupMetadata.subject || null;
//                 } catch (err) {
//                     console.error('⚠️ Failed to fetch group metadata:', err.message);
//                 }
//             } else {
//                 // For 1:1 chat, show the other person's name
//                 if (isFromMe) {
//                     chatName = msg.pushName || from.split('@')[0];
//                 } else {
//                     chatName = senderName;
//                 }
//             }

//             let receiverName = isFromMe
//                 ? (isGroup ? (chatName || 'Group') : (msg.pushName || from.split('@')[0]))
//                 : 'Me';

//             console.log(`\n📥 New ${messageType} from ${isGroup ? 'group' : 'chat'} ${from}`);
//             console.log(`  🧑 Sender: ${senderName} (${senderJid})`);
//             console.log(`  🕓 Timestamp: ${timestamp}`);
//             console.log(`  🏷️ Content: ${content}`);
//             console.log('  --------');

//             let saved = false;
//             let retries = 0;
//             while (!saved && retries < 3) {
//                 try {
//                     const { error } = await supabase.from('memory_entries').insert({
//                         chat_id: from,
//                         chat_name: chatName,
//                         content: content,
//                         type: messageType,
//                         source: 'whatsapp',
//                         created_at: timestamp,
//                         sender: senderName,
//                         receiver: receiverName,
//                         delivery_status: deliveryStatus,
//                         metadata: {
//                             chat_id: from,
//                             chat_name: chatName,
//                             sender: senderName,
//                             sender_jid: senderJid,
//                             receiver: receiverName,
//                             from_me: isFromMe,
//                             timestamp: timestamp,
//                             message_id: msg.key.id,
//                             message_type: messageType,
//                             full_message: msg.message,
//                         },
//                     });

//                     if (error) throw error;
//                     console.log('✅ Saved message to Supabase');
//                     saved = true;
//                 } catch (error) {
//                     retries++;
//                     console.error(`❌ Failed to save message (attempt ${retries}):`, error.message);
//                     if (retries >= 3) {
//                         console.error('❌ Giving up after 3 attempts.');
//                     } else {
//                         console.log('🔁 Retrying in 2 seconds...');
//                         await new Promise(res => setTimeout(res, 2000));
//                     }
//                 }
//             }
//         }

//         // Debounced batch embedding trigger
//         triggerEmbedDebounced();
//     });
// }

// async function stopWhatsAppClient() {
//     if (sock) {
//         try {
//             await sock.logout();
//             console.log('✅ WhatsApp client disconnected successfully.');

//             // Update session status to inactive when stopped
//             await supabase
//                 .from('app_user_platformid')
//                 .update({ session_status: 'inactive' })
//                 .eq('platform', 'whatsapp');

//         } catch (error) {
//             console.error('❌ Failed to disconnect WhatsApp client:', error.message);
//         }
//         sock = null;
//     }
// }

// export { startWhatsAppClient, stopWhatsAppClient };


import pkg from '@whiskeysockets/baileys';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { supabaseServer } from '../lib/supabase.js'; // Use server-side client
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import embed from '../src/app/api/auth/embedding.js';

const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = pkg;
const logger = pino({ level: 'fatal' });

let sock = null;
let embedTimeout = null;
let currentUserId = null;

// Debounce embedding trigger
function triggerEmbedDebounced(delay = 5000) {
    if (embedTimeout) clearTimeout(embedTimeout);
    embedTimeout = setTimeout(() => {
        console.log('⚙️ Running embed batch...');
        embed().catch(err => console.error('❌ Embedding error:', err));
    }, delay);
}

// Supabase Storage bucket name
const STORAGE_BUCKET = 'whatsapp-session';

// Temporary local folder for auth files
const TEMP_DIR = path.join(os.tmpdir(), 'whatsapp-auth');

// Helper to ensure directory exists
async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}

// Helper to log Supabase client configuration
async function logSupabaseConfig() {
    try {
        const { data: { user }, error } = await supabaseServer.auth.getUser();
        const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY === supabaseServer.auth.api.apiKey
            ? 'service_role'
            : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === supabaseServer.auth.api.apiKey
            ? 'anon'
            : 'unknown';
        console.log('DEBUG: Supabase Server Config:', {
            keyType,
            user: user ? user.id : 'null',
            authError: error?.message || 'none',
            url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'undefined'
        });
        return keyType;
    } catch (err) {
        console.error('❌ Failed to check Supabase config:', err.stack);
        return 'error';
    }
}

// Helper to validate Supabase configuration
function validateSupabaseConfig() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        throw new Error('❌ NEXT_PUBLIC_SUPABASE_URL is not defined');
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('❌ SUPABASE_SERVICE_ROLE_KEY is not defined');
    }
    if (!supabaseServer.auth.api.apiKey) {
        throw new Error('❌ Supabase server client is not initialized with an API key');
    }
    if (supabaseServer.auth.api.apiKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        throw new Error('❌ Supabase server client is using anon key instead of service role key');
    }
}

// Helper to check if session files exist in Supabase Storage
async function checkSessionExists(userId) {
    try {
        validateSupabaseConfig();
        const keyType = await logSupabaseConfig();
        if (keyType !== 'service_role') {
            console.warn('⚠️ Supabase server client is not using service_role key. Uploads may fail.');
        }
        const { data: fileList, error } = await supabaseServer.storage
            .from(STORAGE_BUCKET)
            .list(`${userId}/`);

        if (error) {
            console.error('❌ Failed to check session files in Supabase Storage:', error.message);
            throw error;
        }

        const hasFiles = fileList && fileList.length > 0 && fileList.some(file => file.name === 'creds.json');
        console.log(`DEBUG: Session files ${hasFiles ? 'found' : 'not found'} for user ${userId}`);
        return hasFiles;
    } catch (error) {
        console.error('❌ Error checking session existence:', error.stack);
        return false;
    }
}

// Helper to upload auth files to Supabase Storage with retries
async function uploadAuthFilesToStorage(userId, authStatePath, retries = 3, delayMs = 2000) {
    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            validateSupabaseConfig();
            await logSupabaseConfig();
            const files = await fs.readdir(authStatePath, { withFileTypes: true });
            for (const file of files) {
                if (file.isFile()) {
                    const filePath = path.join(authStatePath, file.name);
                    const fileContent = await fs.readFile(filePath);
                    const storagePath = `${userId}/${file.name}`;

                    const { error } = await supabaseServer.storage
                        .from(STORAGE_BUCKET)
                        .upload(storagePath, fileContent, {
                            upsert: true,
                            contentType: 'application/json'
                        });

                    if (error) {
                        console.error(`❌ Failed to upload ${file.name} to Supabase Storage (attempt ${attempt}/${retries}):`, {
                            message: error.message,
                            statusCode: error.statusCode || 'N/A',
                            details: error
                        });
                        throw error;
                    }
                    console.log(`DEBUG: Uploaded ${file.name} to Supabase Storage at ${storagePath}`);
                }
            }
            console.log('✅ All auth files uploaded to Supabase Storage');
            return true;
        } catch (error) {
            lastError = error;
            if (attempt < retries) {
                console.log(`⚠️ Retrying upload (attempt ${attempt + 1}/${retries}) in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
            }
            console.error('❌ Failed to upload auth files to Supabase Storage after retries:', error.message || error.stack);
            return false;
        }
    }
    console.error('❌ Upload failed after all retries:', lastError?.message || lastError?.stack || 'Unknown error');
    return false;
}

// Helper to download auth files from Supabase Storage
async function downloadAuthFilesFromStorage(userId, authStatePath) {
    try {
        validateSupabaseConfig();
        await logSupabaseConfig();
        const { data: fileList, error: listError } = await supabaseServer.storage
            .from(STORAGE_BUCKET)
            .list(`${userId}/`);

        if (listError) {
            console.error('❌ Failed to list files in Supabase Storage:', listError.message);
            throw listError;
        }

        if (!fileList || fileList.length === 0) {
            console.log('ℹ️ No auth files found in Supabase Storage for user:', userId);
            return false;
        }

        await ensureDir(authStatePath);

        for (const file of fileList) {
            const { data, error } = await supabaseServer.storage
                .from(STORAGE_BUCKET)
                .download(`${userId}/${file.name}`);

            if (error) {
                console.error(`❌ Failed to download ${file.name} from Supabase Storage:`, error.message);
                throw error;
            }

            const filePath = path.join(authStatePath, file.name);
            const buffer = Buffer.from(await data.arrayBuffer());
            await fs.writeFile(filePath, buffer);
            console.log(`DEBUG: Downloaded ${file.name} to ${filePath}`);
        }

        console.log('✅ All auth files downloaded from Supabase Storage');
        return true;
    } catch (error) {
        console.error('❌ Failed to download auth files from Supabase Storage:', error.stack);
        return false;
    }
}

// Helper to delete auth files from Supabase Storage
async function deleteAuthFilesFromStorage(userId) {
    try {
        validateSupabaseConfig();
        await logSupabaseConfig();
        const { data: fileList, error: listError } = await supabaseServer.storage
            .from(STORAGE_BUCKET)
            .list(`${userId}/`);

        if (listError) {
            console.error('❌ Failed to list files in Supabase Storage for deletion:', listError.message);
            throw listError;
        }

        if (!fileList || fileList.length === 0) {
            console.log('ℹ️ No auth files to delete in Supabase Storage for user:', userId);
            return;
        }

        const filePaths = fileList.map(file => `${userId}/${file.name}`);
        const { error } = await supabaseServer.storage
            .from(STORAGE_BUCKET)
            .remove(filePaths);

        if (error) {
            console.error('❌ Failed to delete auth files from Supabase Storage:', error.message);
            throw error;
        }

        console.log('✅ Auth files deleted from Supabase Storage');
    } catch (error) {
        console.error('❌ Failed to delete auth files from Supabase Storage:', error.stack);
        throw error;
    }
}

async function startWhatsAppClient(userId, retryAttempt = 0) {
    try {
        currentUserId = userId;
        const { version } = await fetchLatestBaileysVersion();
        console.log(`Using Baileys version: ${version.join('.')}`);

        // Create a user-specific temporary auth folder
        const authStatePath = path.join(TEMP_DIR, userId.toString());
        await ensureDir(authStatePath);

        // Check if session exists in Supabase Storage
        let hasAuthFiles = await checkSessionExists(userId);

        // Download auth files if they exist
        if (hasAuthFiles) {
            hasAuthFiles = await downloadAuthFilesFromStorage(userId, authStatePath);
        }

        // Initialize auth state
        const { state, saveCreds } = await useMultiFileAuthState(authStatePath);

        sock = makeWASocket({
            version,
            logger,
            auth: state,
            printQRInTerminal: false,
            browser: ['CloudBrief-WhatsApp', 'Chrome', '1.0'],
            getMessage: async (key) => {
                return null; // Implement message retrieval if needed
            },
            shouldSyncHistoryMessage: () => false,
            shouldIgnoreJid: () => false,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            linkPreviewImageThumbnailWidth: 192,
            transactionOpts: {
                maxCommitRetries: 10,
                delayBetweenTriesMs: 3000
            }
        });

        // Log initial auth state for debugging
        console.log('DEBUG: Initial auth state:', {
            creds: Object.keys(sock.authState.creds),
            keys: Object.keys(sock.authState.keys)
        });

        sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                console.log('DEBUG: Credentials updated and saved to local files');
                const uploaded = await uploadAuthFilesToStorage(userId, authStatePath);
                if (!uploaded) {
                    console.warn('⚠️ Failed to upload auth files to Supabase Storage, keeping local files for session persistence');
                }
            } catch (error) {
                console.error('❌ Error in creds.update handler:', error.stack);
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && !hasAuthFiles) {
                console.log('🖨️ QR code generated. Scan with WhatsApp to login:');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'open') {
                console.log('✅ Connected to WhatsApp successfully!');
                const waId = sock.user.id;
                const myName = sock.user.name || 'Unknown';
                console.log('My WhatsApp ID:', waId);
                console.log('My Name:', myName);

                try {
                    await supabaseServer
                        .from('app_user_platformid')
                        .upsert([{
                            user_id: userId,
                            current_platform_id: waId,
                            platform: 'whatsapp',
                            session_status: 'active',
                        }], { onConflict: ['user_id', 'platform'] });
                    console.log(`✅ WhatsApp ID ${waId} saved for user ${userId}`);
                } catch (error) {
                    console.error('❌ Failed to update platform ID:', error.stack);
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || 'Unknown error';

                console.error('🔄 Disconnection details:', {
                    statusCode,
                    message: errorMessage,
                    error: lastDisconnect?.error?.stack || 'No stack trace'
                });

                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    console.error('⚠️ Session expired. Deleting auth files and forcing re-authentication.');
                    try {
                        await supabaseServer
                            .from('app_user_platformid')
                            .update({ session_status: 'expired' })
                            .eq('user_id', userId)
                            .eq('platform', 'whatsapp');
                        await deleteAuthFilesFromStorage(userId);
                        await fs.rm(authStatePath, { recursive: true, force: true });
                        console.log('✅ Auth files deleted');
                    } catch (error) {
                        console.error('❌ Failed to update session status or delete auth files:', error.stack);
                    }
                    sock = null;
                    return;
                } else if (errorMessage.includes('Stream Errored')) {
                    console.warn('⚠️ Stream error detected. Attempting reconnection...');
                    if (retryAttempt >= 3) {
                        console.error('⚠️ Max reconnection attempts reached. Forcing re-authentication.');
                        try {
                            await supabaseServer
                                .from('app_user_platformid')
                                .update({ session_status: 'expired' })
                                .eq('user_id', userId)
                                .eq('platform', 'whatsapp');
                            await deleteAuthFilesFromStorage(userId);
                            await fs.rm(authStatePath, { recursive: true, force: true });
                            console.log('✅ Auth files deleted');
                        } catch (error) {
                            console.error('❌ Failed to update session status or delete auth files:', error.stack);
                        }
                        sock = null;
                        return;
                    }
                    const delay = Math.pow(2, retryAttempt) * 15000; // 15s, 30s, 60s
                    console.log(`🔁 Reconnecting in ${delay / 1000} seconds (attempt ${retryAttempt + 1}/3)...`);
                    setTimeout(() => startWhatsAppClient(userId, retryAttempt + 1), delay);
                } else {
                    console.error('🔄 Disconnected:', errorMessage);
                    try {
                        await supabaseServer
                            .from('app_user_platformid')
                            .update({ session_status: 'inactive' })
                            .eq('user_id', userId)
                            .eq('platform', 'whatsapp');
                    } catch (error) {
                        console.error('❌ Failed to update platform ID status:', error.stack);
                    }
                    const delay = Math.pow(2, retryAttempt) * 10000; // 10s, 20s, 40s, 80s, 160s
                    console.log(`🔁 Reconnecting in ${delay / 1000} seconds (attempt ${retryAttempt + 1}/5)...`);
                    setTimeout(() => startWhatsAppClient(userId, retryAttempt + 1), delay);
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            try {
                for (const msg of messages) {
                    if (!msg.message) {
                        console.log('ℹ️ Skipping message with no content');
                        continue;
                    }

                    console.log('DEBUG: Received message:', JSON.stringify(msg, null, 2));

                    const messageData = await extractMessageData(msg, userId);
                    if (!messageData.content) {
                        console.log('❌ Skipping empty message');
                        continue;
                    }

                    await saveMessageToSupabase(messageData);
                    console.log('✅ Saved message to Supabase');
                }

                triggerEmbedDebounced();
            } catch (error) {
                console.error('❌ Error processing messages:', error.stack);
            }
        });

        sock.ev.on('messages.update', (updates) => {
            console.log('DEBUG: Message updates:', JSON.stringify(updates, null, 2));
        });
        sock.ev.on('presence.update', (updates) => {
            console.log('DEBUG: Presence updates:', JSON.stringify(updates, null, 2));
        });
        sock.ev.on('chats.update', (updates) => {
            console.log('DEBUG: Chats updates:', JSON.stringify(updates, null, 2));
        });

    } catch (error) {
        console.error('❌ Error starting WhatsApp client:', error.stack);

        if (sock) {
            try {
                await sock.end();
            } catch (e) {
                console.error('❌ Error cleaning up socket:', e.stack);
            }
            sock = null;
        }

        const maxRetries = 5;
        if (retryAttempt < maxRetries) {
            const delay = Math.pow(2, retryAttempt) * 10000; // 10s, 20s, 40s, 80s, 160s
            console.log(`🔁 Retrying in ${delay / 1000} seconds (attempt ${retryAttempt + 1}/${maxRetries})...`);
            setTimeout(() => startWhatsAppClient(userId, retryAttempt + 1), delay);
        } else {
            console.error('❌ Max retries reached. Please check the session or network.');
            try {
                await supabaseServer
                    .from('app_user_platformid')
                    .update({ session_status: 'inactive' })
                    .eq('user_id', userId)
                    .eq('platform', 'whatsapp');
            } catch (error) {
                console.error('❌ Failed to update platform ID status:', error.stack);
            }
        }
    }
}

async function extractMessageData(msg, userId) {
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const senderName = msg.pushName || 'Unknown';
    const isFromMe = msg.key.fromMe;
    const timestamp = new Date(Number(msg.messageTimestamp) * 1000).toISOString();

    const deliveryStatus = msg.status === 1 ? 'Sent' :
                         msg.status === 2 ? 'Delivered' :
                         msg.status === 3 ? 'Read' :
                         'Unknown';

    let messageType = 'unknown';
    let content = '';

    if (msg.message.conversation) {
        messageType = 'text';
        content = msg.message.conversation;
    } else if (msg.message.extendedTextMessage?.text) {
        messageType = 'text';
        content = msg.message.extendedTextMessage.text;
    } else if (msg.message.imageMessage) {
        messageType = 'image';
        content = msg.message.imageMessage.caption || '[Image]';
    } else if (msg.message.videoMessage) {
        messageType = 'video';
        content = msg.message.videoMessage.caption || '[Video]';
    } else if (msg.message.audioMessage) {
        messageType = 'audio';
        content = '[Voice Message]';
    } else if (msg.message.stickerMessage) {
        messageType = 'sticker';
        content = '[Sticker]';
    }

    if (!content && ['audio', 'sticker'].includes(messageType)) {
        content = `[${messageType.charAt(0).toUpperCase() + messageType.slice(1)}]`;
    }

    let chatName = null;
    if (isGroup) {
        try {
            const groupMetadata = await sock.groupMetadata(from);
            chatName = groupMetadata.subject || null;
        } catch (err) {
            console.error('⚠️ Failed to fetch group metadata:', err.stack);
        }
    } else {
        chatName = isFromMe ? (from.split('@')[0]) : senderName;
    }

    const receiverName = isFromMe
        ? (isGroup ? (chatName || 'Group') : (chatName || from.split('@')[0]))
        : 'Me';

    return {
        userId,
        from,
        isGroup,
        senderJid,
        senderName,
        isFromMe,
        timestamp,
        deliveryStatus,
        messageType,
        content,
        chatName,
        receiverName,
        msg
    };
}

async function saveMessageToSupabase(messageData) {
    const { userId, from, chatName, content, messageType, timestamp, senderName, receiverName, deliveryStatus, msg } = messageData;

    let saved = false;
    let retries = 0;
    const maxRetries = 3;

    while (!saved && retries < maxRetries) {
        try {
            const { error } = await supabaseServer.from('memory_entries').insert({
                user_id: userId,
                chat_id: from,
                chat_name: chatName,
                content: content,
                type: messageType,
                source: 'whatsapp',
                created_at: timestamp,
                sender: senderName,
                receiver: receiverName,
                delivery_status: deliveryStatus,
                metadata: {
                    chat_id: from,
                    chat_name: chatName,
                    sender: senderName,
                    sender_jid: messageData.senderJid,
                    receiver: receiverName,
                    from_me: messageData.isFromMe,
                    timestamp: timestamp,
                    message_id: msg.key.id,
                    message_type: messageType,
                    full_message: msg.message,
                },
            });

            if (error) throw error;
            saved = true;
            console.log('✅ Saved message to Supabase');
        } catch (error) {
            retries++;
            console.error(`❌ Failed to save message (attempt ${retries}):`, error.stack);
            if (retries < maxRetries) {
                await new Promise(res => setTimeout(res, 2000 * retries));
            }
        }
    }

    if (!saved) {
        throw new Error(`Failed to save message after ${maxRetries} attempts`);
    }
}

async function stopWhatsAppClient(userId) {
    if (!sock) return;

    try {
        await sock.logout();
        console.log('✅ WhatsApp client disconnected successfully.');

        const authStatePath = path.join(TEMP_DIR, userId.toString());
        await deleteAuthFilesFromStorage(userId);
        await fs.rm(authStatePath, { recursive: true, force: true });

        await supabaseServer
            .from('app_user_platformid')
            .update({ session_status: 'inactive' })
            .eq('user_id', userId)
            .eq('platform', 'whatsapp');
    } catch (err) {
        console.error('❌ Error disconnecting WhatsApp:', err.stack);
    } finally {
        sock = null;
        currentUserId = null;
    }
}

export { startWhatsAppClient, stopWhatsAppClient, currentUserId };