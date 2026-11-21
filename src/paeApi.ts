import { supabase, supabaseDisponivel } from './supabaseClient'
import { wsSend } from './wsClient'
import type {
  ConcluirChamadoPaeInput,
  NovoChamadoPaeInput,
  NovoEventoPaeInput,
  PaeHistorico,
  PaeAtendimento,
  PaeChamado,
  PaeEvento,
  PaeFoto,
  PaeMaterialGasto,
  PaePrioridade,
  PaeStatus,
  PaeUsuarioAutorizado,
  TriarChamadoPaeInput,
} from './paeTypes'

type Linha = Record<string, unknown>

function lista<T>(valor: unknown): T[] {
  if (Array.isArray(valor)) return valor as T[]
  if (typeof valor === 'string') {
    try {
      const parsed = JSON.parse(valor)
      return Array.isArray(parsed) ? parsed as T[] : []
    } catch {
      return []
    }
  }
  return []
}

function texto(valor: unknown): string {
  return valor == null ? '' : String(valor)
}

function numero(valor: unknown, fallback = 0): number {
  const parsed = Number(valor)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function tokenPae(): Promise<string> {
  if (!supabaseDisponivel) {
    throw new Error('O PAE exige Supabase Auth configurado para validar o acesso interno.')
  }
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error('Não foi possível verificar sua sessão do PAE.')
  const token = data.session?.access_token
  if (!token) throw new Error('Entre com sua conta Supabase para acessar o PAE.')
  return token
}

async function fetchPae(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await tokenPae()
  return fetch(input, {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init.headers).entries()),
      Authorization: `Bearer ${token}`,
    },
  })
}

async function perfilAutorizadoPae(userId: string): Promise<PaeUsuarioAutorizado | null> {
  const { data, error } = await supabase
    .from('pae_usuarios_autorizados')
    .select('agente')
    .eq('usuario_id', userId)
    .eq('ativo', true)
    .maybeSingle()
  if (error) {
    throw new Error('Não foi possível validar o acesso ao PAE. Confirme se a migração de acesso interno foi aplicada.')
  }
  const agente = typeof data?.agente === 'string' ? data.agente.trim() : ''
  return agente ? { userId, agente } : null
}

export async function obterAcessoPaeAtual(): Promise<PaeUsuarioAutorizado | null> {
  if (!supabaseDisponivel) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error('Não foi possível verificar sua sessão do PAE.')
  const userId = data.session?.user?.id
  if (!userId) return null
  try {
    const perfil = await perfilAutorizadoPae(userId)
    if (perfil) return perfil
  } catch (erro) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    throw erro
  }
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  return null
}

export async function autenticarPae(email: string, password: string): Promise<PaeUsuarioAutorizado> {
  if (!supabaseDisponivel) {
    throw new Error('O acesso ao PAE exige Supabase configurado. Contate a coordenação do sistema.')
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error || !data.user) {
    throw new Error('Não foi possível entrar. Confira o e-mail e a senha cadastrados no Supabase Auth.')
  }
  try {
    const perfil = await perfilAutorizadoPae(data.user.id)
    if (!perfil) {
      await supabase.auth.signOut({ scope: 'local' })
      throw new Error('Esta conta não está autorizada para o PAE. Solicite acesso à coordenação.')
    }
    return perfil
  } catch (erro) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    throw erro
  }
}

export async function sairPae(): Promise<void> {
  if (!supabaseDisponivel) return
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw new Error('Não foi possível encerrar a sessão do PAE.')
}

function normalizarEvento(row: Linha): PaeEvento {
  const status = texto(row.status)
  return {
    id: texto(row.id),
    nome: texto(row.nome),
    acionadoPor: texto(row.acionado_por ?? row.acionadoPor),
    descricao: texto(row.descricao),
    tipoEvento: texto(row.tipo_evento ?? row.tipoEvento),
    objetivos: texto(row.objetivos),
    responsavel: texto(row.responsavel) || texto(row.acionado_por ?? row.acionadoPor),
    inicioEm: row.inicio_em == null && row.inicioEm == null
      ? null
      : texto(row.inicio_em ?? row.inicioEm),
    status: status === 'encerrado' ? 'encerrado' : 'ativo',
    criadoEm: texto(row.criado_em ?? row.criadoEm),
    atualizadoEm: texto(row.atualizado_em ?? row.atualizadoEm ?? row.criado_em),
  }
}

