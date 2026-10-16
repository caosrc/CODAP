const cache = new Map()
const TTL_MS = 10 * 60 * 1000

function resposta(statusCode, body, cacheControl = 'no-store') {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cacheControl },
    body: JSON.stringify(body),
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return resposta(405, { erro: 'Método não permitido.' })
  }

  let entrada
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : event.body || '{}'
    entrada = JSON.parse(body)
  } catch {
    return resposta(400, { erro: 'Corpo da requisição inválido.' })
  }

  const areas = Array.isArray(entrada?.areas) ? entrada.areas : []
  if (areas.length < 1 || areas.length > 50) {
    return resposta(400, { erro: 'Envie de 1 a 50 áreas para consultar a previsão.' })
  }

  const areasValidas = areas.map(area => ({
    id: String(area?.id ?? '').trim(),
    latitude: Number(area?.latitude),
    longitude: Number(area?.longitude),
  }))
  if (areasValidas.some(area =>
    !area.id ||
    !Number.isFinite(area.latitude) || area.latitude < -90 || area.latitude > 90 ||
    !Number.isFinite(area.longitude) || area.longitude < -180 || area.longitude > 180,
  )) {
    return resposta(400, { erro: 'Uma ou mais áreas têm coordenadas inválidas.' })
  }

  const chave = areasValidas
    .map(area => `${area.id}:${area.latitude.toFixed(3)}:${area.longitude.toFixed(3)}`)
    .join('|')
  const salvo = cache.get(chave)
  if (salvo && Date.now() - salvo.ts < TTL_MS) {
    return resposta(200, {
      previsoes: salvo.previsoes,
      atualizadoEm: new Date(salvo.ts).toISOString(),
      cache: true,
    }, 'public, max-age=300, stale-while-revalidate=600')
  }

  try {
    const params = new URLSearchParams({
      latitude: areasValidas.map(area => area.latitude.toFixed(4)).join(','),
      longitude: areasValidas.map(area => area.longitude.toFixed(4)).join(','),
      timezone: 'America/Sao_Paulo',
      forecast_days: '2',
      precipitation_unit: 'mm',
      hourly: 'precipitation',
    })
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`Open-Meteo: ${response.status}`)

    const body = await response.json()
    const previsoes = areasValidas.map((area, index) => {
      const ponto = Array.isArray(body) ? body[index] : body
      const chuva = ponto?.hourly?.precipitation
      const total = Array.isArray(chuva)
        ? chuva.slice(0, 24).reduce((soma, valor) =>
          soma + (Number.isFinite(Number(valor)) ? Math.max(0, Number(valor)) : 0), 0)
        : null
      return { id: area.id, precipitacao_24h_mm: total }
    })
    const ts = Date.now()
    cache.set(chave, { previsoes, ts })
    if (cache.size > 100) {
      const chaveAntiga = cache.keys().next().value
      if (chaveAntiga) cache.delete(chaveAntiga)
    }
    return resposta(200, { previsoes, atualizadoEm: new Date(ts).toISOString(), cache: false }, 'public, max-age=300, stale-while-revalidate=600')
  } catch (error) {
    console.error('Erro na previsão para áreas de risco:', error?.message || error)
    if (salvo) {
      return resposta(200, {
        previsoes: salvo.previsoes,
        atualizadoEm: new Date(salvo.ts).toISOString(),
        cache: true,
        erroAtualizacao: true,
      }, 'public, max-age=300, stale-while-revalidate=600')
    }
    return resposta(503, { erro: 'Previsão de precipitação para as áreas de risco indisponível.' })
  }
}
