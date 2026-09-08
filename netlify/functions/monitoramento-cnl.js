const CATALOGO = 'https://resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=MG'
const RECURSOS = 'https://mapservices.cemaden.gov.br/MapaInterativoWS/resources'
const NIVEL = 'https://resources.cemaden.gov.br/graficos/cemaden/hidro/resources/json/MedidaResource.php?est=6622&sen=20&pag=24'
const FONTE = 'https://resources.cemaden.gov.br/graficos/interativo/grafico_CEMADEN.php?idpcd=6622&uf=MG'
const CNL_ID = 6622
const COTAS_PADRAO = { atencao: 2.55, alerta: 3.4, transbordamento: 4.25 }

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' },
  body: JSON.stringify(body),
})
const number = value => value == null || value === '-' || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null)

function configurarSupabase() {
  const url = String(process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const key = String(process.env.VITE_SUPABASE_ANON_KEY || '')
  if (!url || !key) return null
  return { endpoint: `${url}/rest/v1/monitoramento_cnl_cotas`, headers: { apikey: key, Authorization: `Bearer ${key}` } }
}

async function buscarCotas() {
  const supabase = configurarSupabase()
  if (!supabase) return { cotas: COTAS_PADRAO, configuradas: false }
  try {
    const response = await fetch(`${supabase.endpoint}?id=eq.1&select=atencao,alerta,transbordamento`, { headers: supabase.headers, signal: AbortSignal.timeout(8000) })
    if (!response.ok) return { cotas: COTAS_PADRAO, configuradas: false }
    const row = (await response.json())?.[0]
    const cotas = { atencao: number(row?.atencao), alerta: number(row?.alerta), transbordamento: number(row?.transbordamento) }
    const validas = Object.values(cotas).every(value => value != null) && cotas.atencao < cotas.alerta && cotas.alerta < cotas.transbordamento
    return validas ? { cotas, configuradas: true } : { cotas: COTAS_PADRAO, configuradas: false }
  } catch { return { cotas: COTAS_PADRAO, configuradas: false } }
}

function extrairSerie(payload) {
  const datas = Array.isArray(payload?.datas) ? payload.datas : []
  const horarios = Array.isArray(payload?.horarios) ? payload.horarios : []
  const pontos = []
  ;(payload?.acumulados || []).forEach((linha, dataIndex) => {
    if (!Array.isArray(linha)) return
    linha.forEach((valor, hourIndex) => {
      const n = number(valor)
      if (n != null && datas[dataIndex] && horarios[hourIndex]) {
        pontos.push({ data: datas[dataIndex], hora: horarios[hourIndex], valor: n })
      }
    })
  })
  return pontos
}

function diaria(serie) {
  const porDia = new Map()
  for (const ponto of serie) {
    const match = String(ponto.data).match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    const chave = match ? `${match[3]}-${match[2]}-${match[1]}` : ponto.data
    const atual = porDia.get(chave) || { data: chave, total: 0, pontos: 0, ultimaDataHora: '' }
    atual.total = Number((atual.total + ponto.valor).toFixed(2))
    atual.pontos += 1
    atual.ultimaDataHora = `${ponto.data} ${ponto.hora}`
    porDia.set(chave, atual)
  }
  return [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data))
}

function normalizar(item, payload) {
  const serie = extrairSerie(payload)
  const ultimo = serie.at(-1)
  return {
    id: Number(item.idestacao),
    uf: String(item.uf || 'MG'),
    cidade: String(item.cidade || 'CONSELHEIRO LAFAIETE'),
    nome: String(item.nomeestacao || ''),
    codigo: String(item.codEstacao || ''),
    ultimoValor: number(item.ultimovalor),
    dataHora: String(item.datahoraUltimovalor || ''),
    precipitacaoAtual: number(item.acc1hr) ?? ultimo?.valor ?? null,
    precipitacaoDataHora: String(item.datahoraUltimovalor || ''),
    precipitacaoDiaria: diaria(serie),
    acumulados: {
      umaHora: number(item.acc1hr),
      seisHoras: number(item.acc6hr),
      dozeHoras: number(item.acc12hr),
      vinteQuatroHoras: number(item.acc24hr),
      quarentaEOitoHoras: number(item.acc48hr),
      setentaEDuasHoras: number(item.acc72hr),
      noventaESeisHoras: number(item.acc96hr),
    },
  }
}

