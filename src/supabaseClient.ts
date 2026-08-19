import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''
// Quando as credenciais estão configuradas, o Supabase é a fonte compartilhada
// por padrão. VITE_USE_SUPABASE=false continua sendo um opt-out explícito para
// ambientes locais que precisem trabalhar apenas com o Express.
const USE_SUPABASE = (import.meta.env.VITE_USE_SUPABASE as string | undefined) ?? 'true'

export const supabaseDisponivel = !!(SUPABASE_URL && SUPABASE_ANON_KEY) && USE_SUPABASE !== 'false'

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder',
  {
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  }
)