function normalizarHistorico(row: Linha): PaeHistorico {
  const detalhes = row.detalhes && typeof row.detalhes === 'object' && !Array.isArray(row.detalhes)
    ? row.detalhes as Record<string, unknown>
    : {}
  return {
    id: texto(row.id),
    eventoId: texto(row.evento_id ?? row.eventoId),
    chamadoId: row.chamado_id == null && row.chamadoId == null
      ? null
      : texto(row.chamado_id ?? row.chamadoId),
    acao: texto(row.acao),
    detalhes,
    realizadoPor: texto(row.realizado_por ?? row.realizadoPor),
    criadoEm: texto(row.criado_em ?? row.criadoEm),
  }
}

function normalizarFoto(row: Linha): PaeFoto {
  return {
    id: texto(row.id),
    dataUrl: texto(row.data_url ?? row.dataUrl),
    legenda: texto(row.legenda),
    agente: texto(row.agente),
    criadoEm: texto(row.criado_em ?? row.criadoEm),
    latitude: row.latitude == null ? null : numero(row.latitude),
    longitude: row.longitude == null ? null : numero(row.longitude),
  }
}

function normalizarAtendimento(row: Linha | null | undefined, fotosIniciais: unknown[] = []): PaeAtendimento | null {
  if (!row) return null
  const id = texto(row.id ?? row.atendimento_id)
  if (!id) return null
  const materiais = lista<Linha>(row.materiais_gastos ?? row.materiaisGastos ?? row.atendimento_materiais_gastos)
    .map(item => ({
      nome: texto(item.nome),
      quantidade: numero(item.quantidade),
      unidade: texto(item.unidade) || 'un.',
    }))
    .filter(item => item.nome && item.quantidade > 0)
  const fotos = lista<Linha>(row.fotos ?? row.atendimento_fotos ?? fotosIniciais).map(normalizarFoto)
  return {
    id,
    chamadoId: texto(row.chamado_id ?? row.chamadoId),
    agente: texto(row.agente ?? row.atendimento_agente),
    observacao: texto(row.observacao ?? row.atendimento_observacao),
    relato: texto(row.relato ?? row.atendimento_relato),
    materiaisGastos: materiais,
    fotos,
    concluidoEm: texto(row.concluido_em ?? row.concluidoEm ?? row.atendimento_concluido_em),
  }
}

function normalizarChamado(row: Linha): PaeChamado {
  const atendimentoRow = row.atendimento && typeof row.atendimento === 'object'
    ? row.atendimento as Linha
    : row.atendimento_id
      ? row
      : null
  const statusBruto = texto(row.status)
  const status = statusBruto === 'concluido'
    ? 'validado'
    : ['novo', 'triado', 'em_atendimento', 'concluido_em_campo', 'validado', 'suspenso', 'cancelado'].includes(statusBruto)
      ? statusBruto
      : 'novo'
  return {
    id: texto(row.id),
    eventoId: texto(row.evento_id ?? row.eventoId),
    acionadoPor: texto(row.acionado_por ?? row.acionadoPor),
    endereco: texto(row.endereco),
    referencia: texto(row.referencia),
    bairro: texto(row.bairro),
    municipio: texto(row.municipio),
    latitude: numero(row.latitude),
    longitude: numero(row.longitude),
    tipoRisco: texto(row.tipo_risco ?? row.tipoRisco),
    cobrade: texto(row.cobrade),
    canalEntrada: texto(row.canal_entrada ?? row.canalEntrada) || 'interno',
    descricao: texto(row.descricao),
    prioridade: (['baixa', 'media', 'alta', 'critica'].includes(texto(row.prioridade))
      ? texto(row.prioridade)
      : 'media') as PaePrioridade,
    justificativaPrioridade: texto(row.justificativa_prioridade ?? row.justificativaPrioridade),
    triadoPor: row.triado_por == null ? null : texto(row.triado_por),
    triadoEm: row.triado_em == null ? null : texto(row.triado_em),
    validadoPor: row.validado_por == null ? null : texto(row.validado_por),
    validadoEm: row.validado_em == null ? null : texto(row.validado_em),
    motivoSuspensaoCancelamento: texto(row.motivo_suspensao_cancelamento),
    status: status as PaeStatus,
    agentesEnvolvidos: lista<unknown>(row.agentes_envolvidos ?? row.agentesEnvolvidos).map(String),
    criadoEm: texto(row.criado_em ?? row.criadoEm),
    atualizadoEm: texto(row.atualizado_em ?? row.atualizadoEm ?? row.criado_em),
    atendimento: normalizarAtendimento(atendimentoRow, lista(row.atendimento_fotos)),
  }
}

