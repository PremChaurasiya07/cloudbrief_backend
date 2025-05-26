


// import pkg from '@whiskeysockets/baileys';
// import { fileURLToPath } from 'url';
// import path from 'path';
// import fs from 'fs/promises';
// import os from 'os';
// import { supabaseServer } from '../lib/supabase.js'; // Use server-side client
// import pino from 'pino';
// import qrcode from 'qrcode-terminal';
// import embed from '../src/app/api/auth/embedding.js';

// const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = pkg;
// const logger = pino({ level: 'fatal' });

// let sock = null;
// let embedTimeout = null;
// let currentUserId = null;

// // Debounce embedding trigger
// function triggerEmbedDebounced(delay = 5000) {
//     if (embedTimeout) clearTimeout(embedTimeout);
//     embedTimeout = setTimeout(() => {
//         console.log('⚙️ Running embed batch...');
//         embed().catch(err => console.error('❌ Embedding error:', err));
//     }, delay);
// }

// // Supabase Storage bucket name
// const STORAGE_BUCKET = 'whatsapp-session';

// // Temporary local folder for auth files
// const TEMP_DIR = path.join(os.tmpdir(), 'whatsapp-auth');

// // Helper to ensure directory exists
// async function ensureDir(dirPath) {
//     try {
//         await fs.mkdir(dirPath, { recursive: true });
//     } catch (error) {
//         if (error.code !== 'EEXIST') throw error;
//     }
// }

// // Helper to log Supabase client configuration
// async function logSupabaseConfig() {
//     try {
//         const { data: { user }, error } = await supabaseServer.auth.getUser();
//         const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY === supabaseServer.auth.api.apiKey
//             ? 'service_role'
//             : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === supabaseServer.auth.api.apiKey
//             ? 'anon'
//             : 'unknown';
//         console.log('DEBUG: Supabase Server Config:', {
//             keyType,
//             user: user ? user.id : 'null',
//             authError: error?.message || 'none',
//             url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'undefined'
//         });
//         return keyType;
//     } catch (err) {
//         console.error('❌ Failed to check Supabase config:', err.stack);
//         return 'error';
//     }
// }

// // Helper to validate Supabase configuration
// function validateSupabaseConfig() {
//     if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
//         throw new Error('❌ NEXT_PUBLIC_SUPABASE_URL is not defined');
//     }
//     if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
//         throw new Error('❌ SUPABASE_SERVICE_ROLE_KEY is not defined');
//     }
//     if (!supabaseServer.auth.api.apiKey) {
//         throw new Error('❌ Supabase server client is not initialized with an API key');
//     }
//     if (supabaseServer.auth.api.apiKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
//         throw new Error('❌ Supabase server client is using anon key instead of service role key');
//     }
// }

// // Helper to check if session files exist in Supabase Storage
// async function checkSessionExists(userId) {
//     try {
//         validateSupabaseConfig();
//         const keyType = await logSupabaseConfig();
//         if (keyType !== 'service_role') {
//             console.warn('⚠️ Supabase server client is not using service_role key. Uploads may fail.');
//         }
//         const { data: fileList, error } = await supabaseServer.storage
//             .from(STORAGE_BUCKET)
//             .list(`${userId}/`);

//         if (error) {
//             console.error('❌ Failed to check session files in Supabase Storage:', error.message);
//             throw error;
//         }

//         const hasFiles = fileList && fileList.length > 0 && fileList.some(file => file.name === 'creds.json');
//         console.log(`DEBUG: Session files ${hasFiles ? 'found' : 'not found'} for user ${userId}`);
//         return hasFiles;
//     } catch (error) {
//         console.error('❌ Error checking session existence:', error.stack);
//         return false;
//     }
// }

// // Helper to upload auth files to Supabase Storage with retries
// async function uploadAuthFilesToStorage(userId, authStatePath, retries = 3, delayMs = 2000) {
//     let lastError = null;
//     for (let attempt = 1; attempt <= retries; attempt++) {
//         try {
//             validateSupabaseConfig();
//             await logSupabaseConfig();
//             const files = await fs.readdir(authStatePath, { withFileTypes: true });
//             for (const file of files) {
//                 if (file.isFile()) {
//                     const filePath = path.join(authStatePath, file.name);
//                     const fileContent = await fs.readFile(filePath);
//                     const storagePath = `${userId}/${file.name}`;

//                     const { error } = await supabaseServer.storage
//                         .from(STORAGE_BUCKET)
//                         .upload(storagePath, fileContent, {
//                             upsert: true,
//                             contentType: 'application/json'
//                         });

//                     if (error) {
//                         console.error(`❌ Failed to upload ${file.name} to Supabase Storage (attempt ${attempt}/${retries}):`, {
//                             message: error.message,
//                             statusCode: error.statusCode || 'N/A',
//                             details: error
//                         });
//                         throw error;
//                     }
//                     console.log(`DEBUG: Uploaded ${file.name} to Supabase Storage at ${storagePath}`);
//                 }
//             }
//             console.log('✅ All auth files uploaded to Supabase Storage');
//             return true;
//         } catch (error) {
//             lastError = error;
//             if (attempt < retries) {
//                 console.log(`⚠️ Retrying upload (attempt ${attempt + 1}/${retries}) in ${delayMs}ms...`);
//                 await new Promise(resolve => setTimeout(resolve, delayMs));
//                 continue;
//             }
//             console.error('❌ Failed to upload auth files to Supabase Storage after retries:', error.message || error.stack);
//             return false;
//         }
//     }
//     console.error('❌ Upload failed after all retries:', lastError?.message || lastError?.stack || 'Unknown error');
//     return false;
// }

