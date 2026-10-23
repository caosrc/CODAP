import './_group.css'

export type PontoSerie = {
  data: string
  hora: string
  valor: number
}

const serieCentro: PontoSerie[] = [
  1.2, 2.8, 1.6, 0.8, 0.4, 0, 0, 0, 0, 0,
  0.8, 3.2, 1, 2.4, 1, 0.9, 0.9, 0.8, 0.8, 0,
  0, 0, 0, 0,
].map((valor, indice) => ({
  data: '2025-05-18',
  hora: `${String(indice).padStart(2, '0')}:00`,
  valor,
}))

const mm = (valor: number) => `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`
const numero = (valor: number, decimais = 1) =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: decimais, maximumFractionDigits: decimais })

function horaDaSerie(ponto: PontoSerie): number {
  return Number(ponto.hora.match(/\d{1,2}/)?.[0] ?? 0)
}

function faixaHora(hora: number): string {
  return `${String(hora).padStart(2, '0')}h`
}

function formatarData(data: string): string {
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

function CenterRainChart({ pontos }: { pontos: PontoSerie[] }) {
  const largura = 980
  const altura = 365
  const margem = { topo: 48, direita: 62, baixo: 45, esquerda: 62 }
  const plotW = largura - margem.esquerda - margem.direita
  const plotH = altura - margem.topo - margem.baixo
  const baseY = margem.topo + plotH
  const maxHora = Math.max(4, Math.ceil(Math.max(...pontos.map((p) => p.valor), 0) / 2) * 2)
  const maxAcumulado = Math.max(20, Math.ceil(pontos.reduce((soma, ponto) => soma + ponto.valor, 0) / 5) * 5)
  const posX = (indice: number) => margem.esquerda + ((indice + 0.5) * plotW) / pontos.length
  const yChuva = (valor: number) => margem.topo + plotH - (valor / maxHora) * plotH
  const yAcumulado = (valor: number) => margem.topo + plotH - (valor / maxAcumulado) * plotH
  let runningTotal = 0
  const acumulados = pontos.map((ponto) => (runningTotal += ponto.valor))
  const caminhoLinha = acumulados
    .map((valor, indice) => `${indice === 0 ? 'M' : 'L'} ${posX(indice).toFixed(1)} ${yAcumulado(valor).toFixed(1)}`)
    .join(' ')
  const stepX = plotW / pontos.length
  const barW = Math.min(21, stepX * 0.58)

  return (
    <div className="cr-plot-scroll" role="region" aria-label="Gráfico horário. Em telas pequenas, deslize para consultar o período completo." tabIndex={0}>
      <svg
        className="cr-chart"
        viewBox={`0 0 ${largura} ${altura}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Barras de chuva por hora e linha de precipitação acumulada nas últimas 24 horas"
      >
        <text x={margem.esquerda} y="17" className="cr-axis-title cr-axis-title-left">CHUVA / HORA · mm</text>
        <text x={largura - margem.direita} y="17" textAnchor="end" className="cr-axis-title">ACUMULADO · mm</text>
        {[0, 1, 2, 3, 4].map((passo) => {
          const valor = (maxHora * passo) / 4
          const y = yChuva(valor)
          const acumuladoRef = (maxAcumulado * passo) / 4
          return (
            <g key={passo}>
              <line x1={margem.esquerda} x2={largura - margem.direita} y1={y} y2={y} className="cr-grid" />
              <text x={margem.esquerda - 12} y={y + 4} textAnchor="end" className="cr-axis-label">{numero(valor, valor % 1 ? 1 : 0)}</text>
              <text x={largura - margem.direita + 12} y={y + 4} textAnchor="start" className="cr-axis-label">{numero(acumuladoRef, 0)}</text>
            </g>
          )
        })}
        <line x1={margem.esquerda} x2={largura - margem.direita} y1={baseY} y2={baseY} className="cr-axis-base" />
        {pontos.map((ponto, indice) => {
          const x = posX(indice)
          const top = yChuva(ponto.valor)
          const barHeight = Math.max(0, baseY - top)
          const isPeak = ponto.valor === Math.max(...pontos.map((item) => item.valor)) && ponto.valor > 0
          const showHour = indice % 3 === 0 || indice === pontos.length - 1
          return (
            <g key={`${ponto.data}-${ponto.hora}`}>
              {ponto.valor > 0 && (
                <rect
                  x={x - barW / 2}
                  y={top}
                  width={barW}
                  height={barHeight}
                  rx="2"
                  className={`cr-bar${isPeak ? ' cr-bar-peak' : ''}`}
                >
                  <title>{`${faixaHora(horaDaSerie(ponto))} · chuva na hora: ${mm(ponto.valor)}`}</title>
                </rect>
              )}
              {showHour && (
                <text x={x} y={baseY + 23} textAnchor="middle" className="cr-time-label">
                  {faixaHora(horaDaSerie(ponto))}
                </text>
              )}
            </g>
          )
        })}
        <path d={caminhoLinha} className="cr-cumulative-line" />
        {acumulados.map((valor, indice) => {
          if (indice % 3 !== 0 && indice !== acumulados.length - 1) return null
          const x = posX(indice)
          const y = yAcumulado(valor)
          return (
            <circle key={`dot-${indice}`} cx={x} cy={y} r="3.2" className="cr-cumulative-point">
              <title>{`${faixaHora(horaDaSerie(pontos[indice]))} · acumulado: ${mm(valor)}`}</title>
            </circle>
          )
        })}
      </svg>
    </div>
  )
}

function metricasDaSerie(pontos: PontoSerie[]) {
  const total = pontos.reduce((soma, ponto) => soma + ponto.valor, 0)
  const horasMolhadas = pontos.filter((ponto) => ponto.valor > 0).length
  const pico = pontos.reduce<PontoSerie | null>(
    (maior, ponto) => (!maior || ponto.valor > maior.valor ? ponto : maior),
    null,
  )
  let janelaChuvosa: { inicio: number; fim: number; total: number } | null = null
  const horasPorJanela = Math.min(4, pontos.length)
  for (let indice = 0; indice <= pontos.length - horasPorJanela; indice += 1) {
    const janela = pontos.slice(indice, indice + horasPorJanela)
    const soma = janela.reduce((valor, ponto) => valor + ponto.valor, 0)
    if (!janelaChuvosa || soma > janelaChuvosa.total) {
      janelaChuvosa = {
        inicio: horaDaSerie(janela[0]),
        fim: horaDaSerie(janela[janela.length - 1]),
        total: soma,
      }
    }
  }
  return {
    total,
    horasMolhadas,
    pico: pico?.valor ? pico : null,
    janelaChuvosa,
    intensidadeMedia: horasMolhadas ? total / horasMolhadas : null,
  }
}

function Metric({ label, value, detail, emphasis = false }: { label: string; value: string; detail: string; emphasis?: boolean }) {
  return (
    <div className={`cr-metric${emphasis ? ' cr-metric-emphasis' : ''}`}>
      <div className="cr-metric-label">{label}</div>
      <div className="cr-metric-value">{value}</div>
      <div className="cr-metric-detail">{detail}</div>
    </div>
  )
}

export function CenterRain() {
  const pontos = serieCentro.slice(-24)
  const metricas = metricasDaSerie(pontos)
  const ultimoPonto = pontos.at(-1)
  const picoHora = metricas.pico ? faixaHora(horaDaSerie(metricas.pico)) : '—'
  const janela = metricas.janelaChuvosa
  const janelaLabel = janela
    ? `${faixaHora(janela.inicio)}–${faixaHora(janela.fim)}`
    : '—'
  const media = metricas.intensidadeMedia == null
    ? '—'
    : `${numero(metricas.intensidadeMedia, 2)} mm/h`

  return (
    <main className="cc-preview cr-preview">
      <article className="cr-panel" aria-labelledby="cr-title">
        <header className="cr-header">
          <div className="cr-title-block">
            <div className="cr-overline"><span className="cr-overline-mark" /> RADAR DC <span className="cr-slash">/</span> PLUVIOMETRIA</div>
            <h1 id="cr-title">Chuva no Centro</h1>
            <div className="cr-station-line">
              <span>Conselheiro Lafaiete, MG</span>
              <span className="cr-divider" />
              <span>Estação Centro <b>CEM-310</b></span>
            </div>
          </div>
          <div className="cr-total">
            <span className="cr-total-label">ACUMULADO · 24H</span>
            <strong>{mm(metricas.total).replace(' mm', '')}<small> mm</small></strong>
            <span className="cr-period">18 mai, 00h — 23h</span>
          </div>
        </header>

        <div className="cr-metadata">
          <div className="cr-source">
            <span className="cr-source-dot" />
            <span><strong>Fonte</strong> CEMADEN · estação Centro</span>
          </div>
          <div className="cr-updated">
            <span>ÚLTIMA ATUALIZAÇÃO</span>
            <time dateTime="2025-05-19T00:05:00-03:00">19 mai 2025 · 00:05 BRT</time>
          </div>
          <span className="cr-data-label">DADOS ILUSTRATIVOS</span>
        </div>

        <section className="cr-chart-section" aria-label="Série horária de precipitação">
          <div className="cr-chart-heading">
            <div>
              <span className="cr-section-index">01 / SÉRIE HORÁRIA</span>
              <h2>Precipitação por hora</h2>
            </div>
            <div className="cr-legend">
              <span><i className="cr-legend-bar" /> Chuva por hora</span>
              <span><i className="cr-legend-line" /> Acumulado</span>
            </div>
          </div>
          <CenterRainChart pontos={pontos} />
          <div className="cr-chart-foot">
            <span>Milímetros por hora · eixo direito: acumulado</span>
            <span>Horário local · BRT</span>
          </div>
        </section>

        <section className="cr-summary" aria-label="Resumo das últimas 24 horas">
          <div className="cr-summary-head">
            <span className="cr-section-index">02 / RESUMO DO PERÍODO</span>
            <span>Valores derivados da série horária</span>
          </div>
          <div className="cr-metrics">
            <Metric
              label="Maior chuva em 1h"
              value={metricas.pico ? mm(metricas.pico.valor) : '—'}
              detail={metricas.pico ? `às ${picoHora}` : 'sem leitura'}
              emphasis
            />
            <Metric
              label="Horas com chuva"
              value={`${metricas.horasMolhadas} / ${pontos.length}`}
              detail="leituras acima de 0 mm"
            />
            <Metric
              label="Período mais chuvoso"
              value={janelaLabel}
              detail={janela ? `${mm(janela.total)} · janela de 4h` : 'sem leitura'}
            />
            <Metric
              label="Intensidade média"
              value={media}
              detail="nas horas com chuva"
            />
          </div>
        </section>
        <footer className="cr-disclaimer">
          <span>Série de demonstração — valores ilustrativos, não representam medição em tempo real.</span>
          <span>{ultimoPonto ? `Último horário na série: ${faixaHora(horaDaSerie(ultimoPonto))} · ${formatarData(ultimoPonto.data)}` : 'Sem dados de horário'}</span>
        </footer>
      </article>
    </main>
  )
}

export default CenterRain
