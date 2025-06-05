// lib/whatsappSessionManager.js
import pkg from '@whiskeysockets/baileys';
const {
    default: makeWASocket,DisconnectReason,fetchLatestBaileysVersion,jidNormalizedUser,Browsers,proto,WAMessageContent,
} = pkg;
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import dotenv from 'dotenv';
import { sendWebSocketMessage } from './websocketServer.js'; // <--- ADD THIS LINE
import { makeSupabaseAuthStore } from './supabaseAuthStore.js';
import { supabaseServer } from './supabase.js';
import embed from '../src/app/api/auth/embedding.js';
import { encryptMessage } from '../src/app/api/data_security/route.js';
dotenv.config();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const supabaseForAuthStore = createClient(supabaseUrl, supabaseServiceRoleKey);
const whatsappClients = new Map();
const pendingQrCodes = new Map();
const logger = pino({ level: 'debug' }).child({ level: 'debug', module: 'WA-MANAGER' });

let singleUserSaveCredsTimeout = null;
const SINGLE_USER_DEBOUNCE_SAVE_CREDS_MS = 5000;

/**
 * @param {string} userId The application's user ID.
 * @param {string} type The type of message (e.g., 'qr', 'status', 'new-message').
 * @param {object} data The payload for the message.
 */
const broadcastToUser = (userId, type, data) => {
    logger.debug(`Attempting to broadcast to userId: ${userId} with type: ${type}`);
    const sent = sendWebSocketMessage(userId, type, data);
    if (!sent) {
        logger.warn(`Failed to send message to user ${userId} via WebSocket. Client might be disconnected.`);
    }
};

/**
 * @param {string} userId The application's user ID.
 * @param {WebSocket | null} ws The WebSocket instance, or null if disconnected.
 */
export const updateClientWebSocket = (userId, ws) => {
    const clientEntry = whatsappClients.get(userId);
    if (clientEntry) {
        clientEntry.ws = ws; // Attach the WebSocket instance to the client's entry
        logger.debug(`[WA-MANAGER] WebSocket updated for user ${userId}.`);
    } else {
        logger.warn(`[WA-MANAGER] Cannot update WebSocket for unknown user: ${userId}.`);
    }
};
/**
 * @param {string} userId The application's user ID.
 * @param {string} sessionStatus The status of the WhatsApp session ('inactive', 'qr_pending', 'connected', 'disconnected', 'logged_out', 'error', 'reconnecting').
 * @param {string | null} currentPlatformId The WhatsApp JID (e.g., '1234567890@c.us').
 * @param {string | null} qrCodeData The QR code string if status is 'qr_pending'.
 * @param {string | null} errorMessage Optional message for 'error' status.
 */
const updateWhatsAppSessionStatusInDb = async (userId, sessionStatus, currentPlatformId = null, qrCodeData = null, errorMessage = null) => {
    try {
        const now = new Date().toISOString();
        const updateData = {
            user_id: userId,
            platform: 'whatsapp',
            session_status: sessionStatus,
            current_platform_id: currentPlatformId,
            qr_code_data: qrCodeData,
            updated_at: now,
            error_message: errorMessage,
        };
        if (sessionStatus === 'connected') {
            updateData.connected_at = now;
            updateData.disconnected_at = null;
            updateData.qr_code_data = null;
            updateData.error_message = null;
        } else if (sessionStatus === 'disconnected' || sessionStatus === 'logged_out' || sessionStatus === 'error') {
            updateData.disconnected_at = now;
            updateData.qr_code_data = null;
            if (sessionStatus === 'disconnected' || sessionStatus === 'logged_out') {
                updateData.connected_at = null;
            }
        } else if (sessionStatus === 'qr_pending') {
            updateData.connected_at = null;
            updateData.disconnected_at = null;
            updateData.error_message = null;
        } else if (sessionStatus === 'reconnecting') {
            updateData.qr_code_data = null;
            updateData.disconnected_at = null;
            updateData.error_message = null;
        }
        const { error } = await supabaseServer
            .from('app_user_platformid')
            .upsert(updateData, {
                onConflict: 'user_id,platform',
                ignoreDuplicates: false
            });
        if (error) {
            logger.error({ error, userId }, `[Supabase DB] Error updating status for user ${userId}: ${error.message}`);
        } else {
            logger.info(`[Supabase DB] Session status updated for user ${userId} to: ${sessionStatus}`);
        }
    } catch (e) {
        logger.error({ e, userId }, `[Supabase DB] Exception while updating status for user ${userId}: ${e.message}`);
    }
};
/**
 * @param {string} userId The application's user ID.
 * @returns {object} An object containing status, message, qrCodeData, platformId from DB.
 */
