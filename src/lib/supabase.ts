/**
 * InfoTicket - Cliente Supabase v1.0.4
 * Inicializa a conexão com o Supabase utilizando as variáveis de ambiente.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '❌ [InfoTicket] Variáveis de ambiente VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não encontradas no arquivo .env.'
  );
}

/**
 * Instância exportada do cliente Supabase para consultas diretas no Frontend
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
