// // src/app/api/auth/baileys/getprofile/route.js

// import { getWhatsAppClient, getWhatsAppClientConnectionStatus } from '../../../../../../lib/whatsappSessionManager.js';
// import { NextResponse } from 'next/server';
// import pino from 'pino'; // Import pino for consistent logging

// const logger = pino({ level: 'debug' }).child({ module: 'GET-PROFILE-API' });

// export async function POST(req) { // No 'res' parameter needed in App Router API routes
//     let userId, jid; // Declare these variables outside the try block for broader scope in error logging

//     try {
//         // Correctly parse the JSON body from the Next.js App Router Request object
//         const requestBody = await req.json();
//         userId = requestBody.userId;
//         jid = requestBody.jid;

//         logger.debug(`[GET-PROFILE-API] Received request body: ${JSON.stringify(requestBody)}`);
//         logger.debug(`[GET-PROFILE-API] Parsed userId: ${userId}, jid: ${jid}`);

//         if (!userId || !jid) {
//             logger.warn(`[GET-PROFILE-API] Missing userId or jid in request body. userId: ${userId}, jid: ${jid}`);
//             return NextResponse.json({ message: 'Missing userId or jid' }, { status: 400 });
//         }

//         logger.info(`[GET-PROFILE-API] Fetching profile picture for userId: ${userId}, jid: ${jid}`);

//         // 1. Get the client instance
//         const clientInfo =await getWhatsAppClient(userId); // getWhatsAppClient now returns clientInfo {sock, connectionStatus, ...}

//         if (!clientInfo || !clientInfo.sock) {
//             logger.warn(`[GET-PROFILE-API] Baileys client for ${userId} not found or not initialized.`);
//             return NextResponse.json({ message: 'WhatsApp client not initialized. Please ensure a session is active.' }, { status: 425 });
//         }

//         // 2. Check the connection status
//         // You already have clientInfo.connectionStatus if your getWhatsAppClient is updated
//         const connectionStatus = clientInfo.connectionStatus; // Use the status directly from clientInfo
//         // If your getWhatsAppClient doesn't directly provide connectionStatus, then:
//         // const connectionStatus = getWhatsAppClientConnectionStatus(userId);
        
//         logger.info(`[GET-PROFILE-API] Baileys client for ${userId} connection state: ${connectionStatus}`);

//         if (connectionStatus !== 'open') {
//             logger.warn(`[GET-PROFILE-API] Baileys client for ${userId} is not in OPEN state. Current state: ${connectionStatus}`);
//             return NextResponse.json({ message: `WhatsApp client not ready. Current state: ${connectionStatus}. Please try again shortly.` }, { status: 425 });
//         }

//         // If we reach here, the client should be 'open'
//         logger.debug(`[GET-PROFILE-API] Client is open. Attempting to fetch profile picture for ${jid}.`);
//         const profilePicUrl = await clientInfo.sock.profilePictureUrl(jid);
//         console.log(profilePicUrl)
//         logger.info(`[GET-PROFILE-API] Successfully fetched profile picture for ${jid}.`);

//         return NextResponse.json({ profilePicUrl }, { status: 200 });

//     } catch (error) {
//         // userId and jid might not be defined if req.json() failed or if the 400 error happened immediately.
//         logger.error({ 
//             error: error.message, 
//             stack: error.stack, 
//             userId: userId, // Log userId if available
//             jid: jid // Log jid if available
//         }, '[GET-PROFILE-API] Error processing request or fetching profile picture:');
        
//         // Handle specific errors like not found or network issues from Baileys using Boom
//         if (error.output && error.output.statusCode) {
//             return NextResponse.json({ message: error.message, code: error.output.statusCode }, { status: error.output.statusCode });
//         }
        
//         return NextResponse.json({ message: 'Failed to fetch profile picture.', error: error.message }, { status: 500 });
//     }
// }