const getWhatsAppSessionStatusFromDb = async (userId) => {
    try {
        logger.debug(`[Supabase DB] Fetching current status from app_user_platformid for user: ${userId}`);
        const { data, error } = await supabaseServer
            .from('app_user_platformid')
            .select('session_status, current_platform_id, qr_code_data, connected_at, disconnected_at, error_message')
            .eq('user_id', userId)
            .eq('platform', 'whatsapp')
            .maybeSingle();
        if (error) {
            logger.error({ error, userId }, `[Supabase DB] Error fetching session status for user ${userId}: ${error.message}`);
            return {
                status: 'error',
                message: `DB error fetching status: ${error.message}`,
                qrCodeData: null,
                platformId: null
            };
        }
        if (!data) {
            logger.info(`[Supabase DB] No existing WhatsApp session found for user ${userId} in DB.`);
            return {
                status: 'inactive',
                message: 'No previous WhatsApp session found in DB.',
                qrCodeData: null,
                platformId: null
            };
        }
        logger.info(`[Supabase DB] Found DB status for user ${userId}: ${data.session_status}`);
        return {
            status: data.session_status,
            message: data.error_message || `Last known status: ${data.session_status}.`,
            qrCodeData: data.qr_code_data,
            platformId: data.current_platform_id
        };
    } catch (e) {
        logger.error({ e, userId }, `[Supabase DB] Exception while fetching session status for user ${userId}: ${e.message}`);
        return {
            status: 'error',
            message: `Exception getting DB status: ${e.message}`,
            qrCodeData: null,
            platformId: null
        };
    }
};

let embedTimeout = null;
function triggerEmbedDebounced(delay = 3000) {
    if (embedTimeout) clearTimeout(embedTimeout);
    embedTimeout = setTimeout(() => {
        logger.info('⚙️ Running embed batch...');
        embed().catch(err => logger.error({ err }, '❌ Embedding error:'));
    }, delay);
}
/**
 * @param {object | undefined} contact Baileys contact object (from client.contacts).
 * @param {string} fallbackJid JID to use if no names are found.
 * @param {string} [pushNameFromMsg=''] Optional pushName from the message itself.
 * @returns {string} The best available display name.
 */
// const getDisplayName = (contact, fallbackJid, pushNameFromMsg = '') => {
//     if (contact) {
//         return contact.name || contact.verifiedName || contact.notify || pushNameFromMsg || fallbackJid.split('@')[0];
//     }
//     return pushNameFromMsg || fallbackJid.split('@')[0];
// };

// Make sure this utility function is accessible where extractMessageData is called
function getDisplayName(contact, jid, pushName, client = null) {
    // 1. Try saved contact name
    if (contact?.name) return contact.name;
    if (contact?.verifiedName) return contact.verifiedName; // Business accounts
    if (contact?.notify) return contact.notify; // Older name field / push name if no saved name

    // 2. Try the public 'pushName' if available (common for group messages)
    if (pushName) return pushName;

    // 3. Attempt to fetch profile info if client is available (might be slow or rate-limited)
    // This part would ideally happen asynchronously or as part of a contact sync
    // For a real-time message display, relying on 'pushName' or contact cache is better.
    // If you need more advanced lookup, you'd likely do this once for the contact and cache it.

    // 4. Fallback to formatted phone number
    const rawNumber = jid.split('@')[0];
    if (rawNumber) {
        // You can make this formatting more user-friendly, e.g., "+91 12345 67890"
        if (rawNumber.length > 10) { // Assuming international format without '+'
            // Example: +91 79727 78094
            const countryCode = rawNumber.slice(0, 2); // Adjust based on your expected country code length
            const numberPart = rawNumber.slice(2);
            return `+${countryCode} ${numberPart.replace(/(\d{5})(\d{5})/, '$1 $2')}`; // Example for 10-digit numbers
        }
        return rawNumber; // Just the number
    }

    return 'Unknown'; // Last resort
}

/**
 * @param {object} msg The raw Baileys message object.
 * @param {string} userId The application's user ID associated with this client.
 * @returns {object|null} Structured message data, or null if invalid.
 */
