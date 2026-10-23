import './ChuvaCentro24h.css'

type AcumuladosChuvaCentro = {
  umaHora: number | null
  seisHoras: number | null
  dozeHoras: number | null
  vinteQuatroHoras: number | null
}

export type EstacaoChuvaCentro = {
  nome: string
  codigo?: string
  dataHora?: string
  acumulados: AcumuladosChuvaCentro
}

type Props = {
  estacao: EstacaoChuvaCentro | null | undefined
}

const LARGURA = 960
const ALTURA = 330
const MARGEM = { topo: 46, direita: 34, baixo: 48, esquerda: 52 }
const HORA_MS = 60 * 60 * 1000

function formatarMm(valor: number | null | undefined) {
  return valor == null || !Number.isFinite(valor)
    ? '—'
    : `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} mm`
}

function rotuloLeituraCemaden(valor?: string) {
  if (!valor) return 'Horário não informado'
  const match = valor.match(/^(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}):(\d{2})/)
  if (!match) return valor
  const ano = match[3].length === 2 ? `20${match[3]}` : match[3]
  return `${match[1]}/${match[2]}/${ano} · ${match[4]}:${match[5]}`
}

function formatarNumero(valor: number) {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}

function formatarEscala(valor: number) {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function tetoEscala(valor: number) {
  const alvo = Math.max(valor, 0.1)
  const expoente = 10 ** Math.floor(Math.log10(alvo))
  const escala = alvo / expoente
  const passo = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(item => item >= escala) || 10
  return passo * expoente
}

function dataHoraCatalogo(valor?: string) {
  if (!valor) return null
  const match = valor.match(/^(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}):(\d{2})/)
  if (!match) return null
  const [, dia, mes, anoTexto, hora, minuto] = match
  const ano = Number(anoTexto.length === 2 ? `20${anoTexto}` : anoTexto)
  return Date.UTC(ano, Number(mes) - 1, Number(dia), Number(hora), Number(minuto))
}

function intervaloJanela(horas: number, dataHora?: string) {
  const fim = dataHoraCatalogo(dataHora)
  if (fim == null) return 'janela móvel oficial'
  const formatador = new Intl.DateTimeFormat('pt-BR', {
    day: horas === 24 ? '2-digit' : undefined,
    month: horas === 24 ? '2-digit' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  })
  const inicio = fim - horas * HORA_MS
  return `${formatador.format(new Date(inicio))} – ${formatador.format(new Date(fim))}`
}

function IconeChuva() {
  return (
    <svg viewBox="0 0 40 36" aria-hidden="true">
      <path d="M10 23.5h18a6.5 6.5 0 0 0 .4-13A9.7 9.7 0 0 0 10 12.3a5.6 5.6 0 0 0 0 11.2Z" />
      <path d="m14 27-2 5m10-5-2 5m10-5-2 5" className="chuva-centro-gota-brilho" />
    </svg>
  )
}

function IconeIndicador() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="6" width="20" height="21" rx="2" /><path d="M9 3v6m10-6v6M4 12h20m3 9v7m-3-3h6" /></svg>
}

function IconeRelogio() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11.5" /><path d="M16 9v7l5 3" /></svg>
}