// // Helper to download auth files from Supabase Storage
// async function downloadAuthFilesFromStorage(userId, authStatePath) {
//     try {
//         validateSupabaseConfig();
//         await logSupabaseConfig();
//         const { data: fileList, error: listError } = await supabaseServer.storage
//             .from(STORAGE_BUCKET)
//             .list(`${userId}/`);

//         if (listError) {
//             console.error('❌ Failed to list files in Supabase Storage:', listError.message);
//             throw listError;
//         }

//         if (!fileList || fileList.length === 0) {
//             console.log('ℹ️ No auth files found in Supabase Storage for user:', userId);
//             return false;
//         }

//         await ensureDir(authStatePath);

//         for (const file of fileList) {
//             const { data, error } = await supabaseServer.storage
//                 .from(STORAGE_BUCKET)
//                 .download(`${userId}/${file.name}`);

//             if (error) {
//                 console.error(`❌ Failed to download ${file.name} from Supabase Storage:`, error.message);
//                 throw error;
//             }

//             const filePath = path.join(authStatePath, file.name);
//             const buffer = Buffer.from(await data.arrayBuffer());
//             await fs.writeFile(filePath, buffer);
//             console.log(`DEBUG: Downloaded ${file.name} to ${filePath}`);
//         }

//         console.log('✅ All auth files downloaded from Supabase Storage');
//         return true;
//     } catch (error) {
//         console.error('❌ Failed to download auth files from Supabase Storage:', error.stack);
//         return false;
//     }
// }

// // Helper to delete auth files from Supabase Storage
// async function deleteAuthFilesFromStorage(userId) {
//     try {
//         validateSupabaseConfig();
//         await logSupabaseConfig();
//         const { data: fileList, error: listError } = await supabaseServer.storage
//             .from(STORAGE_BUCKET)
//             .list(`${userId}/`);

//         if (listError) {
//             console.error('❌ Failed to list files in Supabase Storage for deletion:', listError.message);
//             throw listError;
//         }

//         if (!fileList || fileList.length === 0) {
//             console.log('ℹ️ No auth files to delete in Supabase Storage for user:', userId);
//             return;
//         }

//         const filePaths = fileList.map(file => `${userId}/${file.name}`);
//         const { error } = await supabaseServer.storage
//             .from(STORAGE_BUCKET)
//             .remove(filePaths);

//         if (error) {
//             console.error('❌ Failed to delete auth files from Supabase Storage:', error.message);
//             throw error;
//         }

//         console.log('✅ Auth files deleted from Supabase Storage');
//     } catch (error) {
//         console.error('❌ Failed to delete auth files from Supabase Storage:', error.stack);
//         throw error;
//     }
// }

// async function startWhatsAppClient(userId, retryAttempt = 0) {
//     try {
//         currentUserId = userId;
//         const { version } = await fetchLatestBaileysVersion();
//         console.log(`Using Baileys version: ${version.join('.')}`);

//         // Create a user-specific temporary auth folder
//         const authStatePath = path.join(TEMP_DIR, userId.toString());
//         await ensureDir(authStatePath);

//         // Check if session exists in Supabase Storage
//         let hasAuthFiles = await checkSessionExists(userId);

//         // Download auth files if they exist
//         if (hasAuthFiles) {
//             hasAuthFiles = await downloadAuthFilesFromStorage(userId, authStatePath);
//         }

//         // Initialize auth state
//         const { state, saveCreds } = await useMultiFileAuthState(authStatePath);

//         sock = makeWASocket({
//             version,
//             logger,
//             auth: state,
//             printQRInTerminal: false,
//             browser: ['CloudBrief-WhatsApp', 'Chrome', '1.0'],
//             getMessage: async (key) => {
//                 return null; // Implement message retrieval if needed
//             },
//             shouldSyncHistoryMessage: () => false,
//             shouldIgnoreJid: () => false,
//             markOnlineOnConnect: false,
//             syncFullHistory: false,
//             linkPreviewImageThumbnailWidth: 192,
//             transactionOpts: {
//                 maxCommitRetries: 10,
//                 delayBetweenTriesMs: 3000
//             }
//         });

//         // Log initial auth state for debugging
//         console.log('DEBUG: Initial auth state:', {
//             creds: Object.keys(sock.authState.creds),
//             keys: Object.keys(sock.authState.keys)
//         });

//         sock.ev.on('creds.update', async () => {
//             try {
//                 await saveCreds();
//                 console.log('DEBUG: Credentials updated and saved to local files');
//                 const uploaded = await uploadAuthFilesToStorage(userId, authStatePath);
//                 if (!uploaded) {
//                     console.warn('⚠️ Failed to upload auth files to Supabase Storage, keeping local files for session persistence');
//                 }
//             } catch (error) {
//                 console.error('❌ Error in creds.update handler:', error.stack);
//             }
//         });

//         sock.ev.on('connection.update', async (update) => {
//             const { connection, lastDisconnect, qr } = update;

