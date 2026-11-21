import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  ConcluirChamadoPaeInput,
  NovoChamadoPaeInput,
  NovoEventoPaeInput,
  PaeChamado,
  PaeAtribuicao,
  PaeEvento,
  PaeHistorico,
  PaeMaterialGasto,
  TriarChamadoPaeInput,
} from '../../paeTypes'
import { AGENTES } from '../../types'
import './pae.css'

export interface PAECommandPanelProps {
  aberto: boolean
  eventos: PaeEvento[]
  chamados: PaeChamado[]
  historico: PaeHistorico[]
  historicoCarregando: boolean
  eventoSelecionadoId: string | null
  chamadoSelecionadoId: string | null
  ajusteChamadoId: string | null
  agenteAtual: string
  gpsStatus: 'inativo' | 'aguardando' | 'ativo' | 'erro'
  carregando: boolean
  salvando: boolean
  erro: string | null
  localizacaoMapa: { lat: number; lng: number; nome: string } | null
  onFechar: () => void
  onSairPae: () => void
  onAtivarGps: () => void
  onCriarEvento: (input: NovoEventoPaeInput) => Promise<PaeEvento>
  onCriarChamado: (input: NovoChamadoPaeInput) => Promise<PaeChamado>
  onTriarChamado: (chamadoId: string, input: TriarChamadoPaeInput) => Promise<PaeChamado>
  onDesignarChamado: (chamado: PaeChamado, agentes: string[]) => Promise<PaeAtribuicao>
  onResponderAtribuicao: (chamado: PaeChamado, atribuicao: PaeAtribuicao, aceitar: boolean, motivo: string) => Promise<PaeAtribuicao>
  onSolicitarReforco: (chamado: PaeChamado, atribuicao: PaeAtribuicao, motivo: string) => Promise<PaeAtribuicao>
  onAtenderReforco: (chamado: PaeChamado, atribuicao: PaeAtribuicao, agentes: string[]) => Promise<PaeAtribuicao>
  onIniciarChamado: (chamadoId: string, agente: string) => Promise<PaeChamado>
  onConcluirChamado: (chamadoId: string, input: ConcluirChamadoPaeInput) => Promise<PaeChamado>
  onValidarChamado: (chamadoId: string) => Promise<PaeChamado>
  onSuspenderCancelarChamado: (chamadoId: string, status: 'suspenso' | 'cancelado', motivo: string) => Promise<PaeChamado>
  onAjustarLocalizacao: (chamadoId: string | null) => void
  onSelecionarEvento: (eventoId: string) => void
  onSelecionarChamado: (chamado: PaeChamado | null) => void
}

type FotoRascunho = { dataUrl: string; legenda: string }
const TIPOS_EVENTO_PAE = [
  'Chuvas intensas',
  'Enchente',
  'Alagamento',
  'Deslizamento',
  'Vendaval',
  'Granizo',
  'Incêndio',
  'Seca',
  'Erosão',
  'Interdição preventiva',
  'Outro',
]

const TIPOS_CHAMADO_PAE = [
  'Alagamento/inundação',
  'Deslizamento ou movimentação de massa',
  'Queda de muro',
  'Queda de árvore',
  'Destelhamento',
  'Risco elétrico',
  'Dano em via',
  'Erosão',
  'Obstrução',
  'Incêndio',
  'Risco estrutural',
  'Outro',
]

const prioridadeLabel = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
} as const

const statusLabel = {
  novo: 'Novo',
  triado: 'Triado',
  em_atendimento: 'Em atendimento',
  concluido_em_campo: 'Concluído em campo',
  validado: 'Validado',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
} as const