async function extractMessageData(msg, userId) {
    if (!msg || !msg.key || !msg.message) {
        logger.warn(`Skipping extractMessageData for userId ${userId} due to invalid message object.`);
        return null;
    }

    const clientInfo = whatsappClients.get(userId);
    const client = clientInfo?.client; // Client might be undefined if not found
    const messageChatJid = msg.key.remoteJid; // The JID of the conversation
    const sender_jid = msg.key.participant || msg.key.remoteJid;
    const phone_no = sender_jid.split('@')[0];
    const isGroup = messageChatJid.endsWith('@g.us');
    const senderJid = msg.key.participant || msg.key.remoteJid; // Actual sender JID
    const isFromMe = msg.key.fromMe;
    const timestamp = new Date(Number(msg.messageTimestamp) * 1000).toISOString();

    let messageType = 'unknown';
    let content = '';
    let mediaUrl = null;

    if (msg.message.conversation) {
        messageType = 'text';
        content = msg.message.conversation;
    } else if (msg.message.extendedTextMessage?.text) {
        messageType = 'text';
        content = msg.message.extendedTextMessage.text;
    } else if (msg.message.imageMessage) {
        messageType = 'image';
        content = msg.message.imageMessage.caption || '[Image Message]';
    } else if (msg.message.videoMessage) {
        messageType = 'video';
        content = msg.message.videoMessage.caption || '[Video Message]';
    } else if (msg.message.audioMessage) {
        messageType = 'audio';
        content = '[Voice Message]';
    } else if (msg.message.stickerMessage) {
        messageType = 'sticker';
        content = '[Sticker]';
    } else if (msg.message.documentMessage) {
        messageType = 'document';
        content = msg.message.documentMessage.caption || `[Document: ${msg.message.documentMessage.fileName || 'unknown'}]`;
    } else if (msg.message.reactionMessage) {
        messageType = 'reaction';
        content = msg.message.reactionMessage.text || '[Reaction]';
    } else if (msg.message.locationMessage) {
        messageType = 'location';
        content = `[Location: Lat ${msg.message.locationMessage.degreesLatitude}, Lon ${msg.message.locationMessage.degreesLongitude}]`;
    } else if (msg.message.contactMessage) {
        messageType = 'contact';
        content = `[Contact: ${msg.message.contactMessage.displayName || 'Unknown Contact'}]`;
    }
    if (!content && ['audio', 'sticker', 'document', 'reaction', 'image', 'video', 'location', 'contact'].includes(messageType)) {
        content = `[${messageType.charAt(0).toUpperCase() + messageType.slice(1)} Message]`;
    }

    let senderName;
    let chatName;
    let receiverName;

    // --- Enhanced Sender Name Resolution ---
  const formatPhoneNumber = (jid) => {
    const raw = jid?.split('@')[0];
    if (!raw) return '';
    return `+${raw.slice(0, 2)} ${raw.slice(2)}`; // e.g., +91 7972778094
};

if (isFromMe) {
    senderName = 'You'; // Always 'You' for messages sent by the logged-in user

    if (isGroup) {
        try {
            const groupMetadata = client ? await client.groupMetadata(messageChatJid) : null;
            chatName = groupMetadata?.subject;
        } catch (err) {
            logger.error({ err }, `Failed to fetch group metadata for ${messageChatJid} (outgoing group message).`);
        }
        // Fallback to formatted phone number
        chatName = chatName || formatPhoneNumber(messageChatJid);
        receiverName = chatName;
    } else {
        const recipientContact = client?.contacts ? client.contacts[messageChatJid] : undefined;
        chatName = getDisplayName(recipientContact, messageChatJid);
        chatName = chatName || formatPhoneNumber(messageChatJid);
        receiverName = chatName;
    }
} else {
    const incomingSenderContact = client?.contacts ? client.contacts[senderJid] : undefined;
    senderName = getDisplayName(incomingSenderContact, senderJid, msg.pushName);

    if (isGroup) {
        try {
            const groupMetadata = client ? await client.groupMetadata(messageChatJid) : null;
            chatName = groupMetadata?.subject;
        } catch (err) {
            logger.error({ err }, `Failed to fetch group metadata for ${messageChatJid} (incoming group message).`);
        }
        chatName = chatName || formatPhoneNumber(messageChatJid);
        receiverName = 'You';
    } else {
        chatName = senderName || formatPhoneNumber(senderJid);
        receiverName = 'You';
    }
}

    // --- End Enhanced Sender Name Resolution ---

    let deliveryStatus = 'Unknown';
    if (isFromMe) {
        deliveryStatus = msg.status === 1 ? 'Sent' :
                         msg.status === 2 ? 'Delivered' :
                         msg.status === 3 ? 'Read' :
                         'Sending'; // Default if no specific status (e.g., still processing)
    } else {
        deliveryStatus = 'Received';
    }

    return {
        userId,
        messageChatJid, // This is the JID of the conversation (e.g., recipient JID for 1-1, group JID for groups)
        isGroup,
        senderJid,      // The actual JID of the message sender
        senderName,     // The display name of the message sender
        isFromMe,
        timestamp,
        deliveryStatus,
        messageType,
        content,
        chatName,       // The name of the chat/conversation (group name or other participant's name)
        receiverName,   // Who received the message ('You' or the chat partner/group)
        fullMessageObject: msg.message,
        messageId: msg.key.id,
        mediaUrl
    };
}

/**
 * @param {object} messageData Structured message data from extractMessageData.
 * @returns {Promise<void>}
 */
async function saveMessageToSupabase(messageData) {
    if (!messageData || !messageData.content) {
        logger.warn('Skipping saveMessageToSupabase due to missing message data or content.');
        return;
    }

    const {
        userId,
        messageChatJid,
        chatName,
        content,
        messageType,
        timestamp,
        senderName,
        receiverName,
        deliveryStatus,
        fullMessageObject,
        messageId,
        mediaUrl
    } = messageData;

    let saved = false;
    let retries = 0;
    const maxRetries = 3;

    let embedding = null;
    let encryptedContent = null;

    try {
        embedding = await embed(content);
        logger.debug('✅ Embedding successful');
    } catch (embedError) {
        logger.warn({ embedError }, '⚠️ Embedding failed. Falling back to encryption.');
    }

    try {
        encryptedContent = encryptMessage(content,userId);
    } catch (encryptError) {
        logger.error({ encryptError }, '❌ Encryption failed. Message will not be saved.');
        return; // Don't proceed if encryption fails
    }

    const finalContent = embedding ? content : encryptedContent;

    while (!saved && retries < maxRetries) {
        try {
            const { error } = await supabaseServer.from('memory_entries').upsert({
                user_id: userId,
                chat_id: messageChatJid,
                chat_name: chatName,
                content: finalContent,
                type: "message",
                source: 'whatsapp',
                created_at: timestamp,
                sender: senderName,
                receiver: receiverName,
                delivery_status: deliveryStatus,
                embedding: embedding,
                message_unique_id: messageId,
                metadata: {
                    chat_id: messageChatJid,
                    chat_name: chatName,
                    sender: senderName,
                    sender_jid: messageData.senderJid,
                    receiver: receiverName,
                    from_me: messageData.isFromMe,
                    timestamp: timestamp,
                    message_id: messageId,
                    message_type: messageType,
                    // full_message_object: fullMessageObject,
                    encrypted: !embedding // Mark if fallback used
                },
                media_url: mediaUrl,
            }, { onConflict: 'user_id, message_unique_id' });

            if (error) throw error;
            saved = true;
            logger.info('✅ Message saved to Supabase');
        } catch (error) {
            retries++;
            logger.error({ error, userId, messageChatJid }, `❌ Save failed (attempt ${retries})`);
            await new Promise(res => setTimeout(res, 2000 * retries));
        }
    }

    if (!saved) {
        logger.error({ userId, messageChatJid }, `Fatal: Could not save message after ${maxRetries} retries.`);
        throw new Error(`Failed to save message after ${maxRetries} attempts`);
    }
}

