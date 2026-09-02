import { useCallback, useEffect, useMemo, useState } from 'react'
import './MonitoramentoCNL.css'

type EstacaoCNL = {
  id: number
  uf: string
  cidade: string
  nome: string
  codigo: string
  ultimoValor: number | null
  dataHora: string
  precipitacaoAtual: number | null
  precipitacaoDataHora: string
  precipitacaoDiaria: PrecipitacaoDia[]
  acumulados: {
    umaHora: number | null
    seisHoras: number | null
    dozeHoras: number | null
    vinteQuatroHoras: number | null
    setentaEDuasHoras: number | null
  }
}

type PrecipitacaoDia = {
  data: string
  total: number
  pontos: number
  ultimaDataHora: string
}

type LeituraCNL = EstacaoCNL & {
  latitude: number | null
  longitude: number | null
  tipo: string
  status: string
  cotas: CotasCNL
}

type CotasCNL = {
  atencao: number | null
  alerta: number | null
  transbordamento: number | null
}

type PontoSerie = {
  data: string
  hora: string
  valor: number
}

type PontoNivel = {
  dataHora: string
  valor: number
}

type NivelAtual = PontoNivel & {
  qualificacao?: string
}

type DadosCNL = {
  sucesso: boolean
  estacao: LeituraCNL
  estacoes: EstacaoCNL[]
  serie: PontoSerie[]
  nivelAtual: NivelAtual | null
  serieNivel: PontoNivel[]
  cotasConfiguradas?: boolean
  atualizadoEm: string
  fonte: string
  aviso?: string
}

type Props = {
  onAbrirMapa?: (latitude: number, longitude: number, nome: string) => void
}

const INTERVALO_ATUALIZACAO = 5 * 60 * 1000
const FUSO_HORARIO = 'America/Sao_Paulo'

function formatarMm(valor: number | null | undefined): string {
  return valor == null || !Number.isFinite(valor) ? '—' : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mm`
}

function formatarCota(valor: number | null | undefined): string {
  return valor == null || !Number.isFinite(valor) ? '—' : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m`
}

function formatarDiaPrecipitacao(data: string): string {
  const partes = data.split('-')
  return partes.length === 3 ? `${partes[2]}/${partes[1]}` : data
}

function formatarDataHora(iso?: string): string {
  if (!iso) return '—'
  const data = parseDataCemaden(iso)
  return data
    ? data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: FUSO_HORARIO })
    : iso
}