function dataHora(valor: string) {
  const data = new Date(valor)
  return Number.isNaN(data.getTime())
    ? valor
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

function situacaoChamado(chamado: PaeChamado): string {
  if (chamado.atribuicao?.status === 'designada') return 'Aguardando aceite'
  if (chamado.atribuicao?.status === 'aceita' && chamado.status === 'triado') return 'Equipe aceitou'
  if (chamado.atribuicao?.status === 'recusada' && chamado.status === 'triado') return 'Aguardando nova equipe'
  return statusLabel[chamado.status]
}

function atualizarSelecaoAgente(atual: string[], agente: string, selecionado: boolean): string[] {
  return selecionado
    ? [...new Set([...atual, agente])]
    : atual.filter(item => item !== agente)
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

function escaparHtml(valor: unknown): string {
  return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[caractere] || caractere)
}

function imprimirDocumentoPae(titulo: string, conteudo: string): boolean {
  const janela = window.open('', '_blank')
  if (!janela) return false
  janela.document.open()
  janela.document.write(`<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>${escaparHtml(titulo)}</title>
        <style>
          @page { size: A4; margin: 16mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #17212b; font: 11pt/1.45 Arial, sans-serif; }
          header { border-bottom: 2px solid #173f63; margin-bottom: 18px; padding-bottom: 10px; }
          header small { color: #526575; text-transform: uppercase; letter-spacing: .08em; }
          h1 { margin: 5px 0; color: #123b5d; font-size: 20pt; }
          h2 { margin: 18px 0 8px; color: #173f63; font-size: 13pt; }
          h3 { margin: 0 0 6px; font-size: 11pt; }
          p { margin: 4px 0; white-space: pre-wrap; }
          .meta { color: #526575; font-size: 9pt; }
          .report-call { border-top: 1px solid #b9c7d1; margin-top: 18px; padding-top: 12px; page-break-inside: avoid; }
          .report-call + .report-call { page-break-before: always; }
          .report-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 10px 0; }
          .report-facts div { border-bottom: 1px solid #dbe3e9; padding: 4px 0; }
          .report-facts b { display: block; color: #526575; font-size: 8pt; text-transform: uppercase; }
          .report-photos { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
          figure { width: 46%; margin: 0; page-break-inside: avoid; }
          figure img { display: block; width: 100%; max-height: 230px; object-fit: contain; }
          figcaption { color: #526575; font-size: 9pt; }
          a { color: #165b89; }
          footer { border-top: 1px solid #b9c7d1; margin-top: 24px; padding-top: 8px; color: #526575; font-size: 8pt; }
          @media screen { body { max-width: 820px; margin: 30px auto; padding: 24px; } }
        </style>
      </head>
      <body>
        <header><small>Defesa Civil · Conselheiro Lafaiete — MG · Radar DC</small><h1>${escaparHtml(titulo)}</h1><p class="meta">Gerado em ${escaparHtml(new Date().toLocaleString('pt-BR'))} · Documento operacional interno</p></header>
        ${conteudo}
        <footer>Relatório para uso operacional interno. Os registros apresentados dependem dos dados disponíveis no PAE.</footer>
        <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300))</script>
      </body>
    </html>`)
  janela.document.close()
  return true
}

export default function PAECommandPanel({
  aberto,
  eventos,
  chamados,
  eventoSelecionadoId,
  agenteAtual,
  gpsStatus,
  carregando,
  salvando,
  erro,
  localizacaoMapa,
  onFechar,
  onSairPae,
  onAtivarGps,
  onCriarEvento,
  onCriarChamado,
  onTriarChamado,
  onDesignarChamado,
  onResponderAtribuicao,
  onSolicitarReforco,
  onAtenderReforco,
  onIniciarChamado,
  onConcluirChamado,
  onValidarChamado,
  onSuspenderCancelarChamado,
  onAjustarLocalizacao,
  onSelecionarEvento,
  onSelecionarChamado,
  historico,
  historicoCarregando,
  chamadoSelecionadoId,
  ajusteChamadoId,
}: PAECommandPanelProps) {
  const [modoFormulario, setModoFormulario] = useState<'evento' | 'chamado' | null>(null)
  const [chamadoEmAtendimento, setChamadoEmAtendimento] = useState<PaeChamado | null>(null)
  const [eventoNome, setEventoNome] = useState('')
  const [eventoDescricao, setEventoDescricao] = useState('')
  const [tipoEvento, setTipoEvento] = useState('')
  const [objetivos, setObjetivos] = useState('')
  const [endereco, setEndereco] = useState('')
  const [enderecoConfirmado, setEnderecoConfirmado] = useState('')
  const [referencia, setReferencia] = useState('')
  const [bairro, setBairro] = useState('')
  const [municipio, setMunicipio] = useState('Conselheiro Lafaiete')
  const [tipoRisco, setTipoRisco] = useState('')
  const [cobrade, setCobrade] = useState('')
  const [canalEntrada, setCanalEntrada] = useState('interno')
  const [descricaoChamado, setDescricaoChamado] = useState('')
  const [prioridade, setPrioridade] = useState<NovoChamadoPaeInput['prioridade']>('media')
  const [prioridadeTriagem, setPrioridadeTriagem] = useState<NovoChamadoPaeInput['prioridade']>('media')
  const [justificativaTriagem, setJustificativaTriagem] = useState('')
  const [agentesDesignacao, setAgentesDesignacao] = useState<string[]>([])
  const [agentesReforco, setAgentesReforco] = useState<string[]>([])
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [motivoReforco, setMotivoReforco] = useState('')
  const [filtroTexto, setFiltroTexto] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroPrioridade, setFiltroPrioridade] = useState('')
  const [motivoEncerramento, setMotivoEncerramento] = useState('')
  const [acaoEncerramento, setAcaoEncerramento] = useState<'suspenso' | 'cancelado'>('suspenso')
  const [coordenadas, setCoordenadas] = useState<{ latitude: number; longitude: number } | null>(null)
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
  const chamadosFiltrados = useMemo(() => {
    const pesoPrioridade: Record<PaeChamado['prioridade'], number> = {
      critica: 0, alta: 1, media: 2, baixa: 3,
    }
    const busca = filtroTexto.trim().toLocaleLowerCase('pt-BR')
    return chamadosDoEvento
      .filter(chamado => !filtroStatus || chamado.status === filtroStatus)
      .filter(chamado => !filtroPrioridade || chamado.prioridade === filtroPrioridade)
      .filter(chamado => !busca || [
        chamado.tipoRisco, chamado.endereco, chamado.bairro, chamado.cobrade,
      ].some(valor => valor?.toLocaleLowerCase('pt-BR').includes(busca)))
      .sort((a, b) => pesoPrioridade[a.prioridade] - pesoPrioridade[b.prioridade]
        || a.criadoEm.localeCompare(b.criadoEm))
  }, [chamadosDoEvento, filtroTexto, filtroStatus, filtroPrioridade])
  const chamadoAtivoOriginal = chamadosDoEvento.find(chamado => chamado.id === chamadoSelecionadoId) ?? null
  const chamadoAtivo = chamadoEmAtendimento?.id === chamadoAtivoOriginal?.id
    ? chamadoEmAtendimento
    : chamadoAtivoOriginal
  const podeAtender = Boolean(
    chamadoAtivo?.agentesEnvolvidos.includes(agenteAtual)
      && (chamadoAtivo.status === 'em_atendimento' || chamadoAtivo.atribuicao?.status === 'aceita'),
  )
  const podeValidar = Boolean(eventoAtivo && (eventoAtivo.responsavel || eventoAtivo.acionadoPor) === agenteAtual)
  const podeDesignar = Boolean(
    eventoAtivo
      && chamadoAtivo?.status === 'triado'
      && (eventoAtivo.responsavel || eventoAtivo.acionadoPor) === agenteAtual,
  )
  const podeResponderAtribuicao = Boolean(
    chamadoAtivo?.atribuicao?.status === 'designada'
      && chamadoAtivo.atribuicao.agentesDesignados.includes(agenteAtual),
  )

  useEffect(() => {
    if (!aberto) return
    const fecharComEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', fecharComEsc)
    return () => window.removeEventListener('keydown', fecharComEsc)
  }, [aberto, onFechar])

  useEffect(() => {
    if (!chamadoAtivo) {
      setJustificativaTriagem('')
      return
    }
    setPrioridadeTriagem(chamadoAtivo.prioridade)
    setJustificativaTriagem(chamadoAtivo.justificativaPrioridade || '')
    setCobrade(chamadoAtivo.cobrade || '')
    setAgentesDesignacao(chamadoAtivo.atribuicao?.agentesDesignados || [])
    setAgentesReforco([])
    setMotivoRecusa('')
    setMotivoReforco('')
  }, [
    chamadoAtivo?.id,
    chamadoAtivo?.prioridade,
    chamadoAtivo?.justificativaPrioridade,
    chamadoAtivo?.cobrade,
    chamadoAtivo?.atribuicao?.id,
    chamadoAtivo?.atribuicao?.status,
    chamadoAtivo?.atribuicao?.agentesDesignados.join(','),
  ])

  if (!aberto) return null

  const iniciarChamado = () => {
    setModoFormulario('chamado')
    setErroLocal('')
    setEndereco(localizacaoMapa?.nome || '')
    setEnderecoConfirmado(localizacaoMapa?.nome || '')
    setReferencia('')
    setBairro('')
    setMunicipio('Conselheiro Lafaiete')
    setTipoRisco('')
    setCobrade('')
    setCanalEntrada('interno')
    setDescricaoChamado('')
    setPrioridade('media')
    setCoordenadas(localizacaoMapa
      ? { latitude: localizacaoMapa.lat, longitude: localizacaoMapa.lng }
      : null)
    setMensagemGeocode(localizacaoMapa
      ? `Local do Mapa selecionado · ${localizacaoMapa.lat.toFixed(5)}, ${localizacaoMapa.lng.toFixed(5)}`
      : 'Pesquise e selecione um endereço na barra de busca do Mapa.')
  }

  const invalidarEnderecoEncontrado = () => {
    setCoordenadas(null)
    setEnderecoConfirmado('')
    setMensagemGeocode('')
  }

  const usarLocalizacaoMapa = () => {
    if (!localizacaoMapa) {
      setMensagemGeocode('Pesquise e selecione um endereço na barra de busca do Mapa.')
      return
    }
    setEndereco(localizacaoMapa.nome)
    setEnderecoConfirmado(localizacaoMapa.nome)
    setCoordenadas({ latitude: localizacaoMapa.lat, longitude: localizacaoMapa.lng })
    setMensagemGeocode(
      `Local do Mapa selecionado · ${localizacaoMapa.lat.toFixed(5)}, ${localizacaoMapa.lng.toFixed(5)}`,
    )
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
        tipoEvento: tipoEvento.trim(),
        objetivos: objetivos.trim(),
        responsavel: agenteAtual,
        inicioEm: new Date().toISOString(),
      }
      const criado = await onCriarEvento(input)
      onSelecionarEvento(criado.id)
      setEventoNome('')
      setEventoDescricao('')
      setTipoEvento('')
      setObjetivos('')
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
      const local = coordenadas
      if (!local) {
        setMensagemGeocode('Selecione e confirme um endereço encontrado antes de registrar.')
        return
      }
      const input: NovoChamadoPaeInput = {
        eventoId: eventoSelecionadoId,
        acionadoPor: agenteAtual,
        endereco: enderecoConfirmado,
        referencia: referencia.trim(),
        bairro: bairro.trim(),
        municipio: municipio.trim(),
        latitude: local.latitude,
        longitude: local.longitude,
        tipoRisco: tipoRisco.trim(),
        cobrade: '',
        canalEntrada,
        descricao: descricaoChamado.trim(),
        prioridade,
        justificativaPrioridade: '',
        agentesEnvolvidos: [],
      }
      const criado = await onCriarChamado(input)
      onSelecionarChamado(criado)
      setModoFormulario(null)
    } catch (error) {
      setErroLocal(error instanceof Error ? error.message : 'Não foi possível registrar o chamado.')
    } finally {
      setEnviando(false)
    }
  }

  const triarChamado = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!chamadoAtivo) return
    setErroLocal('')
    setEnviando(true)
    try {
      const atualizado = await onTriarChamado(chamadoAtivo.id, {
        agente: agenteAtual,
        prioridade: prioridadeTriagem,
        justificativa: justificativaTriagem.trim(),
        cobrade: cobrade.trim(),
      })
      setChamadoEmAtendimento(atualizado)
    } catch (error) {
      setErroLocal(error instanceof Error ? error.message : 'Não foi possível registrar a triagem.')
    } finally {
      setEnviando(false)
    }
  }

  const designarEquipe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!chamadoAtivo || agentesDesignacao.length === 0) return
    setErroLocal('')
    setEnviando(true)
    try {
      await onDesignarChamado(chamadoAtivo, agentesDesignacao)
      setChamadoEmAtendimento(null)
    } catch (error) {
      setErroLocal(error instanceof Error ? error.message : 'Não foi possível designar a equipe.')
    } finally {
      setEnviando(false)
    }
  }

  const responderDesignacao = async (aceitar: boolean) => {
    if (!chamadoAtivo?.atribuicao) return
    setErroLocal('')
    setEnviando(true)
    try {
      await onResponderAtribuicao(
        chamadoAtivo,
        chamadoAtivo.atribuicao,
        aceitar,
        motivoRecusa.trim(),
      )
      setMotivoRecusa('')
      setChamadoEmAtendimento(null)
    } catch (error) {
      setErroLocal(error instanceof Error ? error.message : 'Não foi possível responder à designação.')
    } finally {
      setEnviando(false)
    }
  }

  const solicitarReforco = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!chamadoAtivo?.atribuicao || !motivoReforco.trim()) return
    setErroLocal('')
    setEnviando(true)
    try {
      await onSolicitarReforco(chamadoAtivo, chamadoAtivo.atribuicao, motivoReforco.trim())
      setMotivoReforco('')
      setChamadoEmAtendimento(null)
    } catch (error) {
      setErroLocal(error instanceof Error ? error.message : 'Não foi possível solicitar o reforço.')
    } finally {
      setEnviando(false)
    }
  }

  const atenderPedidoReforco = async () => {
    if (!chamadoAtivo?.atribuicao || agentesReforco.length === 0) return
    setErroLocal('')
    setEnviando(true)
    try {
      await onAtenderReforco(chamadoAtivo, chamadoAtivo.atribuicao, agentesReforco)
      setAgentesReforco([])
      setChamadoEmAtendimento(null)
    } catch (error) {
      setErroLocal(error instanceof Error ? error.message : 'Não foi possível designar o reforço.')
    } finally {
      setEnviando(false)
    }
  }

  const validarChamado = async () => {
    if (!chamadoAtivo) return
    setErroLocal('')
    setEnviando(true)
    try {
      const atualizado = await onValidarChamado(chamadoAtivo.id)
      setChamadoEmAtendimento(atualizado)
    } catch (error) {
      setErroLocal(error instanceof Error ? error.message : 'Não foi possível validar o chamado.')
    } finally {
      setEnviando(false)
    }
  }

  const atualizarEncerramento = async () => {
    if (!chamadoAtivo || !motivoEncerramento.trim()) return
    setErroLocal('')
    setEnviando(true)
    try {
      const atualizado = await onSuspenderCancelarChamado(
        chamadoAtivo.id, acaoEncerramento, motivoEncerramento.trim(),
      )
      setChamadoEmAtendimento(atualizado)
      setMotivoEncerramento('')
    } catch (error) {
      setErroLocal(error instanceof Error ? error.message : 'Não foi possível atualizar a situação do chamado.')
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
    if (!chamadoAtivo || chamadoAtivo.status !== 'triado') return
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

  const exportarRelatorioChamado = () => {
    if (!chamadoAtivo) return
    const pontoMapa = `https://www.openstreetmap.org/?mlat=${chamadoAtivo.latitude}&mlon=${chamadoAtivo.longitude}#map=17/${chamadoAtivo.latitude}/${chamadoAtivo.longitude}`
    const fotos = chamadoAtivo.atendimento?.fotos ?? []
    const corpo = `
      <h2>Evento</h2>
      <p><b>${escaparHtml(eventoAtivo?.nome || 'Evento')}</b> · ${escaparHtml(eventoAtivo?.tipoEvento || 'Tipo não informado')}</p>
      <p>${escaparHtml(eventoAtivo?.descricao || '')}</p>
      <h2>Chamado ${escaparHtml(chamadoAtivo.id.slice(0, 8).toUpperCase())}</h2>
      <div class="report-facts">
        <div><b>Situação</b>${escaparHtml(situacaoChamado(chamadoAtivo))}</div>
        <div><b>Prioridade</b>${escaparHtml(prioridadeLabel[chamadoAtivo.prioridade])}</div>
        <div><b>Tipo operacional</b>${escaparHtml(chamadoAtivo.tipoRisco)}</div>
        <div><b>COBRADE</b>${escaparHtml(chamadoAtivo.cobrade || 'Não informado')}</div>
        <div><b>Recebido em</b>${escaparHtml(dataHora(chamadoAtivo.criadoEm))}</div>
        <div><b>Acionado por</b>${escaparHtml(chamadoAtivo.acionadoPor)}</div>
        <div><b>Endereço</b>${escaparHtml(chamadoAtivo.endereco)}</div>
        <div><b>Bairro / município</b>${escaparHtml([chamadoAtivo.bairro, chamadoAtivo.municipio].filter(Boolean).join(' · ') || 'Não informado')}</div>
        <div><b>Coordenadas</b>${chamadoAtivo.latitude.toFixed(6)}, ${chamadoAtivo.longitude.toFixed(6)}</div>
        <div><b>Equipe</b>${escaparHtml(chamadoAtivo.agentesEnvolvidos.join(', ') || 'Sem equipe designada')}</div>
      </div>
      <p><b>Referência:</b> ${escaparHtml(chamadoAtivo.referencia || 'Não informada')}</p>
      <p><b>Descrição:</b> ${escaparHtml(chamadoAtivo.descricao)}</p>
      <p><b>Justificativa da triagem:</b> ${escaparHtml(chamadoAtivo.justificativaPrioridade || 'Não informada')}</p>
      <p><a href="${pontoMapa}">Abrir localização no OpenStreetMap</a></p>
      ${chamadoAtivo.atendimento ? `<h2>Atendimento em campo</h2>
        <p><b>Responsável:</b> ${escaparHtml(chamadoAtivo.atendimento.agente)} · ${escaparHtml(dataHora(chamadoAtivo.atendimento.concluidoEm))}</p>
        <p><b>Observações:</b> ${escaparHtml(chamadoAtivo.atendimento.observacao || 'Sem observações')}</p>
        <p><b>Relato:</b> ${escaparHtml(chamadoAtivo.atendimento.relato || 'Sem relato')}</p>
        <p><b>Materiais consumidos:</b> ${escaparHtml(chamadoAtivo.atendimento.materiaisGastos.map(item => `${item.nome} · ${item.quantidade} ${item.unidade}`).join(' / ') || 'Nenhum registrado')}</p>
        ${fotos.length ? `<h2>Registro fotográfico</h2><div class="report-photos">${fotos.map(foto => `<figure><img src="${escaparHtml(foto.dataUrl)}" alt="${escaparHtml(foto.legenda || 'Foto do atendimento')}" /><figcaption>${escaparHtml(foto.legenda || 'Sem legenda')} · ${escaparHtml(foto.agente)} · ${escaparHtml(dataHora(foto.criadoEm))}</figcaption></figure>`).join('')}</div>` : ''}` : '<h2>Atendimento em campo</h2><p>Ainda não há registro de conclusão em campo.</p>'}
      <h2>Histórico</h2>
      ${historico.length ? historico.map(item => `<p><b>${escaparHtml(dataHora(item.criadoEm))} · ${escaparHtml(item.acao)}</b> — ${escaparHtml(item.realizadoPor)}</p>`).join('') : '<p>Sem histórico disponível.</p>'}
      <p><b>Validação:</b> ${chamadoAtivo.validadoPor ? `${escaparHtml(chamadoAtivo.validadoPor)} · ${escaparHtml(dataHora(chamadoAtivo.validadoEm || ''))}` : 'Pendente'}</p>`
    if (!imprimirDocumentoPae(`Relatório do chamado ${chamadoAtivo.id.slice(0, 8).toUpperCase()}`, corpo)) {
      setErroLocal('O navegador bloqueou a janela do relatório. Permita pop-ups para imprimir ou salvar em PDF.')
    }
  }

  const exportarRelatorioEvento = () => {
    if (!eventoAtivo) return
    const totaisStatus = Object.entries(statusLabel)
      .map(([status, label]) => {
        const total = chamadosDoEvento.filter(chamado => chamado.status === status).length
        return total ? `<li>${escaparHtml(label)}: ${total}</li>` : ''
      }).filter(Boolean).join('')
    const totaisTipo = [...new Set(chamadosDoEvento.map(chamado => chamado.tipoRisco))]
      .map(tipo => `<li>${escaparHtml(tipo)}: ${chamadosDoEvento.filter(chamado => chamado.tipoRisco === tipo).length}</li>`).join('')
    const chamadas = [...chamadosDoEvento]
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
      .map(chamado => `<section class="report-call">
        <h2>${escaparHtml(chamado.tipoRisco)} · ${escaparHtml(chamado.id.slice(0, 8).toUpperCase())}</h2>
        <div class="report-facts">
          <div><b>Situação</b>${escaparHtml(situacaoChamado(chamado))}</div>
          <div><b>Prioridade</b>${escaparHtml(prioridadeLabel[chamado.prioridade])}</div>
          <div><b>Endereço</b>${escaparHtml(chamado.endereco)}</div>
          <div><b>Bairro</b>${escaparHtml(chamado.bairro || 'Não informado')}</div>
          <div><b>Recebido</b>${escaparHtml(dataHora(chamado.criadoEm))}</div>
          <div><b>Equipe</b>${escaparHtml(chamado.agentesEnvolvidos.join(', ') || 'Não designada')}</div>
        </div>
        <p>${escaparHtml(chamado.descricao)}</p>
      </section>`).join('')
    const linhaTempo = historico.map(item => `<p><b>${escaparHtml(dataHora(item.criadoEm))} · ${escaparHtml(item.acao)}</b> — ${escaparHtml(item.realizadoPor)}</p>`).join('')
    const corpo = `
      <h2>Dados da operação</h2>
      <div class="report-facts">
        <div><b>Tipo</b>${escaparHtml(eventoAtivo.tipoEvento || 'Não informado')}</div>
        <div><b>Responsável</b>${escaparHtml(eventoAtivo.responsavel || eventoAtivo.acionadoPor)}</div>
        <div><b>Abertura</b>${escaparHtml(dataHora(eventoAtivo.inicioEm || eventoAtivo.criadoEm))}</div>
        <div><b>Situação</b>${escaparHtml(eventoAtivo.status)}</div>
      </div>
      <p><b>Descrição:</b> ${escaparHtml(eventoAtivo.descricao || 'Não informada')}</p>
      <p><b>Objetivos operacionais:</b> ${escaparHtml(eventoAtivo.objetivos || 'Não informados')}</p>
      <h2>Resumo dos chamados (${chamadosDoEvento.length})</h2>
      <h3>Por situação</h3><ul>${totaisStatus || '<li>Sem chamados registrados</li>'}</ul>
      <h3>Por tipo operacional</h3><ul>${totaisTipo || '<li>Sem chamados registrados</li>'}</ul>
      <h2>Linha do tempo</h2>${linhaTempo || '<p>Sem registros de histórico.</p>'}
      <h2>Chamados e localizações</h2>${chamadas || '<p>Nenhum chamado registrado.</p>'}`
    if (!imprimirDocumentoPae(`Relatório consolidado — ${eventoAtivo.nome}`, corpo)) {
      setErroLocal('O navegador bloqueou a janela do relatório. Permita pop-ups para imprimir ou salvar em PDF.')
    }
  }

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
            <span className={`pae-gps-indicator pae-gps-indicator--${gpsStatus}`} role="status" data-testid="status-pae-gps">
              <i aria-hidden="true" />
              {gpsStatus === 'ativo' ? 'GPS ativo' : gpsStatus === 'aguardando' ? 'Localizando GPS' : gpsStatus === 'erro' ? 'GPS indisponível' : 'GPS desligado'}
            </span>
            {(gpsStatus === 'inativo' || gpsStatus === 'erro') && (
              <button className="pae-icon-button pae-gps-retry" type="button" onClick={onAtivarGps} data-testid="button-retry-pae-gps">
                Ativar GPS
              </button>
            )}
            {eventoAtivo && <button className="pae-icon-button pae-report-button" type="button" onClick={exportarRelatorioEvento} data-testid="button-report-event">PDF evento</button>}
            {chamadoAtivo && <button className="pae-icon-button pae-report-button" type="button" onClick={exportarRelatorioChamado} data-testid="button-report-call">PDF chamado</button>}
            <button className="pae-icon-button pae-signout-button" type="button" onClick={onSairPae} data-testid="button-signout-pae">Sair</button>
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
                    onClick={() => { onSelecionarEvento(evento.id); onSelecionarChamado(null); setModoFormulario(null) }}
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
                  <>
                    <div className="pae-call-filters">
                      <input
                        aria-label="Buscar chamados"
                        placeholder="Buscar tipo, endereço ou COBRADE"
                        value={filtroTexto}
                        onChange={event => setFiltroTexto(event.target.value)}
                        data-testid="input-filter-calls"
                      />
                      <select aria-label="Filtrar por situação" value={filtroStatus} onChange={event => setFiltroStatus(event.target.value)} data-testid="select-filter-call-status">
                        <option value="">Todas as situações</option>
                        {Object.entries(statusLabel).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
                      </select>
                      <select aria-label="Filtrar por prioridade" value={filtroPrioridade} onChange={event => setFiltroPrioridade(event.target.value)} data-testid="select-filter-call-priority">
                        <option value="">Todas as prioridades</option>
                        {Object.entries(prioridadeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    {chamadosFiltrados.length === 0
                      ? <div className="pae-empty-calls" data-testid="empty-filtered-calls">Nenhum chamado corresponde aos filtros.</div>
                      : <div className="pae-call-list" data-testid="list-calls">
                    {chamadosFiltrados.map(chamado => (
                      <button
                        key={chamado.id}
                        className={`pae-call-row ${chamadoSelecionadoId === chamado.id ? 'is-selected' : ''}`}
                        type="button"
                        onClick={() => { setModoFormulario(null); onSelecionarChamado(chamado) }}
                        data-testid={`button-select-call-${chamado.id}`}
                        aria-current={chamadoSelecionadoId === chamado.id ? 'true' : undefined}
                      >
                        <span className={`pae-priority-line priority-${chamado.prioridade}`} />
                        <span className="pae-call-copy"><strong>{chamado.tipoRisco}</strong><small>{chamado.endereco}</small><em>{situacaoChamado(chamado)}</em></span>
                        <span className={`pae-priority-tag priority-${chamado.prioridade}`}>{prioridadeLabel[chamado.prioridade]}</span>
                      </button>
                    ))}
                      </div>}
                  </>
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
                  <label>Tipo do evento<input list="pae-event-types" maxLength={120} value={tipoEvento} onChange={event => setTipoEvento(event.target.value)} placeholder="Escolha ou digite o tipo" data-testid="input-event-type" /><datalist id="pae-event-types">{TIPOS_EVENTO_PAE.map(tipo => <option key={tipo} value={tipo} />)}</datalist></label>
                  <label>Descrição<textarea rows={4} value={eventoDescricao} onChange={event => setEventoDescricao(event.target.value)} placeholder="Contexto inicial para as equipes em campo" data-testid="input-event-description" /></label>
                  <label>Objetivos operacionais<textarea rows={3} value={objetivos} onChange={event => setObjetivos(event.target.value)} placeholder="Prioridades e resultados esperados para a operação" data-testid="input-event-objectives" /></label>
                  <div className="pae-form-meta">ACIONADO POR <strong>{agenteAtual}</strong></div>
                  <div className="pae-form-actions"><button className="pae-secondary-button" type="button" onClick={() => setModoFormulario(null)} data-testid="button-cancel-event">Cancelar</button><button className="pae-primary-button" type="submit" disabled={salvarBloqueado || !eventoNome.trim()} data-testid="button-submit-event">{salvando || enviando ? 'Abrindo…' : 'Abrir evento'}</button></div>
                </form>
              </section>
            ) : modoFormulario === 'chamado' ? (
              <section className="pae-form-view">
                <div className="pae-detail-kicker">NOVO REGISTRO / CHAMADO DE RISCO</div>
                <h2>Registrar chamado</h2>
                <p className="pae-form-intro">Pesquise o endereço no Mapa e use o ponto selecionado para localizar o chamado. A prioridade final e o COBRADE serão confirmados na triagem.</p>
                <form onSubmit={criarChamado} className="pae-form">
                  <div className="pae-form-grid">
                    <label className="pae-span-two">Rua, número ou local<input required value={endereco} onChange={event => { setEndereco(event.target.value); invalidarEnderecoEncontrado() }} placeholder="Selecione pela busca do Mapa" data-testid="input-call-address" /></label>
                    <label>Bairro<input maxLength={120} value={bairro} onChange={event => { setBairro(event.target.value); invalidarEnderecoEncontrado() }} placeholder="Bairro" data-testid="input-call-neighborhood" /></label>
                    <label>Município<input maxLength={120} value={municipio} onChange={event => { setMunicipio(event.target.value); invalidarEnderecoEncontrado() }} data-testid="input-call-municipality" /></label>
                    <div className="pae-geocode-row pae-span-two">
                      <button className="pae-geocode-button" type="button" onClick={usarLocalizacaoMapa} disabled={!localizacaoMapa} data-testid="button-use-map-location">Usar local pesquisado no Mapa</button>
                      <span className={coordenadas ? 'pae-geocode-ok' : ''} role="status" data-testid="status-geocode">{mensagemGeocode || 'Pesquise o endereço na barra do Mapa e selecione um resultado.'}</span>
                      {!localizacaoMapa && <button className="pae-geocode-button" type="button" onClick={onFechar} data-testid="button-return-map-search">Voltar ao Mapa para pesquisar</button>}
                    </div>
                    <label>Tipo operacional<input list="pae-call-types" required value={tipoRisco} onChange={event => setTipoRisco(event.target.value)} placeholder="Escolha ou digite o tipo" data-testid="input-call-risk" /><datalist id="pae-call-types">{TIPOS_CHAMADO_PAE.map(tipo => <option key={tipo} value={tipo} />)}</datalist></label>
                    <label>Prioridade inicial<select value={prioridade} onChange={event => setPrioridade(event.target.value as NovoChamadoPaeInput['prioridade'])} data-testid="select-call-priority"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
                    <label>Canal de entrada<select value={canalEntrada} onChange={event => setCanalEntrada(event.target.value)} data-testid="select-call-channel"><option value="interno">Equipe interna</option><option value="telefone">Telefone</option><option value="radio">Rádio</option><option value="orgao_parceiro">Órgão parceiro</option><option value="outro">Outro</option></select></label>
                    <label className="pae-span-two">Ponto de referência<input maxLength={250} value={referencia} onChange={event => setReferencia(event.target.value)} placeholder="Referência próxima ao local" data-testid="input-call-reference" /></label>
                    <label className="pae-span-two">Descrição<textarea required rows={3} value={descricaoChamado} onChange={event => setDescricaoChamado(event.target.value)} placeholder="O que foi informado? Inclua sinais de risco e pessoas afetadas." data-testid="input-call-description" /></label>
                  </div>
                  <div className="pae-form-meta">EVENTO <strong>{eventoAtivo?.nome}</strong><span>A equipe será designada após a triagem.</span></div>
                  <div className="pae-form-actions"><button className="pae-secondary-button" type="button" onClick={() => setModoFormulario(null)} data-testid="button-cancel-call">Cancelar</button><button className="pae-primary-button" type="submit" disabled={salvarBloqueado || !coordenadas || !enderecoConfirmado || !tipoRisco.trim() || !descricaoChamado.trim()} data-testid="button-submit-call">{salvando || enviando ? 'Registrando…' : 'Registrar chamado'}</button></div>
                </form>
              </section>
            ) : chamadoAtivo ? (
              <section className="pae-call-detail" data-testid={`detail-call-${chamadoAtivo.id}`}>
                <div className="pae-detail-head">
                  <div>
                    <div className="pae-detail-kicker">CHAMADO / {chamadoAtivo.id.slice(0, 8).toUpperCase()}</div>
                    <h2>{chamadoAtivo.tipoRisco}</h2>
                  </div>
                  <span className={`pae-status-pill status-${chamadoAtivo.status}`}>{situacaoChamado(chamadoAtivo)}</span>
                </div>
                <div className="pae-call-address">
                  <span className="pae-pin" aria-hidden="true" />
                  <div><strong>{chamadoAtivo.endereco}</strong><small>{chamadoAtivo.latitude.toFixed(5)}, {chamadoAtivo.longitude.toFixed(5)}</small></div>
                  <button
                    className="pae-geocode-button"
                    type="button"
                    aria-pressed={ajusteChamadoId === chamadoAtivo.id}
                    onClick={() => onAjustarLocalizacao(ajusteChamadoId === chamadoAtivo.id ? null : chamadoAtivo.id)}
                    data-testid="button-adjust-call-location"
                  >
                    {ajusteChamadoId === chamadoAtivo.id ? 'Cancelar ajuste' : 'Ajustar no mapa'}
                  </button>
                </div>
                <div className="pae-facts">
                  <div><span>PRIORIDADE</span><strong className={`pae-fact-priority priority-${chamadoAtivo.prioridade}`}>{prioridadeLabel[chamadoAtivo.prioridade]}</strong></div>
                  <div><span>ACIONADO POR</span><strong>{chamadoAtivo.acionadoPor}</strong></div>
                  <div><span>ABERTO</span><strong>{dataHora(chamadoAtivo.criadoEm)}</strong></div>
                </div>
                <div className="pae-description-block">
                  <span className="pae-block-label">CLASSIFICAÇÃO E DESCRIÇÃO</span>
                  <p><b>Tipo operacional:</b> {chamadoAtivo.tipoRisco}{chamadoAtivo.cobrade ? ` · COBRADE: ${chamadoAtivo.cobrade}` : ''}</p>
                  {chamadoAtivo.canalEntrada && <p><b>Canal:</b> {chamadoAtivo.canalEntrada}</p>}
                  {chamadoAtivo.bairro && <p><b>Bairro:</b> {chamadoAtivo.bairro}</p>}
                  {chamadoAtivo.referencia && <p><b>Referência:</b> {chamadoAtivo.referencia}</p>}
                  {chamadoAtivo.justificativaPrioridade && <p><b>Justificativa da triagem:</b> {chamadoAtivo.justificativaPrioridade}</p>}
                  <p>{chamadoAtivo.descricao}</p>
                </div>
                <div className="pae-agents-block"><span className="pae-block-label">EQUIPE DESIGNADA <b>{chamadoAtivo.agentesEnvolvidos.length}</b></span>{chamadoAtivo.agentesEnvolvidos.length > 0 ? <div className="pae-agent-chips">{chamadoAtivo.agentesEnvolvidos.map((agente, index) => <span className={agente === agenteAtual ? 'is-current' : ''} key={`${agente}-${index}`} data-testid={`text-agent-${chamadoAtivo.id}-${index}`}><i>{agente.trim().charAt(0).toLocaleUpperCase()}</i>{agente}</span>)}</div> : <p className="pae-history-empty">Aguardando triagem e designação.</p>}</div>
                {chamadoAtivo.atendimento && (
                  <div className="pae-completed-record" data-testid="record-completed-call">
                    <div className="pae-record-heading"><span className="pae-block-label">REGISTRO DE CAMPO</span><strong>Concluído por {chamadoAtivo.atendimento.agente}</strong><small>{dataHora(chamadoAtivo.atendimento.concluidoEm)}</small></div>
                    {chamadoAtivo.atendimento.observacao && <div><b>Observações</b><p>{chamadoAtivo.atendimento.observacao}</p></div>}
                    {chamadoAtivo.atendimento.relato && <div><b>O que aconteceu</b><p>{chamadoAtivo.atendimento.relato}</p></div>}
                    {chamadoAtivo.atendimento.materiaisGastos.length > 0 && <div><b>Materiais consumidos</b><p>{chamadoAtivo.atendimento.materiaisGastos.map(item => `${item.nome} · ${item.quantidade} ${item.unidade}`).join(' / ')}</p></div>}
                    {chamadoAtivo.atendimento.fotos.length > 0 && <div className="pae-photo-grid">{chamadoAtivo.atendimento.fotos.map(foto => <figure key={foto.id}><img src={foto.dataUrl} alt={foto.legenda || 'Registro fotográfico do atendimento'} /><figcaption>{foto.legenda || foto.agente}</figcaption></figure>)}</div>}
                    {chamadoAtivo.status === 'concluido_em_campo' && (
                      <div className="pae-pending-validation">
                        <div><strong>Aguardando validação do responsável</strong><span>A conclusão de campo não encerra o chamado automaticamente.</span></div>
                        {podeValidar
                          ? <button className="pae-primary-button" type="button" onClick={() => void validarChamado()} disabled={salvarBloqueado} data-testid="button-validate-call">{enviando ? 'Validando…' : 'Validar e encerrar'}</button>
                          : <small>Validação reservada a {eventoAtivo?.responsavel || eventoAtivo?.acionadoPor}.</small>}
                      </div>
                    )}
                  </div>
                )}
                {chamadoAtivo.status === 'novo' && (
                  <form className="pae-triage-form" onSubmit={triarChamado} data-testid="form-triage-call">
                    <div className="pae-completion-title"><div><span className="pae-detail-kicker">TRIAGEM</span><h3>Classificar chamado</h3></div></div>
                    <p>Registre a avaliação técnica. O tipo operacional permanece separado da classificação COBRADE.</p>
                    <div className="pae-form-grid">
                      <label>Prioridade<select value={prioridadeTriagem} onChange={event => setPrioridadeTriagem(event.target.value as NovoChamadoPaeInput['prioridade'])} data-testid="select-triage-priority"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
                      <label>COBRADE <small className="pae-label-hint">Opcional</small><input maxLength={120} value={cobrade} onChange={event => setCobrade(event.target.value)} placeholder="Classificação oficial, se conhecida" data-testid="input-triage-cobrade" /></label>
                      <label className="pae-span-two">Justificativa da prioridade<textarea required rows={3} value={justificativaTriagem} onChange={event => setJustificativaTriagem(event.target.value)} placeholder="Explique os fatores que justificam a urgência atribuída." data-testid="input-triage-justification" /></label>
                    </div>
                    <div className="pae-form-actions"><button className="pae-primary-button" type="submit" disabled={salvarBloqueado || !justificativaTriagem.trim()} data-testid="button-submit-triage">{enviando ? 'Salvando…' : 'Registrar triagem'}</button></div>
                  </form>
                )}
                {podeDesignar && (
                  <form className="pae-assignment-form" onSubmit={designarEquipe} data-testid="form-pae-assignment">
                    <div className="pae-completion-title">
                      <div><span className="pae-detail-kicker">DESPACHO</span><h3>{chamadoAtivo.atribuicao ? 'Designar ou substituir equipe' : 'Designar equipe'}</h3></div>
                    </div>
                    <p>O responsável pelo evento designa a equipe. Um dos agentes selecionados precisa aceitar a missão no PAE.</p>
                    <div className="pae-agent-options">
                      {AGENTES.map(agente => (
                        <label className={`pae-agent-option ${agentesDesignacao.includes(agente) ? 'is-selected' : ''}`} key={agente}>
                          <input
                            type="checkbox"
                            checked={agentesDesignacao.includes(agente)}
                            onChange={event => setAgentesDesignacao(atuais => atualizarSelecaoAgente(atuais, agente, event.target.checked))}
                            aria-label={`Designar ${agente}`}
                            data-testid={`checkbox-dispatch-agent-${agente.toLowerCase()}`}
                          />
                          <span className="pae-agent-check" aria-hidden="true" />
                          <span>{agente}{agente === agenteAtual ? <small>Você</small> : null}</span>
                        </label>
                      ))}
                    </div>
                    <div className="pae-form-actions">
                      <button className="pae-primary-button" type="submit" disabled={salvarBloqueado || agentesDesignacao.length === 0} data-testid="button-dispatch-assignment">
                        {enviando ? 'Enviando…' : chamadoAtivo.atribuicao ? 'Salvar nova equipe' : 'Designar equipe'}
                      </button>
                    </div>
                  </form>
                )}
                {podeResponderAtribuicao && chamadoAtivo.atribuicao && (
                  <section className="pae-assignment-response" data-testid="panel-assignment-response">
                    <div>
                      <span className="pae-detail-kicker">MISSÃO RECEBIDA</span>
                      <h3>Aceitar ou recusar</h3>
                      <p>A designação só fica confirmada depois da resposta de um agente da equipe.</p>
                    </div>
                    <label>Motivo da recusa <small className="pae-label-hint">Obrigatório para recusar</small>
                      <textarea rows={2} value={motivoRecusa} onChange={event => setMotivoRecusa(event.target.value)} placeholder="Explique por que a equipe não pode assumir esta missão." data-testid="input-assignment-refusal-reason" />
                    </label>
                    <div className="pae-form-actions">
                      <button className="pae-secondary-button" type="button" onClick={() => void responderDesignacao(false)} disabled={salvarBloqueado || !motivoRecusa.trim()} data-testid="button-refuse-assignment">{enviando ? 'Salvando…' : 'Recusar missão'}</button>
                      <button className="pae-primary-button" type="button" onClick={() => void responderDesignacao(true)} disabled={salvarBloqueado} data-testid="button-accept-assignment">{enviando ? 'Salvando…' : 'Aceitar missão'}</button>
                    </div>
                  </section>
                )}
                {chamadoAtivo.atribuicao?.status === 'aceita' && (
                  <div className="pae-assignment-status" role="status" data-testid="status-assignment-accepted">
                    <strong>Missão aceita por {chamadoAtivo.atribuicao.aceitoPor || 'equipe designada'}</strong>
                    <span>{chamadoAtivo.atribuicao.reforcoStatus === 'atendido'
                      ? `Reforço confirmado: ${chamadoAtivo.atribuicao.reforcoAgentes.join(', ')}.`
                      : 'A equipe pode solicitar reforço se precisar de apoio.'}</span>
                  </div>
                )}
                {chamadoAtivo.atribuicao?.status === 'aceita'
                  && chamadoAtivo.atribuicao.reforcoStatus === 'solicitado'
                  && podeDesignar && (
                    <section className="pae-reinforcement-panel" data-testid="panel-pae-reinforcement-request">
                      <div>
                        <span className="pae-detail-kicker">PEDIDO DE APOIO</span>
                        <h3>Reforço solicitado</h3>
                        <p>{chamadoAtivo.atribuicao.reforcoMotivo}</p>
                        <small>Solicitado por {chamadoAtivo.atribuicao.reforcoSolicitadoPor || 'equipe'}</small>
                      </div>
                      <div className="pae-agent-options">
                        {AGENTES.filter(agente => !chamadoAtivo.atribuicao?.agentesDesignados.includes(agente)).map(agente => (
                          <label className={`pae-agent-option ${agentesReforco.includes(agente) ? 'is-selected' : ''}`} key={agente}>
                            <input
                              type="checkbox"
                              checked={agentesReforco.includes(agente)}
                              onChange={event => setAgentesReforco(atuais => atualizarSelecaoAgente(atuais, agente, event.target.checked))}
                              aria-label={`Adicionar ${agente} ao reforço`}
                              data-testid={`checkbox-reinforcement-agent-${agente.toLowerCase()}`}
                            />
                            <span className="pae-agent-check" aria-hidden="true" />
                            <span>{agente}</span>
                          </label>
                        ))}
                      </div>
                      <button className="pae-primary-button" type="button" onClick={() => void atenderPedidoReforco()} disabled={salvarBloqueado || agentesReforco.length === 0} data-testid="button-approve-reinforcement">
                        {enviando ? 'Salvando…' : 'Designar reforço'}
                      </button>
                    </section>
                  )}
                {podeAtender
                  && chamadoAtivo.atribuicao?.status === 'aceita'
                  && chamadoAtivo.atribuicao.reforcoStatus !== 'solicitado'
                  && (
                    <form className="pae-reinforcement-form" onSubmit={solicitarReforco} data-testid="form-pae-request-reinforcement">
                      <label>Solicitar reforço <small className="pae-label-hint">Informe o apoio necessário à coordenação.</small>
                        <textarea rows={2} value={motivoReforco} onChange={event => setMotivoReforco(event.target.value)} placeholder="Ex.: apoio de mais agentes, ferramenta ou órgão parceiro." data-testid="input-reinforcement-reason" />
                      </label>
                      <button className="pae-secondary-button" type="submit" disabled={salvarBloqueado || !motivoReforco.trim()} data-testid="button-request-reinforcement">Solicitar apoio</button>
                    </form>
                  )}
                {chamadoAtivo.atribuicao?.reforcoStatus === 'solicitado'
                  && !podeDesignar
                  && podeAtender && (
                    <div className="pae-assignment-status" role="status" data-testid="status-reinforcement-pending">
                      <strong>Pedido de reforço enviado</strong>
                      <span>A coordenação do evento ainda precisa responder.</span>
                    </div>
                  )}
                {chamadoAtivo.status === 'triado' && (
                  podeAtender
                    ? <div className="pae-start-attendance"><div><strong>Triagem concluída</strong><span>Confirme o início da ação em campo para a equipe acionada.</span></div><button className="pae-secondary-button" type="button" onClick={() => void iniciarAtendimento()} disabled={salvarBloqueado} data-testid="button-start-call">{enviando ? 'Iniciando…' : 'Iniciar atendimento'}</button></div>
                    : !podeResponderAtribuicao && <div className="pae-permission-note" data-testid="status-agent-not-selected"><strong>Atendimento reservado à equipe que aceitar a missão</strong><p>{chamadoAtivo.atribuicao?.status === 'designada' ? 'Aguardando resposta de um agente da equipe designada.' : 'A coordenação ainda precisa designar uma equipe para este chamado.'}</p></div>
                )}
                {chamadoAtivo.status === 'em_atendimento' && (
                  podeAtender ? (
                    <form className="pae-completion-form" onSubmit={concluirChamado}>
                      <div className="pae-completion-title"><div><span className="pae-detail-kicker">AÇÃO DE CAMPO</span><h3>Concluir em campo</h3></div><span>RESPONSÁVEL <b>{agenteAtual}</b></span></div>
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
                      <div className="pae-completion-footer"><p>O responsável pelo evento ainda precisará validar o encerramento.</p><button className="pae-primary-button pae-finish-button" type="submit" disabled={salvarBloqueado || !relato.trim()} data-testid="button-complete-call">{enviando ? 'Salvando registro…' : 'Concluir em campo'}</button></div>
                    </form>
                  ) : <div className="pae-permission-note" data-testid="status-agent-not-selected"><strong>Atendimento reservado à equipe acionada</strong><p>Seu nome não está entre os agentes selecionados para este chamado.</p></div>
                )}
                {['validado', 'suspenso', 'cancelado'].includes(chamadoAtivo.status) && !chamadoAtivo.atendimento && (
                  <div className="pae-completed-record"><p>{chamadoAtivo.status === 'validado' ? 'Este chamado foi validado e encerrado.' : `Chamado ${statusLabel[chamadoAtivo.status].toLocaleLowerCase('pt-BR')}.`}</p>{chamadoAtivo.motivoSuspensaoCancelamento && <p>Motivo: {chamadoAtivo.motivoSuspensaoCancelamento}</p>}</div>
                )}
                {!['validado', 'suspenso', 'cancelado'].includes(chamadoAtivo.status) && (
                  <div className="pae-cancel-form">
                    <label>Situação de encerramento<select value={acaoEncerramento} onChange={event => setAcaoEncerramento(event.target.value as 'suspenso' | 'cancelado')} data-testid="select-call-close-status"><option value="suspenso">Suspender chamado</option><option value="cancelado">Cancelar chamado</option></select></label>
                    <label>Motivo<textarea rows={2} value={motivoEncerramento} onChange={event => setMotivoEncerramento(event.target.value)} placeholder="Justifique a suspensão ou o cancelamento." data-testid="input-call-close-reason" /></label>
                    <button className="pae-secondary-button" type="button" onClick={() => void atualizarEncerramento()} disabled={salvarBloqueado || !motivoEncerramento.trim()} data-testid="button-close-call">{enviando ? 'Salvando…' : acaoEncerramento === 'cancelado' ? 'Cancelar chamado' : 'Suspender chamado'}</button>
                  </div>
                )}
                {ajusteChamadoId === chamadoAtivo.id && <div className="pae-location-hint" role="status">Arraste o marcador do chamado no mapa para corrigir a posição. A alteração ficará registrada no histórico.</div>}
                <section className="pae-history" aria-label="Histórico do chamado" data-testid="call-history">
                  <div className="pae-record-heading"><span className="pae-block-label">LINHA DO TEMPO</span>{historicoCarregando && <small>Atualizando…</small>}</div>
                  {historico.filter(item => item.chamadoId === chamadoAtivo.id).length === 0
                    ? <p className="pae-history-empty">Nenhum marco registrado.</p>
                    : <ol>{historico.filter(item => item.chamadoId === chamadoAtivo.id).map(item => {
                      const detalhes = item.detalhes
                      const resumo = [
                        detalhes.prioridade ? `Prioridade ${String(detalhes.prioridade)}` : '',
                        detalhes.motivo ? String(detalhes.motivo) : '',
                        detalhes.justificativa ? String(detalhes.justificativa) : '',
                        Array.isArray(detalhes.agentes) ? `Agentes: ${(detalhes.agentes as unknown[]).join(', ')}` : '',
                        Array.isArray(detalhes.agentes_adicionados) ? `Reforço: ${(detalhes.agentes_adicionados as unknown[]).join(', ')}` : '',
                      ].filter(Boolean).join(' · ')
                      return <li key={item.id}><div><strong>{item.acao.replaceAll('_', ' ')}</strong><small>{dataHora(item.criadoEm)} · {item.realizadoPor}</small>{resumo && <p>{resumo}</p>}</div></li>
                    })}</ol>}
                </section>
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
