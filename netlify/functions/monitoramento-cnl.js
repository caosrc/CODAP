const CATALOGO = 'https://resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=MG'
const HORARIO = 'https://mapservices.cemaden.gov.br/MapaInterativoWS/resources/horario/6622/23'
const NIVEL = 'https://resources.cemaden.gov.br/graficos/cemaden/hidro/resources/json/MedidaResource.php?est=6622&sen=20&pag=24'
const FONTE = 'https://resources.cemaden.gov.br/graficos/interativo/grafico_CEMADEN.php?idpcd=6622&uf=MG'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' },
  body: JSON.stringify(body),
})
const number = value => value == null || value === '-' || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null)

export const handler = async () => {
  try {
    const [catalogoResponse, horarioResponse, nivelResponse] = await Promise.all([
      fetch(CATALOGO, { signal: AbortSignal.timeout(15000) }),
      fetch(HORARIO, { signal: AbortSignal.timeout(15000) }),
      fetch(NIVEL, { signal: AbortSignal.timeout(15000) }),
    ])
    if (!catalogoResponse.ok || !horarioResponse.ok || !nivelResponse.ok) throw new Error('CEMADEN indisponível')
    const [catalogo, horario, medidas] = await Promise.all([
      catalogoResponse.json(), horarioResponse.json(), nivelResponse.json(),
    ])
    const item = Array.isArray(catalogo) ? catalogo.find(row => Number(row?.idestacao) === 6622) : null
    const estacaoRaw = horario?.estacao || {}
    if (!item || !estacaoRaw) throw new Error('Estação Rio Bananeiras não encontrada')
    const datas = Array.isArray(horario?.datas) ? horario.datas : []
    const horarios = Array.isArray(horario?.horarios) ? horario.horarios : []
    const serie = []
    ;(horario?.acumulados || []).forEach((linha, dataIndex) => {
      if (!Array.isArray(linha)) return
      linha.forEach((valor, hourIndex) => {
        const valorNumerico = number(valor)
        if (valorNumerico != null && datas[dataIndex] && horarios[hourIndex]) {
          serie.push({ data: datas[dataIndex], hora: horarios[hourIndex], valor: valorNumerico })
        }
      })
    })
    const nivelSerie = (Array.isArray(medidas) ? medidas : []).map(medida => ({
      dataHora: String(medida?.datahora || ''),
      valor: number(medida?.offset) != null && number(medida?.valor) != null
        ? Number((number(medida.offset) - number(medida.valor)).toFixed(2)) : null,
      qualificacao: String(medida?.qualificacao || ''),
      cotas: {
        atencao: number(medida?.cota_atencao),
        alerta: number(medida?.cota_alerta),
        transbordamento: number(medida?.cota_transbordamento),
      },
    })).filter(itemNivel => itemNivel.valor != null)
    const ultimoNivel = nivelSerie.at(-1) || null
    const cotas = ultimoNivel?.cotas || {
      atencao: number(estacaoRaw.cotaAtencao) ?? 2.55,
      alerta: number(estacaoRaw.cotaAlerta) ?? 3.4,
      transbordamento: number(estacaoRaw.cotaTransbordamento) ?? 4.25,
    }
    const estacao = {
      id: 6622,
      uf: 'MG',
      cidade: String(item.cidade || 'CONSELHEIRO LAFAIETE'),
      nome: String(item.nomeestacao || 'Rio Bananeiras'),
      codigo: String(item.codEstacao || estacaoRaw.codEstacao || ''),
      ultimoValor: number(item.ultimovalor),
      dataHora: String(item.datahoraUltimovalor || ''),
      precipitacaoAtual: number(item.acc1hr),
      precipitacaoDataHora: String(item.datahoraUltimovalor || ''),
      precipitacaoDiaria: [],
      acumulados: {
        umaHora: number(item.acc1hr), seisHoras: number(item.acc6hr),
        dozeHoras: number(item.acc12hr), vinteQuatroHoras: number(item.acc24hr),
        setentaEDuasHoras: number(item.acc72hr),
      },
      latitude: Number(estacaoRaw.latitude),
      longitude: Number(estacaoRaw.longitude),
      cotas,
    }
    return json(200, {
      sucesso: true,
      estacao,
      estacoes: [estacao],
      serie: serie.slice(-24),
      nivelAtual: ultimoNivel,
      serieNivel: nivelSerie.slice(-24).map(({ dataHora, valor }) => ({ dataHora, valor })),
      cotasConfiguradas: false,
      atualizadoEm: new Date().toISOString(),
      fonte: FONTE,
    })
  } catch (error) {
    return json(503, { sucesso: false, erro: 'Não foi possível consultar o monitoramento do CEMADEN.', detalhe: error?.message })
  }
}