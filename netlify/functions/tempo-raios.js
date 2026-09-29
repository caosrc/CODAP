const LAT = -20.6604
const LNG = -43.7863
const MODELOS = [
  { id: 'ecmwf_ifs025', nome: 'ECMWF IFS' },
  { id: 'gfs_seamless', nome: 'GFS Global' },
  { id: 'icon_seamless', nome: 'DWD ICON Global' },
]

function resposta(statusCode, body, cache = 'public, max-age=300, stale-while-revalidate=600') {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cache },
    body: JSON.stringify(body),
  }
}

function riscoTrovoada(consenso) {
  if (consenso >= 2) return 'alto'
  if (consenso > 0) return 'atenção'
  return 'baixo'
}

export const handler = async () => {
  try {
    const params = new URLSearchParams({
      latitude: String(LAT),
      longitude: String(LNG),
      timezone: 'America/Sao_Paulo',
      forecast_days: '2',
      models: MODELOS.map(modelo => modelo.id).join(','),
      hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m',
      wind_speed_unit: 'kmh',
      precipitation_unit: 'mm',
    })
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`Open-Meteo raios: ${response.status}`)
    const json = await response.json()
    const hourly = json.hourly || {}
    if (!Array.isArray(hourly.time)) throw new Error('Resposta de raios inválida da Open-Meteo')

    const modelos = MODELOS.map(modelo => {
      const sufixo = `_${modelo.id}`
      const horas = hourly.time.map((time, index) => ({
        time,
        temperatura: hourly[`temperature_2m${sufixo}`]?.[index] ?? null,
        umidade: hourly[`relative_humidity_2m${sufixo}`]?.[index] ?? null,
        probabilidadeChuva: hourly[`precipitation_probability${sufixo}`]?.[index] ?? null,
        precipitacao: hourly[`precipitation${sufixo}`]?.[index] ?? null,
        chuva: hourly[`rain${sufixo}`]?.[index] ?? null,
        codigoTempo: hourly[`weather_code${sufixo}`]?.[index] ?? null,
        vento: hourly[`wind_speed_10m${sufixo}`]?.[index] ?? null,
        rajada: hourly[`wind_gusts_10m${sufixo}`]?.[index] ?? null,
      }))
      const trovoadas = horas.filter(item => Number(item.codigoTempo) >= 95)
      return {
        id: modelo.id,
        nome: modelo.nome,
        horas: horas.slice(0, 36),
        primeiraTrovoada: trovoadas[0]?.time || null,
        maiorCodigo: trovoadas.reduce((maior, item) => Math.max(maior, Number(item.codigoTempo) || 0), 0),
      }
    })

    const tamanho = Math.min(...modelos.map(modelo => modelo.horas.length))
    const consenso = Array.from({ length: tamanho }, (_, index) => {
      const leituras = modelos.map(modelo => modelo.horas[index])
      const modelosComTrovoada = leituras.filter(item => Number(item.codigoTempo) >= 95).length
      return {
        time: hourly.time[index],
        modelosComTrovoada,
        maiorProbabilidadeChuva: Math.max(...leituras.map(item => Number(item.probabilidadeChuva) || 0), 0),
        codigoMaisGrave: Math.max(...leituras.map(item => Number(item.codigoTempo) || 0), 0),
        risco: riscoTrovoada(modelosComTrovoada),
      }
    })
    const agora = Date.now()
    const atualIndex = hourly.time.reduce((melhor, time, index) => {
      const distancia = Math.abs(new Date(time).getTime() - agora)
      return distancia < melhor.distancia ? { index, distancia } : melhor
    }, { index: 0, distancia: Infinity }).index
    const atual = consenso[atualIndex] || consenso[0] || null
    const proximaTrovoada = consenso.find(item => item.modelosComTrovoada > 0)?.time || null

    return resposta(200, {
      local: 'Conselheiro Lafaiete - MG',
      latitude: LAT,
      longitude: LNG,
      timezone: json.timezone,
      atualizadoEm: new Date().toISOString(),
      atual,
      modelos,
      consenso,
      proximaTrovoada,
      riscoAtual: atual?.risco || 'baixo',
      fonte: 'Open-Meteo',
      observacao: 'Previsão de trovoadas pelos modelos numéricos; não é detecção de descargas observadas.',
    })
  } catch (error) {
    return resposta(503, { erro: 'Previsão de raios indisponível', detalhe: error?.message }, 'no-store')
  }
}