import { useEffect, useState } from 'react'
import { getAgenteLogado } from './Login'
import { wsOn } from '../wsClient'

interface NotificacaoRadar {
  id: string
  texto: string
  data: string
  hora: string
  prioridade: string
  criadoPor: string
}

function tocarSininho() {
  try {
    if (!window.AudioContext) return
    const contexto = new window.AudioContext()
    const agora = contexto.currentTime
    const oscilador = contexto.createOscillator()
    const ganho = contexto.createGain()
    oscilador.type = 'sine'
    oscilador.frequency.setValueAtTime(880, agora)
    oscilador.frequency.setValueAtTime(1175, agora + 0.12)
    ganho.gain.setValueAtTime(0.0001, agora)
    ganho.gain.exponentialRampToValueAtTime(0.2, agora + 0.02)
    ganho.gain.exponentialRampToValueAtTime(0.0001, agora + 0.3)
    oscilador.connect(ganho).connect(contexto.destination)
    oscilador.start(agora)
    oscilador.stop(agora + 0.32)
    window.setTimeout(() => contexto.close().catch(() => {}), 500)
  } catch { /* áudio pode estar bloqueado até interação */ }
}

function formatarData(data: string) {
  if (!data) return 'Data não informada'
  const [ano, mes, dia] = data.split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data
}

export default function BannerRadarNotificacao() {
  const [fila, setFila] = useState<NotificacaoRadar[]>([])
  const agente = getAgenteLogado() || ''

  useEffect(() => {
    const off = wsOn('radar_notificacao_agente', (mensagem) => {
      const envolvidos = Array.isArray(mensagem.agentesEnvolvidos)
        ? mensagem.agentesEnvolvidos.map(String)
        : []
      if (!agente || !envolvidos.includes(agente) || String(mensagem.criadoPor) === agente) return

      const nova: NotificacaoRadar = {
        id: String(mensagem.id || `${mensagem.data}-${mensagem.hora}-${mensagem.texto}`),
        texto: String(mensagem.texto || 'Nova convocação no Radar DC'),
        data: String(mensagem.data || ''),
        hora: String(mensagem.hora || ''),
        prioridade: String(mensagem.prioridade || 'normal'),
        criadoPor: String(mensagem.criadoPor || 'Equipe Defesa Civil'),
      }
      setFila(prev => prev.some(item => item.id === nova.id) ? prev : [...prev, nova])
      tocarSininho()
    })
    return off
  }, [agente])

  function fecharAtual() {
    setFila(prev => prev.slice(1))
  }

  function abrirRadar() {
    window.dispatchEvent(new CustomEvent('dc:abrir-radar'))
    fecharAtual()
  }

  const atual = fila[0]
  if (!atual) return null

  return (
    <div className="radar-convocacao-overlay" role="alertdialog" aria-label="Nova convocação do Radar DC">
      <div className="radar-convocacao-card">
        <div className="radar-convocacao-header">
          <span className="radar-convocacao-sino">🔔</span>
          <div>
            <strong>Você foi marcado no Radar DC</strong>
            <small>Nova notificação de calendário</small>
          </div>
          <button type="button" className="radar-convocacao-fechar" onClick={fecharAtual} aria-label="Fechar notificação">×</button>
        </div>
        <div className="radar-convocacao-body">
          <div className="radar-convocacao-info">
            <span>📅 {formatarData(atual.data)}</span>
            <span>⏰ {atual.hora || 'Horário não informado'}</span>
          </div>
          <p>{atual.texto}</p>
          <small>Enviado por {atual.criadoPor} · prioridade {atual.prioridade}</small>
        </div>
        <div className="radar-convocacao-actions">
          <button type="button" onClick={fecharAtual}>Fechar</button>
          <button type="button" className="radar-convocacao-abrir" onClick={abrirRadar}>Abrir Radar DC</button>
        </div>
        {fila.length > 1 && <div className="radar-convocacao-fila">+ {fila.length - 1} notificação(ões) aguardando</div>}
      </div>
    </div>
  )
}