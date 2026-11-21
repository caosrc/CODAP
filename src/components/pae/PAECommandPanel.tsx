import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  ConcluirChamadoPaeInput,
  NovoChamadoPaeInput,
  NovoEventoPaeInput,
  PaeChamado,
  PaeEvento,
  PaeMaterialGasto,
} from '../../paeTypes'
import { AGENTES } from '../../types'
import './pae.css'

export interface PAECommandPanelProps {
  aberto: boolean
  eventos: PaeEvento[]
  chamados: PaeChamado[]
  eventoSelecionadoId: string | null
  agenteAtual: string
  carregando: boolean
  salvando: boolean
  erro: string | null
  onFechar: () => void
  onCriarEvento: (input: NovoEventoPaeInput) => Promise<PaeEvento>
  onCriarChamado: (input: NovoChamadoPaeInput) => Promise<PaeChamado>
  onIniciarChamado: (chamadoId: string, agente: string) => Promise<PaeChamado>
  onConcluirChamado: (chamadoId: string, input: ConcluirChamadoPaeInput) => Promise<PaeChamado>
  onGeocodificar: (endereco: string) => Promise<{ latitude: number; longitude: number } | null>
  onSelecionarEvento: (eventoId: string) => void
  onSelecionarChamado: (chamado: PaeChamado) => void
}

type FotoRascunho = { dataUrl: string; legenda: string }

const prioridadeLabel = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
} as const

const statusLabel = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
} as const

function dataHora(valor: string) {
  const data = new Date(valor)
  return Number.isNaN(data.getTime())
    ? valor
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

function lerArquivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Não foi possível ler a imagem.'))
    }
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    reader.readAsDataURL(file)
  })
}

async function comprimirImagem(file: File): Promise<string> {
  const original = await lerArquivo(file)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const escala = Math.min(1, 1280 / image.width, 1280 / image.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * escala))
      canvas.height = Math.max(1, Math.round(image.height * escala))
      const context = canvas.getContext('2d')
      if (!context) {
        resolve(original)
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const webp = canvas.toDataURL('image/webp', 0.78)
      resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.78))
      canvas.width = 0
      canvas.height = 0
    }
    image.onerror = () => resolve(original)
    image.src = original
  })
}

function parseMateriais(texto: string): PaeMaterialGasto[] {
  return texto
    .split('\n')
    .map(linha => linha.trim())
    .filter(Boolean)
    .map(linha => {
      const [nome = '', quantidade = '1', unidade = 'un.'] = linha.split(',').map(parte => parte.trim())
      return { nome, quantidade: Number(quantidade), unidade }
    })
    .filter(material => material.nome && Number.isFinite(material.quantidade) && material.quantidade > 0)
}