export const handler = async () => {
  try {
    const [catalogoResponse, nivelResponse, cotasSalvas] = await Promise.all([
      fetch(CATALOGO, { signal: AbortSignal.timeout(15000) }),
      fetch(NIVEL, { signal: AbortSignal.timeout(15000) }),
      buscarCotas(),
    ])
    if (!catalogoResponse.ok || !nivelResponse.ok) throw new Error('CEMADEN indisponível')
    const [catalogo, medidas] = await Promise.all([catalogoResponse.json(), nivelResponse.json()])
    const principalRaw = Array.isArray(catalogo) ? catalogo.find(row => Number(row?.idestacao) === CNL_ID) : null
    if (!principalRaw) throw new Error('Estação Rio Bananeiras não encontrada')
    const estacoesCatalogo = catalogo.filter(row => Number(row?.codibge) === Number(principalRaw.codibge))
    const chuva = await Promise.allSettled(estacoesCatalogo.map(async item => {
      const id = Number(item.idestacao)
      const response = await fetch(`${RECURSOS}/horario/${id}/96`, { signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new Error(`estação ${id} respondeu ${response.status}`)
      return { id, payload: await response.json() }
    }))
    const payloadPorId = new Map()
    chuva.forEach(result => { if (result.status === 'fulfilled') payloadPorId.set(result.value.id, result.value.payload) })
    const principalPayload = payloadPorId.get(CNL_ID) || {}
    const estacoes = estacoesCatalogo.map(item => normalizar(item, payloadPorId.get(Number(item.idestacao)) || {})).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    const estacaoHorario = principalPayload.estacao || {}
    const nivelSerie = (Array.isArray(medidas) ? medidas : []).map(medida => {
      const offset = number(medida?.offset)
      const bruto = number(medida?.valor)
      return { dataHora: String(medida?.datahora || ''), valor: offset != null && bruto != null ? Number((offset - bruto).toFixed(2)) : null }
    }).filter(item => item.valor != null)
    const nivelAtual = nivelSerie.at(-1) || null
    const cotasOficiais = {
      atencao: number(estacaoHorario.cotaAtencao) ?? COTAS_PADRAO.atencao,
      alerta: number(estacaoHorario.cotaAlerta) ?? COTAS_PADRAO.alerta,
      transbordamento: number(estacaoHorario.cotaTransbordamento) ?? COTAS_PADRAO.transbordamento,
    }
    const principal = normalizar(principalRaw, principalPayload)
    const estacao = {
      ...principal,
      ultimoValor: nivelAtual?.valor ?? principal.ultimoValor,
      dataHora: nivelAtual?.dataHora || principal.dataHora,
      latitude: number(estacaoHorario.latitude),
      longitude: number(estacaoHorario.longitude),
      tipo: String(estacaoHorario.idTipoestacao?.descricao || 'Hidrológica'),
      status: String(estacaoHorario.status || 'UNKNOWN'),
      cotas: cotasSalvas.configuradas ? cotasSalvas.cotas : cotasOficiais,
    }
    return json(200, {
      sucesso: true,
      estacao,
      estacoes,
      serie: extrairSerie(principalPayload).slice(-24),
      nivelAtual,
      serieNivel: nivelSerie.slice(-24),
      cotasConfiguradas: cotasSalvas.configuradas,
      atualizadoEm: new Date().toISOString(),
      fonte: FONTE,
    })
  } catch (error) {
    return json(503, { sucesso: false, erro: 'Não foi possível consultar o monitoramento do CEMADEN.', detalhe: error?.message })
  }
}