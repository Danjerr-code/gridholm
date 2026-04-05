import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase env vars missing');
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function getGuestId() {
  let id = localStorage.getItem('gridholm_guest_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('gridholm_guest_id', id);
  }
  return id;
}
