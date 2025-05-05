// // simple-whatsapp-qr-messages.js
// import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
// import pino from 'pino';
// import qrcode from 'qrcode-terminal';

// async function connectToWhatsApp() {
//     const logger = pino({ level: 'fatal' });
//     const { version } = await fetchLatestBaileysVersion();
//     const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

//     const sock = makeWASocket({
//         version,
//         logger,
//         printQRInTerminal: false,
//         auth: state,
//         browser: ['SimpleWhatsApp', 'Chrome', '1.0'],
//         defaultQueryParams: { ws: '/ws/chat' },
//     });

//     // Store for caching real-time messages
//     const messageStore = new Map();

//     sock.ev.on('creds.update', saveCreds);

//     sock.ev.on('connection.update', (update) => {
//         const { connection, lastDisconnect, qr } = update;

//         if (qr) {
//             console.log('QR code generated. Scan it with WhatsApp.');
//             qrcode.generate(qr, { small: true });
//         }

//         if (connection === 'open') {
//             console.log('Connected to WhatsApp successfully!');
//             console.log('Available sock methods:', Object.keys(sock));
//             console.log('Run this script again to reconnect without QR.');
//             // Try manual sync query
//             sock.sendNode({ tag: 'query', attrs: { type: 'chat', count: '100' } })
//                 .catch(err => console.error('Failed to trigger chat sync:', err.message));
//             // Add 50-second delay for sync
//             setTimeout(() => fetchRecentMessages(sock, messageStore), 5000);
//         }

//         if (connection === 'close') {
//             const statusCode = lastDisconnect?.error?.output?.statusCode;
//             const errorMessage = lastDisconnect?.error?.message || 'Unknown error';
//             if (statusCode === 401) {
//                 console.error('Session logged out. Delete ./auth_info and try again.');
//             } else if (statusCode === 405) {
//                 console.error('Connection rejected (405 error). Try a different phone number or wait 10-15 minutes.');
//             } else if (statusCode === 428) {
//                 console.error('Rate limited by WhatsApp. Wait 10-15 minutes and try again.');
//             } else {
//                 console.error('Connection failed:', errorMessage);
//                 setTimeout(connectToWhatsApp, 10000);
//             }
//         }
//     });

//     sock.ev.on('messages.upsert', async (m) => {
//         const messages = m.messages;
//         for (const msg of messages) {
//             const from = msg.key.remoteJid;
//             const sender = msg.key.fromMe ? 'You' : msg.key.participant || from;
//             const timestamp = new Date(Number(msg.messageTimestamp) * 1000).toLocaleString();
//             const status = msg.status || 'Unknown';
//             const pushName = msg.pushName || 'N/A';
//             let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
//             if (!text) {
//                 if (msg.message?.imageMessage) text = '[Image]';
//                 else if (msg.message?.videoMessage) text = '[Video]';
//                 else if (msg.message?.audioMessage) text = '[Audio]';
//                 else if (msg.message?.documentMessage) text = '[Document]';
//                 else text = '[Non-text message]';
//             }
//             console.log(`📥 New message from ${from} (${sender}):`);
//             console.log(`  🆔 ID: ${msg.key.id}`);
//             console.log(`  🕓 Timestamp: ${timestamp}`);
//             console.log(`  🔄 Status: ${status}`);
//             console.log(`  ✨ Push Name: ${pushName}`);
//             console.log(`  🏷️ Content: ${text}`);
//             console.log('  --------');

//             // Store the message
//             if (!messageStore.has(from)) {
//                 messageStore.set(from, []);
//             }
//             messageStore.get(from).push(msg);
//         }
//     });

//     // Debug: Monitor sock.chats population
//     sock.ev.on('chats.set', () => {
//         console.log('Chats updated. Available chats:', Object.keys(sock.chats || {}));
//         console.log('sock.chats details:', JSON.stringify(sock.chats, null, 2));
//     });
// }

// async function fetchRecentMessages(sock, messageStore, retryCount = 0) {
//     try {
//         console.log('Fetching recent messages...');

