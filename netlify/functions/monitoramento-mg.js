const CATALOGO_URL = 'https://resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=MG'
const RECURSOS_URL = 'https://mapservices.cemaden.gov.br/MapaInterativoWS/resources'
const GEOGRAFIA_URL = 'https://observatorio.infraestrutura.mg.gov.br/server/rest/services/00_PUBLICACOES/cemaden_estacoes_pluviometricas/MapServer/1/query?where=uf%3D%27MG%27&outFields=idestacao%2Ccodestacao%2Clatitude%2Clongitude%2Ccidade%2Cnomeestacao&returnGeometry=false&resultRecordCount=2000&f=json'
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX_STALE_MS = 15 * 60 * 1000

let cache = null
let cacheAt = 0

function numeroOuNulo(valor) {
  if (valor == null || valor === '' || valor === '-') return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function dataHoraPonto(ponto) {
  if (!ponto) return ''
  const data = String(ponto.data || '')
  const hora = String(ponto.hora || '').match(/^(\d{1,2})h$/i)?.[1]
  if (!hora || !/^\d{2}\/\d{2}\/\d{4}$/.test(data)) return ''
  return `${data} ${hora.padStart(2, '0')}:00`
}

function ultimaLeitura(payload) {
  const horarios = Array.isArray(payload?.horarios) ? payload.horarios : []
  const datas = Array.isArray(payload?.datas) ? payload.datas : []
  const acumulados = Array.isArray(payload?.acumulados) ? payload.acumulados : []
  const pontos = []

  acumulados.forEach((linha, indiceData) => {
    if (!Array.isArray(linha)) return
    linha.forEach((valor, indiceHora) => {
      const numero = numeroOuNulo(valor)
      const data = String(datas[indiceData] || '')
      const hora = String(horarios[indiceHora] || '')
      const matchData = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
      const matchHora = hora.match(/^(\d{1,2})h$/i)
      if (numero == null || !matchData || !matchHora) return
      const instante = Date.UTC(
        Number(matchData[3]),
        Number(matchData[2]) - 1,
        Number(matchData[1]),
        Number(matchHora[1]),
      )
      pontos.push({ data, hora, valor: numero, instante })
    })
  })

  return pontos.sort((a, b) => a.instante - b.instante).at(-1) || null
}

function respostaJson(statusCode, dados) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(dados),
  }
}

export const handler = async () => {
  const agora = Date.now()
  if (cache && agora - cacheAt < CACHE_TTL_MS) {
    return respostaJson(200, { ...cache, cache: true })
  }

  try {
    const [catalogoResposta, geografiaResposta] = await Promise.all([
      fetch(CATALOGO_URL, {
        headers: { 'User-Agent': 'CODAP/1.0 (Minas Gerais)' },
        signal: AbortSignal.timeout(10_000),
      }),
      fetch(GEOGRAFIA_URL, {
        headers: {
          'User-Agent': 'CODAP/1.0 (Minas Gerais)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      }),
    ])

    if (!catalogoResposta.ok) throw new Error(`Catálogo CEMADEN respondeu ${catalogoResposta.status}`)
    if (!geografiaResposta.ok) throw new Error(`Localização respondeu ${geografiaResposta.status}`)

    const [catalogo, geografia] = await Promise.all([
      catalogoResposta.json(),
      geografiaResposta.json(),
    ])
    if (!Array.isArray(catalogo) || !Array.isArray(geografia?.features)) {
      throw new Error('Formato inesperado nas estações CEMADEN')
    }

    const coordenadasPorId = new Map(
      geografia.features
        .map(feature => feature?.attributes || {})
        .map(item => [Number(item.idestacao), item])
        .filter(([id]) => Number.isFinite(id)),
    )
    const estacoesLafaiete = catalogo.filter(item =>
      String(item?.uf || '').toUpperCase() === 'MG' &&
      /conselheiro\s+lafaiete/i.test(String(item?.cidade || '')),
    )

    const leituras = await Promise.allSettled(estacoesLafaiete.map(async item => {
      const id = Number(item?.idestacao)
      const resposta = await fetch(`${RECURSOS_URL}/horario/${id}/96`, {
        headers: { 'User-Agent': 'CODAP/1.0 (Conselheiro Lafaiete, MG)' },
        signal: AbortSignal.timeout(3500),
      })
      if (!resposta.ok) throw new Error(`Estação ${id} respondeu ${resposta.status}`)
      return { id, ponto: ultimaLeitura(await resposta.json()) }
    }))
    const leituraPorId = new Map()
    leituras.forEach(resultado => {
      if (resultado.status === 'fulfilled') {
        leituraPorId.set(resultado.value.id, resultado.value.ponto)
      }
    })

    const estacoes = estacoesLafaiete.map(item => {
      const localizacao = coordenadasPorId.get(Number(item?.idestacao)) || {}
      const valorCatalogo = numeroOuNulo(item?.acc1hr)
      const ultimaChuva = leituraPorId.get(Number(item?.idestacao))
      return {
        id: Number(item?.idestacao),
        nome: String(item?.nomeestacao || localizacao.nomeestacao || ''),
        municipio: String(item?.cidade || localizacao.cidade || ''),
        codigo: String(localizacao.codestacao || ''),
        latitude: numeroOuNulo(localizacao.latitude),
        longitude: numeroOuNulo(localizacao.longitude),
        precipitacaoAtual: valorCatalogo ?? ultimaChuva?.valor ?? null,
        precipitacaoDataHora: valorCatalogo != null
          ? String(item?.datahoraUltimovalor || '')
          : dataHoraPonto(ultimaChuva) || String(item?.datahoraUltimovalor || ''),
      }
    })
    const estacoesGeorreferenciadas = estacoes.filter(
      estacao => estacao.latitude != null && estacao.longitude != null,
    ).length
    if (estacoesGeorreferenciadas === 0) {
      throw new Error('Nenhuma estação do catálogo pôde ser posicionada no mapa')
    }

    cache = {
      sucesso: true,
      estacoes,
      totalEstacoes: estacoes.length,
      estacoesGeorreferenciadas,
      estacoesSemCoordenadas: estacoes.length - estacoesGeorreferenciadas,
      atualizadoEm: new Date().toISOString(),
      fonte: 'CEMADEN · Conselheiro Lafaiete · posições: Observatório de Infraestrutura de Minas Gerais',
    }
    cacheAt = agora
    return respostaJson(200, cache)
  } catch (erro) {
    console.error('[CEMADEN MG] Falha ao consultar pluviômetros:', erro?.message || erro)
    if (cache && agora - cacheAt <= CACHE_MAX_STALE_MS) {
      return respostaJson(200, { ...cache, cache: true, erroAtualizacao: true })
    }
    return respostaJson(503, {
      sucesso: false,
      erro: 'Não foi possível consultar as estações CEMADEN de Minas Gerais.',
    })
  }
}