async function respostaJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('O servidor do PAE não respondeu em JSON. Confira se a aplicação está atualizada.')
  }
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body?.error || 'Não foi possível concluir a operação do PAE.')
  return body
}

async function rpc<T>(funcao: string, parametros: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(funcao, parametros)
  if (error) throw new Error(error.message || `Falha na operação ${funcao}.`)
  return data as T
}

function emitirAtualizacao(_chamadoId?: string, _eventoId?: string) {
  wsSend({
    tipo: 'pae_atualizado',
    id: crypto.randomUUID(),
  })
}

function enviarPushPae(
  tipo: 'novo_chamado' | 'chamado_concluido',
  chamado: PaeChamado,
  remetente: string,
) {
  const body = {
    tipo,
    chamadoId: chamado.id,
    agentes: chamado.agentesEnvolvidos,
    remetente,
    tipoRisco: chamado.tipoRisco,
    endereco: chamado.endereco,
    agente: chamado.atendimento?.agente || '',
  }
  void fetchPae('/api/push/pae', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async response => {
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string }
      console.warn('[PAE] Push não enviado:', result.error || response.status)
    }
  }).catch(() => {
    // O broadcast e o polling mantêm as atualizações dentro do app; push depende do servidor.
  })
}

function notificarNovoChamado(chamado: PaeChamado, _evento: PaeEvento) {
  emitirAtualizacao()
  enviarPushPae('novo_chamado', chamado, chamado.acionadoPor)
}

function notificarConclusao(chamado: PaeChamado, agente: string) {
  emitirAtualizacao()
  enviarPushPae('chamado_concluido', chamado, agente)
}

export async function listarPae(): Promise<{ eventos: PaeEvento[]; chamados: PaeChamado[] }> {
  if (!supabaseDisponivel) {
    const response = await fetchPae('/api/pae')
    const data = await respostaJson<{ eventos: Linha[]; chamados: Linha[] }>(response)
    return {
      eventos: data.eventos.map(normalizarEvento),
      chamados: data.chamados.map(normalizarChamado),
    }
  }

  const [eventosResult, chamadosResult] = await Promise.all([
    supabase.from('pae_eventos').select('*').order('criado_em', { ascending: false }),
    supabase.from('pae_chamados').select('*').order('criado_em', { ascending: false }),
  ])
  if (eventosResult.error) throw new Error(eventosResult.error.message)
  if (chamadosResult.error) throw new Error(chamadosResult.error.message)
  const chamadosRaw = (chamadosResult.data || []) as Linha[]
  const idsChamados = chamadosRaw.map(row => texto(row.id)).filter(Boolean)
  if (idsChamados.length === 0) {
    return { eventos: (eventosResult.data || []).map(normalizarEvento), chamados: [] }
  }

  const atendimentosResult = await supabase.from('pae_atendimentos').select('*').in('chamado_id', idsChamados)
  if (atendimentosResult.error) throw new Error(atendimentosResult.error.message)
  const atendimentosRaw = (atendimentosResult.data || []) as Linha[]
  const atendimentoIds = atendimentosRaw.map(row => texto(row.id)).filter(Boolean)
  let fotosRaw: Linha[] = []
  if (atendimentoIds.length > 0) {
    const fotosResult = await supabase.from('pae_fotos').select('*').in('atendimento_id', atendimentoIds)
    if (fotosResult.error) throw new Error(fotosResult.error.message)
    fotosRaw = (fotosResult.data || []) as Linha[]
  }
  const fotosPorAtendimento = new Map<string, PaeFoto[]>()
  fotosRaw.forEach(row => {
    const atendimentoId = texto(row.atendimento_id)
    const fotos = fotosPorAtendimento.get(atendimentoId) || []
    fotos.push(normalizarFoto(row))
    fotosPorAtendimento.set(atendimentoId, fotos)
  })
  const atendimentoPorChamado = new Map<string, Linha>()
  atendimentosRaw.forEach(row => atendimentoPorChamado.set(texto(row.chamado_id), row))

  return {
    eventos: (eventosResult.data || []).map(normalizarEvento),
    chamados: chamadosRaw.map(row => {
      const atendimento = atendimentoPorChamado.get(texto(row.id))
      return {
        ...normalizarChamado(row),
        atendimento: atendimento
          ? normalizarAtendimento({
            ...atendimento,
            fotos: fotosPorAtendimento.get(texto(atendimento.id)) || [],
          })
          : null,
      }
    }),
  }
}

