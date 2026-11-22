import { useEffect, useState } from 'react'
import { iniciarSessaoPae, obterAcessoPaeAtual, sairPae } from '../../paeApi'
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
  const [carregandoSessao, setCarregandoSessao] = useState(true)
  const [erro, setErro] = useState('')
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (!aberto) return
    let ativo = true
    setErro('')
    setCarregandoSessao(true)
    if (!supabaseDisponivel) {
      setErro('O Supabase ainda não está configurado neste ambiente.')
      setCarregandoSessao(false)
      return
    }
    void (async () => {
      try {
        const atual = await obterAcessoPaeAtual()
        if (!ativo) return
        if (atual?.agente === normalizarNomeAgente(agente)) {
          onAutorizado(atual)
          return
        }
        if (atual) await sairPae()
        const usuario = await iniciarSessaoPae(agente)
        if (ativo) onAutorizado(usuario)
      } catch (error) {
        if (ativo) setErro(error instanceof Error ? error.message : 'Não foi possível abrir o PAE.')
      } finally {
        if (ativo) setCarregandoSessao(false)
      }
    })()
    return () => { ativo = false }
  }, [aberto, agente, onAutorizado, tentativa])

  if (!aberto) return null

  return (
    <div className="pae-access-backdrop" role="presentation">
      <section className="pae-access-card" role="dialog" aria-modal="true" aria-labelledby="pae-access-title" data-testid="dialog-pae-access">
        <div className="pae-access-mark" aria-hidden="true">PAE</div>
        <div className="pae-detail-kicker">ACESSO INTERNO · DEFESA CIVIL</div>
        <h2 id="pae-access-title">Abrindo o PAE</h2>
        <p>O acesso usa a sessão do aplicativo. Não é necessário informar outra senha.</p>
        <div className="pae-access-agent" data-testid="label-pae-agent">
          <span>Agente</span>
          <strong>{normalizarNomeAgente(agente)}</strong>
        </div>
        {carregandoSessao && <div className="pae-access-status" role="status">Preparando o acesso…</div>}
        {erro && <div className="pae-access-error" role="alert" data-testid="error-pae-access">{erro}</div>}
        {!carregandoSessao && (
          <div className="pae-access-actions">
            <button className="pae-secondary-button" type="button" onClick={onFechar}>Voltar</button>
            {erro && (
              <button className="pae-primary-button" type="button" onClick={() => setTentativa(valor => valor + 1)}>
                Tentar novamente
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
