const LAT = -20.6604
const LNG = -43.7863
const MODELOS = [
  { id: 'ecmwf_ifs025', nome: 'ECMWF IFS' },
  { id: 'gfs_seamless', nome: 'GFS Global' },
  { id: 'icon_seamless', nome: 'DWD ICON Global' },
]
const PONTOS_MINAS = [
  { id: 'belo-horizonte', nome: 'Belo Horizonte', latitude: -19.9167, longitude: -43.9345 },
  { id: 'conselheiro-lafaiete', nome: 'Conselheiro Lafaiete', latitude: -20.6604, longitude: -43.7863 },
  { id: 'barbacena', nome: 'Barbacena', latitude: -21.2214, longitude: -43.7703 },
  { id: 'juiz-de-fora', nome: 'Juiz de Fora', latitude: -21.7642, longitude: -43.3503 },
  { id: 'divinopolis', nome: 'Divinópolis', latitude: -20.1436, longitude: -44.8906 },
  { id: 'sete-lagoas', nome: 'Sete Lagoas', latitude: -19.456, longitude: -44.2413 },
  { id: 'montes-claros', nome: 'Montes Claros', latitude: -16.7282, longitude: -43.8578 },
  { id: 'governador-valadares', nome: 'Governador Valadares', latitude: -18.8549, longitude: -41.9559 },
  { id: 'ipatinga', nome: 'Ipatinga', latitude: -19.4708, longitude: -42.5471 },
  { id: 'teofilo-otoni', nome: 'Teófilo Otoni', latitude: -17.8575, longitude: -41.505 },
  { id: 'uberlandia', nome: 'Uberlândia', latitude: -18.9186, longitude: -48.2772 },
  { id: 'patos-de-minas', nome: 'Patos de Minas', latitude: -18.5789, longitude: -46.518 },
  { id: 'uberaba', nome: 'Uberaba', latitude: -19.7476, longitude: -47.9382 },
  { id: 'araxa', nome: 'Araxá', latitude: -19.5902, longitude: -46.9438 },
  { id: 'pocos-de-caldas', nome: 'Poços de Caldas', latitude: -21.7878, longitude: -46.5614 },
  { id: 'varginha', nome: 'Varginha', latitude: -21.551, longitude: -45.43 },
  { id: 'pouso-alegre', nome: 'Pouso Alegre', latitude: -22.23, longitude: -45.933 },
  { id: 'januaria', nome: 'Januária', latitude: -15.484, longitude: -44.36 },
]
let previsaoCache = null
let previsaoCacheTs = 0
const CACHE_TTL_MS = 5 * 60 * 1000

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