const isRecent = (timestamp) => {
    const now = Date.now();
    const msgTime = Number(timestamp) * 1000;
    return msgTime >= now - (5 * 60 * 1000); // 5 minutes ago
};
/**
 * @param {string} userId The application's user ID.
 * @param {number} days How many days back to fetch messages.
 * @returns {Promise<Array>} An array of message objects.
 */
async function fetchRecentMessagesFromSupabase(userId, days = 2) {
    try {
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - days);
        const twoDaysAgoISO = twoDaysAgo.toISOString();
        logger.info(`Workspaceing messages for user ${userId} from ${twoDaysAgoISO} onwards.`);
        const { data, error } = await supabaseServer
            .from('memory_entries')
            .select('*') // Select all columns, or specific ones you need for frontend display
            .eq('user_id', userId)
            .gte('created_at', twoDaysAgoISO)
            .order('created_at', { ascending: true }); // Order chronologically

        if (error) {
            logger.error({ error, userId }, `Error fetching recent messages from Supabase for user ${userId}: ${error.message}`);
            return [];
        }
        logger.info(`Found ${data.length} recent messages for user ${userId}.`);
        return data;
    } catch (e) {
        logger.error({ e, userId }, `Exception while fetching recent messages from Supabase for user ${userId}: ${e.message}`);
        return [];
    }
}
//to update the status of messages
export const updateMessageStatusInSupabase = async (userId, baileysMessageId, newStatus) => {
    try {
        const { data, error } = await supabase
            .from('memory_entries') // Replace with your actual messages table name
            .update({ delivery_status: newStatus })
            .eq('user_id', userId) // Assuming you store userId with messages
            .eq('metadata->>message_id', baileysMessageId) // Assuming you store Baileys' message ID
            .select(); // Use select() to get the updated row, or omit if not needed

        if (error) {
            logger.error({ error }, `Error updating message status for Baileys ID ${baileysMessageId}: ${error.message}`);
            throw error; // Propagate error for retry or logging
        }

        if (data && data.length > 0) {
            logger.info(`Updated message ${baileysMessageId} to status '${newStatus}'.`);
            return data[0]; // Return the updated row if needed
        } else {
            logger.warn(`No message found with Baileys ID ${baileysMessageId} for user ${userId} to update status.`);
            return null;
        }
    } catch (e) {
        logger.error({ e }, `Exception in updateMessageStatusInSupabase for Baileys ID ${baileysMessageId}: ${e.message}`);
        throw e;
    }
};

/**
 * @param {string} userId The application's user ID.
 * @returns {Promise<object>} The Baileys client instance.
 */