export default function PAECommandPanel({
  aberto,
  eventos,
  chamados,
  eventoSelecionadoId,
  agenteAtual,
  carregando,
  salvando,
  erro,
  onFechar,
  onCriarEvento,
  onCriarChamado,
  onIniciarChamado,
  onConcluirChamado,
  onGeocodificar,
  onSelecionarEvento,
  onSelecionarChamado,
}: PAECommandPanelProps) {
  const [modoFormulario, setModoFormulario] = useState<'evento' | 'chamado' | null>(null)
  const [chamadoAtivoId, setChamadoAtivoId] = useState<string | null>(null)
  const [chamadoEmAtendimento, setChamadoEmAtendimento] = useState<PaeChamado | null>(null)
  const [eventoNome, setEventoNome] = useState('')
  const [eventoDescricao, setEventoDescricao] = useState('')
  const [endereco, setEndereco] = useState('')
  const [tipoRisco, setTipoRisco] = useState('')
  const [descricaoChamado, setDescricaoChamado] = useState('')
  const [prioridade, setPrioridade] = useState<NovoChamadoPaeInput['prioridade']>('media')
  const [agentesSelecionados, setAgentesSelecionados] = useState<string[]>(() => (
    AGENTES.includes(agenteAtual) ? [agenteAtual] : []
  ))
  const [coordenadas, setCoordenadas] = useState<{ latitude: number; longitude: number } | null>(null)
  const [geocodificando, setGeocodificando] = useState(false)
  const [mensagemGeocode, setMensagemGeocode] = useState('')
  const [observacao, setObservacao] = useState('')
  const [relato, setRelato] = useState('')
  const [materiaisTexto, setMateriaisTexto] = useState('')
  const [fotos, setFotos] = useState<FotoRascunho[]>([])
  const [erroLocal, setErroLocal] = useState('')
  const [enviando, setEnviando] = useState(false)

  const eventoAtivo = eventos.find(evento => evento.id === eventoSelecionadoId) ?? null
  const chamadosDoEvento = useMemo(
    () => eventoSelecionadoId ? chamados.filter(chamado => chamado.eventoId === eventoSelecionadoId) : [],
    [chamados, eventoSelecionadoId],
  )
  const chamadoAtivoOriginal = chamadosDoEvento.find(chamado => chamado.id === chamadoAtivoId) ?? null
  const chamadoAtivo = chamadoEmAtendimento?.id === chamadoAtivoOriginal?.id
    ? chamadoEmAtendimento
    : chamadoAtivoOriginal
  const podeAtender = Boolean(chamadoAtivo?.agentesEnvolvidos.includes(agenteAtual))

  useEffect(() => {
    if (!aberto) return
    const fecharComEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', fecharComEsc)
    return () => window.removeEventListener('keydown', fecharComEsc)
  }, [aberto, onFechar])

  if (!aberto) return null

  const iniciarChamado = () => {
    setModoFormulario('chamado')
    setErroLocal('')
    setEndereco('')
    setTipoRisco('')
    setDescricaoChamado('')
    setPrioridade('media')
    setAgentesSelecionados(AGENTES.includes(agenteAtual) ? [agenteAtual] : [])
    setCoordenadas(null)
    setMensagemGeocode('')
  }

  const geocodificar = async () => {
    if (!endereco.trim()) {
      setMensagemGeocode('Informe o endereço para localizar o ponto.')
      return null
    }
    setGeocodificando(true)
    setMensagemGeocode('')
    try {
      const resultado = await onGeocodificar(endereco.trim())
      if (!resultado) {
        setCoordenadas(null)
        setMensagemGeocode('Endereço não localizado. Revise o texto e tente novamente.')
        return null
      }
      setCoordenadas(resultado)
      setMensagemGeocode(`Localização confirmada · ${resultado.latitude.toFixed(5)}, ${resultado.longitude.toFixed(5)}`)
      return resultado
    } catch {
      setMensagemGeocode('Não foi possível localizar o endereço. Tente novamente.')
      return null
    } finally {
      setGeocodificando(false)
    }
  }

  const criarEvento = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErroLocal('')
    setEnviando(true)
    try {
      const input: NovoEventoPaeInput = {
        nome: eventoNome.trim(),
        acionadoPor: agenteAtual,
        descricao: eventoDescricao.trim(),
      }
      const criado = await onCriarEvento(input)
      onSelecionarEvento(criado.id)
      setEventoNome('')
      setEventoDescricao('')
      setModoFormulario(null)
    } catch (error) {
      setErroLocal(error instanceof Error ? error.message : 'Não foi possível abrir o evento.')
    } finally {
      setEnviando(false)
    }
  }

  const criarChamado = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!eventoSelecionadoId) return
    setErroLocal('')
    setEnviando(true)
    try {
      const local = coordenadas ?? await onGeocodificar(endereco.trim())
      if (!local) {
        setMensagemGeocode('Localização necessária. Verifique o endereço e tente novamente.')
        setEnviando(false)
        return
      }
      const input: NovoChamadoPaeInput = {
        eventoId: eventoSelecionadoId,
        acionadoPor: agenteAtual,
        endereco: endereco.trim(),
        latitude: local.latitude,
        longitude: local.longitude,
        tipoRisco: tipoRisco.trim(),
        descricao: descricaoChamado.trim(),
        prioridade,
        agentesEnvolvidos: AGENTES.filter(agente => agentesSelecionados.includes(agente)),
      }
      const criado = await onCriarChamado(input)
      onSelecionarChamado(criado)
      setChamadoAtivoId(criado.id)
      setModoFormulario(null)
    } catch (error) {
      setErroLocal(error instanceof Error ? error.message : 'Não foi possível registrar o chamado.')
    } finally {
      setEnviando(false)
    }
  }

  const concluirChamado = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!chamadoAtivo) return
    setErroLocal('')
    setEnviando(true)
    try {
      const input: ConcluirChamadoPaeInput = {
        agente: agenteAtual,
        observacao: observacao.trim(),
        relato: relato.trim(),
        materiaisGastos: parseMateriais(materiaisTexto),
        fotos: fotos.map(foto => ({
          dataUrl: foto.dataUrl,
          legenda: foto.legenda.trim(),
          latitude: chamadoAtivo.latitude,
          longitude: chamadoAtivo.longitude,
        })),
      }
      const concluido = await onConcluirChamado(chamadoAtivo.id, input)
      setChamadoEmAtendimento(concluido)
      setObservacao('')
      setRelato('')
      setMateriaisTexto('')
      setFotos([])
    } catch (error) {
      setErroLocal(error instanceof Error ? error.message : 'Não foi possível concluir o chamado.')
    } finally {
      setEnviando(false)
    }
  }

  const iniciarAtendimento = async () => {
    if (!chamadoAtivo || chamadoAtivo.status !== 'novo') return
    setErroLocal('')
    setEnviando(true)
    try {
      const atualizado = await onIniciarChamado(chamadoAtivo.id, agenteAtual)
      setChamadoEmAtendimento(atualizado)
    } catch (error) {
      setErroLocal(error instanceof Error ? error.message : 'Não foi possível iniciar o atendimento.')
    } finally {
      setEnviando(false)
    }
  }

  const adicionarFotos = async (files: FileList | null) => {
    if (!files?.length) return
    setErroLocal('')
    try {
      const novasFotos = await Promise.all(Array.from(files).filter(file => file.type.startsWith('image/')).map(async file => ({
        dataUrl: await comprimirImagem(file),
        legenda: file.name.replace(/\.[^.]+$/, ''),
      })))
      setFotos(atuais => [...atuais, ...novasFotos])
    } catch {
      setErroLocal('Não foi possível preparar uma ou mais imagens.')
    }
  }

  const salvarBloqueado = salvando || enviando || carregando

  return (
    <div className="pae-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onFechar() }}>
      <section className="pae-command" role="dialog" aria-modal="true" aria-labelledby="pae-title" data-testid="panel-pae-command">
        <header className="pae-topbar">
          <div className="pae-brand">
            <span className="pae-mark" aria-hidden="true"><i /><i /><i /></span>
            <div>
              <div className="pae-eyebrow">RADAR DC <span>/</span> PROTOCOLO DE ATENDIMENTO</div>
              <h1 id="pae-title">PAE <span>Comando de campo</span></h1>
            </div>
          </div>
          <div className="pae-topbar-right">
            <span className="pae-operator"><b className="pae-live-dot" /> {agenteAtual || 'Agente não identificado'}</span>
            <button className="pae-icon-button" type="button" onClick={onFechar} aria-label="Fechar painel PAE" data-testid="button-close-pae">Fechar <span aria-hidden="true">×</span></button>
          </div>
        </header>

        <div className="pae-summary-strip" aria-label="Resumo operacional">
          <div><span>EVENTOS ATIVOS</span><strong>{eventos.filter(evento => evento.status === 'ativo').length.toString().padStart(2, '0')}</strong></div>
          <div><span>CHAMADOS NESTE EVENTO</span><strong>{chamadosDoEvento.length.toString().padStart(2, '0')}</strong></div>
          <div><span>EM ATENDIMENTO</span><strong>{chamadosDoEvento.filter(chamado => chamado.status === 'em_atendimento').length.toString().padStart(2, '0')}</strong></div>
          <div className="pae-summary-note"><span>ESCOPO</span><strong>1 evento · múltiplos riscos</strong></div>
        </div>

        <div className="pae-workspace">
          <aside className="pae-rail">
            <div className="pae-section-heading">
              <div><span className="pae-section-index">01</span><h2>Eventos</h2></div>
              <button className="pae-add-button" type="button" onClick={() => { setModoFormulario(modoFormulario === 'evento' ? null : 'evento'); setErroLocal('') }} data-testid="button-create-event">+ Abrir</button>
            </div>
            <p className="pae-rail-caption">Ocorrência que reúne os chamados de campo.</p>
            {carregando ? (
              <div className="pae-skeleton-list" aria-label="Carregando eventos" data-testid="status-events-loading"><i /><i /><i /></div>
            ) : eventos.length === 0 ? (
              <div className="pae-empty-events" data-testid="empty-events"><span className="pae-empty-mark">—</span><strong>Nenhum evento aberto</strong><p>Abra um evento para começar a coordenar os chamados.</p><button type="button" onClick={() => setModoFormulario('evento')} data-testid="button-empty-create-event">Abrir primeiro evento</button></div>
            ) : (
              <div className="pae-event-list" data-testid="list-events">
                {eventos.map(evento => (
                  <button
                    key={evento.id}
                    className={`pae-event-row ${eventoSelecionadoId === evento.id ? 'is-selected' : ''}`}
                    type="button"
                    onClick={() => { onSelecionarEvento(evento.id); setChamadoAtivoId(null); setModoFormulario(null) }}
                    data-testid={`button-select-event-${evento.id}`}
                    aria-current={eventoSelecionadoId === evento.id ? 'true' : undefined}
                  >
                    <span className={`pae-event-status ${evento.status === 'ativo' ? 'is-active' : ''}`} />
                    <span className="pae-event-copy"><strong>{evento.nome}</strong><small>{evento.acionadoPor} · {dataHora(evento.criadoEm)}</small></span>
                    <span className="pae-row-count">{chamados.filter(chamado => chamado.eventoId === evento.id).length.toString().padStart(2, '0')}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="pae-rail-divider" />
            <div className="pae-section-heading pae-call-heading">
              <div><span className="pae-section-index">02</span><h2>Chamados</h2></div>
              <button className="pae-add-button" type="button" onClick={iniciarChamado} disabled={!eventoAtivo || eventoAtivo.status !== 'ativo' || salvarBloqueado} data-testid="button-create-call">+ Novo</button>
            </div>
            <p className="pae-rail-caption">{eventoAtivo ? eventoAtivo.nome : 'Selecione um evento para ver os chamados.'}</p>
            {eventoAtivo && (
              carregando ? <div className="pae-skeleton-list pae-skeleton-short" aria-label="Carregando chamados"><i /><i /></div> :
                chamadosDoEvento.length === 0 ? <div className="pae-empty-calls" data-testid="empty-calls">Sem chamados neste evento.</div> :
                  <div className="pae-call-list" data-testid="list-calls">
                    {chamadosDoEvento.map(chamado => (
                      <button
                        key={chamado.id}
                        className={`pae-call-row ${chamadoAtivoId === chamado.id ? 'is-selected' : ''}`}
                        type="button"
                        onClick={() => { setChamadoAtivoId(chamado.id); setModoFormulario(null); onSelecionarChamado(chamado) }}
                        data-testid={`button-select-call-${chamado.id}`}
                        aria-current={chamadoAtivoId === chamado.id ? 'true' : undefined}
                      >
                        <span className={`pae-priority-line priority-${chamado.prioridade}`} />
                        <span className="pae-call-copy"><strong>{chamado.tipoRisco}</strong><small>{chamado.endereco}</small><em>{statusLabel[chamado.status]}</em></span>
                        <span className={`pae-priority-tag priority-${chamado.prioridade}`}>{prioridadeLabel[chamado.prioridade]}</span>
                      </button>
                    ))}
                  </div>
            )}
          </aside>

          <main className="pae-detail">
            {(erro || erroLocal) && <div className="pae-error" role="alert" data-testid="status-pae-error"><strong>Falha na operação</strong><span>{erroLocal || erro}</span></div>}
            {modoFormulario === 'evento' ? (
              <section className="pae-form-view">
                <div className="pae-detail-kicker">NOVO REGISTRO / EVENTO</div>
                <h2>Abrir evento</h2>
                <p className="pae-form-intro">Nomeie a ocorrência que vai concentrar os chamados de risco.</p>
                <form onSubmit={criarEvento} className="pae-form">
                  <label>Nome do evento<input autoFocus required maxLength={120} value={eventoNome} onChange={event => setEventoNome(event.target.value)} placeholder="Ex.: Alagamento no Centro" data-testid="input-event-name" /></label>
                  <label>Descrição<textarea rows={4} value={eventoDescricao} onChange={event => setEventoDescricao(event.target.value)} placeholder="Contexto inicial para as equipes em campo" data-testid="input-event-description" /></label>
                  <div className="pae-form-meta">ACIONADO POR <strong>{agenteAtual}</strong></div>
                  <div className="pae-form-actions"><button className="pae-secondary-button" type="button" onClick={() => setModoFormulario(null)} data-testid="button-cancel-event">Cancelar</button><button className="pae-primary-button" type="submit" disabled={salvarBloqueado || !eventoNome.trim()} data-testid="button-submit-event">{salvando || enviando ? 'Abrindo…' : 'Abrir evento'}</button></div>
                </form>
              </section>
            ) : modoFormulario === 'chamado' ? (
              <section className="pae-form-view">
                <div className="pae-detail-kicker">NOVO REGISTRO / CHAMADO DE RISCO</div>
                <h2>Registrar chamado</h2>
                <p className="pae-form-intro">Todos os agentes selecionados recebem o alerta e podem assumir o atendimento.</p>
                <form onSubmit={criarChamado} className="pae-form">
                  <div className="pae-form-grid">
                    <label className="pae-span-two">Endereço<input required value={endereco} onChange={event => { setEndereco(event.target.value); setCoordenadas(null); setMensagemGeocode('') }} placeholder="Rua, número, bairro e município" data-testid="input-call-address" /></label>
                    <div className="pae-geocode-row pae-span-two">
                      <button className="pae-geocode-button" type="button" onClick={() => void geocodificar()} disabled={geocodificando || !endereco.trim()} data-testid="button-geocode-address">{geocodificando ? 'Localizando…' : 'Localizar no mapa'}</button>
                      <span className={coordenadas ? 'pae-geocode-ok' : ''} role="status" data-testid="status-geocode">{mensagemGeocode || 'A localização é necessária para registrar o chamado.'}</span>
                    </div>
                    <label>Tipo de risco<input required value={tipoRisco} onChange={event => setTipoRisco(event.target.value)} placeholder="Ex.: Deslizamento" data-testid="input-call-risk" /></label>
                    <label>Prioridade<select value={prioridade} onChange={event => setPrioridade(event.target.value as NovoChamadoPaeInput['prioridade'])} data-testid="select-call-priority"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
                    <label className="pae-span-two">Descrição<textarea required rows={3} value={descricaoChamado} onChange={event => setDescricaoChamado(event.target.value)} placeholder="O que foi informado? Inclua sinais de risco e pessoas afetadas." data-testid="input-call-description" /></label>
                    <fieldset className="pae-agent-picker pae-span-two" aria-describedby="pae-agent-picker-hint">
                      <legend>Agentes selecionados</legend>
                      <span id="pae-agent-picker-hint" className="pae-label-hint">Selecione um ou mais agentes para receber o alerta e atuar no chamado.</span>
                      <div className="pae-agent-options">
                        {AGENTES.map(agente => (
                          <label className={`pae-agent-option ${agentesSelecionados.includes(agente) ? 'is-selected' : ''}`} key={agente}>
                            <input
                              type="checkbox"
                              checked={agentesSelecionados.includes(agente)}
                              onChange={event => setAgentesSelecionados(atuais => (
                                event.target.checked
                                  ? [...atuais, agente]
                                  : atuais.filter(item => item !== agente)
                              ))}
                              aria-label={`Selecionar agente ${agente}`}
                              data-testid={`checkbox-call-agent-${agente.toLowerCase()}`}
                            />
                            <span className="pae-agent-check" aria-hidden="true" />
                            <span>{agente}{agente === agenteAtual ? <small>Você</small> : null}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                  <div className="pae-form-meta">EVENTO <strong>{eventoAtivo?.nome}</strong></div>
                  <div className="pae-form-actions"><button className="pae-secondary-button" type="button" onClick={() => setModoFormulario(null)} data-testid="button-cancel-call">Cancelar</button><button className="pae-primary-button" type="submit" disabled={salvarBloqueado || !tipoRisco.trim() || !descricaoChamado.trim() || agentesSelecionados.length === 0} data-testid="button-submit-call">{salvando || enviando ? 'Registrando…' : 'Registrar chamado'}</button></div>
                </form>
              </section>
            ) : chamadoAtivo ? (
              <section className="pae-call-detail" data-testid={`detail-call-${chamadoAtivo.id}`}>
                <div className="pae-detail-head">
                  <div>
                    <div className="pae-detail-kicker">CHAMADO / {chamadoAtivo.id.slice(0, 8).toUpperCase()}</div>
                    <h2>{chamadoAtivo.tipoRisco}</h2>
                  </div>
                  <span className={`pae-status-pill status-${chamadoAtivo.status}`}>{statusLabel[chamadoAtivo.status]}</span>
                </div>
                <div className="pae-call-address"><span className="pae-pin" aria-hidden="true" /> <div><strong>{chamadoAtivo.endereco}</strong><small>{chamadoAtivo.latitude.toFixed(5)}, {chamadoAtivo.longitude.toFixed(5)}</small></div></div>
                <div className="pae-facts">
                  <div><span>PRIORIDADE</span><strong className={`pae-fact-priority priority-${chamadoAtivo.prioridade}`}>{prioridadeLabel[chamadoAtivo.prioridade]}</strong></div>
                  <div><span>ACIONADO POR</span><strong>{chamadoAtivo.acionadoPor}</strong></div>
                  <div><span>ABERTO</span><strong>{dataHora(chamadoAtivo.criadoEm)}</strong></div>
                </div>
                <div className="pae-description-block"><span className="pae-block-label">DESCRIÇÃO DO RISCO</span><p>{chamadoAtivo.descricao}</p></div>
                <div className="pae-agents-block"><span className="pae-block-label">EQUIPE ACIONADA <b>{chamadoAtivo.agentesEnvolvidos.length}</b></span><div className="pae-agent-chips">{chamadoAtivo.agentesEnvolvidos.map((agente, index) => <span className={agente === agenteAtual ? 'is-current' : ''} key={`${agente}-${index}`} data-testid={`text-agent-${chamadoAtivo.id}-${index}`}><i>{agente.trim().charAt(0).toLocaleUpperCase()}</i>{agente}</span>)}</div></div>
                {chamadoAtivo.atendimento ? (
                  <div className="pae-completed-record" data-testid="record-completed-call">
                    <div className="pae-record-heading"><span className="pae-block-label">REGISTRO DE CAMPO</span><strong>Concluído por {chamadoAtivo.atendimento.agente}</strong><small>{dataHora(chamadoAtivo.atendimento.concluidoEm)}</small></div>
                    {chamadoAtivo.atendimento.observacao && <div><b>Observações</b><p>{chamadoAtivo.atendimento.observacao}</p></div>}
                    {chamadoAtivo.atendimento.relato && <div><b>O que aconteceu</b><p>{chamadoAtivo.atendimento.relato}</p></div>}
                    {chamadoAtivo.atendimento.materiaisGastos.length > 0 && <div><b>Materiais consumidos</b><p>{chamadoAtivo.atendimento.materiaisGastos.map(item => `${item.nome} · ${item.quantidade} ${item.unidade}`).join(' / ')}</p></div>}
                    {chamadoAtivo.atendimento.fotos.length > 0 && <div className="pae-photo-grid">{chamadoAtivo.atendimento.fotos.map(foto => <figure key={foto.id}><img src={foto.dataUrl} alt={foto.legenda || 'Registro fotográfico do atendimento'} /><figcaption>{foto.legenda || foto.agente}</figcaption></figure>)}</div>}
                  </div>
                ) : chamadoAtivo.status !== 'concluido' && chamadoAtivo.status !== 'cancelado' ? (
                  podeAtender ? (
                    <>
                    {chamadoAtivo.status === 'novo' && (
                      <div className="pae-start-attendance">
                        <div><strong>Assumir atendimento</strong><span>Registre o início da ação em campo para a equipe acionada.</span></div>
                        <button className="pae-secondary-button" type="button" onClick={() => void iniciarAtendimento()} disabled={salvarBloqueado} data-testid="button-start-call">{salvando || enviando ? 'Iniciando…' : 'Iniciar atendimento'}</button>
                      </div>
                    )}
                    <form className="pae-completion-form" onSubmit={concluirChamado}>
                      <div className="pae-completion-title"><div><span className="pae-detail-kicker">AÇÃO DE CAMPO</span><h3>Concluir chamado</h3></div><span>RESPONSÁVEL <b>{agenteAtual}</b></span></div>
                      <div className="pae-form-grid">
                        <label className="pae-span-two">Observações de campo<textarea rows={2} value={observacao} onChange={event => setObservacao(event.target.value)} placeholder="Condições encontradas, medidas tomadas e situação do local." data-testid="input-completion-observations" /></label>
                        <label className="pae-span-two">Relato do ocorrido<textarea required rows={3} value={relato} onChange={event => setRelato(event.target.value)} placeholder="Registre o que aconteceu e como a ocorrência foi tratada." data-testid="input-completion-account" /></label>
                        <label className="pae-span-two">Materiais consumidos <small className="pae-label-hint">Uma linha por item: material, quantidade, unidade.</small><textarea rows={2} value={materiaisTexto} onChange={event => setMateriaisTexto(event.target.value)} placeholder={'Ex.: Lona, 2, un.\nAreia, 4, sacos'} data-testid="input-completion-materials" /></label>
                      </div>
                      <div className="pae-photo-control">
                        <div><strong>Fotos de campo</strong><span>Imagens reduzidas para registro operacional.</span></div>
                        <label className="pae-upload-button">Adicionar fotos<input type="file" accept="image/*" multiple onChange={event => { void adicionarFotos(event.currentTarget.files); event.currentTarget.value = '' }} data-testid="input-completion-photos" /></label>
                      </div>
                      {fotos.length > 0 && <div className="pae-photo-grid pae-photo-drafts">{fotos.map((foto, index) => <figure key={`${index}-${foto.dataUrl.slice(-16)}`}><img src={foto.dataUrl} alt={foto.legenda || `Foto de campo ${index + 1}`} /><figcaption><input aria-label={`Legenda da foto ${index + 1}`} value={foto.legenda} onChange={event => setFotos(atuais => atuais.map((item, itemIndex) => itemIndex === index ? { ...item, legenda: event.target.value } : item))} data-testid={`input-photo-caption-${index}`} /><button type="button" aria-label={`Remover foto ${index + 1}`} onClick={() => setFotos(atuais => atuais.filter((_, itemIndex) => itemIndex !== index))} data-testid={`button-remove-photo-${index}`}>Remover</button></figcaption></figure>)}</div>}
                      <div className="pae-completion-footer"><p>Ao concluir, a equipe selecionada será notificada do encerramento.</p><button className="pae-primary-button pae-finish-button" type="submit" disabled={salvarBloqueado || !relato.trim()} data-testid="button-complete-call">{salvando || enviando ? 'Salvando registro…' : 'Concluir atendimento'}</button></div>
                    </form>
                    </>
                  ) : <div className="pae-permission-note" data-testid="status-agent-not-selected"><strong>Atendimento reservado à equipe acionada</strong><p>Seu nome não está entre os agentes selecionados para este chamado. A equipe acionada pode registrar a conclusão e notificar os demais.</p></div>
                ) : <div className="pae-completed-record"><p>Este chamado está encerrado.</p></div>}
              </section>
            ) : eventoAtivo ? (
              <section className="pae-welcome-state" data-testid="empty-call-selection">
                <div className="pae-crosshair" aria-hidden="true"><i /><i /></div>
                <div className="pae-detail-kicker">EVENTO ATIVO · {eventoAtivo.acionadoPor}</div>
                <h2>{eventoAtivo.nome}</h2>
                <p>{eventoAtivo.descricao || 'Selecione um chamado para abrir o registro de campo, ou crie um novo chamado de risco.'}</p>
                <button className="pae-primary-button" type="button" onClick={iniciarChamado} disabled={eventoAtivo.status !== 'ativo'} data-testid="button-start-first-call">Registrar primeiro chamado <span aria-hidden="true">→</span></button>
                <div className="pae-welcome-foot"><span>LOCALIZAÇÃO</span><b>Coordenadas necessárias para cada chamado</b></div>
              </section>
            ) : (
              <section className="pae-no-event-state" data-testid="empty-event-selection">
                <div className="pae-command-stamp">PAE<span>01</span></div>
                <div className="pae-detail-kicker">PAINEL DE ATENDIMENTO A EMERGÊNCIAS</div>
                <h2>Pronto para<br />coordenar.</h2>
                <p>Abra um evento para reunir os riscos e equipes de uma ocorrência no mesmo lugar.</p>
                <div className="pae-no-event-rule" />
                <span className="pae-no-event-note">SELECIONE UM EVENTO OU INICIE UM NOVO</span>
              </section>
            )}
          </main>
        </div>

        <footer className="pae-footer">
          <span><b className="pae-live-dot" /> CANAL OPERACIONAL</span>
          <span>DEFESA CIVIL MUNICIPAL <i /> PAE / RADAR DC</span>
        </footer>
      </section>
    </div>
  )
}
