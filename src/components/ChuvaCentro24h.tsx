import type { PontoSerie } from './MonitoramentoCNL'
import './ChuvaCentro24h.css'

export type AcumuladosChuvaCentro = {
  umaHora: number | null
  tresHoras: number | null
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
  pontos: PontoSerie[]
  estacao: EstacaoChuvaCentro | null | undefined
}

const LARGURA = 960
const ALTURA = 320
const MARGEM = { topo: 42, direita: 48, baixo: 42, esquerda: 48 }
const HORA_MS = 60 * 60 * 1000

function formatarMm(valor: number | null | undefined) {
  return valor == null || !Number.isFinite(valor)
    ? '—'
    : `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`
}

function formatarNumero(valor: number) {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function horaDoPonto(ponto: PontoSerie) {
  const hora = ponto.hora.match(/\d{1,2}/)?.[0]
  return hora ? `${hora.padStart(2, '0')}h` : ponto.hora
}

function horaDoInstante(instante: number) {
  return `${String(new Date(instante).getUTCHours()).padStart(2, '0')}h`
}

function instanteDoPonto(ponto: PontoSerie): number | null {
  const data = ponto.data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const hora = ponto.hora.match(/^(\d{1,2})h$/)
  if (!data || !hora) return null
  const [, dia, mes, ano] = data
  return Date.UTC(Number(ano), Number(mes) - 1, Number(dia), Number(hora[1]))
}

function rotuloInstante(valor: number | null | undefined) {
  if (valor == null || !Number.isFinite(valor)) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(valor))
}

function rotuloLeituraCemaden(valor?: string) {
  if (!valor) return 'Horário não informado'
  const match = valor.match(/^(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}):(\d{2})/)
  if (!match) return valor
  const ano = match[3].length === 2 ? `20${match[3]}` : match[3]
  return `${match[1]}/${match[2]}/${ano} · ${match[4]}:${match[5]}`
}

function completarSerie(pontos: PontoSerie[]) {
  const validos = pontos
    .map(ponto => ({ ...ponto, instante: instanteDoPonto(ponto) }))
    .filter((ponto): ponto is PontoSerie & { instante: number } =>
      ponto.instante != null && Number.isFinite(ponto.valor) && ponto.valor >= 0,
    )
    .sort((a, b) => a.instante - b.instante)
  const fim = validos.at(-1)?.instante
  if (fim == null) return { slots: [], observados: validos }

  const porInstante = new Map(validos.map(ponto => [ponto.instante, ponto]))
  const slots = Array.from({ length: 24 }, (_, indice) => {
    const instante = fim - (23 - indice) * HORA_MS
    return { instante, ponto: porInstante.get(instante) || null }
  })
  return { slots, observados: validos.filter(ponto => ponto.instante >= fim - 23 * HORA_MS) }
}

function maiorJanelaCompleta(slots: ReturnType<typeof completarSerie>['slots'], tamanho: number) {
  let melhor: { valor: number; inicio: number; fim: number } | null = null
  for (let indice = 0; indice <= slots.length - tamanho; indice += 1) {
    const janela = slots.slice(indice, indice + tamanho)
    if (janela.some(slot => !slot.ponto)) continue
    const valor = janela.reduce((total, slot) => total + (slot.ponto?.valor || 0), 0)
    if (!melhor || valor > melhor.valor) {
      melhor = {
        valor,
        inicio: janela[0].instante,
        fim: janela.at(-1)!.instante,
      }
    }
  }
  return melhor
}

function tetoEscala(valor: number) {
  const alvo = Math.max(valor, 0.1)
  const expoente = 10 ** Math.floor(Math.log10(alvo))
  const escala = alvo / expoente
  const passo = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(item => item >= escala) || 10
  return passo * expoente
}

function IconeGota() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2.5C12.5 8 6.5 14.2 6.5 20a9.5 9.5 0 0 0 19 0c0-5.8-6-12-9.5-17.5Z" />
      <path d="M11.2 20.3a5 5 0 0 0 4.4 4.8" className="chuva-centro-gota-brilho" />
    </svg>
  )
}