const createWhatsAppClient = async (userId) => {
    logger.info(`Initiating client creation for user: ${userId}`);

    // If an existing client exists, close it gracefully.
    // This part is mostly fine, but ensure the `clearAuthData` is *not* called here
    // unless the decision to clear is explicitly made later based on Baileys events.
    if (whatsappClients.has(userId)) {
        logger.warn(`Closing existing WhatsApp client in memory for user ${userId} before creating a new one.`);
        const clientInfo = whatsappClients.get(userId);
        try {
            if (clientInfo && clientInfo.client && typeof clientInfo.client.end === 'function') {
                await clientInfo.client.end('RECREATE_CLIENT'); // Using 'RECREATE_CLIENT' as a reason
                logger.info(`Gracefully ended existing in-memory client for user ${userId}.`);
            } else {
                logger.warn(`Existing in-memory client for ${userId} found but has no .end() method.`);
            }
        } catch (e) {
            logger.error({ e, userId }, `Error during graceful end of existing client for ${userId}`);
        }
        whatsappClients.delete(userId);
        pendingQrCodes.delete(userId);
        if (singleUserSaveCredsTimeout) {
            clearTimeout(singleUserSaveCredsTimeout);
            singleUserSaveCredsTimeout = null;
        }
    }

    // --- CRITICAL CHANGE START ---
    // The goal is to ALWAYS try to load existing credentials first.
    // Let the auth store tell us if no credentials were found or if they are invalid.
    const { state, saveCreds, clearAllAuthData: storeClearAuthData, loadedSuccessfully } =
        await makeSupabaseAuthStore(userId, supabaseForAuthStore, true); // <--- ALWAYS set expectCredsExist to true here

    // Only clear if no credentials were loaded successfully or if the DB explicitly says 'logged_out' / 'inactive' / 'error'
    const dbStatusInfo = await getWhatsAppSessionStatusFromDb(userId);
    let shouldPerformFreshLogin = false;

    if (!loadedSuccessfully) {
        logger.warn(`[SupabaseAuthStore] No existing credentials found for user ${userId} or failed to load. Will perform fresh login.`);
        shouldPerformFreshLogin = true;
    } else if (dbStatusInfo.status === 'logged_out' || dbStatusInfo.status === 'inactive' || dbStatusInfo.status === 'error') {
        logger.info(`[WA-MANAGER] DB reports user ${userId} is '${dbStatusInfo.status}'. Forcing fresh login flow despite potentially loaded creds.`);
        shouldPerformFreshLogin = true;
    } else {
        logger.info(`[WA-MANAGER] DB reports user ${userId} is '${dbStatusInfo.status}'. Attempting to re-establish session from potentially loaded credentials.`);
        // If credentials were loaded successfully AND DB status is connected/reconnecting/qr_pending
        // we don't clear, we let Baileys try to resume.
        await updateWhatsAppSessionStatusInDb(userId, 'reconnecting', dbStatusInfo.platformId, null); // Set to reconnecting as we're trying
    }

    // If a fresh login is needed (either no creds found or DB explicitly indicates a need to log out/re-QR)
    if (shouldPerformFreshLogin) {
        if (loadedSuccessfully) { // If some partial creds were loaded, but we decided to clear anyway
             await storeClearAuthData(); // Clear them from storage
             logger.info(`Cleared previous auth data for user ${userId} because a fresh login is required.`);
        }
        await updateWhatsAppSessionStatusInDb(userId, 'qr_pending', null, null); // Always update to qr_pending for a fresh start
    }
    // --- CRITICAL CHANGE END ---

    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`Baileys version: ${version.join('.')}, is latest: ${isLatest}`);

    const client = makeWASocket({
        version,
        logger: logger.child({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state, // Use the state obtained from makeSupabaseAuthStore
        browser: Browsers.macOS('Chrome'),
         getMessage: async (key) => {
            logger.debug(`getMessage: Looking for message ${key.id} in chat ${key.remoteJid}`);
            const { data, error } = await supabaseServer.from('memory_entries')
                .select('metadata->full_message_object')
                .eq('chat_id', key.remoteJid)
                .eq('metadata->>message_id', key.id)
                .maybeSingle();
            if (error) {
                logger.error({ error, messageId: key.id }, `Error fetching message for getMessage hook: ${error.message}`);
            }
            if (data && data.full_message_object) {
                logger.debug(`Found message for getMessage hook: ${key.id}`);
                return proto.WebMessageInfo.fromObject(data.full_message_object);
            }
            return null;
        },
    });

    // Store the client and its auth management functions.
    whatsappClients.set(userId, { client, clearAuthData: storeClearAuthData });
    logger.info(`Baileys client created and stored for user: ${userId}. Current in-memory clients: ${Array.from(whatsappClients.keys()).join(', ')}`);

    client.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        logger.debug({ update }, `Connection update for user ${userId}:`);

        if (qr) {
        logger.info(`QR code received for user ${userId}`);
        broadcastToUser(userId, 'qr', { qrCode: qr });
        await updateWhatsAppSessionStatusInDb(userId, 'qr_pending', null, qr);
        pendingQrCodes.set(userId, qr);
        return;
        }

        

        if (connection === 'open') {
            const platformId = jidNormalizedUser(client.user.id);
            logger.info(`Connection opened for user: ${userId}. JID: ${platformId}`);
            broadcastToUser(userId, 'status', { status: 'connected', message: 'WhatsApp Connected!', platformId });
            await updateWhatsAppSessionStatusInDb(userId, 'connected', platformId, null);
            pendingQrCodes.delete(userId);

            // IMPORTANT: Immediately save credentials when connection is open and registered
            // This ensures that the 'creds.registered: true' state is persisted quickly.
            // Also, update the flag to prevent redundant saves of the initial registered state.
            if (client.authState.creds.registered && !client.authState.creds._savedRegisteredState) {
                logger.info(`Connection open and registered for user ${userId}. Forcing immediate credential save.`);
                await saveCreds();
                client.authState.creds._savedRegisteredState = true; // Mark as saved
            }

            try {
                const recentMessages = await fetchRecentMessagesFromSupabase(userId, 2);
                if (recentMessages.length > 0) {
                    logger.info(`Broadcasting ${recentMessages.length} recent messages from DB to user ${userId}.`);
                    broadcastToUser(userId, 'recent_messages', { messages: recentMessages });
                }
            } catch (error) {
                logger.error({ error, userId }, `Error fetching/broadcasting recent messages on connection open for user ${userId}:`);
            }
         } else if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        logger.warn(`Connection closed for user ${userId}. Reason: ${reason}.`);

        const isLoggedOut = reason === DisconnectReason.loggedOut;
        // Check for the specific error message for Invalid PreKey ID
        const isPreKeyError = lastDisconnect?.error?.message?.includes('Invalid PreKey ID');
        const isServerErrorShutdown = reason === 500 && lastDisconnect?.error?.message === 'SHUTDOWN_SERVER';

        if (isLoggedOut || isPreKeyError) { // <<< Ensure isPreKeyError is included here
            logger.info(`User ${userId} explicitly logged out or encountered PreKeyError. Cleaning up session.`);
            broadcastToUser(userId, 'status', { status: 'logged_out', message: 'Logged out from WhatsApp. Please reconnect.' });
            await updateWhatsAppSessionStatusInDb(userId, 'logged_out', null, null);
            const clientInfo = whatsappClients.get(userId);
            if (clientInfo && clientInfo.clearAuthData) {
                await clientInfo.clearAuthData(); // Clear auth data from Supabase
                logger.info(`Successfully cleared auth data for user ${userId} on explicit logout/PreKeyError.`);
            } else {
                logger.warn(`clearAuthData function not found for user ${userId} during explicit logout/PreKeyError.`);
            }
            whatsappClients.delete(userId);
            pendingQrCodes.delete(userId);
            if (singleUserSaveCredsTimeout) {
                clearTimeout(singleUserSaveCredsTimeout);
                singleUserSaveCredsTimeout = null;
            }
            // No automatic reconnect here, as it's a full logout.
            // The user will need to re-initiate connection from the UI.
        } else if (isServerErrorShutdown) { // Handle your specific server shutdown
            logger.info(`Server initiated shutdown for user ${userId}. Not attempting automatic reconnect.`);
            // Just let the server shut down gracefully.
            whatsappClients.delete(userId);
            pendingQrCodes.delete(userId);
        }
        else {
            // For other disconnect reasons (like 515, network issues)
            logger.info(`Connection closed for user ${userId}. Reason: ${reason}. Attempting to reconnect...`);
            broadcastToUser(userId, 'status', { status: 'reconnecting', message: 'Connection lost. Attempting to reconnect...' });
            await updateWhatsAppSessionStatusInDb(userId, 'reconnecting', null, null);
            setTimeout(() => createWhatsAppClient(userId), 5000);
        }
    }
});

