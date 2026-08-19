import { useCallback, useEffect, useMemo, useState } from 'react'
import './RadarDC.css'
import './RadarDCResponsive.css'
import { getAgenteLogado } from './Login'
import { wsOn } from '../wsClient'
import { supabase, supabaseDisponivel } from '../supabaseClient'

type Prioridade = 'normal' | 'importante' | 'urgente'
type RegistroRadar = {
  id: string; texto: string; data: string; hora: string; prioridade: Prioridade
  concluido: boolean; criadoPor: string; criadoEm: string; tipo: 'lembrete' | 'notificacao'
}
type Atividade = {
  id: number; agente: string; hora: string; placa?: string; natureza?: string
  endereco?: string; created_at: string
}

const STORAGE_KEY = 'defesacivil-radar-dc-v2'
const prioridadeConfig: Record<Prioridade, { label: string; emoji: string }> = {
  normal: { label: 'Normal', emoji: '🟢' },
  importante: { label: 'Importante', emoji: '🟠' },
  urgente: { label: 'Urgente', emoji: '🔴' },
}

function hoje() { return new Date().toLocaleDateString('en-CA') }
function horaAgora() { return new Date().toTimeString().slice(0, 5) }
function dataBonita(data: string) {
  return data ? new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '') : 'Sem data'
}
function disparar(nome: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(nome, { detail }))
}

