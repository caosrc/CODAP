import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { autenticarPae, obterAcessoPaeAtual, sairPae } from '../../paeApi'
import type { PaeUsuarioAutorizado } from '../../paeTypes'
import { supabaseDisponivel } from '../../supabaseClient'
import { normalizarNomeAgente } from '../../types'
import './pae.css'

interface Props {
  aberto: boolean
  agente: string
  onAutorizado: (usuario: PaeUsuarioAutorizado) => void
  onFechar: () => void
}

export default function PAEAccessDialog({ aberto, agente, onAutorizado, onFechar }: Props) {
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
        if (!ativo || !usuario) return
        if (usuario.agente === normalizarNomeAgente(agente)) {
          onAutorizado(usuario)
        } else {
          void sairPae().catch(() => {})
        }
      })
      .catch(error => {
        if (ativo) setErro(error instanceof Error ? error.message : 'Não foi possível validar o acesso.')
      })
      .finally(() => {
        if (ativo) setCarregandoSessao(false)
      })
    return () => { ativo = false }
  }, [aberto, agente, onAutorizado])

  if (!aberto) return null

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    setEntrando(true)
    try {
      const usuario = await autenticarPae(agente, senha)
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
        <p>Confirme seu acesso com a senha do agente selecionado no aplicativo.</p>
        {carregandoSessao ? (
          <div className="pae-access-status" role="status">Verificando sessão…</div>
        ) : (
          <form className="pae-access-form" onSubmit={entrar}>
            <div className="pae-access-agent" data-testid="label-pae-agent">
              <span>Agente selecionado</span>
              <strong>{normalizarNomeAgente(agente)}</strong>
            </div>
            <label>
              Senha do agente
              <input
                autoComplete="off"
                type="password"
                inputMode="numeric"
                required
                value={senha}
                maxLength={20}
                onChange={event => setSenha(event.target.value)}
                disabled={!supabaseDisponivel || entrando}
                data-testid="input-pae-password"
              />
            </label>
            {erro && <div className="pae-access-error" role="alert" data-testid="error-pae-access">{erro}</div>}
            <div className="pae-access-actions">
              <button className="pae-secondary-button" type="button" onClick={onFechar} disabled={entrando}>Voltar</button>
              <button className="pae-primary-button" type="submit" disabled={!supabaseDisponivel || entrando}>
                {entrando ? 'Validando…' : 'Entrar'}
              </button>
            </div>
          </form>
        )}
        {!carregandoSessao && !erro && <div className="pae-access-hint">A senha é validada pelo Supabase e não é salva neste dispositivo.</div>}
        {!supabaseDisponivel && !carregandoSessao && (
          <div className="pae-access-error" role="alert">Configure o Supabase para validar o acesso do PAE.</div>
        )}
      </section>
    </div>
  )
}
