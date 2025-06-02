
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
        .maybeSingle(); // <--- Change this from .single() to .maybeSingle()

    if (error) {
        // If there's a database error (e.g., table not found, permissions)
        console.error('❌ Supabase query error during verification:', error.message);
        throw error; // Re-throw to be caught by the outer catch
    }

    // If data is null, it means no rows were returned, which is fine for verification
    // if you just want to ensure connectivity and the table exists.
    console.log('✅ Verified Supabase connection. Data received:', data ? 'A row was found.' : 'No rows in memory_entries table.');

    // You might want to remove the 'data?.setting' part unless you actually
    // have a 'setting' column in 'memory_entries' that holds a version.
    // For simple verification, just checking if 'data' is not undefined or error is null is enough.
    console.log('✅ Verified Supabase connection:', {
      url: config.url // Assuming config.url is defined elsewhere
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