//             if (qr && !hasAuthFiles) {
//                 console.log('🖨️ QR code generated. Scan with WhatsApp to login:');
//                 qrcode.generate(qr, { small: true });
//             }

//             if (connection === 'open') {
//                 console.log('✅ Connected to WhatsApp successfully!');
//                 const waId = sock.user.id;
//                 const myName = sock.user.name || 'Unknown';
//                 console.log('My WhatsApp ID:', waId);
//                 console.log('My Name:', myName);

//                 try {
//                     await supabaseServer
//                         .from('app_user_platformid')
//                         .upsert([{
//                             user_id: userId,
//                             current_platform_id: waId,
//                             platform: 'whatsapp',
//                             session_status: 'active',
//                         }], { onConflict: ['user_id', 'platform'] });
//                     console.log(`✅ WhatsApp ID ${waId} saved for user ${userId}`);
//                 } catch (error) {
//                     console.error('❌ Failed to update platform ID:', error.stack);
//                 }
//             }

//             if (connection === 'close') {
//                 const statusCode = lastDisconnect?.error?.output?.statusCode;
//                 const errorMessage = lastDisconnect?.error?.message || 'Unknown error';

//                 console.error('🔄 Disconnection details:', {
//                     statusCode,
//                     message: errorMessage,
//                     error: lastDisconnect?.error?.stack || 'No stack trace'
//                 });

//                 if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
//                     console.error('⚠️ Session expired. Deleting auth files and forcing re-authentication.');
//                     try {
//                         await supabaseServer
//                             .from('app_user_platformid')
//                             .update({ session_status: 'expired' })
//                             .eq('user_id', userId)
//                             .eq('platform', 'whatsapp');
//                         await deleteAuthFilesFromStorage(userId);
//                         await fs.rm(authStatePath, { recursive: true, force: true });
//                         console.log('✅ Auth files deleted');
//                     } catch (error) {
//                         console.error('❌ Failed to update session status or delete auth files:', error.stack);
//                     }
//                     sock = null;
//                     return;
//                 } else if (errorMessage.includes('Stream Errored')) {
//                     console.warn('⚠️ Stream error detected. Attempting reconnection...');
//                     if (retryAttempt >= 3) {
//                         console.error('⚠️ Max reconnection attempts reached. Forcing re-authentication.');
//                         try {
//                             await supabaseServer
//                                 .from('app_user_platformid')
//                                 .update({ session_status: 'expired' })
//                                 .eq('user_id', userId)
//                                 .eq('platform', 'whatsapp');
//                             await deleteAuthFilesFromStorage(userId);
//                             await fs.rm(authStatePath, { recursive: true, force: true });
//                             console.log('✅ Auth files deleted');
//                         } catch (error) {
//                             console.error('❌ Failed to update session status or delete auth files:', error.stack);
//                         }
//                         sock = null;
//                         return;
//                     }
//                     const delay = Math.pow(2, retryAttempt) * 15000; // 15s, 30s, 60s
//                     console.log(`🔁 Reconnecting in ${delay / 1000} seconds (attempt ${retryAttempt + 1}/3)...`);
//                     setTimeout(() => startWhatsAppClient(userId, retryAttempt + 1), delay);
//                 } else {
//                     console.error('🔄 Disconnected:', errorMessage);
//                     try {
//                         await supabaseServer
//                             .from('app_user_platformid')
//                             .update({ session_status: 'inactive' })
//                             .eq('user_id', userId)
//                             .eq('platform', 'whatsapp');
//                     } catch (error) {
//                         console.error('❌ Failed to update platform ID status:', error.stack);
//                     }
//                     const delay = Math.pow(2, retryAttempt) * 10000; // 10s, 20s, 40s, 80s, 160s
//                     console.log(`🔁 Reconnecting in ${delay / 1000} seconds (attempt ${retryAttempt + 1}/5)...`);
//                     setTimeout(() => startWhatsAppClient(userId, retryAttempt + 1), delay);
//                 }
//             }
//         });

//         sock.ev.on('messages.upsert', async ({ messages }) => {
//             try {
//                 for (const msg of messages) {
//                     if (!msg.message) {
//                         console.log('ℹ️ Skipping message with no content');
//                         continue;
//                     }

//                     console.log('DEBUG: Received message:', JSON.stringify(msg, null, 2));

//                     const messageData = await extractMessageData(msg, userId);
//                     if (!messageData.content) {
//                         console.log('❌ Skipping empty message');
//                         continue;
//                     }

//                     await saveMessageToSupabase(messageData);
//                     console.log('✅ Saved message to Supabase');
//                 }

//                 triggerEmbedDebounced();
//             } catch (error) {
//                 console.error('❌ Error processing messages:', error.stack);
//             }
//         });

//         sock.ev.on('messages.update', (updates) => {
//             console.log('DEBUG: Message updates:', JSON.stringify(updates, null, 2));
//         });
//         sock.ev.on('presence.update', (updates) => {
//             console.log('DEBUG: Presence updates:', JSON.stringify(updates, null, 2));
//         });
//         sock.ev.on('chats.update', (updates) => {
//             console.log('DEBUG: Chats updates:', JSON.stringify(updates, null, 2));
//         });