export function ChuvaCentro24h({ estacao }: Props) {
  const acumulados = estacao?.acumulados
  const janelas = [
    { rotulo: 'Última hora', horas: 1, valor: acumulados?.umaHora ?? null },
    { rotulo: 'Últimas 6 horas', horas: 6, valor: acumulados?.seisHoras ?? null },
    { rotulo: 'Últimas 12 horas', horas: 12, valor: acumulados?.dozeHoras ?? null },
    { rotulo: 'Últimas 24 horas', horas: 24, valor: acumulados?.vinteQuatroHoras ?? null },
  ]
  const valorBarraPorPeriodo = janelas.map((janela, indice) => {
    if (janela.valor == null) return null
    if (indice === 0) return janela.valor
    if (indice === janelas.length - 1) return janela.valor
    const janelaAnterior = janelas[indice - 1].valor
    if (janelaAnterior == null || janela.valor < janelaAnterior) return null
    return janela.valor - janelaAnterior
  })
  const total24h = acumulados?.vinteQuatroHoras ?? null
  const temDados = janelas.some(janela => janela.valor != null)
  const maiorBarra = Math.max(1, ...valorBarraPorPeriodo.filter((valor): valor is number => valor != null))
  const maiorAcumulado = Math.max(1, ...janelas.map(janela => janela.valor ?? 0))
  const escala = tetoEscala(Math.max(maiorBarra, maiorAcumulado) * 1.2)
  const grade = Array.from({ length: 6 }, (_, indice) => indice / 5)
  const larguraArea = LARGURA - MARGEM.esquerda - MARGEM.direita
  const alturaArea = ALTURA - MARGEM.topo - MARGEM.baixo
  const espacamento = larguraArea / janelas.length
  const x = (indice: number) => MARGEM.esquerda + (indice + 0.5) * espacamento
  const yValor = (valor: number) => MARGEM.topo + alturaArea - valor / escala * alturaArea
  const segmentosLinha: number[][] = []
  janelas.forEach((janela, indice) => {
    if (janela.valor == null) return
    const segmento = segmentosLinha.at(-1)
    if (indice === 0 || janelas[indice - 1].valor == null) segmentosLinha.push([indice])
    else segmento?.push(indice)
  })
  const tituloEstacao = 'Centro de Conselheiro Lafaiete (CEMADEN)'

  return (
    <section className="chuva-centro-card" aria-labelledby="chuva-centro-titulo">
      <header className="chuva-centro-topo">
        <div className="chuva-centro-titulo-grupo">
          <span className="chuva-centro-eyebrow">MONITORAMENTO CEMADEN · PLUVIÔMETRO</span>
          <h2 id="chuva-centro-titulo">Precipitação acumulada nas últimas 24 horas</h2>
          <p>Estação: {tituloEstacao}</p>
        </div>
        <div className="chuva-centro-total" aria-label={`Acumulado oficial em 24 horas: ${formatarMm(total24h)}`}>
          <span className="chuva-centro-total-icone"><IconeChuva /></span>
          <div>
            <small>Acumulado em 24 horas</small>
            <strong>{formatarMm(total24h)}</strong>
            <small>Atualizado: {rotuloLeituraCemaden(estacao?.dataHora)}</small>
          </div>
        </div>
      </header>

      <div className="chuva-centro-corpo">
        <div className="chuva-centro-meta">
          <span>Estação {estacao?.codigo || 'CEMADEN 3121'}</span>
          <span>Valores oficiais do catálogo CEMADEN</span>
        </div>

        {temDados ? (
          <div className="chuva-centro-grafico-wrap">
            <div className="chuva-centro-grafico-cabecalho">
              <strong><IconeIndicador /> Acumulado de precipitação</strong>
              <div className="chuva-centro-legenda">
                <span><i className="chuva-centro-legenda-barra" /> Acumulado no período (mm)</span>
                <span><i className="chuva-centro-legenda-linha" /> Acumulado total (mm)</span>
              </div>
            </div>
            <svg
              className="chuva-centro-grafico"
              viewBox={`0 0 ${LARGURA} ${ALTURA}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`Acumulados oficiais de chuva CEMADEN nas janelas de 1, 6, 12 e 24 horas para a estação ${tituloEstacao}`}
            >
              <defs>
                <linearGradient id="chuva-centro-barras" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#70b8f7" />
                  <stop offset="100%" stopColor="#a8d3fa" />
                </linearGradient>
              </defs>
              {grade.map(proporcao => {
                const linhaY = MARGEM.topo + alturaArea * (1 - proporcao)
                return (
                  <g key={proporcao}>
                    <line x1={MARGEM.esquerda} x2={LARGURA - MARGEM.direita} y1={linhaY} y2={linhaY} className="chuva-centro-grade" />
                    <text x={MARGEM.esquerda - 10} y={linhaY + 4} textAnchor="end" className="chuva-centro-eixo">
                      {formatarEscala(escala * proporcao)}
                    </text>
                  </g>
                )
              })}
              {janelas.map((janela, indice) => {
                const valorBarra = valorBarraPorPeriodo[indice]
                const larguraBarra = Math.min(100, espacamento * 0.45)
                if (valorBarra == null) {
                  return (
                    <g key={janela.rotulo}>
                      <text x={x(indice)} y={ALTURA - MARGEM.baixo - 10} textAnchor="middle" className="chuva-centro-rotulo-barra">—</text>
                    </g>
                  )
                }
                const alturaBarra = valorBarra > 0 ? (valorBarra / escala) * alturaArea : 1
                const yBarra = MARGEM.topo + alturaArea - alturaBarra
                const linhaProxima = janela.valor != null && Math.abs(yValor(janela.valor) - yBarra) < 28
                const barraBaixa = alturaBarra < Math.max(20, alturaArea * 0.08)
                const rotuloDentro = linhaProxima && !barraBaixa
                const rotuloDeslocado = linhaProxima && barraBaixa
                const rotuloX = rotuloDeslocado
                  ? x(indice) + (indice < janelas.length / 2 ? 1 : -1) * (larguraBarra / 2 + 8)
                  : x(indice)
                const rotuloAncora = rotuloDeslocado
                  ? indice < janelas.length / 2 ? 'start' : 'end'
                  : 'middle'
                const rotuloY = rotuloDentro
                  ? Math.min(MARGEM.topo + alturaArea - 4, yBarra + 21)
                  : barraBaixa
                    ? MARGEM.topo + alturaArea - 5
                    : Math.max(MARGEM.topo + 14, yBarra - 8)
                return (
                  <g key={janela.rotulo}>
                    <rect
                      x={x(indice) - larguraBarra / 2}
                      y={yBarra}
                      width={larguraBarra}
                      height={alturaBarra}
                      rx="3"
                      className="chuva-centro-barra"
                    >
                      <title>{indice === 0
                        ? `Acumulado oficial na última hora: ${formatarMm(valorBarra)}`
                        : indice === janelas.length - 1
                          ? `Acumulado oficial nas últimas 24 horas: ${formatarMm(valorBarra)}`
                          : `${janela.rotulo}: ${formatarMm(valorBarra)} de incremento em relação à janela anterior`}</title>
                    </rect>
                    <text
                      x={rotuloX}
                      y={rotuloY}
                      textAnchor={rotuloAncora}
                      className={`chuva-centro-rotulo-barra${rotuloDentro ? ' chuva-centro-rotulo-barra-interno' : ''}`}
                    >
                      {formatarNumero(valorBarra)} mm
                    </text>
                  </g>
                )
              })}
              {segmentosLinha.map(segmento => segmento.length > 1 ? (
                <polyline
                  key={`linha-${segmento[0]}`}
                  points={segmento.map(indice => `${x(indice).toFixed(1)},${yValor(janelas[indice].valor!)}`).join(' ')}
                  className="chuva-centro-curva"
                />
              ) : null)}
              {janelas.map((janela, indice) => {
                if (janela.valor == null) return null
                const yPonto = yValor(janela.valor)
                const rotuloY = Math.max(MARGEM.topo + 14, yPonto - 24)
                return (
                  <g key={`acumulado-${janela.rotulo}`}>
                    <circle cx={x(indice)} cy={yPonto} r="6" className="chuva-centro-ponto">
                      <title>{`${janela.rotulo}: acumulado oficial de ${formatarMm(janela.valor)}`}</title>
                    </circle>
                    <text x={x(indice)} y={rotuloY} textAnchor="middle" className="chuva-centro-rotulo-acumulado">
                      {formatarNumero(janela.valor)}
                    </text>
                  </g>
                )
              })}
              <text x={MARGEM.esquerda} y="25" className="chuva-centro-eixo-titulo">mm</text>
              {janelas.map((janela, indice) => (
                <text key={`eixo-${janela.rotulo}`} x={x(indice)} y={ALTURA - 20} textAnchor="middle" className="chuva-centro-eixo-categoria">
                  {janela.rotulo}
                </text>
              ))}
            </svg>
            <p className="chuva-centro-aviso-serie">
              A linha e os cartões mostram os acumulados móveis oficiais. As barras seguem a referência: total de 1 h, incrementos entre as janelas de 1–6 h e 6–12 h, e total oficial de 24 h. “—” indica dado ausente ou diferença não calculável.
            </p>
          </div>
        ) : (
          <div className="chuva-centro-sem-acumulado">
            O catálogo CEMADEN ainda não retornou acumulados para esta estação.
          </div>
        )}

        <div className="chuva-centro-indicadores">
          {janelas.map((janela, indice) => (
            <article className="chuva-centro-indicador" key={janela.rotulo}>
              <span className="chuva-centro-indicador-icone chuva-centro-indicador-icone-periodo">
                <IconeRelogio />
              </span>
              <span>{janela.rotulo}</span>
              <strong>{formatarMm(janela.valor)}</strong>
              <small>{intervaloJanela(janela.horas, estacao?.dataHora)}</small>
              {indice === 3 && <small className="chuva-centro-indicador-fonte">Acumulado oficial de 24 h</small>}
            </article>
          ))}
        </div>
        <p className="chuva-centro-fonte">
          Fonte: CEMADEN · Estação Centro, Conselheiro Lafaiete/MG · Atualização automática a cada 5 minutos.
        </p>
      </div>
    </section>
  )
}
