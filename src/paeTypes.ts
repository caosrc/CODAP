export type PaeStatus =
  | 'novo'
  | 'triado'
  | 'em_atendimento'
  | 'concluido_em_campo'
  | 'validado'
  | 'suspenso'
  | 'cancelado'
export type PaePrioridade = 'baixa' | 'media' | 'alta' | 'critica'

export interface PaeUsuarioAutorizado {
  userId: string
  agente: string
}

export interface PaeEvento {
  id: string
  nome: string
  acionadoPor: string
  descricao: string
  tipoEvento?: string
  objetivos?: string
  responsavel?: string
  inicioEm?: string | null
  status: 'ativo' | 'encerrado'
  criadoEm: string
  atualizadoEm: string
}

export interface PaeHistorico {
  id: string
  eventoId: string
  chamadoId: string | null
  acao: string
  detalhes: Record<string, unknown>
  realizadoPor: string
  criadoEm: string
}

export interface PaeMaterialGasto {
  nome: string
  quantidade: number
  unidade: string
}

export interface PaeFoto {
  id: string
  dataUrl: string
  legenda: string
  agente: string
  criadoEm: string
  latitude: number | null
  longitude: number | null
}

export interface PaeAtendimento {
  id: string
  chamadoId: string
  agente: string
  observacao: string
  relato: string
  materiaisGastos: PaeMaterialGasto[]
  fotos: PaeFoto[]
  concluidoEm: string
}

export interface PaeChamado {
  id: string
  eventoId: string
  acionadoPor: string
  endereco: string
  referencia?: string
  bairro?: string
  municipio?: string
  latitude: number
  longitude: number
  tipoRisco: string
  cobrade?: string
  canalEntrada?: string
  descricao: string
  prioridade: PaePrioridade
  justificativaPrioridade?: string
  triadoPor?: string | null
  triadoEm?: string | null
  validadoPor?: string | null
  validadoEm?: string | null
  motivoSuspensaoCancelamento?: string
  status: PaeStatus
  agentesEnvolvidos: string[]
  criadoEm: string
  atualizadoEm: string
  atendimento: PaeAtendimento | null
}

export interface NovoEventoPaeInput {
  nome: string
  acionadoPor: string
  descricao: string
  tipoEvento?: string
  objetivos?: string
  responsavel?: string
  inicioEm?: string | null
}

export interface NovoChamadoPaeInput {
  eventoId: string
  acionadoPor: string
  endereco: string
  referencia?: string
  bairro?: string
  municipio?: string
  latitude: number
  longitude: number
  tipoRisco: string
  cobrade?: string
  canalEntrada?: string
  descricao: string
  prioridade: PaePrioridade
  justificativaPrioridade?: string
  agentesEnvolvidos: string[]
}

export interface TriarChamadoPaeInput {
  agente: string
  prioridade: PaePrioridade
  justificativa: string
  cobrade?: string
}

export interface ConcluirChamadoPaeInput {
  agente: string
  observacao: string
  relato: string
  materiaisGastos: PaeMaterialGasto[]
  fotos: Array<{
    dataUrl: string
    legenda: string
    latitude: number | null
    longitude: number | null
  }>
}