//     } catch (error) {
//         console.error('❌ Error starting WhatsApp client:', error.stack);

//         if (sock) {
//             try {
//                 await sock.end();
//             } catch (e) {
//                 console.error('❌ Error cleaning up socket:', e.stack);
//             }
//             sock = null;
//         }

//         const maxRetries = 5;
//         if (retryAttempt < maxRetries) {
//             const delay = Math.pow(2, retryAttempt) * 10000; // 10s, 20s, 40s, 80s, 160s
//             console.log(`🔁 Retrying in ${delay / 1000} seconds (attempt ${retryAttempt + 1}/${maxRetries})...`);
//             setTimeout(() => startWhatsAppClient(userId, retryAttempt + 1), delay);
//         } else {
//             console.error('❌ Max retries reached. Please check the session or network.');
//             try {
//                 await supabaseServer
//                     .from('app_user_platformid')
//                     .update({ session_status: 'inactive' })
//                     .eq('user_id', userId)
//                     .eq('platform', 'whatsapp');
//             } catch (error) {
//                 console.error('❌ Failed to update platform ID status:', error.stack);
//             }
//         }
//     }
// }

// async function extractMessageData(msg, userId) {
//     const from = msg.key.remoteJid;
//     const isGroup = from.endsWith('@g.us');
//     const senderJid = msg.key.participant || msg.key.remoteJid;
//     const senderName = msg.pushName || 'Unknown';
//     const isFromMe = msg.key.fromMe;
//     const timestamp = new Date(Number(msg.messageTimestamp) * 1000).toISOString();

//     const deliveryStatus = msg.status === 1 ? 'Sent' :
//                          msg.status === 2 ? 'Delivered' :
//                          msg.status === 3 ? 'Read' :
//                          'Unknown';

//     let messageType = 'unknown';
//     let content = '';

//     if (msg.message.conversation) {
//         messageType = 'text';
//         content = msg.message.conversation;
//     } else if (msg.message.extendedTextMessage?.text) {
//         messageType = 'text';
//         content = msg.message.extendedTextMessage.text;
//     } else if (msg.message.imageMessage) {
//         messageType = 'image';
//         content = msg.message.imageMessage.caption || '[Image]';
//     } else if (msg.message.videoMessage) {
//         messageType = 'video';
//         content = msg.message.videoMessage.caption || '[Video]';
//     } else if (msg.message.audioMessage) {
//         messageType = 'audio';
//         content = '[Voice Message]';
//     } else if (msg.message.stickerMessage) {
//         messageType = 'sticker';
//         content = '[Sticker]';
//     }

//     if (!content && ['audio', 'sticker'].includes(messageType)) {
//         content = `[${messageType.charAt(0).toUpperCase() + messageType.slice(1)}]`;
//     }

//     let chatName = null;
//     if (isGroup) {
//         try {
//             const groupMetadata = await sock.groupMetadata(from);
//             chatName = groupMetadata.subject || null;
//         } catch (err) {
//             console.error('⚠️ Failed to fetch group metadata:', err.stack);
//         }
//     } else {
//         chatName = isFromMe ? (from.split('@')[0]) : senderName;
//     }

//     const receiverName = isFromMe
//         ? (isGroup ? (chatName || 'Group') : (chatName || from.split('@')[0]))
//         : 'Me';

//     return {
//         userId,
//         from,
//         isGroup,
//         senderJid,
//         senderName,
//         isFromMe,
//         timestamp,
//         deliveryStatus,
//         messageType,
//         content,
//         chatName,
//         receiverName,
//         msg
//     };
// }

// async function saveMessageToSupabase(messageData) {
//     const { userId, from, chatName, content, messageType, timestamp, senderName, receiverName, deliveryStatus, msg } = messageData;

//     let saved = false;
//     let retries = 0;
//     const maxRetries = 3;

//     while (!saved && retries < maxRetries) {
//         try {
//             const { error } = await supabaseServer.from('memory_entries').insert({
//                 user_id: userId,
//                 chat_id: from,
//                 chat_name: chatName,
//                 content: content,
//                 type: messageType,
//                 source: 'whatsapp',
//                 created_at: timestamp,
//                 sender: senderName,
//                 receiver: receiverName,
//                 delivery_status: deliveryStatus,
//                 metadata: {
//                     chat_id: from,
//                     chat_name: chatName,
//                     sender: senderName,
//                     sender_jid: messageData.senderJid,
//                     receiver: receiverName,
//                     from_me: messageData.isFromMe,
//                     timestamp: timestamp,
//                     message_id: msg.key.id,
//                     message_type: messageType,
//                     full_message: msg.message,
//                 },
//             });

//             if (error) throw error;
//             saved = true;
//             console.log('✅ Saved message to Supabase');
//         } catch (error) {
//             retries++;
//             console.error(`❌ Failed to save message (attempt ${retries}):`, error.stack);
//             if (retries < maxRetries) {
//                 await new Promise(res => setTimeout(res, 2000 * retries));
//             }
//         }
//     }

//     if (!saved) {
//         throw new Error(`Failed to save message after ${maxRetries} attempts`);
//     }
// }

// async function stopWhatsAppClient(userId) {
//     if (!sock) return;

//     try {
//         await sock.logout();
//         console.log('✅ WhatsApp client disconnected successfully.');

