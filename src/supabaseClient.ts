import { createClient } from '@supabase/supabase-js'

type DisabledSupabaseClient = {
  from: (...args: unknown[]) => any
  channel: (...args: unknown[]) => any
  removeChannel: (...args: unknown[]) => any
  rpc: (...args: unknown[]) => any
  auth: {
    getSession: (...args: unknown[]) => any
    setSession: (...args: unknown[]) => any
    signInWithPassword: (...args: unknown[]) => any
    signOut: (...args: unknown[]) => any
    onAuthStateChange: (...args: unknown[]) => any
  }
  functions: { invoke: (...args: unknown[]) => any }
}

const supabaseDisabled = (): never => {
  throw new Error('Supabase está desativado nesta cópia do aplicativo.')
}

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
const usarSupabase = String(import.meta.env.VITE_USE_SUPABASE || '').toLowerCase() === 'true'

const SUPABASE_REQUEST_TIMEOUT_MS = 15_000

const supabaseFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController()
  const requestSignal = init?.signal ??
    (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined)
  const abortFromRequest = () => controller.abort(requestSignal?.reason)

  if (requestSignal?.aborted) {
    abortFromRequest()
  } else {
    requestSignal?.addEventListener('abort', abortFromRequest, { once: true })
  }

  const timeout = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS)
  try {
    return await globalThis.fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    requestSignal?.removeEventListener('abort', abortFromRequest)
  }
}

// O build do Netlify injeta essas variáveis VITE_* no frontend. No Replit,
// quando elas não existem, o app continua usando o servidor Express local.
export const supabaseDisponivel = usarSupabase && Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = supabaseDisponivel
  ? createClient(supabaseUrl, supabaseAnonKey, {
      db: { schema: 'public' },
      auth: { persistSession: true, autoRefreshToken: true },
      global: { fetch: supabaseFetch },
    })
  : ({
      from: supabaseDisabled,
      channel: supabaseDisabled,
      removeChannel: supabaseDisabled,
      rpc: supabaseDisabled,
      auth: {
        getSession: supabaseDisabled,
        setSession: supabaseDisabled,
        signInWithPassword: supabaseDisabled,
        signOut: supabaseDisabled,
        onAuthStateChange: supabaseDisabled,
      },
      functions: { invoke: supabaseDisabled },
    } as DisabledSupabaseClient)