client.ev.on('messages.update', async (messageUpdates) => {
    logger.info(`Received messages.update for user ${userId}. Count: ${messageUpdates.length}`);

    for (const update of messageUpdates) {
        const messageId = update.key.id;
        const remoteJid = update.key.remoteJid;
        const fromMe = update.key.fromMe;

        // Ensure it's a message sent by *us* that is being updated
        if (!fromMe) {
            logger.debug(`Skipping message update not from me: ${messageId}`);
            continue;
        }

        if (update.update && update.update.status !== undefined) {
            const newStatus = update.update.status;
            let statusText = 'UNKNOWN'; // Default

            // Map Baileys status codes to human-readable or your DB status
            if (newStatus === 0) statusText = 'PENDING'; // Not yet sent
            else if (newStatus === 1) statusText = 'SENT'; // Sent to server
            else if (newStatus === 2) statusText = 'DELIVERED'; // Delivered to recipient
            else if (newStatus === 3) statusText = 'READ'; // Read by recipient
            else if (newStatus === 4) statusText = 'PLAYED'; // Media message played (audio/video)
            // You might need to add more cases based on Baileys' internal status codes

            logger.info(`Message ID ${messageId} to ${remoteJid} updated to status: ${statusText} (${newStatus})`);

            try {
                // Call a helper function to update your Supabase table
                await updateMessageStatusInSupabase(userId, messageId, statusText);
                logger.debug(`Successfully updated message ${messageId} status to ${statusText} in Supabase.`);
            } catch (error) {
                logger.error({ error, messageId }, `Failed to update message status for ${messageId} in Supabase: ${error.message}`);
            }
        }
    }
});
    client.ev.on('creds.update', async () => {
        // This event fires frequently. Use the debounce for general updates.
        logger.debug(`creds.update event fired for user ${userId}. Debouncing credential save...`);
        // The condition below correctly forces an immediate save for the 'registered' state.
        if (client.authState.creds.registered && !client.authState.creds._savedRegisteredState) {
            await saveCreds(); // Force immediate save
            client.authState.creds._savedRegisteredState = true; // Set a flag to prevent repeated immediate saves
            logger.info(`✅ Credentials IMMEDIATELY saved to Supabase: registered true for user ${userId}.`);
        }
        if (singleUserSaveCredsTimeout) {
            clearTimeout(singleUserSaveCredsTimeout);
        }
        singleUserSaveCredsTimeout = setTimeout(async () => {
            await saveCreds(); // This calls saveAuthDataToSupabase from your store
            logger.info(`✅ Credentials saved to Supabase after debounce for user ${userId}.`);
            singleUserSaveCredsTimeout = null;
        }, SINGLE_USER_DEBOUNCE_SAVE_CREDS_MS);
    });

     client.ev.on('messages.upsert', async ({ messages, type }) => {
        try {
            logger.info(`Received messages.upsert for user ${userId}. Type: ${type}, Count: ${messages.length}`);
            for (const msg of messages) {
                if (!msg.message) {
                    logger.debug('Skipping message with no content object.');
                    continue;
                }

                // Only process recent messages if type is 'notify' or 'append'
                if (type === 'notify' || (type === 'append' && !isRecent(msg.messageTimestamp))) {
                    if (!isRecent(msg.messageTimestamp)) {
                        logger.info(`Skipping old message from ${msg.key.remoteJid} (timestamp: ${msg.messageTimestamp}) of type '${type}'.`);
                        continue;
                    }
                }
                logger.debug({ msg }, `Processing message for user ${userId}:`);

                const messageData = await extractMessageData(msg, userId);
                if (!messageData || !messageData.content) {
                    logger.info(`❌ Skipping message for user ${userId} due to empty or invalid extracted content.`);
                    continue;
                }
                await saveMessageToSupabase(messageData);
                logger.info(`Message from ${messageData.senderName} (${messageData.messageChatJid}) saved for user ${userId}.`);

                broadcastToUser(userId, 'new_message', { message: messageData });
            }
             triggerEmbedDebounced();
        } catch (error) {
            logger.error({ error, userId }, `Error processing incoming messages for user ${userId}:`);
        }
    });


    client.ev.on('contacts.upsert', async (newContacts) => {
        logger.info(`Contacts updated for user ${userId}. Count: ${newContacts.length}`);
    });
    return client;
};