//         const authStatePath = path.join(TEMP_DIR, userId.toString());
//         await deleteAuthFilesFromStorage(userId);
//         await fs.rm(authStatePath, { recursive: true, force: true });

//         await supabaseServer
//             .from('app_user_platformid')
//             .update({ session_status: 'inactive' })
//             .eq('user_id', userId)
//             .eq('platform', 'whatsapp');
//     } catch (err) {
//         console.error('❌ Error disconnecting WhatsApp:', err.stack);
//     } finally {
//         sock = null;
//         currentUserId = null;
//     }
// }

// export { startWhatsAppClient, stopWhatsAppClient, currentUserId };


import pkg from '@whiskeysockets/baileys';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { supabaseServer } from './supabase.js';
import qrcode from 'qrcode-terminal';
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = pkg;

//Configuration
const STORAGE_BUCKET = 'whatsapp-session';
const TEMP_DIR = path.join(os.tmpdir(), 'whatsapp-auth');
let sock = null;
let currentUserId = null;

async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}

const isRecent = (timestamp) => {
  const now = Date.now();
  const msgTime = timestamp * 1000; // from seconds to ms
  return msgTime >= now - 3 * 24 * 60 * 60 * 1000;
};

async function updateUserPlatformId(userId, platformId) {
    try {
        const { error } = await supabaseServer
            .from('app_user_platformid')
            .upsert([{
                user_id: userId,
                current_platform_id: platformId,
                platform: 'whatsapp',
                session_status: 'active',
            }], { onConflict: ['user_id', 'platform'] });

        if (error) throw error;
        console.log(`✅ Updated platform ID for user ${userId}`);
    } catch (error) {
        console.error('❌ Failed to update platform ID:', error);
        throw error;
    }
}

// Auth File Management
async function uploadAuthFilesToStorage(userId, authStatePath) {
    try {
        await ensureDir(authStatePath);
        const files = await fs.readdir(authStatePath);
        
        for (const file of files) {
            const filePath = path.join(authStatePath, file);
            try {
                const fileContent = await fs.readFile(filePath);
                const storagePath = `${userId}/${file}`;

                const { error } = await supabaseServer.storage
                    .from(STORAGE_BUCKET)
                    .upload(storagePath, fileContent, {
                        upsert: true,
                        contentType: 'application/json'
                    });

                if (error) throw error;
            } catch (fileError) {
                console.warn(`⚠️ Skipping file ${file}:`, fileError.message);
                continue;
            }
        }
    } catch (error) {
        console.error('❌ Error uploading auth files:', error);
        throw error;
    }
}

async function downloadAuthFilesFromStorage(userId, authStatePath) {
    try {
        await ensureDir(authStatePath);

        const { data: fileList, error } = await supabaseServer.storage
            .from(STORAGE_BUCKET)
            .list(`${userId}/`);

        if (error) throw error;
        if (!fileList || fileList.length === 0) return false;

        for (const file of fileList) {
            try {
                const { data, error: downloadError } = await supabaseServer.storage
                    .from(STORAGE_BUCKET)
                    .download(`${userId}/${file.name}`);

                if (downloadError) throw downloadError;

                const buffer = Buffer.from(await data.arrayBuffer());
                await fs.writeFile(path.join(authStatePath, file.name), buffer);
            } catch (fileError) {
                console.warn(`⚠️ Skipping file ${file.name}:`, fileError.message);
                continue;
            }
        }
        return true;
    } catch (error) {
        console.error('❌ Error downloading auth files:', error);
        return false;
    }
}

async function deleteAuthFilesFromStorage(userId) {
    async function listAllFiles(prefix) {
        let allFiles = [];
        let page = 0;
        while (true) {
            const { data: files, error } = await supabaseServer.storage
                .from(STORAGE_BUCKET)
                .list(prefix, { limit: 100, offset: page * 100 });

            if (error) throw error;
            if (!files || files.length === 0) break;

            for (const file of files) {
                if (file.name === undefined) continue;
                const fullPath = `${prefix}${file.name}`;
                if (file.metadata?.mimetype === 'application/x-directory') {
                    const nested = await listAllFiles(`${fullPath}/`);
                    allFiles = [...allFiles, ...nested];
                } else {
                    allFiles.push(fullPath);
                }
            }

            page++;
        }

        return allFiles;
    }

    const filesToDelete = await listAllFiles(`${userId}/`);
    if (filesToDelete.length === 0) return;

    const { error } = await supabaseServer.storage
        .from(STORAGE_BUCKET)
        .remove(filesToDelete);

    if (error) throw error;
    console.log('✅ All auth files (including keys) deleted from Supabase Storage');
}

