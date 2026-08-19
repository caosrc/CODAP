import { useCallback, useEffect, useMemo, useState } from 'react'
import './RadarDC.css'
import './RadarDCResponsive.css'
import { getAgenteLogado } from './Login'
import { wsOn } from '../wsClient'

type Prioridade = 'normal' | 'importante' | 'urgente'
type Bilhete = {
  id: string
  texto: string
  data: string
  hora: string
  prioridade: Prioridade
  concluido: boolean
  criadoPor: string
  criadoEm: string
}

const STORAGE_KEY = 'defesacivil-radar-dc-v1'
const prioridadeConfig: Record<Prioridade, { label: string; cor: string; emoji: string }> = {
  normal: { label: 'Normal', cor: '#36b37e', emoji: '🟢' },
  importante: { label: 'Importante', cor: '#f59e0b', emoji: '🟠' },
  urgente: { label: 'Urgente', cor: '#f04438', emoji: '🔴' },
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

function dataBonita(data: string) {
  if (!data) return 'Sem data'
  return new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '')
}

export default function RadarDC() {
  const agente = getAgenteLogado() || 'Agente DC'
  const [bilhetes, setBilhetes] = useState<Bilhete[]>([])
  const [dataSelecionada, setDataSelecionada] = useState(hoje())
  const [mes, setMes] = useState(() => new Date(`${hoje()}T12:00:00`))
  const [texto, setTexto] = useState('')
  const [hora, setHora] = useState('08:00')
  const [prioridade, setPrioridade] = useState<Prioridade>('normal')
  const [editorAberto, setEditorAberto] = useState(false)
  const [tv, setTv] = useState(false)
  const [notificacaoAtiva, setNotificacaoAtiva] = useState(false)

  const carregarBilhetes = useCallback(async () => {
    try {
      const res = await fetch('/api/radar-bilhetes')
      if (!res.ok) throw new Error('Falha ao carregar')
      const rows = await res.json() as Array<Record<string, unknown>>
      setBilhetes(rows.map(row => ({
        id: String(row.id), texto: String(row.texto), data: String(row.data), hora: String(row.hora),
        prioridade: (row.prioridade as Prioridade) || 'normal', concluido: Boolean(row.concluido),
        criadoPor: String(row.criado_por), criadoEm: String(row.criado_em),
      })))
    } catch {
      try { setBilhetes(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')) } catch { setBilhetes([]) }
    }
  }, [])

  useEffect(() => {
    carregarBilhetes()
    return wsOn('radar_bilhetes_atualizados', carregarBilhetes)
  }, [carregarBilhetes])

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(bilhetes)) }, [bilhetes])

  const dias = useMemo(() => {
    const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1)
    const inicio = new Date(primeiro)
    inicio.setDate(1 - primeiro.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const dia = new Date(inicio)
      dia.setDate(inicio.getDate() + i)
      return dia
    })
  }, [mes])

  const doDia = bilhetes.filter(b => b.data === dataSelecionada)
  const proximos = bilhetes.filter(b => !b.concluido).sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`))

  const criar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!texto.trim()) return
    const novo = {
      id: crypto.randomUUID(), texto: texto.trim(), data: dataSelecionada, hora,
      prioridade, concluido: false, criadoPor: agente, criadoEm: new Date().toISOString(),
    }
    const res = await fetch('/api/radar-bilhetes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...novo, criado_por: agente }) })
    if (!res.ok) return
    setBilhetes(prev => [...prev, novo])
    setTexto('')
    setHora('08:00')
    setEditorAberto(false)
  }

  const alternar = async (id: string) => {
    const bilhete = bilhetes.find(b => b.id === id)
    if (!bilhete || bilhete.criadoPor !== agente) return
    const res = await fetch(`/api/radar-bilhetes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agente, concluido: !bilhete.concluido }) })
    if (res.ok) setBilhetes(prev => prev.map(b => b.id === id ? { ...b, concluido: !b.concluido } : b))
  }
  const remover = async (id: string) => {
    const res = await fetch(`/api/radar-bilhetes/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agente }) })
    if (res.ok) setBilhetes(prev => prev.filter(b => b.id !== id))
  }

  const pedirNotificacao = useCallback(async () => {
    if (!('Notification' in window)) return
    const permissao = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    setNotificacaoAtiva(permissao === 'granted')
  }, [])

  useEffect(() => {
    if ('Notification' in window) setNotificacaoAtiva(Notification.permission === 'granted')
    const timer = window.setInterval(() => {
      const agora = new Date()
      const chave = `${agora.toISOString().slice(0, 10)}|${agora.toTimeString().slice(0, 5)}`
      bilhetes.filter(b => !b.concluido && `${b.data}|${b.hora}` === chave).forEach(b => {
        if ('Notification' in window && Notification.permission === 'granted') new Notification('Radar DC', { body: b.texto, tag: b.id })
      })
    }, 30000)
    return () => window.clearInterval(timer)
  }, [bilhetes])

  const entrarTV = async () => {
    await pedirNotificacao()
    try { await document.documentElement.requestFullscreen?.() } catch { /* fullscreen pode ser bloqueado pelo navegador */ }
    try { await screen.orientation?.lock?.('landscape') } catch { /* alguns navegadores não permitem orientação em desktop */ }
    setTv(true)
  }

  const sairTV = () => {
    document.exitFullscreen?.()
    try { screen.orientation?.unlock?.() } catch { /* orientação volta ao padrão do dispositivo */ }
    setTv(false)
  }

  return (
    <section className={`radar-page ${tv ? 'radar-tv' : ''}`}>
      <header className="radar-header">
        <div>
          <div className="radar-kicker">CENTRAL DE LEMBRETES OPERACIONAIS</div>
          <h1><span className="radar-shield">🛡️</span> Radar <b>DC</b></h1>
          <p>O que precisa entrar no radar da equipe hoje?</p>
        </div>
        <div className="radar-actions">
          {!notificacaoAtiva && <button className="radar-notify" onClick={pedirNotificacao}>🔔 Ativar notificações</button>}
          <button className="radar-tv-btn" onClick={tv ? sairTV : entrarTV}>{tv ? '↙ Voltar ao app' : '▣ Modo TV'}</button>
        </div>
      </header>

      <div className="radar-layout">
        <div className="radar-note-card radar-bilhete-large">
          <div className="card-label"><span className="label-dot" /> BILHETE</div>
          <h2>Bilhete</h2>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escreva uma mensagem ou pendência para todos os agentes..." rows={11} />
          <small>Escreva aqui. Depois clique em um dia no calendário para escolher data, hora e nível do alerta.</small>
        </div>

        <div className="radar-calendar-card">
          <div className="calendar-top"><div><span>CALENDÁRIO DE ALERTAS</span><h2>{mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2></div><div className="month-buttons"><button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>‹</button><button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>›</button></div></div>
          <div className="weekdays">{['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map(d => <span key={d}>{d}</span>)}</div>
          <div className="calendar-grid">{dias.map(d => { const key = d.toISOString().slice(0, 10); const count = bilhetes.filter(b => b.data === key && !b.concluido).length; return <button key={key} className={`${d.getMonth() !== mes.getMonth() ? 'other-month ' : ''}${key === dataSelecionada ? 'selected ' : ''}${key === hoje() ? 'today' : ''}`} onClick={() => setDataSelecionada(key)}><span>{d.getDate()}</span>{count > 0 && <i>{count}</i>}</button> })}</div>
          <div className="calendar-legend"><span><i className="legend-green" /> lembrete</span><span><i className="legend-red" /> urgente</span></div>
        </div>
      </div>

      <section className="radar-list-section">
        <div className="radar-list-heading"><div><span className="radar-kicker">VISÃO DA EQUIPE</span><h2>Radar DC: <em>{dataBonita(dataSelecionada)}</em></h2></div><strong>{proximos.length} pendência{proximos.length === 1 ? '' : 's'}</strong></div>
        {doDia.length === 0 ? <div className="radar-empty"><span>🛰️</span><b>Nenhum alerta para este dia</b><small>Adicione um bilhete para manter a equipe alinhada.</small></div> : <div className="radar-tickets">{doDia.map(b => { const c = prioridadeConfig[b.prioridade]; return <article className={`radar-ticket ${b.concluido ? 'done' : ''}`} key={b.id}><div className="ticket-time">{b.hora}<span>{b.concluido ? 'CONCLUÍDO' : 'ALERTA'}</span></div><div className="ticket-line" style={{ background: c.cor }} /><div className="ticket-copy"><div><span className="ticket-priority" style={{ color: c.cor }}>{c.emoji} {c.label}</span><span className="ticket-author">por {b.criadoPor}</span></div><p>{b.texto}</p></div><button className="ticket-check" onClick={() => alternar(b.id)}>{b.concluido ? '↩' : '✓'}</button><button className="ticket-remove" onClick={() => remover(b.id)}>×</button></article> })}</div>}
      </section>
      <div className="radar-ticker"><span>RADAR DC</span><div>{(proximos.length ? proximos : bilhetes).map(b => <b key={b.id}>● {dataBonita(b.data)} · {b.texto}</b>)}</div></div>
    </section>
  )
}