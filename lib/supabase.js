// import { createClient } from '@supabase/supabase-js';
// import dotenv from 'dotenv';

// dotenv.config(); // Load .env for Node.js scripts

// // Client-side configuration (for browser/Next.js frontend)
// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// // Server-side configuration (for Node.js backend like whatsapp-client.js)
// const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// // Validate client-side variables
// if (!supabaseUrl || !supabaseAnonKey) {
//     throw new Error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
// }

// // Validate server-side variables
// if (!supabaseServiceRoleKey) {
//     throw new Error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in environment variables');
// }

// // Client-side Supabase client (for frontend)
// export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
//     auth: {
//         autoRefreshToken: true,
//         persistSession: true
//     }
// });

// // Server-side Supabase client (for backend)
// export const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey, {
//     auth: {
//         autoRefreshToken: false,
//         persistSession: false
//     }
// });

// console.log('DEBUG: Supabase clients initialized:', {
//     clientSide: { url: supabaseUrl, keyType: 'anon' },
//     serverSide: { url: supabaseUrl, keyType: 'service_role' }
// });


import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const config = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
};

// Validate configuration
function validateConfig() {
  const errors = [];
  if (!config.url) errors.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!config.anonKey) errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!config.serviceRoleKey) errors.push('SUPABASE_SERVICE_ROLE_KEY');
  
  if (errors.length > 0) {
    throw new Error(`Missing required environment variables: ${errors.join(', ')}`);
  }
}

// Initialize clients
function initializeClients() {
  validateConfig();

  const commonOptions = {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  };

  const clientOptions = {
    ...commonOptions,
    auth: {
      ...commonOptions.auth,
      persistSession: true,
      autoRefreshToken: true
    }
  };

  return {
    client: createClient(config.url, config.anonKey, clientOptions),
    server: createClient(config.url, config.serviceRoleKey, commonOptions)
  };
}

// Verify Supabase connection
async function verifySupabaseConnection() {
  try {
    const { data, error } = await supabaseServer
        .from('memory_entries')  // Try querying a common table
        .select('*')
        .limit(1)
        .single();

    if (error) throw error;
    
    console.log('✅ Verified Supabase connection:', {
      version: data?.setting || 'unknown',
      url: config.url
    });
    
    return true;
  } catch (error) {
    console.error('❌ Supabase connection verification failed:', error.message);
    throw new Error('Failed to verify Supabase connection');
  }
}

// Main initialization
const { client: supabase, server: supabaseServer } = initializeClients();

export { 
  supabase, 
  supabaseServer, 
  verifySupabaseConnection 
};