/**
 * @param {string} userId
 * @returns {object|undefined} The client object or undefined if not found.
 */

export const getWhatsAppClient = async (userId) => {
    let clientInfo = whatsappClients.get(userId);
    // Check if client and its user/websocket state exist and are open
    if (clientInfo?.client?.user && clientInfo?.client?.ws.readyState === clientInfo.client.ws.OPEN) {
        logger.debug(`getWhatsAppClient: Returning existing connected client for user ${userId}.`);
        return clientInfo.client;
    }
    logger.info(`getWhatsAppClient: Client not found or not connected for user ${userId}. Attempting to create/re-establish.`);
    try {
        const client = await createWhatsAppClient(userId);
        // After creating, you might want to wait for it to be fully "open" if immediate use is expected.
        // However, the `connection.update` event handles this.
        return client;
    } catch (error) {
        logger.error({ error, userId }, `Failed to create WhatsApp client in getWhatsAppClient for user ${userId}:`);
        return undefined;
    }
};
/**
 * @param {string} userId The application's user ID.
 * @param {string} recipientJid The recipient's JID (e.g., '1234567890@s.whatsapp.net' or '12345@g.us').
 * @param {string} messageText The text message content.
 * @param {object} [options={}] Optional message options (e.g., quoting, mentions).
 * @returns {Promise<object|null>} The sent message response from Baileys, or null on failure.
 */
export const sendWhatsAppMessage = async (userId, recipientJid, messageText, options = {}) => {
    const client =await getWhatsAppClient(userId);
    if (!client) {
        logger.warn(`Cannot send message: WhatsApp client not active for user ${userId}.`);
        return null;
    }

    try {
        await client.sendPresenceUpdate('composing', recipientJid);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await client.sendPresenceUpdate('paused', recipientJid);

        const sentMsg = await client.sendMessage(recipientJid, { text: messageText, ...options });
        logger.info(`Message sent by user ${userId} to ${recipientJid}: "${messageText.substring(0, 50)}..."`);
        if (sentMsg && sentMsg.key) {
            let chatNameForOutgoing;
            let receiverNameForOutgoing;
            const isGroup = recipientJid.endsWith('@g.us');

            if (isGroup) {
                try {
                    const groupMetadata = await client.groupMetadata(recipientJid);
                    chatNameForOutgoing = groupMetadata?.subject || recipientJid.split('@')[0];
                } catch (err) {
                    logger.error({ err }, `Failed to fetch group metadata for ${recipientJid} (outgoing send):`);
                    chatNameForOutgoing = recipientJid.split('@')[0]; // Fallback to JID number
                }
                receiverNameForOutgoing = chatNameForOutgoing; // Receiver is the group itself
            } else {
                const recipientContact = client.contacts ? client.contacts[recipientJid] : undefined;
                chatNameForOutgoing = getDisplayName(recipientContact, recipientJid); // This is the partner's name
                receiverNameForOutgoing = chatNameForOutgoing; // Receiver is the chat partner
            }

            const sentMessageData = {
                userId,
                messageChatJid: recipientJid, // The JID of the chat you sent to
                isGroup: isGroup,
                senderJid: client.user.id, // Your own JID
                senderName: 'You',
                isFromMe: true,
                timestamp: new Date(Number(sentMsg.messageTimestamp) * 1000).toISOString(),
                deliveryStatus: sentMsg.status === 1 ? 'Sent' : 'Sending', // Baileys status for sent messages
                messageType: 'text', // Assuming 'text' for now, expand if you send other types
                content: messageText,
                chatName: chatNameForOutgoing, // Use the resolved chat partner/group name
                receiverName: receiverNameForOutgoing, // Receiver is the chat partner or group
                fullMessageObject: sentMsg, // Store the raw message object
                messageId: sentMsg.key.id,
                mediaUrl: null // No media URL for text messages
            };
            await saveMessageToSupabase(sentMessageData)
                .catch(e => logger.error({ e }, `Failed to save outgoing message to DB for user ${userId}`));

            broadcastToUser(userId, 'new_message', { message: sentMessageData }); // Also broadcast the sent message
        }
        return sentMsg;
    } catch (error) {
        logger.error({ error, userId, recipientJid }, `Failed to send WhatsApp message:`);
        return null;
    }
};
/**
 * @param {string} userId The application's user ID.
 * @returns {Promise<void>}
 */
