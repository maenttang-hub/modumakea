import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseStatus } from '@/lib/supabase';

let supabaseAdminInstance: SupabaseClient | null = null;

export function getSupabaseAdminClient() {
  if (supabaseAdminInstance) {
    return supabaseAdminInstance;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    return null;
  }

  if (!resolveSupabaseStatus(url, serviceRoleKey).enabled) {
    return null;
  }

  supabaseAdminInstance = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAdminInstance;
}
