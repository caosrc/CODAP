export type PaeStatus = 'novo' | 'em_atendimento' | 'concluido' | 'cancelado'
export type PaePrioridade = 'baixa' | 'media' | 'alta' | 'critica'

export interface PaeEvento {
  id: string
  nome: string
  acionadoPor: string
  descricao: string
  status: 'ativo' | 'encerrado'
  criadoEm: string
  atualizadoEm: string
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
  latitude: number
  longitude: number
  tipoRisco: string
  descricao: string
  prioridade: PaePrioridade
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
}

export interface NovoChamadoPaeInput {
  eventoId: string
  acionadoPor: string
  endereco: string
  latitude: number
  longitude: number
  tipoRisco: string
  descricao: string
  prioridade: PaePrioridade
  agentesEnvolvidos: string[]
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
