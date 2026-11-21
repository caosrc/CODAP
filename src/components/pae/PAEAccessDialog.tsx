import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { autenticarPae, obterAcessoPaeAtual } from '../../paeApi'
import type { PaeUsuarioAutorizado } from '../../paeTypes'
import { supabaseDisponivel } from '../../supabaseClient'
import './pae.css'

interface Props {
  aberto: boolean
  onAutorizado: (usuario: PaeUsuarioAutorizado) => void
  onFechar: () => void
}

export default function PAEAccessDialog({ aberto, onAutorizado, onFechar }: Props) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregandoSessao, setCarregandoSessao] = useState(true)
  const [entrando, setEntrando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!aberto) return
    let ativo = true
    setErro('')
    setCarregandoSessao(true)
    if (!supabaseDisponivel) {
      setErro('A autenticação do PAE ainda não está configurada neste ambiente.')
      setCarregandoSessao(false)
      return
    }
    void obterAcessoPaeAtual()
      .then(usuario => {
        if (ativo && usuario) onAutorizado(usuario)
      })
      .catch(error => {
        if (ativo) setErro(error instanceof Error ? error.message : 'Não foi possível validar o acesso.')
      })
      .finally(() => {
        if (ativo) setCarregandoSessao(false)
      })
    return () => { ativo = false }
  }, [aberto, onAutorizado])

  if (!aberto) return null

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    setEntrando(true)
    try {
      const usuario = await autenticarPae(email, senha)
      setSenha('')
      onAutorizado(usuario)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível entrar no PAE.')
    } finally {
      setEntrando(false)
    }
  }

  return (
    <div className="pae-access-backdrop" role="presentation">
      <section className="pae-access-card" role="dialog" aria-modal="true" aria-labelledby="pae-access-title" data-testid="dialog-pae-access">
        <div className="pae-access-mark" aria-hidden="true">PAE</div>
        <div className="pae-detail-kicker">ACESSO INTERNO · DEFESA CIVIL</div>
        <h2 id="pae-access-title">Entrar no PAE</h2>
        <p>Use sua conta institucional do Supabase Auth. O acesso é liberado somente para usuários cadastrados pela coordenação.</p>
        {carregandoSessao ? (
          <div className="pae-access-status" role="status">Verificando sessão…</div>
        ) : (
          <form className="pae-access-form" onSubmit={entrar}>
            <label>
              E-mail institucional
              <input
                autoComplete="username"
                type="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                disabled={!supabaseDisponivel || entrando}
                data-testid="input-pae-email"
              />
            </label>
            <label>
              Senha
              <input
                autoComplete="current-password"
                type="password"
                required
                value={senha}
                onChange={event => setSenha(event.target.value)}
                disabled={!supabaseDisponivel || entrando}
                data-testid="input-pae-password"
              />
            </label>
            {erro && <div className="pae-access-error" role="alert" data-testid="error-pae-access">{erro}</div>}
            <div className="pae-access-actions">
              <button className="pae-secondary-button" type="button" onClick={onFechar} disabled={entrando}>Voltar</button>
              <button className="pae-primary-button" type="submit" disabled={!supabaseDisponivel || entrando}>
                {entrando ? 'Validando…' : 'Entrar com segurança'}
              </button>
            </div>
          </form>
        )}
        {!carregandoSessao && !erro && <div className="pae-access-hint">Se ainda não tem uma conta autorizada, solicite o convite à coordenação.</div>}
        {!supabaseDisponivel && !carregandoSessao && (
          <div className="pae-access-error" role="alert">O PAE permanece bloqueado até que o Supabase Auth esteja configurado.</div>
        )}
      </section>
    </div>
  )
}