export async function listarHistoricoPae(eventoId: string, chamadoId?: string): Promise<PaeHistorico[]> {
  if (!supabaseDisponivel) {
    const params = new URLSearchParams()
    if (chamadoId) params.set('chamado_id', chamadoId)
    const queryString = params.toString()
    const response = await fetchPae(
      `/api/pae/eventos/${encodeURIComponent(eventoId)}/historico${queryString ? `?${queryString}` : ''}`,
    )
    const rows = await respostaJson<Linha[]>(response)
    return rows.map(normalizarHistorico)
  }

  let query = supabase.from('pae_historico')
    .select('*')
    .eq('evento_id', eventoId)
    .order('criado_em', { ascending: true })
  if (chamadoId) query = query.eq('chamado_id', chamadoId)
  const result = await query
  if (result.error) throw new Error(result.error.message)
  return ((result.data || []) as Linha[]).map(normalizarHistorico)
}

export async function criarEventoPae(input: NovoEventoPaeInput): Promise<PaeEvento> {
  const id = crypto.randomUUID()
  let row: Linha
  if (supabaseDisponivel) {
    row = await rpc<Linha>('pae_criar_evento_detalhado', {
      p_id: id,
      p_nome: input.nome,
      p_acionado_por: input.acionadoPor,
      p_descricao: input.descricao,
      p_tipo_evento: input.tipoEvento || '',
      p_objetivos: input.objetivos || '',
      p_responsavel: input.responsavel || input.acionadoPor,
      p_inicio_em: input.inicioEm || new Date().toISOString(),
    })
  } else {
    const response = await fetchPae('/api/pae/eventos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id, nome: input.nome, acionado_por: input.acionadoPor, descricao: input.descricao,
        tipo_evento: input.tipoEvento || '', objetivos: input.objetivos || '',
        responsavel: input.responsavel || input.acionadoPor,
        inicio_em: input.inicioEm || new Date().toISOString(),
      }),
    })
    row = await respostaJson<Linha>(response)
  }
  const evento = normalizarEvento(row)
  emitirAtualizacao(undefined, evento.id)
  return evento
}

export async function criarChamadoPae(input: NovoChamadoPaeInput): Promise<PaeChamado> {
  const id = crypto.randomUUID()
  let row: Linha
  if (supabaseDisponivel) {
    row = await rpc<Linha>('pae_criar_chamado_detalhado', {
      p_id: id,
      p_evento_id: input.eventoId,
      p_acionado_por: input.acionadoPor,
      p_endereco: input.endereco,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_tipo_risco: input.tipoRisco,
      p_cobrade: input.cobrade || '',
      p_canal_entrada: input.canalEntrada || 'interno',
      p_referencia: input.referencia || '',
      p_bairro: input.bairro || '',
      p_municipio: input.municipio || '',
      p_descricao: input.descricao,
      p_prioridade: input.prioridade,
      p_justificativa_prioridade: input.justificativaPrioridade || '',
      p_agentes_envolvidos: input.agentesEnvolvidos,
    })
  } else {
    const response = await fetchPae('/api/pae/chamados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        evento_id: input.eventoId,
        acionado_por: input.acionadoPor,
        endereco: input.endereco,
        latitude: input.latitude,
        longitude: input.longitude,
        tipo_risco: input.tipoRisco,
        cobrade: input.cobrade || '',
        canal_entrada: input.canalEntrada || 'interno',
        referencia: input.referencia || '',
        bairro: input.bairro || '',
        municipio: input.municipio || '',
        descricao: input.descricao,
        prioridade: input.prioridade,
        justificativa_prioridade: input.justificativaPrioridade || '',
        agentes_envolvidos: input.agentesEnvolvidos,
      }),
    })
    row = await respostaJson<Linha>(response)
  }
  const chamado = normalizarChamado(row)
  const { eventos } = await listarPae()
  const evento = eventos.find(item => item.id === chamado.eventoId)
  if (evento) notificarNovoChamado(chamado, evento)
  else emitirAtualizacao(chamado.id, chamado.eventoId)
  return chamado
}