// WhatsApp Client Core
async function startWhatsAppClient(userId, retryAttempt = 0) {
    try {
        currentUserId = userId;
        console.log(`🚀 Starting WhatsApp client for user ${userId}`);
        
        const { version } = await fetchLatestBaileysVersion();
        const authStatePath = path.join(TEMP_DIR, userId);
        await ensureDir(authStatePath);

        const hasSession = await downloadAuthFilesFromStorage(userId, authStatePath);
        const { state, saveCreds } = await useMultiFileAuthState(authStatePath);

        sock = makeWASocket({
            version,
            auth: state,
            syncFullHistory: false,
            browser: ['WhatsApp-Cloud', 'Chrome', '1.0'],
            printQRInTerminal: true,
            getMessage: async () => null,
        });

        sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                await uploadAuthFilesToStorage(userId, authStatePath);
            } catch (error) {
                console.error('❌ Error saving credentials:', error);
            }
        });

        sock.ev.on('connection.update', async (update) => {
            try {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !hasSession) {
                    console.log('🔍 Scan the QR code to login:');
                }

                if (connection === 'open') {
                    console.log('✅ Connected to WhatsApp!');
                    await updateUserPlatformId(userId, sock.user.id);
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error?.toString() || 'unknown';

                    if (statusCode === DisconnectReason.loggedOut) {
                        // Session expired, logout and cleanup
                        console.log('🔐 Session expired or logged out. Please re-authenticate.');
                        await stopWhatsAppClient(userId);
                        await cleanupSession(userId, authStatePath);
                    } else {
                        // Attempt reconnect with exponential backoff
                        const delay = Math.min(60000, 5000 * Math.pow(2, retryAttempt));
                        console.log(`🔌 Connection closed (${statusCode} - ${reason}). Reconnecting in ${delay / 1000}s...`);
                        setTimeout(() => startWhatsAppClient(userId, retryAttempt + 1), delay);
                    }
                }
            } catch (error) {
                console.error('❌ Connection update error:', error);
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            await processMessages(messages, userId);
        });

    } catch (error) {
        console.error('❌ Error starting WhatsApp client:', error);

        if (retryAttempt < 3) {
            const delay = 5000 * (retryAttempt + 1);
            console.log(`🔄 Retrying in ${delay / 1000}s...`);
            setTimeout(() => startWhatsAppClient(userId, retryAttempt + 1), delay);
        } else {
            throw error;
        }
    }
}

async function cleanupSession(userId, authStatePath) {
    try {
        await supabaseServer
            .from('app_user_platformid')
            .update({ session_status: 'expired' })
            .eq('user_id', userId)
            .eq('platform', 'whatsapp');
        
        // await deleteAuthFilesFromStorage(userId);
        if (authStatePath) {
            await fs.rm(authStatePath, { recursive: true, force: true });
        }
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    } finally {
        sock = null;
        currentUserId = null;
    }
}

async function processMessages(messages, userId) {
    for (const msg of messages) {
        if (!msg.message) continue;
        
        try {
            const messageData = await extractMessageData(msg, userId);
            if (!messageData.content) continue;

            await saveMessageToSupabase(messageData);
            console.log('💾 Saved message to database', messageData);
        } catch (error) {
            console.error('❌ Error processing message:', error);
        }
    }
}

async function extractMessageData(msg, userId) {
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const senderJid = msg.key.participant || from;
    const senderName = msg.pushName || 'Unknown';
    const isFromMe = msg.key.fromMe;
    const timestamp = new Date(msg.messageTimestamp * 1000).toISOString();

    let messageType = 'text';
    let content = msg.message.conversation || 
                 msg.message.extendedTextMessage?.text || 
                 msg.message.imageMessage?.caption ||
                 msg.message.videoMessage?.caption ||
                 '[Media]';

    let chatName = null;
    if (isGroup) {
        try {
            const groupMetadata = await sock.groupMetadata(from);
            chatName = groupMetadata.subject;
        } catch (err) {
            console.error('❌ Failed to fetch group metadata:', err);
        }
    }
    return {
        userId,
        from,
        isGroup,
        senderJid,
        senderName,
        isFromMe,
        timestamp,
        messageType,
        content,
        chatName
    };
}

async function saveMessageToSupabase(messageData) {
    const { error } = await supabaseServer.from('memory_entries').insert({
        user_id: messageData.userId,
        chat_id: messageData.from,
        chat_name: messageData.chatName,
        content: messageData.content,
        type: messageData.messageType,
        source: 'whatsapp',
        created_at: messageData.timestamp,
        sender: messageData.senderName,
        metadata: {
            is_group: messageData.isGroup,
            sender_jid: messageData.senderJid,
            from_me: messageData.isFromMe
        }
    });

    if (error) throw error;
}

async function stopWhatsAppClient(userId) {
    if (!sock) return;

    try {
        console.log('🛑 Stopping WhatsApp client...');
        await sock.logout();
        await sock.end()
        
        // Update status in database
        await supabaseServer
            .from('app_user_platformid')
            .update({ session_status: 'inactive' })
            .eq('user_id', userId)
            .eq('platform', 'whatsapp');
         
        // await deleteAuthFilesFromStorage(userId);
        // Clean up local files
        const authStatePath = path.join(TEMP_DIR, userId);
        try {
             await fs.rm(authStatePath, { recursive: true, force: true });
        } catch (fsError) {
            console.warn('⚠️ Error cleaning auth files:', fsError.message);
        }

        console.log('✅ WhatsApp client stopped');
    } catch (error) {
        console.error('❌ Error stopping WhatsApp client:', error);
        throw error;
    } finally {
        sock = null;
        currentUserId = null;
    }
}

export { startWhatsAppClient, stopWhatsAppClient, processMessages };









// // Helper Functions
// async function ensureDir(dirPath) {
//     try {
//         await fs.mkdir(dirPath, { recursive: true });
//     } catch (error) {
//         if (error.code !== 'EEXIST') throw error;
//     }
// }

