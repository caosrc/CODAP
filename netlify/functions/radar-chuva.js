let radarChuvaCache = null
let radarChuvaCacheTs = 0
const RADAR_CHUVA_TTL_MS = 60 * 1000
const RADAR_CHUVA_CACHE_CONTROL = 'public, max-age=60, s-maxage=120, stale-while-revalidate=300'

function resposta(statusCode, body, cacheControl = RADAR_CHUVA_CACHE_CONTROL) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
    },
    body: JSON.stringify(body),
  }
}

export const handler = async () => {
  const agora = Date.now()
  if (radarChuvaCache && (agora - radarChuvaCacheTs) < RADAR_CHUVA_TTL_MS) {
    return resposta(200, { ...radarChuvaCache, cache: true })
  }

  try {
    const response = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`RainViewer: ${response.status}`)
    const dados = await response.json()
    const host = typeof dados?.host === 'string' ? dados.host.replace(/\/$/, '') : ''
    const valido = quadro => Number.isFinite(Number(quadro?.time)) &&
      typeof quadro?.path === 'string' && quadro.path.startsWith('/v2/')
    const observados = (dados?.radar?.past || []).filter(valido)
    const ultimo = observados.reduce((maisRecente, quadro) => (
      !maisRecente || Number(quadro.time) > Number(maisRecente.time) ? quadro : maisRecente
    ), null)
    if (!host || !ultimo) throw new Error('RainViewer não retornou quadros de radar')
    const tileUrl = `${host}${ultimo.path}/256/{z}/{x}/{y}/2/1_0.png`
    radarChuvaCache = {
      host,
      path: ultimo.path,
      tileUrl,
      frameTime: Number(ultimo.time),
      atualizadoEm: new Date(Number(ultimo.time) * 1000).toISOString(),
      fonte: 'RainViewer',
      tipoQuadro: 'observado',
    }
    radarChuvaCacheTs = agora
    return resposta(200, radarChuvaCache)
  } catch (error) {
    if (radarChuvaCache) {
      return resposta(200, { ...radarChuvaCache, cache: true, erroAtualizacao: true })
    }
    return resposta(503, { erro: 'Radar de chuva indisponível', detalhe: error?.message }, 'no-store')
  }
}