const CODIGO_IBGE_CONSELHEIRO_LAFAIETE = '3118304'
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_HEADER = 'public, max-age=300, stale-while-revalidate=600'

let cache = null
let cacheTs = 0

function resposta(statusCode, body, cacheControl = CACHE_HEADER) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
    },
    body: JSON.stringify(body),
  }
}

function tituloAlerta(alerta) {
  const codigo = Number(alerta?.id_condicao_severa)
  if (codigo === 45) return 'Onda de calor'
  if (codigo === 38) return 'Tempestade'
  if ([23, 24, 25, 26, 27].includes(codigo)) return 'Chuva intensa'
  return 'Aviso meteorológico'
}

function nivelAlerta(alerta) {
  const codigo = Number(alerta?.id_condicao_severa)
  if (codigo === 45) return 'vermelho'
  if ([38, 23, 24, 25, 26, 27].includes(codigo)) return 'amarelo'
  return 'informativo'
}

function normalizarAlertas(payload) {
  const itens = Object.values(payload || {})
    .flat()
    .filter(item => item && typeof item === 'object')
  const chaves = new Set()

  return itens
    .filter(item => {
      const municipios = String(item.municipios || '')
      return municipios.includes(CODIGO_IBGE_CONSELHEIRO_LAFAIETE)
        || /Conselheiro Lafaiete/i.test(municipios)
    })
    .map(item => {
      const id = Number(item.id ?? item.id_aviso)
      const condicao = Number(item.id_condicao_severa) || null
      const inicio = item.data_inicio && item.hora_inicio
        ? `${String(item.data_inicio).slice(0, 10)}T${item.hora_inicio}:00-03:00`
        : item.data_inicio || null
      const fim = item.data_fim && item.hora_fim
        ? `${String(item.data_fim).slice(0, 10)}T${item.hora_fim}:00-03:00`
        : item.data_fim || null
      const chave = `${id}|${condicao}|${inicio}|${fim}`
      if (!Number.isFinite(id) || chaves.has(chave)) return null
      chaves.add(chave)

      return {
        id,
        codigo: String(item.codigo || ''),
        titulo: tituloAlerta(item),
        nivel: nivelAlerta(item),
        condicao,
        inicio,
        fim,
        horaInicio: item.hora_inicio || null,
        horaFim: item.hora_fim || null,
        municipios: String(item.municipios || ''),
        fonte: 'INMET',
        url: item.id ? `https://avisos.inmet.gov.br/${item.id}` : 'https://avisos.inmet.gov.br/',
      }
    })
    .filter(Boolean)
}

export const handler = async () => {
  const agora = Date.now()
  if (cache && agora - cacheTs < CACHE_TTL_MS) {
    return resposta(200, { ...cache, cache: true })
  }

  try {
    const upstream = await fetch('https://apiprevmet3.inmet.gov.br/avisos/ativos', {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CODAP/1.0 (Conselheiro Lafaiete, MG)',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!upstream.ok) throw new Error(`INMET: ${upstream.status}`)

    const payload = await upstream.json()
    if (!payload || typeof payload !== 'object') {
      throw new Error('Resposta inválida do INMET')
    }

    cache = {
      local: 'Conselheiro Lafaiete - MG',
      atualizadoEm: new Date().toISOString(),
      alertas: normalizarAlertas(payload),
      fonte: 'INMET',
    }
    cacheTs = Date.now()
    return resposta(200, cache)
  } catch (error) {
    console.error('Erro ao buscar alertas do INMET:', error?.message || error)
    if (cache) {
      return resposta(200, { ...cache, cache: true, erroAtualizacao: true })
    }
    return resposta(503, {
      local: 'Conselheiro Lafaiete - MG',
      alertas: [],
      erro: 'Alertas do INMET indisponíveis',
      detalhe: error?.message || 'Falha ao consultar o serviço do INMET',
      fonte: 'INMET',
    }, 'no-store')
  }
}