export async function triarChamadoPae(chamadoId: string, input: TriarChamadoPaeInput): Promise<PaeChamado> {
  let row: Linha
  if (supabaseDisponivel) {
    row = await rpc<Linha>('pae_triar_chamado', {
      p_chamado_id: chamadoId,
      p_agente: input.agente,
      p_prioridade: input.prioridade,
      p_justificativa: input.justificativa,
      p_cobrade: input.cobrade || '',
    })
  } else {
    const response = await fetchPae(`/api/pae/chamados/${encodeURIComponent(chamadoId)}/triagem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    row = await respostaJson<Linha>(response)
  }
  const chamado = normalizarChamado(row)
  emitirAtualizacao(chamado.id, chamado.eventoId)
  return chamado
}

export async function atualizarLocalizacaoChamadoPae(
  chamadoId: string,
  latitude: number,
  longitude: number,
  realizadoPor: string,
): Promise<PaeChamado> {
  let row: Linha
  if (supabaseDisponivel) {
    row = await rpc<Linha>('pae_atualizar_localizacao', {
      p_chamado_id: chamadoId,
      p_latitude: latitude,
      p_longitude: longitude,
      p_realizado_por: realizadoPor,
    })
  } else {
    const response = await fetchPae(`/api/pae/chamados/${encodeURIComponent(chamadoId)}/localizacao`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude, longitude, realizadoPor }),
    })
    row = await respostaJson<Linha>(response)
  }
  const chamado = normalizarChamado(row)
  emitirAtualizacao(chamado.id, chamado.eventoId)
  return chamado
}

export async function validarChamadoPae(chamadoId: string, agente: string): Promise<PaeChamado> {
  let row: Linha
  if (supabaseDisponivel) {
    row = await rpc<Linha>('pae_validar_chamado', {
      p_chamado_id: chamadoId,
      p_validado_por: agente,
    })
  } else {
    const response = await fetchPae(`/api/pae/chamados/${encodeURIComponent(chamadoId)}/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agente }),
    })
    row = await respostaJson<Linha>(response)
  }
  const chamado = normalizarChamado(row)
  emitirAtualizacao(chamado.id, chamado.eventoId)
  return chamado
}

export async function suspenderCancelarChamadoPae(
  chamadoId: string,
  status: 'suspenso' | 'cancelado',
  motivo: string,
  agente: string,
): Promise<PaeChamado> {
  let row: Linha
  if (supabaseDisponivel) {
    row = await rpc<Linha>('pae_suspender_cancelar_chamado', {
      p_chamado_id: chamadoId,
      p_status: status,
      p_motivo: motivo,
      p_realizado_por: agente,
    })
  } else {
    const response = await fetchPae(`/api/pae/chamados/${encodeURIComponent(chamadoId)}/suspender-cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, motivo, agente }),
    })
    row = await respostaJson<Linha>(response)
  }
  const chamado = normalizarChamado(row)
  emitirAtualizacao(chamado.id, chamado.eventoId)
  return chamado
}

export async function iniciarChamadoPae(chamadoId: string, agente: string): Promise<PaeChamado> {
  if (!supabaseDisponivel) {
    const response = await fetchPae(`/api/pae/chamados/${encodeURIComponent(chamadoId)}/iniciar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agente }),
    })
    const row = await respostaJson<Linha>(response)
    const chamado = normalizarChamado(row)
    emitirAtualizacao(chamado.id, chamado.eventoId)
    return chamado
  }
  const row = await rpc<Linha>('pae_iniciar_chamado', {
    p_chamado_id: chamadoId,
    p_agente: agente,
  })
  const chamado = normalizarChamado(row)
  emitirAtualizacao(chamado.id, chamado.eventoId)
  return chamado
}

export async function concluirChamadoPae(
  chamadoId: string,
  input: ConcluirChamadoPaeInput,
): Promise<PaeChamado> {
  let row: Linha
  if (supabaseDisponivel) {
    await rpc('pae_concluir_chamado', {
      p_chamado_id: chamadoId,
      p_agente: input.agente,
      p_observacao: input.observacao,
      p_relato: input.relato,
      p_materiais_gastos: input.materiaisGastos,
      p_fotos: input.fotos,
    })
    const dados = await listarPae()
    const chamado = dados.chamados.find(item => item.id === chamadoId)
    if (!chamado) throw new Error('O chamado foi concluído, mas não retornou na atualização do PAE.')
    notificarConclusao(chamado, input.agente)
    return chamado
  }

  const response = await fetchPae(`/api/pae/chamados/${encodeURIComponent(chamadoId)}/concluir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agente: input.agente,
      observacao: input.observacao,
      relato: input.relato,
      materiais_gastos: input.materiaisGastos,
      fotos: input.fotos,
    }),
  })
  row = await respostaJson<Linha>(response)
  const chamado = normalizarChamado(row)
  notificarConclusao(chamado, input.agente)
  return chamado
}
