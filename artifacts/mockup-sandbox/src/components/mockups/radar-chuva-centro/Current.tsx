import './_group.css'

export type PontoSerie = {
  data: string
  hora: string
  valor: number
}

const pontosExemplo: PontoSerie[] = [
  1.2, 2.8, 1.6, 0.8, 0.4, 0, 0, 0, 0, 0, 0.8, 3.2,
  1, 2.4, 1.6, 1.4, 1.3, 1.3, 1.2, 0, 0, 0, 0, 0,
].map((valor, indice) => ({
  data: '2025-05-18',
  hora: `${String(indice).padStart(2, '0')}:00`,
  valor,
}))

const formatarMm = (valor: number | null | undefined) =>
  valor == null || !Number.isFinite(valor)
    ? '—'
    : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mm`

function formatarPontoChuva(ponto?: PontoSerie): string {
  if (!ponto) return '—'
  const hora = ponto.hora.match(/\d{1,2}/)?.[0]
  if (!hora) return ponto.hora
  const [ano, mes, dia] = ponto.data.split('-')
  return `${dia}/${mes}/${ano} ${hora.padStart(2, '0')}:00`
}

function formatarHoraPontoChuva(ponto: PontoSerie): string {
  const hora = ponto.hora.match(/\d{1,2}/)?.[0]
  return hora ? `${hora.padStart(2, '0')}h` : ponto.hora
}

function ChartaChuva({
  pontos,
  estacao,
  margemEixoEsquerdo = 56,
}: {
  pontos: PontoSerie[]
  estacao?: { nome: string; codigo?: string } | null
  margemEixoEsquerdo?: number
}) {
  const periodo = 24
  const pontosVisiveis = pontos.slice(-periodo)
  const largura = 900
  const altura = 330
  const margem = { topo: 42, direita: 20, baixo: 58, esquerda: margemEixoEsquerdo }
  const acumulados = pontosVisiveis.reduce<number[]>((totais, ponto) => {
    totais.push((totais.at(-1) || 0) + ponto.valor)
    return totais
  }, [])
  const maior = Math.max(...acumulados, 1)
  const areaLargura = largura - margem.esquerda - margem.direita
  const areaAltura = altura - margem.topo - margem.baixo
  const pontoX = (indice: number) =>
    margem.esquerda +
    (pontosVisiveis.length <= 1
      ? areaLargura / 2
      : (indice * areaLargura) / (pontosVisiveis.length - 1))
  const escalaY = (valor: number) =>
    margem.topo + areaAltura - (valor / maior) * areaAltura
  const pontosSvg = acumulados
    .map((valor, indice) => `${pontoX(indice).toFixed(1)},${escalaY(valor).toFixed(1)}`)
    .join(' ')
  const dataMaisRecente = pontosVisiveis.at(-1)?.data
  const larguraBarra = Math.max(
    4,
    Math.min(22, (areaLargura / Math.max(pontosVisiveis.length, 1)) * 0.58),
  )

  if (pontosVisiveis.length === 0) {
    return (
      <div className="cc-empty">
        A estação ainda não retornou pontos horários para o período.
      </div>
    )
  }

  return (
    <div className="cc-chart-wrap">
      <div className="cc-chart-scroll" aria-label="Gráfico de precipitação, deslize para consultar todos os horários">
        <svg
          className="cc-current-chart"
          viewBox={`0 0 ${largura} ${altura}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Precipitação acumulada em ${periodo} horas${estacao?.nome ? ` na estação ${estacao.nome}` : ''}`}
        >
          <text
            x={largura / 2}
            y="18"
            textAnchor="middle"
            className="cnl-grafico-chuva-titulo"
          >
            {`Precipitação Acumulada em ${periodo}h${estacao?.nome ? ` | Estação: ${estacao.nome}${estacao.codigo ? ` (${estacao.codigo})` : ''}` : ''}`}
          </text>
          {[0, 0.25, 0.5, 0.75, 1].map((proporcao) => {
            const y = escalaY(maior * proporcao)
            return (
              <g key={proporcao}>
                <line
                  x1={margem.esquerda}
                  x2={largura - margem.direita}
                  y1={y}
                  y2={y}
                  className="cnl-grafico-grade"
                />
                <text
                  x={margem.esquerda - 9}
                  y={y + 4}
                  textAnchor="end"
                  className="cnl-grafico-label"
                >
                  {formatarMm(maior * proporcao)}
                </text>
              </g>
            )
          })}
          {pontosVisiveis.map((ponto, indice) => {
            const x = pontoX(indice)
            const y = margem.topo + areaAltura
            const alturaBarra = (ponto.valor / maior) * areaAltura
            return (
              <rect
                key={`${ponto.data}-${ponto.hora}-${indice}`}
                x={x - larguraBarra / 2}
                y={y - alturaBarra}
                width={larguraBarra}
                height={alturaBarra}
                rx="1"
                className={`cnl-grafico-chuva-bar${ponto.data === dataMaisRecente ? ' cnl-grafico-chuva-bar-atual' : ''}`}
              >
                <title>{`${formatarPontoChuva(ponto)} · chuva da hora: ${formatarMm(ponto.valor)}`}</title>
              </rect>
            )
          })}
          <polyline points={pontosSvg} className="cnl-grafico-linha cnl-grafico-linha-chuva" />
          {pontosVisiveis.map((ponto, indice) => {
            const x = pontoX(indice)
            const y = escalaY(acumulados[indice])
            const rotuloY = Math.max(margem.topo + 30, y - 9)
            const hora = formatarHoraPontoChuva(ponto)
            return (
              <g key={`${ponto.data}-${ponto.hora}-${indice}`}>
                <circle cx={x} cy={y} r="4" className="cnl-grafico-ponto cnl-grafico-ponto-chuva">
                  <title>{`${formatarPontoChuva(ponto)} · chuva: ${formatarMm(ponto.valor)} · acumulado: ${formatarMm(acumulados[indice])}`}</title>
                </circle>
                <text x={x} y={rotuloY} textAnchor="middle" className="cnl-grafico-label cnl-grafico-label-chuva">
                  {formatarMm(acumulados[indice])}
                </text>
                <text
                  x={x}
                  y={altura - margem.baixo + 18}
                  textAnchor="end"
                  className="cnl-grafico-label cnl-grafico-label-data"
                  transform={`rotate(-42 ${x} ${altura - margem.baixo + 18})`}
                >
                  {hora}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="cc-legend">
        <span><i className="cc-legend-bar" /> Chuva por hora</span>
        <span><i className="cc-legend-line" /> Acumulado</span>
        <small>Valores em milímetros · horário informado pelo CEMADEN</small>
      </div>
    </div>
  )
}

export function Current() {
  return (
    <main className="cc-preview cc-current">
      <section className="cc-current-panel" aria-labelledby="cc-current-title">
        <header className="cc-current-head">
          <div>
            <div className="cc-kicker">Radar DC <span> / </span> Monitoramento pluviométrico</div>
            <h1 id="cc-current-title">Últimas 24 horas</h1>
            <p>Estação Centro <span className="cc-code">CEM-310</span></p>
          </div>
          <div className="cc-source">
            <span className="cc-source-mark" aria-hidden="true" />
            <div><strong>Fonte CEMADEN</strong><span>Atualizado em 19 mai 2025 · 00:05 BRT</span></div>
          </div>
        </header>
        <div className="cc-illustrative">Série de demonstração · dados ilustrativos</div>
        <ChartaChuva
          pontos={pontosExemplo}
          estacao={{ nome: 'Centro', codigo: 'CEM-310' }}
          margemEixoEsquerdo={100}
        />
        <footer className="cc-current-foot">
          <span>Janela observada: 18 mai, 00h — 23h</span>
          <span>Leitura horária · milímetros</span>
        </footer>
      </section>
    </main>
  )
}

export default Current
