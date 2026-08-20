import { useEffect, useState } from 'react'
import { getAgenteLogado } from './Login'
import { wsOn } from '../wsClient'
import { supabase, supabaseDisponivel } from '../supabaseClient'

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
    let ativo = true
    const idsConhecidos = new Set<string>()
    let primeiraBusca = true

    const buscarPendentes = async () => {
      try {
        let rows: Array<Record<string, unknown>> = []
        if (supabaseDisponivel) {
          const result = await supabase
            .from('radar_bilhetes')
            .select('id,texto,data,hora,prioridade,criado_por,agentes_envolvidos')
            .eq('tipo', 'notificacao')
            .eq('concluido', false)
            .order('criado_em', { ascending: false })
          if (result.error) throw result.error
          rows = (result.data || []) as Array<Record<string, unknown>>
        } else {
          const response = await fetch('/api/radar-bilhetes')
          if (!response.ok) return
          rows = await response.json() as Array<Record<string, unknown>>
        }

        const novas = rows
          .filter(row => {
            const envolvidos = Array.isArray(row.agentes_envolvidos)
              ? row.agentes_envolvidos.map(String)
              : Array.isArray(row.agentesEnvolvidos) ? row.agentesEnvolvidos.map(String) : []
            return row.tipo === 'notificacao' &&
              !Boolean(row.concluido) &&
              Boolean(agente) &&
              envolvidos.includes(agente)
          })
          .map(row => ({
            id: String(row.id),
            texto: String(row.texto || 'Nova convocação no Radar DC'),
            data: String(row.data || ''),
            hora: String(row.hora || ''),
            prioridade: String(row.prioridade || 'normal'),
            criadoPor: String(row.criado_por || row.criadoPor || 'Equipe Defesa Civil'),
          }))

        if (!ativo) return
        // A primeira leitura hidrata o estado sem repetir notificações antigas.
        if (primeiraBusca) { primeiraBusca = false; return }
        const recemChegadas = novas.filter(nova => !idsConhecidos.has(nova.id))
        novas.forEach(nova => idsConhecidos.add(nova.id))
        if (recemChegadas.length) {
          setFila(prev => [...prev, ...recemChegadas.filter(nova => !prev.some(item => item.id === nova.id))])
          tocarSininho()
        }
      } catch { /* realtime/servidor pode estar temporariamente indisponível */ }
    }

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
      idsConhecidos.add(nova.id)
      setFila(prev => prev.some(item => item.id === nova.id) ? prev : [...prev, nova])
      tocarSininho()
    })
    buscarPendentes()
    const timer = window.setInterval(buscarPendentes, 10000)
    return () => { ativo = false; off(); window.clearInterval(timer) }
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