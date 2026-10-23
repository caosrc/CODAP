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
const MARGEM = { topo: 30, direita: 42, baixo: 38, esquerda: 42 }
const HORA_MS = 60 * 60 * 1000

function formatarMm(valor: number | null | undefined) {
  return valor == null || !Number.isFinite(valor)
    ? '—'
    : `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`
}

function horaDoPonto(ponto: PontoSerie) {
  const hora = ponto.hora.match(/\d{1,2}/)?.[0]
  return hora ? `${hora.padStart(2, '0')}h` : ponto.hora
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

function IconeGota() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2.5C12.5 8 6.5 14.2 6.5 20a9.5 9.5 0 0 0 19 0c0-5.8-6-12-9.5-17.5Z" />
      <path d="M11.2 20.3a5 5 0 0 0 4.4 4.8" className="chuva-centro-gota-brilho" />
    </svg>
  )
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
  const janela6h = maiorJanelaCompleta(slots, 6)
  const acumuladoEscala = Math.max(1, ...slots.map(slot => slot.ponto?.valor || 0))
  const acumuladoObservado = slots.reduce<number[]>((totais, slot) => {
    totais.push((totais.at(-1) || 0) + (slot.ponto?.valor || 0))
    return totais
  }, [])
  const maximoAcumulado = Math.max(1, total24h || 0, ...acumuladoObservado)
  const larguraArea = LARGURA - MARGEM.esquerda - MARGEM.direita
  const alturaArea = ALTURA - MARGEM.topo - MARGEM.baixo
  const x = (indice: number) => MARGEM.esquerda + indice * larguraArea / 23
  const yChuva = (valor: number) => MARGEM.topo + alturaArea - valor / acumuladoEscala * alturaArea
  const yAcumulado = (valor: number) => MARGEM.topo + alturaArea - valor / maximoAcumulado * alturaArea
  const pontosLinha = slots
    .filter(slot => slot.ponto)
    .map(slot => `${x(slots.indexOf(slot)).toFixed(1)},${yAcumulado(acumuladoObservado[slots.indexOf(slot)]).toFixed(1)}`)
    .join(' ')
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
          <p>Estação {estacao?.nome || 'Centro'} · Conselheiro Lafaiete/MG</p>
        </div>
        <div className="chuva-centro-total" aria-label={`Acumulado em 24 horas: ${formatarMm(total24h)}`}>
          <span className="chuva-centro-total-icone"><IconeGota /></span>
          <div>
            <strong>{formatarMm(total24h)}</strong>
            <small>Total oficial em 24 h</small>
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
            <span><i className="chuva-centro-legenda-barra" /> Chuva observada por hora</span>
            <span><i className="chuva-centro-legenda-linha" /> Acumulado da série horária</span>
            <small>{cobertura} de 24 horários com leitura</small>
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
            {[0, 0.25, 0.5, 0.75, 1].map(proporcao => {
              const linhaY = MARGEM.topo + alturaArea * (1 - proporcao)
              return (
                <g key={proporcao}>
                  <line x1={MARGEM.esquerda} x2={LARGURA - MARGEM.direita} y1={linhaY} y2={linhaY} className="chuva-centro-grade" />
                  <text x={MARGEM.esquerda - 8} y={linhaY + 4} textAnchor="end" className="chuva-centro-eixo">
                    {(acumuladoEscala * proporcao).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                  </text>
                  <text x={LARGURA - MARGEM.direita + 8} y={linhaY + 4} textAnchor="start" className="chuva-centro-eixo">
                    {(maximoAcumulado * proporcao).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                  </text>
                </g>
              )
            })}
            {slots.map((slot, indice) => {
              if (!slot.ponto) return null
              const alturaBarra = Math.max(1, slot.ponto.valor / acumuladoEscala * alturaArea)
              const larguraBarra = Math.max(5, larguraArea / 24 * 0.56)
              return (
                <g key={slot.instante}>
                  <rect
                    x={x(indice) - larguraBarra / 2}
                    y={MARGEM.topo + alturaArea - alturaBarra}
                    width={larguraBarra}
                    height={alturaBarra}
                    rx="3"
                    className="chuva-centro-barra"
                  >
                    <title>{`${rotuloInstante(slot.instante)} · ${formatarMm(slot.ponto.valor)}`}</title>
                  </rect>
                  {indice % 3 === 0 || indice === 23 ? (
                    <text x={x(indice)} y={ALTURA - 12} textAnchor="middle" className="chuva-centro-eixo">
                      {horaDoPonto(slot.ponto)}
                    </text>
                  ) : null}
                </g>
              )
            })}
            {observados.length > 1 && <polyline points={pontosLinha} className="chuva-centro-curva" />}
            {slots.map((slot, indice) => {
              if (!slot.ponto) return null
              const acumulado = acumuladoObservado[indice]
              return (
                <circle key={`linha-${slot.instante}`} cx={x(indice)} cy={yAcumulado(acumulado)} r="3.2" className="chuva-centro-ponto">
                  <title>{`${rotuloInstante(slot.instante)} · acumulado observado: ${formatarMm(acumulado)}`}</title>
                </circle>
              )
            })}
            <text x={MARGEM.esquerda} y="14" className="chuva-centro-eixo-titulo">Chuva por hora (mm)</text>
            <text x={LARGURA - MARGEM.direita} y="14" textAnchor="end" className="chuva-centro-eixo-titulo">Acumulado da série (mm)</text>
          </svg>
          {cobertura < 24 && (
            <p className="chuva-centro-aviso-serie">
              O gráfico mostra os horários recebidos; o total de 24 h acima vem do acumulado oficial do catálogo CEMADEN.
            </p>
          )}
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
          <span>Maior chuva em 1 h</span>
          <strong>{formatarMm(maiorHora?.valor ?? estacao?.acumulados.umaHora)}</strong>
          <small>{maiorHora ? `às ${horaDoPonto(maiorHora)}` : 'leitura horária indisponível'}</small>
        </article>
        <article className="chuva-centro-indicador">
          <span>Total acumulado em 24 h</span>
          <strong>{formatarMm(total24h)}</strong>
          <small>valor oficial do catálogo CEMADEN</small>
        </article>
        <article className="chuva-centro-indicador">
          <span>{janela6h ? 'Janela mais chuvosa · 6 h' : 'Acumulado nas últimas 12 h'}</span>
          <strong>{formatarMm(janela6h?.valor ?? estacao?.acumulados.dozeHoras)}</strong>
          <small>{janela6h ? `${rotuloInstante(janela6h.inicio)}–${rotuloInstante(janela6h.fim)}` : 'valor oficial do catálogo CEMADEN'}</small>
        </article>
        <article className="chuva-centro-indicador">
          <span>Horas com chuva</span>
          <strong>{serieDisponivel ? `${horasComChuva} h` : '—'}</strong>
          <small>{serieDisponivel ? `${cobertura} horário(s) recebido(s)` : 'aguardando série horária'}</small>
        </article>
        <article className="chuva-centro-indicador">
          <span>Intensidade média</span>
          <strong>{intensidadeMedia == null ? '—' : `${intensidadeMedia.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mm/h`}</strong>
          <small>nas horas observadas com chuva</small>
        </article>
      </div>
    </section>
  )
}