// const isRecent = (timestamp) => {
//   const now = Date.now();
//   const msgTime = timestamp * 1000; // from seconds to ms
//   return msgTime >= now - 3 * 24 * 60 * 60 * 1000;
// };

// async function updateUserPlatformId(userId, platformId) {
//     try {
//         const { error } = await supabaseServer
//             .from('app_user_platformid')
//             .upsert([{
//                 user_id: userId,
//                 current_platform_id: platformId,
//                 platform: 'whatsapp',
//                 session_status: 'active',
//             }], { onConflict: ['user_id', 'platform'] });

//         if (error) throw error;
//         console.log(`✅ Updated platform ID for user ${userId}`);
//     } catch (error) {
//         console.error('❌ Failed to update platform ID:', error);
//         throw error;
//     }
// }

// // Auth File Management
// async function uploadAuthFilesToStorage(userId, authStatePath) {
//     try {
//         await ensureDir(authStatePath);
//         const files = await fs.readdir(authStatePath);
        
//         for (const file of files) {
//             const filePath = path.join(authStatePath, file);
//             try {
//                 const fileContent = await fs.readFile(filePath);
//                 const storagePath = `${userId}/${file}`;

//                 const { error } = await supabaseServer.storage
//                     .from(STORAGE_BUCKET)
//                     .upload(storagePath, fileContent, {
//                         upsert: true,
//                         contentType: 'application/json'
//                     });

//                 if (error) throw error;
//             } catch (fileError) {
//                 console.warn(`⚠️ Skipping file ${file}:`, fileError.message);
//                 continue;
//             }
//         }
//     } catch (error) {
//         console.error('❌ Error uploading auth files:', error);
//         throw error;
//     }
// }

// async function downloadAuthFilesFromStorage(userId, authStatePath) {
//     try {
//         await ensureDir(authStatePath);

//         const { data: fileList, error } = await supabaseServer.storage
//             .from(STORAGE_BUCKET)
//             .list(`${userId}/`);

//         if (error) throw error;
//         if (!fileList || fileList.length === 0) return false;

//         for (const file of fileList) {
//             try {
//                 const { data, error: downloadError } = await supabaseServer.storage
//                     .from(STORAGE_BUCKET)
//                     .download(`${userId}/${file.name}`);

//                 if (downloadError) throw downloadError;

//                 const buffer = Buffer.from(await data.arrayBuffer());
//                 await fs.writeFile(path.join(authStatePath, file.name), buffer);
//             } catch (fileError) {
//                 console.warn(`⚠️ Skipping file ${file.name}:`, fileError.message);
//                 continue;
//             }
//         }
//         return true;
//     } catch (error) {
//         console.error('❌ Error downloading auth files:', error);
//         return false;
//     }
// }

// async function deleteAuthFilesFromStorage(userId) {
//     async function listAllFiles(prefix) {
//         let allFiles = [];
//         let page = 0;
//         while (true) {
//             const { data: files, error } = await supabaseServer.storage
//                 .from(STORAGE_BUCKET)
//                 .list(prefix, { limit: 100, offset: page * 100 });

//             if (error) throw error;
//             if (!files || files.length === 0) break;

//             for (const file of files) {
//                 if (file.name === undefined) continue;
//                 const fullPath = `${prefix}${file.name}`;
//                 if (file.metadata?.mimetype === 'application/x-directory') {
//                     const nested = await listAllFiles(`${fullPath}/`);
//                     allFiles = [...allFiles, ...nested];
//                 } else {
//                     allFiles.push(fullPath);
//                 }
//             }

//             page++;
//         }

//         return allFiles;
//     }

//     const filesToDelete = await listAllFiles(`${userId}/`);
//     if (filesToDelete.length === 0) return;

//     const { error } = await supabaseServer.storage
//         .from(STORAGE_BUCKET)
//         .remove(filesToDelete);

//     if (error) throw error;
//     console.log('✅ All auth files (including keys) deleted from Supabase Storage');
// }

    

// // WhatsApp Client Core
// async function startWhatsAppClient(userId, retryAttempt = 0) {
//     try {
//         currentUserId = userId;
//         console.log(`🚀 Starting WhatsApp client for user ${userId}`);
        
//         const { version } = await fetchLatestBaileysVersion();
//         const authStatePath = path.join(TEMP_DIR, userId);
//         await ensureDir(authStatePath);

//         const hasSession = await downloadAuthFilesFromStorage(userId, authStatePath);
//         const { state, saveCreds } = await useMultiFileAuthState(authStatePath);

//         sock = makeWASocket({
//             version,
//             auth: state,
//             syncFullHistory: false,
//             browser: ['WhatsApp-Cloud', 'Chrome', '1.0'],
//             printQRInTerminal: true,
//             getMessage: async () => null,
//         });

//         sock.ev.on('creds.update', async () => {
//             try {
//                 await saveCreds();
//                 await uploadAuthFilesToStorage(userId, authStatePath);
//             } catch (error) {
//                 console.error('❌ Error saving credentials:', error);
//             }
//         });

//         sock.ev.on('connection.update', async (update) => {
//             try {
//                 const { connection, lastDisconnect, qr } = update;

//                 if (qr && !hasSession) {
//                     console.log('🔍 Scan the QR code to login:');
//                 }