//         // Debug: Log available chats and messageStore
//         console.log('Available chats:', Object.keys(sock.chats || {}));
//         console.log('Message store contents:', Array.from(messageStore.keys()));

//         // Fetch group chats
//         let chats = [];
//         try {
//             const groups = await sock.groupFetchAllParticipating();
//             chats = Object.values(groups).map(group => ({
//                 id: group.id,
//                 name: group.subject || group.id,
//                 isGroup: true,
//             }));
//         } catch (error) {
//             console.error('Failed to fetch groups:', error.message);
//             // Fallback: Use sock.chats
//             chats = Object.entries(sock.chats || {}).map(([id, chatData]) => ({
//                 id,
//                 name: chatData.name || chatData.subject || id,
//                 isGroup: id.endsWith('@g.us'),
//             }));
//         }

//         if (chats.length === 0 && retryCount < 5) {
//             console.log('No chats found. Retrying in 15 seconds...');
//             setTimeout(() => fetchRecentMessages(sock, messageStore, retryCount + 1), 15000);
//             return;
//         } else if (chats.length === 0) {
//             console.log('No chats found after retries.');
//             return;
//         }

//         // Fetch messages from each chat
//         for (const chat of chats.slice(0, 10)) {
//             try {
//                 let messages = [];
//                 // Try fetchMessages if available
//                 if (typeof sock.fetchMessages === 'function') {
//                     console.log(`Using fetchMessages for ${chat.id}`);
//                     messages = await sock.fetchMessages(chat.id, { limit: 5 });
//                 } else {
//                     // Fallback to sock.chats
//                     console.log(`Using sock.chats for ${chat.id}`);
//                     messages = sock.chats?.[chat.id]?.messages?.slice(0, 5) || [];
//                     // Fallback to messageStore if sock.chats is empty
//                     if (messages.length === 0 && messageStore.has(chat.id)) {
//                         console.log(`Using messageStore for ${chat.id}`);
//                         messages = messageStore.get(chat.id).slice(-5); // Get last 5 messages
//                     }
//                 }

//                 console.log(`\n💬 Messages from ${chat.name} (${chat.id}) [${chat.isGroup ? 'Group' : 'Individual'}]:`);
//                 if (messages.length === 0) {
//                     console.log('  No messages found.');
//                 }
//                 for (const msg of messages) {
//                     const { key, message, messageTimestamp, pushName, status } = msg;
//                     const fromMe = key.fromMe;
//                     const sender = fromMe ? 'You' : key.participant || key.remoteJid;
//                     const content = message?.conversation
//                         || message?.extendedTextMessage?.text
//                         || message?.imageMessage?.caption
//                         || message?.videoMessage?.caption
//                         || '[Non-text message]';
//                     const type = message?.conversation ? 'Text' :
//                         message?.imageMessage ? 'Image' :
//                         message?.videoMessage ? 'Video' :
//                         message?.documentMessage ? 'Document' :
//                         message?.audioMessage ? 'Audio' : 'Other';
//                     const timestamp = new Date(Number(messageTimestamp) * 1000).toLocaleString();

//                     console.log(`  🆔 ID: ${key.id}`);
//                     console.log(`    👤 Sender: ${sender} (${fromMe ? 'You' : 'Other'})`);
//                     console.log(`    🕓 Timestamp: ${timestamp}`);
//                     console.log(`    🗂️ Type: ${type}`);
//                     console.log(`    🏷️ Content: ${content}`);
//                     console.log(`    🔄 Status: ${status || 'Unknown'}`);
//                     console.log(`    ✨ Push Name: ${pushName || 'N/A'}`);
//                     console.log('    --------');
//                 }
//             } catch (error) {
//                 console.error(`Failed to fetch messages for ${chat.name} (${chat.id}):`, error.message);
//             }
//         }
//     } catch (error) {
//         console.error('Failed to fetch recent messages:', error.message);
//     }
// }

// connectToWhatsApp().catch((error) => {
//     console.error('Fatal error:', error.message);
//     process.exit(1);
// });