const shutdownWhatsAppClient = async (userId) => {
    const clientInfo = whatsappClients.get(userId);
    if (clientInfo) {
        logger.info(`Attempting to end WhatsApp client for user: ${userId}`);
        try {
            if (clientInfo.client && typeof clientInfo.client.end === 'function') {
                await clientInfo.client.end('SHUTDOWN_SERVER');
            } else {
                logger.warn(`client.end is not a function for user ${userId}. Client might already be disconnected or incomplete.`);
            }
            logger.info(`WhatsApp client ended for user: ${userId}.`);
            whatsappClients.delete(userId);
            pendingQrCodes.delete(userId);
        } catch (error) {
            logger.error({ error }, `Error ending WhatsApp client for user ${userId}`);
        }
    } else {
        logger.info(`No active WhatsApp client found for user: ${userId} to shut down.`);
    }
};

export const shutdownWhatsAppClients = async () => {
    logger.info("Initiating graceful shutdown of all WhatsApp clients...");
    for (const [userId] of whatsappClients.entries()) {
        await shutdownWhatsAppClient(userId);
    }
    logger.info("All WhatsApp clients shut down.");
};

export const logoutWhatsAppClient = async (userId) => {
    logger.info(`Initiating logout for user: ${userId}`);
    const clientInfo = whatsappClients.get(userId);

    if (clientInfo && clientInfo.client) {
        try {
            await clientInfo.client.logout();
            logger.info(`Baileys client logout initiated for user ${userId}.`);
            // The 'connection.update' event listener will handle further cleanup (logged_out status, clearAuthData)
            return { success: true, message: 'Logout initiated.' };
        } catch (error) {
            logger.error({ error }, `Error during logout for user ${userId}. Attempting fallback cleanup.`);
            // Fallback cleanup if client.logout() fails
            if (clientInfo.clearAuthData) {
                await clientInfo.clearAuthData();
            }
            await updateWhatsAppSessionStatusInDb(userId, 'logged_out', null, null, 'Logout failed, session cleared via fallback.');
            whatsappClients.delete(userId);
            pendingQrCodes.delete(userId);
            broadcastToUser(userId, 'status', { status: 'logged_out', message: 'Logout failed, session cleared.' });
            return { success: false, message: 'Failed to log out gracefully.' };
        }
    } else {
        logger.warn(`No active client found for user ${userId} to log out. Checking DB status.`);
        // Update DB status directly as there's no active client to log out
        await updateWhatsAppSessionStatusInDb(userId, 'logged_out', null, null, 'No active client, forcing logged out status.');

        try {
            // Corrected call to makeSupabaseAuthStore
            // Pass the Supabase client instance as the second argument
            const { clearAllAuthData: storeClearAuthData } = await makeSupabaseAuthStore(
                userId,
                supabaseForAuthStore, // Correct: Pass the Supabase client
                false // expectCredsExist: false, since we're forcing a fresh start
            );

            if (storeClearAuthData) { // Check if the function exists
                await storeClearAuthData();
                logger.info(`Ensured auth data is cleared for user ${userId} as no active client found.`);
            } else {
                logger.warn(`clearAllAuthData function not returned by makeSupabaseAuthStore for user ${userId}.`);
            }
            return { success: true, message: 'No active client, ensured logged out status and cleared data.' };
        } catch (e) {
            logger.error({ e, userId }, `Exception during fallback auth data cleanup for user ${userId}.`);
            return { success: false, message: `Failed to ensure logged out status and clear data: ${e.message}` };
        }
    }
};
/**
 * @param {string} userId The application's user ID.
 * @returns {object} An object containing status, message, qrCodeData, platformId.
 */
export const getWhatsAppSessionStatus = async (userId) => {
    const clientInfo = whatsappClients.get(userId);
    if (clientInfo && clientInfo.client && clientInfo.client.user) {
        const platformId = jidNormalizedUser(clientInfo.client.user.id);
        return {
            status: 'connected',
            message: 'WhatsApp Connected!',
            qrCodeData: null,
            platformId: platformId
        };
    } else if (pendingQrCodes.has(userId)) {
        return {
            status: 'qr_pending',
            message: 'Scan QR code to connect.',
            qrCodeData: pendingQrCodes.get(userId),
            platformId: null
        };
    } else {
        logger.debug(`Checking Supabase DB for status for user: ${userId}`);
        const dbStatusInfo = await getWhatsAppSessionStatusFromDb(userId);
        return dbStatusInfo;
    }
};
export {
    createWhatsAppClient,shutdownWhatsAppClient,broadcastToUser,whatsappClients,pendingQrCodes,updateWhatsAppSessionStatusInDb,
};