//                 if (connection === 'open') {
//                     console.log('✅ Connected to WhatsApp!');
//                     await updateUserPlatformId(userId, sock.user.id);

//                     // Optional: fetch past 2–3 day messages here if needed
//                     // await fetchRecentMessages(userId);
//                 }

//                 if (connection === 'close') {
//                     const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    
//                     if (shouldReconnect) {
//                         const delay = Math.min(60000, 5000 * Math.pow(2, retryAttempt));
//                         console.log(`🔌 Reconnecting in ${delay / 1000}s...`);
//                         setTimeout(() => startWhatsAppClient(userId, retryAttempt + 1), delay);
//                     } else {
//                         console.log('🔐 Session expired. Please re-authenticate.');
//                         await stopWhatsAppClient(userId);
//                         await cleanupSession(userId, authStatePath);
//                     }
//                 }
//             } catch (error) {
//                 console.error('❌ Connection update error:', error);
//             }
//         });

//         sock.ev.on('messages.upsert', async ({ messages }) => {
//             await processMessages(messages, userId);
//         });

//     } catch (error) {
//         console.error('❌ Error starting WhatsApp client:', error);

//         if (retryAttempt < 3) {
//             const delay = 5000 * (retryAttempt + 1);
//             console.log(`🔄 Retrying in ${delay / 1000}s...`);
//             setTimeout(() => startWhatsAppClient(userId, retryAttempt + 1), delay);
//         } else {
//             throw error;
//         }
//     }
// }


// async function cleanupSession(userId, authStatePath) {
//     try {
//         await supabaseServer
//             .from('app_user_platformid')
//             .update({ session_status: 'expired' })
//             .eq('user_id', userId)
//             .eq('platform', 'whatsapp');
        
//         await deleteAuthFilesFromStorage(userId);
//         if (authStatePath) {
//             await fs.rm(authStatePath, { recursive: true, force: true });
//         }
//     } catch (error) {
//         console.error('❌ Error during cleanup:', error);
//     } finally {
//         sock = null;
//         currentUserId = null;
//     }
// }

// async function processMessages(messages, userId) {
//     for (const msg of messages) {
//         if (!msg.message) continue;
        
//         try {
//             const messageData = await extractMessageData(msg, userId);
//             if (!messageData.content) continue;

//             await saveMessageToSupabase(messageData);
//             console.log('💾 Saved message to database',messageData);
//         } catch (error) {
//             console.error('❌ Error processing message:', error);
//         }
//     }
// }

// async function extractMessageData(msg, userId) {
//     const from = msg.key.remoteJid;
//     const isGroup = from.endsWith('@g.us');
//     const senderJid = msg.key.participant || from;
//     const senderName = msg.pushName || 'Unknown';
//     const isFromMe = msg.key.fromMe;
//     const timestamp = new Date(msg.messageTimestamp * 1000).toISOString();

//     let messageType = 'text';
//     let content = msg.message.conversation || 
//                  msg.message.extendedTextMessage?.text || 
//                  msg.message.imageMessage?.caption ||
//                  msg.message.videoMessage?.caption ||
//                  '[Media]';

//     let chatName = null;
//     if (isGroup) {
//         try {
//             const groupMetadata = await sock.groupMetadata(from);
//             chatName = groupMetadata.subject;
//         } catch (err) {
//             console.error('❌ Failed to fetch group metadata:', err);
//         }
//     }
//      return {
//         userId,
//         from,
//         isGroup,
//         senderJid,
//         senderName,
//         isFromMe,
//         timestamp,
//         messageType,
//         content,
//         chatName
//     };
// }

// async function saveMessageToSupabase(messageData) {
//     const { error } = await supabaseServer.from('memory_entries').insert({
//         user_id: messageData.userId,
//         chat_id: messageData.from,
//         chat_name: messageData.chatName,
//         content: messageData.content,
//         type: messageData.messageType,
//         source: 'whatsapp',
//         created_at: messageData.timestamp,
//         sender: messageData.senderName,
//         metadata: {
//             is_group: messageData.isGroup,
//             sender_jid: messageData.senderJid,
//             from_me: messageData.isFromMe
//         }
//     });

//     if (error) throw error;
// }
// async function stopWhatsAppClient(userId) {
//     if (!sock) return;

//     try {
//         console.log('🛑 Stopping WhatsApp client...');
//         await sock.logout();
        
//         // Update status in database
//         await supabaseServer
//             .from('app_user_platformid')
//             .update({ session_status: 'inactive' })
//             .eq('user_id', userId)
//             .eq('platform', 'whatsapp');
//          await deleteAuthFilesFromStorage(userId);
//         // Clean up local files
//         const authStatePath = path.join(TEMP_DIR, userId);
//         try {
//             await fs.rm(authStatePath, { recursive: true, force: true });
//         } catch (fsError) {
//             console.warn('⚠️ Error cleaning auth files:', fsError.message);
//         }

//         console.log('✅ WhatsApp client stopped');
//     } catch (error) {
//         console.error('❌ Error stopping WhatsApp client:', error);
//         throw error;
//     } finally {
//         sock = null;
//         currentUserId = null;
//     }
// }

// export { startWhatsAppClient, stopWhatsAppClient, currentUserId };