export default function RadarDC() {
  const agente = getAgenteLogado() || 'Agente DC'
  const [registros, setRegistros] = useState<RegistroRadar[]>([])
  const [dataSelecionada, setDataSelecionada] = useState(hoje())
  const [mes, setMes] = useState(() => new Date(`${hoje()}T12:00:00`))
  const [textoLembrete, setTextoLembrete] = useState('')
  const [textoNotificacao, setTextoNotificacao] = useState('')
  const [hora, setHora] = useState(horaAgora())
  const [prioridade, setPrioridade] = useState<Prioridade>('normal')
  const [editorAberto, setEditorAberto] = useState(false)
  const [tv, setTv] = useState(false)
  const [notificacaoAtiva, setNotificacaoAtiva] = useState(false)
  const [atividades, setAtividades] = useState<{ checklists: Atividade[]; ocorrencias: Atividade[] }>({ checklists: [], ocorrencias: [] })

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/radar-bilhetes')
      if (!res.ok) throw new Error()
      const rows = await res.json() as Array<Record<string, unknown>>
      setRegistros(rows.map(row => ({
        id: String(row.id), texto: String(row.texto), data: String(row.data), hora: String(row.hora),
        prioridade: (row.prioridade as Prioridade) || 'normal', concluido: Boolean(row.concluido),
        criadoPor: String(row.criado_por), criadoEm: String(row.criado_em),
        tipo: row.tipo === 'notificacao' ? 'notificacao' : 'lembrete',
      })))
    } catch {
      try { setRegistros(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')) } catch { setRegistros([]) }
    }
  }, [])

  const carregarAtividades = useCallback(async () => {
    try {
      if (supabaseDisponivel) {
        const proximoDia = new Date(`${dataSelecionada}T12:00:00`)
        proximoDia.setDate(proximoDia.getDate() + 1)
        const proximo = proximoDia.toLocaleDateString('en-CA')
        const [checklistsResult, ocorrenciasResult] = await Promise.all([
          supabase.from('checklists_viatura').select('id,data_checklist,placa,motorista,created_at').gte('data_checklist', dataSelecionada).lt('data_checklist', proximo).order('created_at', { ascending: false }),
          supabase.from('ocorrencias').select('id,natureza,endereco,agentes,responsavel_registro,created_at,hora_inicio,data_ocorrencia').or(`data_ocorrencia.eq.${dataSelecionada},created_at.gte.${dataSelecionada}T00:00:00`).order('created_at', { ascending: false }),
        ])
        if (!checklistsResult.error && !ocorrenciasResult.error) {
          setAtividades({
            checklists: (checklistsResult.data || []).map(row => ({ ...row, agente: row.motorista || 'Agente não informado', hora: row.data_checklist?.includes('T') ? row.data_checklist.slice(11, 16) : new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) })) as Atividade[],
            ocorrencias: (ocorrenciasResult.data || []).map(row => ({ ...row, agente: row.responsavel_registro || (Array.isArray(row.agentes) ? row.agentes[0] : null) || 'Agente não informado', hora: row.hora_inicio || new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) })) as Atividade[],
          })
          return
        }
      }
      const res = await fetch(`/api/atividades-dia?data=${dataSelecionada}`)
      if (res.ok) setAtividades(await res.json())
    } catch { setAtividades({ checklists: [], ocorrencias: [] }) }
  }, [dataSelecionada])

  useEffect(() => { carregar(); return wsOn('radar_bilhetes_atualizados', carregar) }, [carregar])
  useEffect(() => {
    carregarAtividades()
    const offChecklist = wsOn('checklist_atualizado', carregarAtividades)
    const offOcorrencias = wsOn('ocorrencias_atualizadas', carregarAtividades)
    return () => { offChecklist(); offOcorrencias() }
  }, [carregarAtividades])
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(registros)) }, [registros])

  const dias = useMemo(() => {
    const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1)
    const inicio = new Date(primeiro); inicio.setDate(1 - primeiro.getDay())
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d })
  }, [mes])
  const lembretes = registros.filter(r => r.tipo === 'lembrete')
  const notificacoes = registros.filter(r => r.tipo === 'notificacao')
  const proximasNotificacoes = notificacoes.filter(r => !r.concluido).sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`))

  async function salvarRegistro(tipo: RegistroRadar['tipo'], texto: string, data: string, horaRegistro: string) {
    if (!texto.trim()) return
    const novo: RegistroRadar = {
      id: crypto.randomUUID(), texto: texto.trim(), data, hora: horaRegistro,
      prioridade, concluido: false, criadoPor: agente, criadoEm: new Date().toISOString(), tipo,
    }
    const res = await fetch('/api/radar-bilhetes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...novo, criado_por: agente, tipo }),
    })
    if (!res.ok) return
    setRegistros(prev => [...prev, novo])
    if (tipo === 'lembrete') setTextoLembrete('')
    else { setTextoNotificacao(''); setHora(horaAgora()); setEditorAberto(false) }
  }

  async function remover(id: string) {
    const res = await fetch(`/api/radar-bilhetes/${id}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agente }),
    })
    if (res.ok) setRegistros(prev => prev.filter(r => r.id !== id))
  }

  const pedirNotificacao = useCallback(async () => {
    if (!('Notification' in window)) return
    const permissao = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    setNotificacaoAtiva(permissao === 'granted')
  }, [])

  useEffect(() => {
    if ('Notification' in window) setNotificacaoAtiva(Notification.permission === 'granted')
    const timer = window.setInterval(() => {
      const chave = `${hoje()}|${new Date().toTimeString().slice(0, 5)}`
      proximasNotificacoes.filter(n => `${n.data}|${n.hora}` === chave).forEach(n => {
        if ('Notification' in window && Notification.permission === 'granted') new Notification('Radar DC', { body: n.texto, tag: n.id })
      })
    }, 30000)
    return () => window.clearInterval(timer)
  }, [proximasNotificacoes])

  useEffect(() => {
    document.body.classList.toggle('radar-tv-active', tv)
    return () => document.body.classList.remove('radar-tv-active')
  }, [tv])

  return (
    <section className={`radar-page ${tv ? 'radar-tv' : ''}`}>
      <header className="radar-header">
        <div><div className="radar-kicker">CENTRAL DE LEMBRETES OPERACIONAIS</div><h1><img className="radar-header-icon" src="/api/radar-icon" alt="" /> Radar <b>DC</b></h1><p>Informações compartilhadas por toda a equipe.</p></div>
        <div className="radar-actions">
          {!notificacaoAtiva && <button className="radar-notify" onClick={pedirNotificacao}>🔔 Ativar notificações</button>}
          <button className="radar-tv-btn" onClick={() => setTv(!tv)}>{tv ? '↙ Voltar ao app' : '▣ Modo TV'}</button>
        </div>
      </header>

      <div className="radar-layout">
        <div className="radar-note-card radar-bilhete-large">
          <div className="card-label"><span className="label-dot" /> LEMBRETE</div>
          <h2>Novo lembrete</h2>
          <textarea value={textoLembrete} onChange={e => setTextoLembrete(e.target.value)} placeholder="Deixe um lembrete para a equipe..." rows={7} />
          <button className="radar-add" onClick={() => salvarRegistro('lembrete', textoLembrete, hoje(), horaAgora())} disabled={!textoLembrete.trim()}>+ Salvar lembrete</button>
          <small>O lembrete fica visível até o agente que o criou removê-lo.</small>
          <div className="radar-mini-list">{lembretes.length === 0 ? <span>Nenhum lembrete cadastrado.</span> : lembretes.map(l => <div className="radar-mini-item" key={l.id}><b>{l.criadoPor}</b><span>{l.texto}</span><button onClick={() => remover(l.id)} title="Remover lembrete">×</button></div>)}</div>
        </div>

        <div className="radar-calendar-card">
          <div className="calendar-top"><div><span>CALENDÁRIO DE NOTIFICAÇÕES</span><h2>{mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2></div><div className="month-buttons"><button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>‹</button><button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>›</button></div></div>
          <div className="weekdays">{['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map(d => <span key={d}>{d}</span>)}</div>
          <div className="calendar-grid">{dias.map(d => { const key = d.toLocaleDateString('en-CA'); const count = notificacoes.filter(n => n.data === key && !n.concluido).length; return <button type="button" key={key} className={`${d.getMonth() !== mes.getMonth() ? 'other-month ' : ''}${key === dataSelecionada ? 'selected ' : ''}${key === hoje() ? 'today' : ''}`} onClick={() => { setDataSelecionada(key); setEditorAberto(true) }}><span>{d.getDate()}</span>{count > 0 && <i>{count}</i>}</button> })}</div>
          <div className="calendar-legend"><span><i className="legend-red" /> notificações</span></div>
          {editorAberto && <form className="radar-calendar-editor" onSubmit={e => { e.preventDefault(); salvarRegistro('notificacao', textoNotificacao, dataSelecionada, hora) }}>
            <strong>Notificar em {dataBonita(dataSelecionada)}</strong>
            <textarea value={textoNotificacao} onChange={e => setTextoNotificacao(e.target.value)} placeholder="Escreva a notificação..." rows={3} />
            <div className="radar-form-row"><label>⏰ Hora<input type="time" value={hora} onChange={e => setHora(e.target.value)} /></label><label>Nível<select value={prioridade} onChange={e => setPrioridade(e.target.value as Prioridade)}>{Object.entries(prioridadeConfig).map(([key, c]) => <option key={key} value={key}>{c.emoji} {c.label}</option>)}</select></label></div>
            <button className="radar-add" type="submit" disabled={!textoNotificacao.trim()}>+ Colocar no Radar DC</button>
          </form>}
        </div>
      </div>

      <section className="radar-activities">
        <div className="radar-list-heading"><div><span className="card-label">REGISTROS OPERACIONAIS</span><h2>Atividades de {dataBonita(dataSelecionada)}</h2></div><strong>{atividades.checklists.length + atividades.ocorrencias.length} registro(s)</strong></div>
        <div className="radar-activity-columns">
          <div><h3>🚗 Checklists do dia</h3>{atividades.checklists.length === 0 ? <div className="radar-empty">Nenhum checklist registrado.</div> : atividades.checklists.map(c => <button className="radar-activity" key={c.id} onClick={() => disparar('dc:abrir-checklist', { id: c.id })}><b>{c.agente}</b><span>{c.hora} · placa {c.placa || 'não informada'}</span><em>abrir ›</em></button>)}</div>
          <div><h3>⚠️ Ocorrências do dia</h3>{atividades.ocorrencias.length === 0 ? <div className="radar-empty">Nenhuma ocorrência registrada.</div> : atividades.ocorrencias.map(o => <button className="radar-activity" key={o.id} onClick={() => disparar('dc:abrir-ocorrencia', { id: o.id })}><b>{o.agente}</b><span>{o.hora} · {o.natureza || 'Natureza não informada'}</span><small>{o.endereco || 'Endereço não informado'}</small><em>abrir ›</em></button>)}</div>
        </div>
      </section>
      <div className="radar-ticker"><span>RADAR DC</span><div>{(proximasNotificacoes.length ? proximasNotificacoes : notificacoes).map(n => <b key={n.id}>● {dataBonita(n.data)} · {n.texto}</b>)}</div></div>
    </section>
  )
}