function parseDataCemaden(valor: string): Date | null {
  const texto = String(valor || '').trim()
  const brasileiro = texto.match(/^(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (brasileiro) {
    const ano = Number(brasileiro[3].length === 2 ? `20${brasileiro[3]}` : brasileiro[3])
    const data = new Date(Date.UTC(ano, Number(brasileiro[2]) - 1, Number(brasileiro[1]), Number(brasileiro[4]), Number(brasileiro[5]), Number(brasileiro[6] || 0)))
    return Number.isNaN(data.getTime()) ? null : data
  }
  const isoSemFuso = texto.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/)
  const data = new Date(isoSemFuso ? `${isoSemFuso[1]}T${isoSemFuso[2]}Z` : texto)
  return Number.isNaN(data.getTime()) ? null : data
}

function estadoEstacao(dataHora: string): 'atualizada' | 'atencao' | 'sem-dados' {
  const data = parseDataCemaden(dataHora)
  if (!data) return 'sem-dados'
  const horas = (Date.now() - data.getTime()) / (60 * 60 * 1000)
  if (horas <= 3) return 'atualizada'
  if (horas <= 24) return 'atencao'
  return 'sem-dados'
}

function rotuloEstado(estado: ReturnType<typeof estadoEstacao>): string {
  if (estado === 'atualizada') return 'Atualizada'
  if (estado === 'atencao') return 'Atenção'
  return 'Sem dados recentes'
}

function ChartaChuva({ pontos }: { pontos: PontoSerie[] }) {
  const largura = 620
  const altura = 190
  const margem = { topo: 18, direita: 18, baixo: 34, esquerda: 36 }
  const valores = pontos.map((ponto) => ponto.valor)
  const maior = Math.max(...valores, 1)
  const areaLargura = largura - margem.esquerda - margem.direita
  const areaAltura = altura - margem.topo - margem.baixo
  const pontosSvg = pontos.map((ponto, indice) => {
    const x = margem.esquerda + (pontos.length <= 1 ? areaLargura / 2 : indice * areaLargura / (pontos.length - 1))
    const y = margem.topo + areaAltura - (ponto.valor / maior) * areaAltura
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  if (pontos.length === 0) {
    return <div className="cnl-grafico-vazio">A estação ainda não retornou pontos horários para o período.</div>
  }

  return (
    <div className="cnl-grafico-wrap">
      <svg className="cnl-grafico" viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label="Chuva acumulada por hora nas últimas 24 horas">
        {[0, 0.5, 1].map((proporcao) => {
          const y = margem.topo + areaAltura - proporcao * areaAltura
          return <line key={proporcao} x1={margem.esquerda} x2={largura - margem.direita} y1={y} y2={y} className="cnl-grafico-grade" />
        })}
        <polyline points={pontosSvg} className="cnl-grafico-linha" />
        {pontos.map((ponto, indice) => {
          const x = margem.esquerda + (pontos.length <= 1 ? areaLargura / 2 : indice * areaLargura / (pontos.length - 1))
          const y = margem.topo + areaAltura - (ponto.valor / maior) * areaAltura
          return <circle key={`${ponto.data}-${ponto.hora}-${indice}`} cx={x} cy={y} r="3.5" className="cnl-grafico-ponto" />
        })}
        <text x={margem.esquerda - 8} y={margem.topo + 4} textAnchor="end" className="cnl-grafico-label">{maior.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</text>
        <text x={margem.esquerda - 8} y={margem.topo + areaAltura + 4} textAnchor="end" className="cnl-grafico-label">0</text>
        <text x={margem.esquerda} y={altura - 8} className="cnl-grafico-label">{formatarPontoChuva(pontos[0])}</text>
        <text x={largura - margem.direita} y={altura - 8} textAnchor="end" className="cnl-grafico-label">{formatarPontoChuva(pontos.at(-1))}</text>
      </svg>
      <div className="cnl-grafico-legenda">Acumulado horário em milímetros · horário informado pelo CEMADEN</div>
    </div>
  )
}

function formatarPontoChuva(ponto?: PontoSerie): string {
  if (!ponto) return '—'
  const hora = ponto.hora.match(/\d{1,2}/)?.[0]
  return hora ? formatarDataHora(`${ponto.data} ${hora.padStart(2, '0')}:00`) : ponto.hora
}

function GraficoNivel({ pontos }: { pontos: PontoNivel[] }) {
  const largura = 620
  const altura = 190
  const margem = { topo: 18, direita: 18, baixo: 34, esquerda: 42 }
  const valores = pontos.map((ponto) => ponto.valor)
  const maior = Math.max(...valores, 0.5)
  const areaLargura = largura - margem.esquerda - margem.direita
  const areaAltura = altura - margem.topo - margem.baixo
  const pontosSvg = pontos.map((ponto, indice) => {
    const x = margem.esquerda + (pontos.length <= 1 ? areaLargura / 2 : indice * areaLargura / (pontos.length - 1))
    const y = margem.topo + areaAltura - (ponto.valor / maior) * areaAltura
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  if (pontos.length === 0) {
    return <div className="cnl-grafico-vazio">A estação ainda não retornou pontos de nível para o período.</div>
  }

  return (
    <div className="cnl-grafico-wrap">
      <svg className="cnl-grafico" viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label="Nível do Rio Bananeiras nas últimas 24 horas">
        {[0, 0.5, 1].map((proporcao) => {
          const y = margem.topo + areaAltura - proporcao * areaAltura
          return <line key={proporcao} x1={margem.esquerda} x2={largura - margem.direita} y1={y} y2={y} className="cnl-grafico-grade" />
        })}
        <polyline points={pontosSvg} className="cnl-grafico-linha cnl-grafico-linha-nivel" />
        <polyline points={pontosSvg} className="cnl-grafico-linha-nivel-pulso" aria-hidden="true" />
        {pontos.map((ponto, indice) => {
          const x = margem.esquerda + (pontos.length <= 1 ? areaLargura / 2 : indice * areaLargura / (pontos.length - 1))
          const y = margem.topo + areaAltura - (ponto.valor / maior) * areaAltura
          const atual = indice === pontos.length - 1
          return (
            <g key={`${ponto.dataHora}-${indice}`}>
              {atual && <circle cx={x} cy={y} r="8" className="cnl-grafico-ponto-atual" aria-hidden="true" />}
              <circle cx={x} cy={y} r={atual ? '4.5' : '3.5'} className="cnl-grafico-ponto cnl-grafico-ponto-nivel" />
            </g>
          )
        })}
        <text x={margem.esquerda - 8} y={margem.topo + 4} textAnchor="end" className="cnl-grafico-label">{maior.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m</text>
        <text x={margem.esquerda - 8} y={margem.topo + areaAltura + 4} textAnchor="end" className="cnl-grafico-label">0 m</text>
        <text x={margem.esquerda} y={altura - 8} className="cnl-grafico-label">{formatarDataHora(pontos[0]?.dataHora)}</text>
        <text x={largura - margem.direita} y={altura - 8} textAnchor="end" className="cnl-grafico-label">{formatarDataHora(pontos.at(-1)?.dataHora)}</text>
      </svg>
      <div className="cnl-grafico-legenda">Cota instantânea em metros · cálculo oficial do CEMADEN</div>
    </div>
  )
}

function CartaoMetrica({ rotulo, valor, detalhe, classe = '' }: { rotulo: string; valor: string; detalhe: string; classe?: string }) {
  return (
    <div className={`cnl-metrica ${classe}`}>
      <span className="cnl-metrica-rotulo">{rotulo}</span>
      <strong>{valor}</strong>
      <span className="cnl-metrica-detalhe">{detalhe}</span>
    </div>
  )
}

export default function MonitoramentoCNL({ onAbrirMapa }: Props) {
  const [dados, setDados] = useState<DadosCNL | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState('')
  const [editandoCotas, setEditandoCotas] = useState(false)
  const [salvandoCotas, setSalvandoCotas] = useState(false)
  const [erroCotas, setErroCotas] = useState('')
  const [cotasSalvas, setCotasSalvas] = useState('')
  const [cotasForm, setCotasForm] = useState({ atencao: '', alerta: '', transbordamento: '' })

  const carregar = useCallback(async () => {
    setAtualizando(true)
    try {
      const resposta = await fetch('/api/monitoramento-cnl', { cache: 'no-store' })
      const corpo = await resposta.json() as DadosCNL & { erro?: string }
      if (!resposta.ok || !corpo.sucesso) throw new Error(corpo.erro || 'O CEMADEN não retornou dados.')
      setDados(corpo)
      setErro('')
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível consultar o CEMADEN.')
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
    const timer = window.setInterval(carregar, INTERVALO_ATUALIZACAO)
    return () => window.clearInterval(timer)
  }, [carregar])

  useEffect(() => {
    if (!dados || editandoCotas) return
    setCotasForm({
      atencao: dados.estacao.cotas.atencao?.toString() || '',
      alerta: dados.estacao.cotas.alerta?.toString() || '',
      transbordamento: dados.estacao.cotas.transbordamento?.toString() || '',
    })
  }, [dados, editandoCotas])

  const iniciarEdicaoCotas = () => {
    if (!dados) return
    setCotasForm({
      atencao: dados.estacao.cotas.atencao?.toString() || '',
      alerta: dados.estacao.cotas.alerta?.toString() || '',
      transbordamento: dados.estacao.cotas.transbordamento?.toString() || '',
    })
    setErroCotas('')
    setCotasSalvas('')
    setEditandoCotas(true)
  }

  const salvarCotas = async () => {
    const valores = {
      atencao: Number(cotasForm.atencao.replace(',', '.')),
      alerta: Number(cotasForm.alerta.replace(',', '.')),
      transbordamento: Number(cotasForm.transbordamento.replace(',', '.')),
    }
    if (!Object.values(valores).every((valor) => Number.isFinite(valor) && valor >= 0 && valor <= 100)) {
      setErroCotas('Informe valores entre 0 e 100 metros.')
      return
    }
    if (!(valores.atencao < valores.alerta && valores.alerta < valores.transbordamento)) {
      setErroCotas('A ordem precisa ser: Atenção < Alerta < Transbordamento.')
      return
    }

    setSalvandoCotas(true)
    setErroCotas('')
    try {
      const resposta = await fetch('/api/monitoramento-cnl/cotas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(valores),
      })
      const corpo = await resposta.json() as { sucesso?: boolean; cotas?: CotasCNL; erro?: string }
      if (!resposta.ok || !corpo.sucesso || !corpo.cotas) throw new Error(corpo.erro || 'Não foi possível salvar as cotas.')
      setDados((anterior) => anterior ? {
        ...anterior,
        cotasConfiguradas: true,
        estacao: { ...anterior.estacao, cotas: corpo.cotas! },
      } : anterior)
      setEditandoCotas(false)
      setCotasSalvas('Cotas salvas para todos os agentes do monitoramento.')
    } catch (falha) {
      setErroCotas(falha instanceof Error ? falha.message : 'Não foi possível salvar as cotas.')
    } finally {
      setSalvandoCotas(false)
    }
  }

  const estadoNivelAtual = dados ? estadoNivel(dados.nivelAtual?.valor, dados.estacao.cotas) : 'sem-dados'

  useEffect(() => {
    const leitura = dados?.nivelAtual
    const cotas = dados?.estacao.cotas
    if (!leitura || leitura.valor == null || estadoNivelAtual === 'normal' || estadoNivelAtual === 'sem-dados') return
    const cotaAtingida = cotas?.[estadoNivelAtual]
    if (cotaAtingida == null) return

    const chave = `cnl-notificacao-nivel:${estadoNivelAtual}:${leitura.dataHora}:${cotaAtingida}`
    try {
      if (localStorage.getItem('cnl-ultima-notificacao-nivel') === chave) return
      localStorage.setItem('cnl-ultima-notificacao-nivel', chave)
    } catch {
      // O alerta visível na página continua funcionando mesmo sem localStorage.
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(`Rio Bananeiras · ${rotuloNivel(estadoNivelAtual)}`, {
        body: `Nível atual: ${formatarCota(leitura.valor)}. Cota de referência: ${formatarCota(cotaAtingida)}.`,
        tag: `cnl-nivel-${estadoNivelAtual}`,
      })
    }
  }, [dados, estadoNivelAtual])

  const acumulado24h = useMemo(() => {
    if (!dados) return null
    return dados.estacao.acumulados.vinteQuatroHoras
  }, [dados])

  const diasPrecipitacao = useMemo(() => {
    if (!dados) return []
    return [...new Set(dados.estacoes.flatMap((estacao) => estacao.precipitacaoDiaria.map((dia) => dia.data)))]
      .sort()
      .reverse()
      .slice(0, 2)
  }, [dados])

  if (carregando && !dados) {
    return <div className="cnl-pagina"><div className="cnl-carregando">Consultando estações do CEMADEN…</div></div>
  }

  if (!dados) {
    return (
      <div className="cnl-pagina">
        <div className="cnl-erro">
          <strong>Monitoramento temporariamente indisponível</strong>
          <span>{erro || 'Não foi possível carregar a estação Rio Bananeiras.'}</span>
          <button className="cnl-btn-principal" onClick={carregar}>Tentar novamente</button>
        </div>
      </div>
    )
  }

  const { estacao } = dados
  const estadoPrincipal = estadoEstacao(estacao.dataHora)
  return (
    <div className="cnl-pagina">
      <section className="cnl-cabecalho">
        <div className="cnl-kicker"><span className="cnl-pulse" /> CNL · Centro de Monitoramento</div>
        <div className="cnl-titulo-linha">
          <div>
            <h1>Monitoramento CNL</h1>
            <p>Cheias, chuva e estações de Conselheiro Lafaiete</p>
          </div>
          <button className="cnl-btn-atualizar" onClick={carregar} disabled={atualizando} title="Atualizar agora">
            {atualizando ? '⟳' : '↻'} <span>{atualizando ? 'Consultando' : 'Atualizar'}</span>
          </button>
        </div>
        <div className="cnl-fonte-strip">
          <span>Fonte oficial: CEMADEN</span>
          <span>Última consulta: {formatarDataHora(dados.atualizadoEm)}</span>
        </div>
      </section>

      {erro && <div className="cnl-aviso-atualizacao">Não foi possível atualizar agora. Exibindo a última leitura válida.</div>}

      <section className="cnl-hero">
        <div className="cnl-hero-identidade">
          <div className="cnl-icone-agua">≋</div>
          <div>
            <span className="cnl-eyebrow">Estação hidrológica monitorada</span>
            <h2>{estacao.nome}</h2>
            <p>{estacao.cidade} · {estacao.codigo}</p>
          </div>
        </div>
        <div className={`cnl-status-principal cnl-status-${estadoPrincipal}`}>
          <span className="cnl-status-ponto" />
          <div><strong>{rotuloEstado(estadoPrincipal)}</strong><small>{formatarDataHora(estacao.dataHora) || 'Sem horário'} · Brasília</small></div>
        </div>
        <div className="cnl-hero-acoes">
          {onAbrirMapa && estacao.latitude != null && estacao.longitude != null && (
            <button className="cnl-btn-secundario" onClick={() => onAbrirMapa(estacao.latitude!, estacao.longitude!, estacao.nome)}>
              ⌖ Abrir no mapa
            </button>
          )}
          <a className="cnl-btn-secundario" href="https://resources.cemaden.gov.br/graficos/interativo/grafico_pcds.php?idpcd=6622" target="_blank" rel="noreferrer">
            Ver CEMADEN ↗
          </a>
        </div>
      </section>

      <section className="cnl-metricas">
        <CartaoMetrica
          rotulo="Nível atual do rio"
          valor={formatarCota(dados.nivelAtual?.valor)}
          detalhe={`Leitura em ${formatarDataHora(dados.nivelAtual?.dataHora)}`}
          classe="cnl-metrica-azul"
        />
        <CartaoMetrica
          rotulo="Chuva na última hora"
          valor={formatarMm(estacao.precipitacaoAtual)}
          detalhe={`Leitura em ${formatarDataHora(estacao.precipitacaoDataHora)}`}
          classe="cnl-metrica-verde"
        />
        <CartaoMetrica
          rotulo="Acumulado móvel em 24h"
          valor={formatarMm(acumulado24h)}
          detalhe="Janela móvel informada pelo CEMADEN"
          classe={acumulado24h != null && acumulado24h >= 30 ? 'cnl-metrica-laranja' : 'cnl-metrica-verde'}
        />
        <CartaoMetrica
          rotulo="Status do nível"
          valor={rotuloNivel(estadoNivelAtual)}
          detalhe={`Alerta a partir de ${formatarCota(estacao.cotas.alerta)}`}
          classe="cnl-metrica-roxa"
        />
      </section>

      <section className={`cnl-nivel-destaque cnl-nivel-${estadoNivelAtual}`}>
        <div className="cnl-nivel-icone">≋</div>
        <div className="cnl-nivel-conteudo">
          <span className="cnl-eyebrow">Leitura hidrológica em tempo real</span>
          <strong>{formatarCota(dados.nivelAtual?.valor)}</strong>
          <span>{rotuloNivel(estadoNivelAtual)} · última leitura {formatarDataHora(dados.nivelAtual?.dataHora)}</span>
        </div>
        <p>Fonte oficial CEMADEN. Atualização automática a cada 5 minutos.</p>
      </section>

      {estadoNivelAtual !== 'normal' && estadoNivelAtual !== 'sem-dados' && dados.nivelAtual && (
        <section className={`cnl-alerta cnl-alerta-${estadoNivelAtual}`} role="alert">
          <div className="cnl-alerta-icone">!</div>
          <div>
            <strong>Notificação de {rotuloNivel(estadoNivelAtual).toLowerCase()}</strong>
            <p>O nível do Rio Bananeiras está em {formatarCota(dados.nivelAtual.valor)}, atingindo a cota de {formatarCota(estacao.cotas[estadoNivelAtual])}. Acompanhe a evolução e prepare a resposta.</p>
          </div>
        </section>
      )}

      <section className="cnl-bloco">
        <div className="cnl-bloco-cabecalho">
          <div><span className="cnl-eyebrow">Chuva acumulada</span><h2>Últimas 24 horas</h2></div>
          <span className="cnl-badge-fonte">Atualização automática · 5 min</span>
        </div>
        <ChartaChuva pontos={dados.serie} />
      </section>

      <section className="cnl-bloco">
        <div className="cnl-bloco-cabecalho">
          <div><span className="cnl-eyebrow">Cota instantânea</span><h2>Nível do Rio Bananeiras</h2></div>
          <span className="cnl-badge-fonte cnl-badge-ao-vivo"><span className="cnl-badge-ponto" /> ao vivo · 5 min · Brasília</span>
        </div>
        <GraficoNivel pontos={dados.serieNivel} />
      </section>

      <section className="cnl-bloco">
        <div className="cnl-bloco-cabecalho">
          <div><span className="cnl-eyebrow">Referência hidrológica</span><h2>Cotas de acompanhamento</h2></div>
          {!editandoCotas && <button className="cnl-btn-editar" onClick={iniciarEdicaoCotas}>✎ Editar cotas</button>}
        </div>
        {editandoCotas ? (
          <div className="cnl-cotas-editor">
            <p>Os valores atuais vieram do CEMADEN. Ajuste as referências usadas pelos alertas do aplicativo.</p>
            <div className="cnl-cotas">
              {([
                ['atencao', 'Atenção', 'começar a observar'],
                ['alerta', 'Alerta', 'preparar resposta'],
                ['transbordamento', 'Transbordamento', 'risco de cheia'],
              ] as const).map(([chave, rotulo, descricao]) => (
                <label key={chave} className={`cnl-cota cnl-cota-${chave}`}>
                  <span className="cnl-cota-linha" />
                  <span>{rotulo}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={cotasForm[chave]}
                    onChange={(evento) => setCotasForm((anterior) => ({ ...anterior, [chave]: evento.target.value }))}
                    aria-label={`Cota de ${rotulo}`}
                  />
                  <small>{descricao} · metros</small>
                </label>
              ))}
            </div>
            {erroCotas && <div className="cnl-cotas-erro" role="alert">{erroCotas}</div>}
            <div className="cnl-cotas-acoes">
              <button className="cnl-btn-cancelar" onClick={() => { setEditandoCotas(false); setErroCotas('') }} disabled={salvandoCotas}>Cancelar</button>
              <button className="cnl-btn-principal cnl-btn-salvar" onClick={salvarCotas} disabled={salvandoCotas}>{salvandoCotas ? 'Salvando…' : 'Salvar cotas'}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="cnl-cotas">
              <div className="cnl-cota cnl-cota-atencao"><span className="cnl-cota-linha" /><span>Atenção</span><strong>{formatarCota(estacao.cotas.atencao)}</strong><small>começar a observar</small></div>
              <div className="cnl-cota cnl-cota-alerta"><span className="cnl-cota-linha" /><span>Alerta</span><strong>{formatarCota(estacao.cotas.alerta)}</strong><small>preparar resposta</small></div>
              <div className="cnl-cota cnl-cota-transbordamento"><span className="cnl-cota-linha" /><span>Transbordamento</span><strong>{formatarCota(estacao.cotas.transbordamento)}</strong><small>risco de cheia</small></div>
            </div>
            <div className="cnl-cotas-rodape">{dados.cotasConfiguradas ? 'Referências personalizadas para os alertas do aplicativo.' : 'Referências oficiais atuais do CEMADEN.'}{cotasSalvas && <strong>{cotasSalvas}</strong>}</div>
          </>
        )}
      </section>

      <section className="cnl-bloco">
        <div className="cnl-bloco-cabecalho">
          <div><span className="cnl-eyebrow">Precipitação diária</span><h2>Acumulado por estação</h2></div>
          <span className="cnl-badge-fonte cnl-badge-ao-vivo"><span className="cnl-badge-ponto" /> atualiza · 5 min</span>
        </div>
        {diasPrecipitacao.length === 0 ? (
          <div className="cnl-grafico-vazio">Ainda não há leituras diárias disponíveis.</div>
        ) : (
          <div className="cnl-tabela-chuva-wrap">
            <div className="cnl-tabela-chuva" role="table" aria-label="Acumulado diário de precipitação por estação">
              <div className="cnl-tabela-chuva-linha cnl-tabela-chuva-cabecalho" role="row" style={{ gridTemplateColumns: `minmax(9rem, 1.6fr) minmax(5.5rem, 0.8fr) repeat(${diasPrecipitacao.length}, minmax(5rem, 1fr))` }}>
                <strong role="columnheader">Estação</strong>
                <strong role="columnheader">Agora</strong>
                {diasPrecipitacao.map((dia) => <strong key={dia} role="columnheader">{formatarDiaPrecipitacao(dia)}</strong>)}
              </div>
              {dados.estacoes.map((item) => (
                <div key={item.id} className="cnl-tabela-chuva-linha" role="row" style={{ gridTemplateColumns: `minmax(9rem, 1.6fr) minmax(5.5rem, 0.8fr) repeat(${diasPrecipitacao.length}, minmax(5rem, 1fr))` }}>
                  <span className="cnl-tabela-chuva-estacao" role="cell">
                    <strong>{item.nome}</strong>
                    <small>{item.codigo || `CEMADEN ${item.id}`}</small>
                  </span>
                  <span role="cell" className="cnl-tabela-chuva-agora">{formatarMm(item.precipitacaoAtual)}<small>{formatarDataHora(item.precipitacaoDataHora)}</small></span>
                  {diasPrecipitacao.map((dia) => {
                    const leitura = item.precipitacaoDiaria.find((itemDia) => itemDia.data === dia)
                    return <span key={dia} role="cell" className="cnl-tabela-chuva-total">{formatarMm(leitura?.total)}</span>
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="cnl-tabela-chuva-nota">“Agora” é o acumulado da última hora. Os totais diários são a soma das leituras horárias do CEMADEN no horário de Brasília.</p>
      </section>

      <section className="cnl-bloco">
        <div className="cnl-bloco-cabecalho">
          <div><span className="cnl-eyebrow">Rede local</span><h2>Estações em Conselheiro Lafaiete</h2></div>
          <span className="cnl-contador">{dados.estacoes.length} estações</span>
        </div>
        <div className="cnl-estacoes">
          {dados.estacoes.map((item) => {
            const estado = estadoEstacao(item.dataHora)
            const selecionada = item.id === estacao.id
            return (
              <div key={item.id} className={`cnl-estacao ${selecionada ? 'cnl-estacao-selecionada' : ''}`}>
                <div className="cnl-estacao-titulo">
                  <span className={`cnl-estacao-dot cnl-estacao-dot-${estado}`} />
                  <strong>{item.nome}</strong>
                  {selecionada && <span className="cnl-tag-rio">RIO</span>}
                </div>
                <span className="cnl-estacao-codigo">{item.codigo || `CEMADEN ${item.id}`}</span>
                <span className="cnl-estacao-leitura">{formatarMm(item.precipitacaoDiaria.at(-1)?.total)} <small>no dia</small></span>
                <span className={`cnl-estacao-status cnl-estacao-status-${estado}`}>{rotuloEstado(estado)}</span>
              </div>
            )
          })}
        </div>
      </section>

      <footer className="cnl-rodape">
        <span>Dados públicos do Centro Nacional de Monitoramento e Alertas de Desastres Naturais.</span>
        <a href={dados.fonte} target="_blank" rel="noreferrer">Abrir fonte original ↗</a>
        {dados.aviso && <small>{dados.aviso}</small>}
      </footer>
    </div>
  )
}

function estacoesAtivas(estacoes: EstacaoCNL[]): number {
  return estacoes.filter((estacao) => estadoEstacao(estacao.dataHora) !== 'sem-dados').length
}

type EstadoNivel = 'normal' | 'atencao' | 'alerta' | 'transbordamento' | 'sem-dados'

function estadoNivel(valor: number | null | undefined, cotas: LeituraCNL['cotas']): EstadoNivel {
  if (valor == null || !Number.isFinite(valor)) return 'sem-dados'
  if (cotas.transbordamento != null && valor >= cotas.transbordamento) return 'transbordamento'
  if (cotas.alerta != null && valor >= cotas.alerta) return 'alerta'
  if (cotas.atencao != null && valor >= cotas.atencao) return 'atencao'
  return 'normal'
}

function rotuloNivel(estado: EstadoNivel): string {
  if (estado === 'transbordamento') return 'Transbordamento'
  if (estado === 'alerta') return 'Alerta'
  if (estado === 'atencao') return 'Atenção'
  if (estado === 'normal') return 'Normal'
  return 'Sem dados'
}