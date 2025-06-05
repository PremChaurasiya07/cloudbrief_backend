
import pkg from '@whiskeysockets/baileys';
const { initAuthCreds, BufferJSON } = pkg; // Removed 'proto' as it's not used directly here

import { makeCacheableSignalKeyStore } from '@whiskeysockets/baileys/lib/Utils/index.js';
import pino from 'pino';
import { Buffer } from 'buffer'; // Explicit import for Buffer

const logger = pino({ level: 'debug' }).child({ module: 'SUPABASE-AUTH-STORE' });

const bucketName = 'whatsapp-session';

export const makeSupabaseAuthStore = async (userId, supabaseClient, expectCredsExist = false) => {
    const AUTH_FILE_NAME = `auth_creds/${userId}/baileys-auth.json`;

    let creds = initAuthCreds();
    let keys = {}; // In-memory representation of signal keys

    // --- Custom Key Store for in-memory keys ---
     const customKeyStore = {
        get: (type, ids) => {
            const data = keys[type];
            const result = {};
            if (data) {
                for (const id of ids) {
                    let value = data[id];
                    if (value !== undefined) {
                        if (value instanceof Buffer) {
                            result[id] = value;
                        } else if (typeof value === 'object' && value !== null && '$buffer' in value) {
                            result[id] = Buffer.from(value.$buffer, 'base64');
                        } else {
                            // If it's not a Buffer or BufferJSON, it's problematic for signal keys
                            logger.error(`[SupabaseAuthStore] get: Unexpected non-buffer/non-BufferJSON object for key '${id}' in type '${type}'. Value: ${JSON.stringify(value)}. Returning undefined.`);
                            result[id] = undefined; // Indicate key not found in expected format
                        }
                    }
                }
            }
            return result;
        },
        set: (data) => {
            for (const type in data) {
                keys[type] = keys[type] || {};
                Object.assign(keys[type], data[type]);
            }
            // >>> REMOVE THIS LINE <<<
            // signalKeyStore.flushAll(); // REMOVE THIS! THIS IS THE LIKELY CULPRIT!
        },
        del: (type, ids) => {
            const data = keys[type];
            if (data) {
                for (const id of ids) {
                    delete data[id];
                }
            }
            // >>> REMOVE THIS LINE <<<
            // signalKeyStore.flushAll(); // REMOVE THIS!
        },
    };

    const signalKeyStore = makeCacheableSignalKeyStore(customKeyStore, logger);

    const loadAuthDataFromSupabase = async () => {
        logger.debug(`[SupabaseAuthStore] Attempting to load auth data for ${userId} from Supabase Storage: ${AUTH_FILE_NAME}`);
        try {
            const { data, error } = await supabaseClient
                .storage
                .from(bucketName)
                .download(AUTH_FILE_NAME);

            if (error) {
                if (error.statusCode === '404' || (error.originalError && error.originalError.statusCode === 404) || (error.message && error.message.includes('not found'))) {
                    logger.info(`[SupabaseAuthStore] Auth file ${AUTH_FILE_NAME} not found for user ${userId}.`);
                    return false;
                } else {
                    logger.error({ error }, `[SupabaseAuthStore] Error downloading auth file ${AUTH_FILE_NAME}: ${error.message}`);
                    return false;
                }
            }

            if (!data) {
                logger.warn(`[SupabaseAuthStore] No data received when downloading ${AUTH_FILE_NAME} for user ${userId}.`);
                return false;
            }

            const text = await data.text();
            // This is the CRITICAL part: JSON.parse with BufferJSON.reviver
            // should correctly convert any $buffer objects back into native Buffers.
            const loadedData = JSON.parse(text, BufferJSON.reviver);
            
            creds = loadedData.creds;
            keys = loadedData.keys || {};

            logger.info(`[SupabaseAuthStore] Successfully loaded auth data for user ${userId} from Supabase. Registered: ${creds.registered}`);
            return true;
        } catch (e) {
            logger.error({ e }, `[SupabaseAuthStore] Exception during loading auth data for user ${userId}: ${e.message}. Auth data likely corrupt or malformed. Resetting.`);
            // If parsing fails, it means the stored JSON is not valid or doesn't conform to BufferJSON
            creds = initAuthCreds(); // Reset to fresh creds
            keys = {}; // Reset keys
            return false;
        }
    };

    const saveAuthDataToSupabase = async () => {
        logger.debug(`[SupabaseAuthStore] Attempting to save auth data for ${userId} to Supabase Storage: ${AUTH_FILE_NAME}`);
        try {
            const dataToSave = {
                creds: creds,
                keys: keys,
            };
            // This is also CRITICAL: JSON.stringify with BufferJSON.replacer
            // should correctly convert all native Buffers into $buffer objects for JSON storage.
            const buffer = Buffer.from(JSON.stringify(dataToSave, BufferJSON.replacer));

            const { error } = await supabaseClient
                .storage
                .from(bucketName)
                .upload(AUTH_FILE_NAME, buffer, {
                    cacheControl: '3600',
                    upsert: true,
                    contentType: 'application/json',
                });

            if (error) {
                logger.error({ error }, `[SupabaseAuthStore] Error uploading auth file ${AUTH_FILE_NAME} to Supabase: ${error.message}`);
                throw error;
            }
            logger.info(`[SupabaseAuthStore] Successfully saved auth data for user ${userId} to Supabase.`);
        } catch (e) {
            logger.error({ e }, `[SupabaseAuthStore] Exception during saving auth data for user ${userId}: ${e.message}`);
            throw e;
        }
    };

    const clearAllAuthData = async () => {
        logger.info(`[SupabaseAuthStore] Attempting to delete auth file ${AUTH_FILE_NAME} from Supabase Storage for user ${userId}.`);
        try {
            const { error } = await supabaseClient
                .storage
                .from(bucketName)
                .remove([AUTH_FILE_NAME]);

            if (error) {
                if (error.statusCode === '404' || (error.originalError && error.originalError.statusCode === 404) || (error.message && error.message.includes('not found'))) {
                    logger.info(`[SupabaseAuthStore] No auth file found to remove for user ${userId}.`);
                } else {
                    logger.error({ error }, `[SupabaseAuthStore] Error deleting auth file ${AUTH_FILE_NAME} from Supabase: ${error.message}`);
                }
            } else {
                logger.info(`[SupabaseAuthStore] Successfully deleted auth file ${AUTH_FILE_NAME} for user ${userId} from Supabase.`);
            }
            // Reset local state after clearing storage
            creds = initAuthCreds();
            keys = {};
        } catch (e) {
            logger.error({ e }, `[SupabaseAuthStore] Exception during clearing auth data for user ${userId}: ${e.message}`);
        }
    };

    let loadedSuccessfully = false;
    if (expectCredsExist) {
        loadedSuccessfully = await loadAuthDataFromSupabase();
        // If credentials failed to load, clear them to ensure a fresh start.
        if (!loadedSuccessfully) {
            logger.warn(`[SupabaseAuthStore] Expected credentials to exist for ${userId}, but failed to load or were corrupt. Starting fresh.`);
            await clearAllAuthData();
        }
    } else {
        logger.info(`[SupabaseAuthStore] 'expectCredsExist' is false for user ${userId}. Ensuring fresh credentials.`);
        await clearAllAuthData(); // Always clear if explicitly starting fresh
    }

    return {
        state: {
            creds: creds,
            keys: signalKeyStore,
        },
        saveCreds: saveAuthDataToSupabase,
        clearAllAuthData: clearAllAuthData,
        loadedSuccessfully: loadedSuccessfully // Return this flag for the calling code
    };
};
