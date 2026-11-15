const REDEMET_API = 'https://api-redemet.decea.mil.br/produtos'
const REDMET_IMAGE_HOST = 'estatico-redemet.decea.mil.br'
const CACHE_TTL_MS = 90 * 1000
const CACHE_CONTROL = 'public, max-age=60, s-maxage=90, stale-while-revalidate=240'
const cache = new Map()

const TIPOS_RADAR = new Set(['maxcappi', '10km', '07km', '05km', '03km'])

function resposta(statusCode, body, cacheControl = CACHE_CONTROL) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
    },
    body: JSON.stringify(body),
  }
}

function numeroValido(valor) {
  if (valor == null || valor === '') return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function urlImagemSegura(valor) {
  if (typeof valor !== 'string') return null
  try {
    const url = new URL(valor)
    return url.protocol === 'https:' && url.hostname === REDMET_IMAGE_HOST
      ? url.toString()
      : null
  } catch {
    return null
  }
}

function normalizarRadar(dados) {
  const registros = Array.isArray(dados?.data?.radar)
    ? dados.data.radar.flat(2)
    : []
  return registros.flatMap(registro => {
    const url = urlImagemSegura(registro?.path)
    const sul = numeroValido(registro?.lat_min)
    const oeste = numeroValido(registro?.lon_min)
    const norte = numeroValido(registro?.lat_max)
    const leste = numeroValido(registro?.lon_max)
    if (!url || sul == null || oeste == null || norte == null || leste == null ||
      sul >= norte || oeste >= leste) return []
    return [{
      id: `${registro.localidade || 'radar'}-${registro.data || url}`,
      nome: String(registro.nome || 'Radar REDEMET'),
      localidade: String(registro.localidade || ''),
      bounds: [[sul, oeste], [norte, leste]],
      url,
      atualizadoEm: typeof registro.data === 'string' ? registro.data : null,
      raioKm: numeroValido(registro.raio),
    }]
  })
}

function normalizarSatelite(dados) {
  const registros = Array.isArray(dados?.data?.satelite) ? dados.data.satelite : []
  const box = dados?.data?.lat_lon
  const sul = numeroValido(box?.lat_min)
  const oeste = numeroValido(box?.lon_min)
  const norte = numeroValido(box?.lat_max)
  const leste = numeroValido(box?.lon_max)
  if (sul == null || oeste == null || norte == null || leste == null ||
    sul >= norte || oeste >= leste) return []
  return registros.flatMap((registro, indice) => {
    const url = urlImagemSegura(registro?.path)
    if (!url) return []
    return [{
      id: `ir-${registro.data || indice}`,
      nome: 'REDEMET · Satélite IR',
      bounds: [[sul, oeste], [norte, leste]],
      url,
      atualizadoEm: typeof registro.data === 'string' ? registro.data : null,
    }]
  })
}

function normalizarStsc(dados) {
  const quadros = Array.isArray(dados?.data?.stsc) ? dados.data.stsc : []
  const quadroAtual = quadros.at(-1)
  if (!Array.isArray(quadroAtual)) return []
  return quadroAtual.flatMap((ponto, indice) => {
    const latitude = numeroValido(ponto?.la)
    const longitude = numeroValido(ponto?.lo)
    if (latitude == null || longitude == null || latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180) return []
    return [{
      id: `${latitude}-${longitude}-${indice}`,
      latitude,
      longitude,
    }]
  })
}

async function buscarProduto(produto, tipo, apiKey) {
  const url = new URL(`${REDEMET_API}/${produto}${produto === 'radar' ? `/${tipo}` : produto === 'satelite' ? '/ir' : ''}`)
  url.searchParams.set('api_key', apiKey)
  if (produto === 'radar') {
    url.searchParams.set('area', 'pc')
    url.searchParams.set('anima', '1')
  } else if (produto === 'stsc') {
    url.searchParams.set('anima', '1')
  } else {
    url.searchParams.set('anima', '1')
  }

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`HTTP_${response.status}`)
  const body = await response.json()
  if (body?.status !== true) throw new Error('UPSTREAM_UNAVAILABLE')

  const now = new Date().toISOString()
  if (produto === 'radar') {
    const imagens = normalizarRadar(body)
    if (!imagens.length) throw new Error('NO_RADAR_IMAGE')
    return { disponivel: true, produto, tipo, fonte: 'REDEMET · DECEA', imagens, consultadoEm: now }
  }
  if (produto === 'satelite') {
    const imagens = normalizarSatelite(body)
    if (!imagens.length) throw new Error('NO_SATELLITE_IMAGE')
    return { disponivel: true, produto, tipo: 'ir', fonte: 'REDEMET · DECEA', imagens, consultadoEm: now }
  }
  const pontos = normalizarStsc(body)
  return {
    disponivel: true,
    produto,
    fonte: 'REDEMET · DECEA',
    pontos,
    horarioQuadro: Array.isArray(body?.data?.anima) ? body.data.anima.at(-1) || null : null,
    consultadoEm: now,
  }
}

export const handler = async (event = {}) => {
  const params = event.queryStringParameters || {}
  const produto = String(params.produto || '').toLowerCase()
  const tipo = String(params.tipo || 'maxcappi').toLowerCase()

  if (!['radar', 'stsc', 'satelite'].includes(produto) ||
    (produto === 'radar' && !TIPOS_RADAR.has(tipo))) {
    return resposta(400, { erro: 'Produto REDEMET inválido.' }, 'no-store')
  }

  const apiKey = process.env.REDEMET_API_KEY
  if (!apiKey) {
    return resposta(503, {
      configurada: false,
      erro: 'Configure REDEMET_API_KEY nas Secrets do servidor para ativar esta fonte.',
    }, 'no-store')
  }

  const chaveCache = `${produto}:${produto === 'radar' ? tipo : ''}`
  const atual = cache.get(chaveCache)
  const agora = Date.now()
  if (atual && agora - atual.salvoEm < CACHE_TTL_MS) {
    return resposta(200, { ...atual.dados, cache: true })
  }

  try {
    const dados = await buscarProduto(produto, tipo, apiKey)
    cache.set(chaveCache, { dados, salvoEm: agora })
    return resposta(200, dados)
  } catch (error) {
    const status = String(error?.message || '').match(/^HTTP_(\d+)$/)?.[1]
    if (status === '429') {
      return resposta(503, { erro: 'Limite temporário da API REDEMET atingido. Tente novamente mais tarde.' }, 'no-store')
    }
    return resposta(502, { erro: 'A API REDEMET não retornou um produto válido nesta consulta.' }, 'no-store')
  }
}