function montarPontosRaios(dados) {
  return PONTOS_MINAS.map((ponto, pontoIndex) => {
    const local = dados[pontoIndex]
    const times = Array.isArray(local?.hourly?.time) ? local.hourly.time : []
    const leituras = times.slice(0, 36).map((time, horaIndex) => {
      const porModelo = MODELOS.map(modelo => {
        const sufixo = `_${modelo.id}`
        return {
          codigo: Number(local?.hourly?.[`weather_code${sufixo}`]?.[horaIndex]) || 0,
          probabilidade: Number(local?.hourly?.[`precipitation_probability${sufixo}`]?.[horaIndex]) || 0,
          precipitacao: Number(local?.hourly?.[`precipitation${sufixo}`]?.[horaIndex]) || 0,
          chuva: Number(local?.hourly?.[`rain${sufixo}`]?.[horaIndex]) || 0,
        }
      })
      const trovoadas = porModelo.filter(leitura => leitura.codigo >= 95)
      return {
        time,
        modelosComTrovoada: trovoadas.length,
        codigoMaisGrave: Math.max(...porModelo.map(leitura => leitura.codigo), 0),
        maiorProbabilidadeChuva: Math.max(...porModelo.map(leitura => leitura.probabilidade), 0),
        maiorPrecipitacao: Math.max(...porModelo.map(leitura => leitura.precipitacao), 0),
        maiorChuva: Math.max(...porModelo.map(leitura => leitura.chuva), 0),
      }
    })
    const comTrovoada = leituras.filter(leitura => leitura.modelosComTrovoada > 0)
    const maisGrave = Math.max(...comTrovoada.map(leitura => leitura.codigoMaisGrave), 0)
    const maiorConsenso = Math.max(...comTrovoada.map(leitura => leitura.modelosComTrovoada), 0)
    const primeiraTrovoada = comTrovoada[0]?.time || null
    if (!primeiraTrovoada) return null
    return {
      ...ponto,
      primeiraTrovoada,
      modelosComTrovoada: maiorConsenso,
      codigoMaisGrave: maisGrave,
      intensidade: maisGrave >= 99 ? 'Trovoada forte' : maisGrave >= 96 ? 'Trovoada com granizo' : 'Trovoada',
      intensidadeNivel: maisGrave >= 99 ? 3 : maisGrave >= 96 ? 2 : 1,
      probabilidadeChuva: Math.max(...comTrovoada.map(leitura => leitura.maiorProbabilidadeChuva), 0),
      precipitacao: Math.max(...comTrovoada.map(leitura => leitura.maiorPrecipitacao), 0),
      chuva: Math.max(...comTrovoada.map(leitura => leitura.maiorChuva), 0),
      risco: maiorConsenso >= 2 ? 'alto' : 'atenção',
    }
  }).filter(Boolean)
}

export const handler = async () => {
  const agora = Date.now()
  if (previsaoCache && agora - previsaoCacheTs < CACHE_TTL_MS) {
    return resposta(200, { ...previsaoCache, cache: true })
  }

  try {
    // Busca a previsão local e os municípios em uma chamada única. Isso evita
    // estourar o tempo limite das Functions do Netlify com chamadas em sequência.
    const locais = [{ latitude: LAT, longitude: LNG }, ...PONTOS_MINAS]
    const params = new URLSearchParams({
      latitude: locais.map(local => local.latitude).join(','),
      longitude: locais.map(local => local.longitude).join(','),
      timezone: 'America/Sao_Paulo',
      forecast_days: '2',
      models: MODELOS.map(modelo => modelo.id).join(','),
      hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m',
      wind_speed_unit: 'kmh',
      precipitation_unit: 'mm',
    })
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`Open-Meteo raios: ${response.status}`)
    const dados = await response.json()
    if (!Array.isArray(dados) || !dados[0]?.hourly) {
      throw new Error('Resposta de raios inválida da Open-Meteo')
    }
    const json = dados[0]
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
    const horaAtual = Date.now()
    const atualIndex = hourly.time.reduce((melhor, time, index) => {
      const distancia = Math.abs(new Date(time).getTime() - agora)
      return distancia < melhor.distancia ? { index, distancia } : melhor
    }, { index: 0, distancia: Infinity }).index
    const atual = consenso[atualIndex] || consenso[0] || null
    const proximaTrovoada = consenso.find(item => item.modelosComTrovoada > 0)?.time || null
    const resultado = {
      local: 'Conselheiro Lafaiete - MG',
      latitude: LAT,
      longitude: LNG,
      timezone: json.timezone,
      atualizadoEm: new Date(horaAtual).toISOString(),
      atual,
      modelos,
      consenso,
      pontos: montarPontosRaios(dados.slice(1)),
      proximaTrovoada,
      riscoAtual: atual?.risco || 'baixo',
      fonte: 'Open-Meteo',
      observacao: 'Previsão de trovoadas pelos modelos numéricos; não é detecção de descargas observadas.',
    }
    previsaoCache = resultado
    previsaoCacheTs = Date.now()
    return resposta(200, resultado)
  } catch (error) {
    console.error('Erro ao buscar previsão de raios:', error?.message || error)
    if (previsaoCache) {
      return resposta(200, { ...previsaoCache, cache: true, erroAtualizacao: true })
    }
    return resposta(503, { erro: 'Previsão de raios indisponível', detalhe: error?.message }, 'no-store')
  }
}