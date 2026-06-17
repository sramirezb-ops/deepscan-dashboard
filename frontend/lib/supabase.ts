import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anon) {
  throw new Error(
    'Faltan variables de entorno de Supabase. Verificá .env.local (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY)'
  );
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: false },
});
