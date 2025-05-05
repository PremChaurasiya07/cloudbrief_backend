import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config(); // Load .env for Node.js scripts

// Client-side configuration (for browser/Next.js frontend)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Server-side configuration (for Node.js backend like whatsapp-client.js)
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate client-side variables
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
}

// Validate server-side variables
if (!supabaseServiceRoleKey) {
    throw new Error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in environment variables');
}

// Client-side Supabase client (for frontend)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true
    }
});

// Server-side Supabase client (for backend)
export const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

console.log('DEBUG: Supabase clients initialized:', {
    clientSide: { url: supabaseUrl, keyType: 'anon' },
    serverSide: { url: supabaseUrl, keyType: 'service_role' }
});