function IconeIndicador({ tipo }: { tipo: 'chuva' | 'total' | 'periodo' | 'horas' | 'media' }) {
  if (tipo === 'total') return <IconeGota />
  if (tipo === 'chuva') {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 19a6 6 0 0 1 .4-12A8 8 0 0 1 23 9a5 5 0 0 1 1 10H8Z" /><path d="m11 22-2 4m9-4-2 4m9-4-2 4" /></svg>
  }
  if (tipo === 'periodo') {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="6" width="20" height="21" rx="2" /><path d="M9 3v6m10-6v6M4 12h20m3 9v7m-3-3h6" /></svg>
  }
  if (tipo === 'horas') {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="18" width="6" height="11" rx="1" /><rect x="13" y="11" width="6" height="18" rx="1" /><rect x="22" y="4" width="6" height="25" rx="1" /></svg>
  }
  return <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" /><path d="m21 10-10 12m1-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></svg>
}

export function ChuvaCentro24h({ pontos, estacao }: Props) {
  const { slots, observados } = completarSerie(pontos)
  const total24h = estacao?.acumulados.vinteQuatroHoras ?? null
  const cobertura = slots.filter(slot => slot.ponto).length
  const serieDisponivel = cobertura > 0
  const maiorHora = observados.reduce<(typeof observados)[number] | null>(
    (maior, ponto) => !maior || ponto.valor > maior.valor ? ponto : maior,
    null,
  )
  const horasComChuva = observados.filter(ponto => ponto.valor > 0).length
  const somaObservada = observados.reduce((total, ponto) => total + ponto.valor, 0)
  const intensidadeMedia = horasComChuva ? somaObservada / horasComChuva : null
  const janela4h = maiorJanelaCompleta(slots, 4)
  const acumuladoEscala = tetoEscala(Math.max(1, ...slots.map(slot => slot.ponto?.valor || 0)))
  const acumuladoObservado = slots.reduce<number[]>((totais, slot) => {
    totais.push((totais.at(-1) || 0) + (slot.ponto?.valor || 0))
    return totais
  }, [])
  const maximoAcumulado = tetoEscala(Math.max(1, total24h || 0, ...acumuladoObservado))
  const intervalosChuva = Array.from({ length: 5 }, (_, indice) => indice / 4)
  const larguraArea = LARGURA - MARGEM.esquerda - MARGEM.direita
  const alturaArea = ALTURA - MARGEM.topo - MARGEM.baixo
  const x = (indice: number) => MARGEM.esquerda + indice * larguraArea / 23
  const yAcumulado = (valor: number) => MARGEM.topo + alturaArea - valor / maximoAcumulado * alturaArea
  const segmentosLinha: number[][] = []
  slots.forEach((slot, indice) => {
    if (!slot.ponto) return
    const segmento = segmentosLinha.at(-1)
    if (indice === 0 || !slots[indice - 1].ponto) segmentosLinha.push([indice])
    else segmento?.push(indice)
  })
  const janelasFallback = [
    { rotulo: '1h', valor: estacao?.acumulados.umaHora ?? null },
    { rotulo: '3h', valor: estacao?.acumulados.tresHoras ?? null },
    { rotulo: '6h', valor: estacao?.acumulados.seisHoras ?? null },
    { rotulo: '12h', valor: estacao?.acumulados.dozeHoras ?? null },
    { rotulo: '24h', valor: total24h },
  ].filter(item => item.valor != null)
  const maximoJanela = Math.max(1, ...janelasFallback.map(item => item.valor || 0))

  return (
    <section className="chuva-centro-card" aria-labelledby="chuva-centro-titulo">
      <header className="chuva-centro-topo">
        <div className="chuva-centro-titulo-grupo">
          <span className="chuva-centro-eyebrow">PLUVIÔMETRO CEMADEN · {estacao?.nome || 'CENTRO'}</span>
          <h2 id="chuva-centro-titulo">Precipitação acumulada nas últimas 24 horas</h2>
          <p>Estação: {estacao?.nome || 'Centro'} · Últimas 24 horas</p>
        </div>
        <div className="chuva-centro-total" aria-label={`Acumulado em 24 horas: ${formatarMm(total24h)}`}>
          <span className="chuva-centro-total-icone"><IconeGota /></span>
          <div>
            <strong>{formatarMm(total24h)}</strong>
            <small>Total oficial CEMADEN · 24 h</small>
          </div>
        </div>
      </header>

      <div className="chuva-centro-meta">
        <span>Estação {estacao?.codigo || 'CEMADEN 3121'}</span>
        <span>Leitura do catálogo: {rotuloLeituraCemaden(estacao?.dataHora)}</span>
        <span>Atualização automática · 5 min</span>
      </div>

      {serieDisponivel ? (
        <div className="chuva-centro-grafico-wrap">
          <div className="chuva-centro-legenda">
            <span><i className="chuva-centro-legenda-barra" /> Precipitação por hora</span>
            <span><i className="chuva-centro-legenda-linha" /> Precipitação acumulada na série</span>
            <small>{cobertura}/24 horários</small>
          </div>
          <svg
            className="chuva-centro-grafico"
            viewBox={`0 0 ${LARGURA} ${ALTURA}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Chuva horária e acumulado da série nas últimas 24 horas na estação ${estacao?.nome || 'Centro'}`}
          >
            <defs>
              <linearGradient id="chuva-centro-barras" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#55a9f5" />
                <stop offset="100%" stopColor="#9bd0ff" />
              </linearGradient>
            </defs>
            {intervalosChuva.map(proporcao => {
              const linhaY = MARGEM.topo + alturaArea * (1 - proporcao)
              return (
                <g key={proporcao}>
                  <line x1={MARGEM.esquerda} x2={LARGURA - MARGEM.direita} y1={linhaY} y2={linhaY} className="chuva-centro-grade" />
                  <text x={MARGEM.esquerda - 8} y={linhaY + 4} textAnchor="end" className="chuva-centro-eixo">
                    {formatarNumero(acumuladoEscala * proporcao)}
                  </text>
                  <text x={LARGURA - MARGEM.direita + 8} y={linhaY + 4} textAnchor="start" className="chuva-centro-eixo">
                    {formatarNumero(maximoAcumulado * proporcao)}
                  </text>
                </g>
              )
            })}
            {slots.map((slot, indice) => {
              const larguraBarra = Math.max(5, larguraArea / 24 * 0.56)
              if (!slot.ponto) {
                return (
                  <text key={slot.instante} x={x(indice)} y={ALTURA - 12} textAnchor="middle" className="chuva-centro-eixo">
                    {horaDoInstante(slot.instante)}
                  </text>
                )
              }
              const alturaBarra = Math.max(1, slot.ponto.valor / acumuladoEscala * alturaArea)
              const yBarra = MARGEM.topo + alturaArea - alturaBarra
              const yRotuloBarra = Math.max(MARGEM.topo + 10, yBarra - 6)
              return (
                <g key={slot.instante}>
                  <rect
                    x={x(indice) - larguraBarra / 2}
                    y={yBarra}
                    width={larguraBarra}
                    height={alturaBarra}
                    rx="3"
                    className="chuva-centro-barra"
                  >
                    <title>{`${rotuloInstante(slot.instante)} · ${formatarMm(slot.ponto.valor)}`}</title>
                  </rect>
                  <text x={x(indice)} y={yRotuloBarra} textAnchor="middle" className="chuva-centro-rotulo-barra">
                    {formatarNumero(slot.ponto.valor)}
                  </text>
                  <text x={x(indice)} y={ALTURA - 12} textAnchor="middle" className="chuva-centro-eixo">
                    {horaDoPonto(slot.ponto)}
                  </text>
                </g>
              )
            })}
            {segmentosLinha.map(segmento => segmento.length > 1 ? (
              <polyline
                key={`linha-${segmento[0]}`}
                points={segmento.map(indice => `${x(indice).toFixed(1)},${yAcumulado(acumuladoObservado[indice]).toFixed(1)}`).join(' ')}
                className="chuva-centro-curva"
              />
            ) : null)}
            {slots.map((slot, indice) => {
              if (!slot.ponto) return null
              const acumulado = acumuladoObservado[indice]
              const yRotuloAcumulado = Math.max(MARGEM.topo + 12, yAcumulado(acumulado) - 9)
              return (
                <g key={`linha-${slot.instante}`}>
                  <circle cx={x(indice)} cy={yAcumulado(acumulado)} r="3.2" className="chuva-centro-ponto">
                    <title>{`${rotuloInstante(slot.instante)} · acumulado observado na série: ${formatarMm(acumulado)}`}</title>
                  </circle>
                  <text x={x(indice)} y={yRotuloAcumulado} textAnchor="middle" className="chuva-centro-rotulo-acumulado">
                    {formatarNumero(acumulado)}
                  </text>
                </g>
              )
            })}
            <text x={MARGEM.esquerda} y="18" className="chuva-centro-eixo-titulo">Chuva por hora (mm)</text>
            <text x={LARGURA - MARGEM.direita} y="18" textAnchor="end" className="chuva-centro-eixo-titulo">Acumulado (mm)</text>
          </svg>
          <p className="chuva-centro-aviso-serie">
            Barras e curva usam registros horários recebidos; o total acima é o acumulado móvel oficial de 24 h publicado pelo CEMADEN.
            {cobertura < 24 ? ` Há ${24 - cobertura} horário(s) sem leitura na série.` : ''}
          </p>
        </div>
      ) : (
        <div className="chuva-centro-fallback">
          <div className="chuva-centro-fallback-cabecalho">
            <strong>Acumulados móveis oficiais</strong>
            <span>Série horária indisponível nesta atualização</span>
          </div>
          {janelasFallback.length ? (
            <div className="chuva-centro-janelas" role="img" aria-label="Acumulados móveis oficiais do CEMADEN por janela de tempo">
              {janelasFallback.map(item => (
                <div className="chuva-centro-janela" key={item.rotulo}>
                  <span>{item.rotulo}</span>
                  <div className="chuva-centro-janela-trilho">
                    <i style={{ width: `${Math.max(3, (item.valor! / maximoJanela) * 100)}%` }} />
                  </div>
                  <b>{formatarMm(item.valor)}</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="chuva-centro-sem-acumulado">O catálogo CEMADEN ainda não retornou acumulados para esta estação.</div>
          )}
          <p className="chuva-centro-aviso-serie">
            Os valores por janela são os acumulados publicados pelo CEMADEN; não representam uma distribuição horária estimada.
          </p>
        </div>
      )}

      <div className="chuva-centro-indicadores">
        <article className="chuva-centro-indicador">
          <span className="chuva-centro-indicador-icone chuva-centro-indicador-icone-chuva"><IconeIndicador tipo="chuva" /></span>
          <span>Maior chuva em 1 h</span>
          <strong>{formatarMm(maiorHora?.valor ?? estacao?.acumulados.umaHora)}</strong>
          <small>{maiorHora ? `às ${horaDoPonto(maiorHora)}` : 'leitura horária indisponível'}</small>
        </article>
        <article className="chuva-centro-indicador">
          <span className="chuva-centro-indicador-icone chuva-centro-indicador-icone-total"><IconeIndicador tipo="total" /></span>
          <span>Total acumulado em 24 h</span>
          <strong>{formatarMm(total24h)}</strong>
          <small>valor oficial do catálogo CEMADEN</small>
        </article>
        <article className="chuva-centro-indicador">
          <span className="chuva-centro-indicador-icone chuva-centro-indicador-icone-periodo"><IconeIndicador tipo="periodo" /></span>
          <span>{janela4h ? 'Período com mais chuva · 4 h' : 'Acumulado nas últimas 12 h'}</span>
          <strong>{formatarMm(janela4h?.valor ?? estacao?.acumulados.dozeHoras)}</strong>
          <small>{janela4h ? `${horaDoInstante(janela4h.inicio)}–${horaDoInstante(janela4h.fim)}` : 'valor oficial do catálogo CEMADEN'}</small>
        </article>
        <article className="chuva-centro-indicador">
          <span className="chuva-centro-indicador-icone chuva-centro-indicador-icone-horas"><IconeIndicador tipo="horas" /></span>
          <span>Horas com chuva</span>
          <strong>{serieDisponivel ? `${horasComChuva} h` : '—'}</strong>
          <small>{serieDisponivel ? `${cobertura} horário(s) recebido(s)` : 'aguardando série horária'}</small>
        </article>
        <article className="chuva-centro-indicador">
          <span className="chuva-centro-indicador-icone chuva-centro-indicador-icone-media"><IconeIndicador tipo="media" /></span>
          <span>Intensidade média</span>
          <strong>{intensidadeMedia == null ? '—' : `${intensidadeMedia.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mm/h`}</strong>
          <small>nas horas observadas com chuva</small>
        </article>
      </div>
    </section>
  )
}
