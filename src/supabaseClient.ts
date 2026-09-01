type DisabledSupabaseClient = {
  from: (...args: unknown[]) => any
  channel: (...args: unknown[]) => any
  removeChannel: (...args: unknown[]) => any
  functions: { invoke: (...args: unknown[]) => any }
}

const supabaseDisabled = (): never => {
  throw new Error('Supabase está desativado nesta cópia do aplicativo.')
}

// Este projeto é a cópia independente hospedada no Replit. Mantemos apenas
// esta interface inerte para os caminhos legados, sem cliente ou conexão real.
export const supabaseDisponivel = false

export const supabase: DisabledSupabaseClient = {
  from: supabaseDisabled,
  channel: supabaseDisabled,
  removeChannel: supabaseDisabled,
  functions: { invoke: supabaseDisabled },
}
