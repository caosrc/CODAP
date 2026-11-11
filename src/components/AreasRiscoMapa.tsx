import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Marker, Polygon, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import ModalSenha from './ModalSenha'
import './AreasRiscoMapa.css'
import {
  areaRiscoTemPoligono,
  clonarGeometriaAreaRisco,
  contarVerticesAreaRisco,
  listarCoordenadasAreaRisco,
  ESTILO_AREA_RISCO,
  TIPOS_AREAS_RISCO,
  type AreaRisco,
  type AreaRiscoInput,
  type AtributoKmz,
  type GeometriaAreaRisco,
  type TipoAreaRisco,
} from '../areasRisco'
import { exportarPoligonosKmz, importarPoligonosKmz, type PoligonoKmzImportado } from '../areasRiscoKmz'

export interface AreasRiscoMapaProps {
  painelHost: HTMLDivElement | null
  modoTv: boolean
  areas: AreaRisco[]
  previsaoPorArea: Record<string, number | null>
  alertaSonoroAtivo: boolean
  onAlternarAlertaSonoro: () => void
  carregando: boolean
  salvando: boolean
  agenteLogado: string
  senhaAgente: string | null
  erro: string | null
  onSalvar: (input: AreaRiscoInput) => Promise<void>
  onSalvarLote: (inputs: AreaRiscoInput[]) => Promise<void>
  onEditar: (id: string, input: AreaRiscoInput) => Promise<void>
  onExcluir: (id: string) => Promise<void>
  onAbrirOcorrencia?: (id: number) => void
}

const TIPOS = TIPOS_AREAS_RISCO
const ROTULOS_TIPOS_COMPACTOS: Partial<Record<TipoAreaRisco, string>> = {
  'Problemas de vias': 'Vias',
  Deslizamentos: 'Desliz.',
}
const CORES = Object.fromEntries(
  TIPOS.map(tipo => [tipo, ESTILO_AREA_RISCO[tipo].cor]),
) as Record<TipoAreaRisco, string>

const ICONES: Record<TipoAreaRisco, string> = {
  Encostas: '<path d="M4 19 11 6l4 7 2-3 3 9H4Z"/><path d="M8 19h.01M12 19h.01M17 19h.01"/>',
  'Erosões': '<path d="M5 5h14M6 9h12M7 13h10M9 17h6"/><path d="m11 5-2 4 2 4-2 4"/>',
  Drenagem: '<path d="M12 3v13"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  Alagamentos: '<path d="M4 9c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2"/><path d="M4 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2"/><path d="M7 19h10"/>',
  Deslizamentos: '<path d="m4 18 5-8 3 4 3-7 5 11H4Z"/><path d="m7 5 2 2m8 7 2 2"/>',
  'Problemas de vias': '<path d="M8 3 5 21m11-18 3 18"/><path d="M12 4v3m0 3v3m0 3v3"/>',
  Obras: '<path d="m14 6 4 4M5 19l8-8"/><path d="m16 4 4 4-3 3-4-4 3-3ZM4 20l2-5 3 3-5 2Z"/>',
  Interdições: '<path d="M3 9h18M3 15h18M6 9v6m12-6v6"/><path d="m4 9 4 6m4-6 4 6m4-6 4 6"/>',
}

interface DraftArea {
  tipo: TipoAreaRisco
  latitude: number | null
  longitude: number | null
  poligono: GeometriaAreaRisco
  data_inicio: string
  limite_precipitacao_mm: string
  referencia: string
  observacao: string
  atributos_kmz: AtributoKmz[]
}

type GateAction = { tipo: 'editar' | 'excluir'; area: AreaRisco }

function dataHoje() {
  const hoje = new Date()
  const local = new Date(hoje.getTime() - hoje.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function novaArea(tipo: TipoAreaRisco = 'Encostas'): DraftArea {
  return {
    tipo,
    latitude: null,
    longitude: null,
    poligono: [],
    data_inicio: dataHoje(),
    limite_precipitacao_mm: tipo === 'Interdições' ? '0' : '30',
    referencia: '',
    observacao: '',
    atributos_kmz: [],
  }
}

function adicionarVertice(geometria: GeometriaAreaRisco, ponto: [number, number]): GeometriaAreaRisco {
  const copia = clonarGeometriaAreaRisco(geometria)
  if (!copia[0]) copia.push([[]])
  if (!copia[0][0]) copia[0].unshift([])
  copia[0][0].push(ponto)
  return copia
}

function desfazerUltimoVertice(geometria: GeometriaAreaRisco): GeometriaAreaRisco {
  const copia = clonarGeometriaAreaRisco(geometria)
  if (!copia[0]?.[0]?.length) return copia
  copia[0][0].pop()
  if (!copia[0][0].length) copia[0].shift()
  if (!copia[0].length) copia.shift()
  return copia
}

function reposicionarVertice(
  geometria: GeometriaAreaRisco,
  indicePoligono: number,
  indiceAnel: number,
  indiceVertice: number,
  ponto: [number, number],
): GeometriaAreaRisco {
  const copia = clonarGeometriaAreaRisco(geometria)
  if (copia[indicePoligono]?.[indiceAnel]?.[indiceVertice]) {
    copia[indicePoligono][indiceAnel][indiceVertice] = ponto
  }
  return copia
}

function criarRascunhoImportado(poligono: PoligonoKmzImportado, tipoFallback: TipoAreaRisco): DraftArea {
  const tipo = poligono.tipo ?? tipoFallback
  const base = novaArea(tipo)
  return {
    ...base,
    latitude: poligono.latitude,
    longitude: poligono.longitude,
    poligono: clonarGeometriaAreaRisco(poligono.poligono),
    data_inicio: poligono.data_inicio ?? base.data_inicio,
    limite_precipitacao_mm: base.limite_precipitacao_mm,
    referencia: poligono.referencia ?? poligono.nome,
    observacao: poligono.observacao ?? '',
    atributos_kmz: poligono.atributos ?? [],
  }
}

function EnquadrarPoligonosImportados({
  poligonos,
  versao,
}: {
  poligonos: PoligonoKmzImportado[]
  versao: number
}) {
  const mapa = useMap()
  useEffect(() => {
    if (!poligonos.length || versao === 0) return
    const limites = L.latLngBounds([])
    for (const importado of poligonos) {
      for (const ponto of listarCoordenadasAreaRisco(importado.poligono)) limites.extend(ponto)
    }
    if (!limites.isValid()) return
    const frame = window.requestAnimationFrame(() => {
      mapa.fitBounds(limites, { padding: [48, 48], maxZoom: 16, animate: false })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [mapa, poligonos, versao])
  return null
}

function iconeArea(tipo: TipoAreaRisco, alerta = false) {
  const cor = CORES[tipo]
  const html = `<span class="arm-marker${alerta ? ' arm-marker-alerta' : ''}" style="--arm-type-color:${cor}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES[tipo]}</svg></span>`
  return L.divIcon({
    className: 'arm-marker-shell',
    html,
    iconSize: [34, 42],
    iconAnchor: [17, 38],
    popupAnchor: [0, -37],
  })
}

function InteracaoMapa({
  modo,
  aoMarcar,
  aoAdicionarPonto,
}: {
  modo: 'marcador' | 'poligono' | null
  aoMarcar: (latitude: number, longitude: number) => void
  aoAdicionarPonto: (ponto: [number, number]) => void
}) {
  useMapEvents({
    click(event) {
      if (modo === 'marcador') aoMarcar(event.latlng.lat, event.latlng.lng)
      if (modo === 'poligono') aoAdicionarPonto([event.latlng.lat, event.latlng.lng])
    },
  })
  return null
}

function formatarData(data: string) {
  if (!data) return '—'
  const parsed = new Date(`${data.slice(0, 10)}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? data : parsed.toLocaleDateString('pt-BR')
}

function formatarPrecipitacao(valor: number | null | undefined) {
  return valor == null
    ? 'Sem dado'
    : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mm`
}

function rotuloAtributoKmz(campo: string) {
  return campo
    .split('_')
    .filter(Boolean)
    .map(parte => parte.charAt(0).toLocaleUpperCase('pt-BR') + parte.slice(1))
    .join(' ')
}

function PopupInformacaoKmz({
  importado,
  tipoSelecionado,
  onEditar,
}: {
  importado: PoligonoKmzImportado
  tipoSelecionado?: TipoAreaRisco
  onEditar?: () => void
}) {
  const atributos = importado.atributos?.filter(item => item.valor.trim()) ?? []
  return (
    <Popup>
      <div className="arm-popup">
        <div className="arm-popup-title" style={{ color: '#8e52c7' }}>{importado.nome}</div>
        {tipoSelecionado && <div>Tipo para cadastro: <strong>{tipoSelecionado}</strong></div>}
        {atributos.length > 0 ? (
          <>
            <div className="arm-popup-notes"><strong>Informações do arquivo KMZ</strong></div>
            <div className="arm-kmz-popup-attrs">
              {atributos.map(({ campo, valor }, indice) => (
                <div key={`${campo}-${indice}`}><strong>{rotuloAtributoKmz(campo)}:</strong> {valor}</div>
              ))}
            </div>
          </>
        ) : (
          <>
            {importado.tipo && <div>Tipo: <strong>{importado.tipo}</strong></div>}
            {importado.data_inicio && <div>Início: <strong>{formatarData(importado.data_inicio)}</strong></div>}
            {importado.limite_precipitacao_mm != null && (
              <div>Limite no arquivo: <strong>{formatarPrecipitacao(importado.limite_precipitacao_mm)}</strong></div>
            )}
            {importado.referencia && <div>Referência: <strong>{importado.referencia}</strong></div>}
            {importado.observacao && <div className="arm-popup-notes">{importado.observacao}</div>}
          </>
        )}
        <div className="arm-popup-by">
          Polígono com {contarVerticesAreaRisco(importado.poligono)} vértices · camada KMZ
        </div>
        {onEditar && (
          <div className="arm-popup-actions">
            <button type="button" onClick={onEditar}>Editar contorno e dados</button>
          </div>
        )}
      </div>
    </Popup>
  )
}

function PopupAreaRisco({
  area,
  cor,
  emAlerta,
  previsto,
  onEditar,
  onExcluir,
  onAbrirOcorrencia,
}: {
  area: AreaRisco
  cor: string
  emAlerta: boolean
  previsto: number | null | undefined
  onEditar: () => void
  onExcluir: () => void
  onAbrirOcorrencia?: (id: number) => void
}) {
  return (
    <Popup>
      <div className="arm-popup">
        <div className="arm-popup-title" style={{ color: cor }}>{area.referencia || area.tipo}</div>
        <div>Tipo: <strong>{area.tipo}</strong></div>
        {emAlerta && <div className="arm-popup-alert">PREVISÃO ACIMA DO LIMITE</div>}
        <div>{area.tipo === 'Interdições' ? 'Interdição desde:' : 'Início:'} <strong>{formatarData(area.data_inicio)}</strong></div>
        {area.tipo === 'Interdições'
          ? <div className="arm-popup-interdiction-status">Local de interdição cadastrado</div>
          : <>
            <div>Limite: <strong>{area.limite_precipitacao_mm} mm</strong></div>
            <div>Previsão 24 h: <strong>{formatarPrecipitacao(previsto)}</strong></div>
          </>}
        {area.referencia && <div>Referência: {area.referencia}</div>}
        {area.observacao && <div className="arm-popup-notes">{area.observacao}</div>}
        {area.atributos_kmz?.length > 0 && (
          <>
            <div className="arm-popup-notes"><strong>Informações originais do KMZ</strong></div>
            <div className="arm-kmz-popup-attrs">
              {area.atributos_kmz.map(({ campo, valor }, indice) => (
                <div key={`${campo}-${indice}`}><strong>{rotuloAtributoKmz(campo)}:</strong> {valor}</div>
              ))}
            </div>
          </>
        )}
        {area.ocorrencia_id != null && <div className="arm-popup-linked">Vinculada à ocorrência #{area.ocorrencia_id}</div>}
        <div className="arm-popup-by">Cadastro: {area.criado_por || '—'} · {contarVerticesAreaRisco(area.poligono)} vértice(s)</div>
        <div className="arm-popup-actions">
          {area.ocorrencia_id != null ? (
            <button
              type="button"
              className="arm-popup-open-occurrence"
              data-testid={`button-abrir-ocorrencia-area-${area.id}`}
              onClick={() => onAbrirOcorrencia?.(area.ocorrencia_id!)}
            >
              Abrir ocorrência #{area.ocorrencia_id}
            </button>
          ) : <>
            <button type="button" data-testid={`button-editar-area-${area.id}`} onClick={onEditar}>Editar</button>
            <button type="button" data-testid={`button-excluir-area-${area.id}`} onClick={onExcluir}>Excluir</button>
          </>}
        </div>
      </div>
    </Popup>
  )
}

export default function AreasRiscoMapa({
  painelHost,
  modoTv,
  areas,
  previsaoPorArea,
  alertaSonoroAtivo,
  onAlternarAlertaSonoro,
  carregando,
  salvando,
  agenteLogado,
  senhaAgente,
  erro,
  onSalvar,
  onSalvarLote,
  onEditar,
  onExcluir,
  onAbrirOcorrencia,
}: AreasRiscoMapaProps) {
  const [filtro, setFiltro] = useState<TipoAreaRisco | 'Todas'>('Todas')
  const [tiposVisiveisNoMapa, setTiposVisiveisNoMapa] = useState<Set<TipoAreaRisco>>(() => new Set(TIPOS))
  const [listaAreasAberta, setListaAreasAberta] = useState(false)
  const [rascunho, setRascunho] = useState<DraftArea | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [modoMapa, setModoMapa] = useState<'marcador' | 'poligono' | null>(null)
  const [portao, setPortao] = useState<GateAction | null>(null)
  const [localErro, setLocalErro] = useState('')
  const [poligonosImportados, setPoligonosImportados] = useState<PoligonoKmzImportado[]>([])
  const [poligonosImportadosConcluidos, setPoligonosImportadosConcluidos] = useState<Set<number>>(() => new Set())
  const [tiposImportados, setTiposImportados] = useState<TipoAreaRisco[]>([])
  const [poligonoImportadoSelecionado, setPoligonoImportadoSelecionado] = useState(0)
  const [indiceImportacaoNoRascunho, setIndiceImportacaoNoRascunho] = useState<number | null>(null)
  const [tipoBaseImportacao, setTipoBaseImportacao] = useState<TipoAreaRisco | null>(null)
  const [versaoImportacao, setVersaoImportacao] = useState(0)
  const [processandoKmz, setProcessandoKmz] = useState(false)
  const [mensagemKmz, setMensagemKmz] = useState('')
  const arquivoKmzRef = useRef<HTMLInputElement>(null)
  const arquivoCadastroKmzRef = useRef<HTMLInputElement>(null)
  const [recolhido, setRecolhido] = useState(() => {
    const celular = typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches
    return !modoTv && !celular
  })
  const painelRef = useRef<HTMLDivElement>(null)
  const scrollAntesDoFormularioRef = useRef(0)
  const formularioAberto = rascunho !== null

  useEffect(() => {
    const painel = painelRef.current
    if (!painel) return

    if (formularioAberto) {
      const mobile = window.matchMedia('(max-width: 700px)').matches
      painel.scrollTo({ top: mobile ? 0 : painel.scrollHeight, behavior: 'smooth' })
    } else {
      painel.scrollTo({ top: scrollAntesDoFormularioRef.current, behavior: 'auto' })
    }
  }, [formularioAberto])

  useEffect(() => {
    if (modoTv) setRecolhido(false)
  }, [modoTv])

  const contagens = useMemo(() => {
    const iniciais = Object.fromEntries(TIPOS.map(tipo => [tipo, 0])) as Record<TipoAreaRisco, number>
    return areas.reduce((resultado, area) => {
      resultado[area.tipo] += 1
      return resultado
    }, iniciais)
  }, [areas])

  const alertas = useMemo(
    () => areas.filter(area => {
      if (area.tipo === 'Interdições') return false
      const previsto = previsaoPorArea[area.id]
      return previsto != null && Number.isFinite(previsto) && previsto > area.limite_precipitacao_mm
    }),
    [areas, previsaoPorArea],
  )

  const areasVisiveis = filtro === 'Todas' ? areas : areas.filter(area => area.tipo === filtro)
  const areasNoMapa = areas.filter(area => tiposVisiveisNoMapa.has(area.tipo))
  const todosTiposVisiveisNoMapa = tiposVisiveisNoMapa.size === TIPOS.length
  const quantidadeImportadaPendente = poligonosImportados.length - poligonosImportadosConcluidos.size
  const areasParaExportar: AreaRiscoInput[] = areas
    .filter(area =>
      areaRiscoTemPoligono(area.poligono)
      && editandoId !== area.id,
    )
    .map(({ tipo, latitude, longitude, poligono, data_inicio, limite_precipitacao_mm, referencia, observacao, atributos_kmz }) => ({
      tipo,
      latitude,
      longitude,
      poligono,
      data_inicio,
      limite_precipitacao_mm,
      referencia,
      observacao,
      atributos_kmz,
    }))
  if (rascunho && areaRiscoTemPoligono(rascunho.poligono) && rascunho.latitude != null && rascunho.longitude != null) {
    areasParaExportar.push({
      tipo: rascunho.tipo,
      latitude: rascunho.latitude,
      longitude: rascunho.longitude,
      poligono: rascunho.poligono,
      data_inicio: rascunho.data_inicio,
      limite_precipitacao_mm: rascunho.tipo === 'Interdições' ? 0 : Number(rascunho.limite_precipitacao_mm) || 0,
      referencia: rascunho.referencia || null,
      observacao: rascunho.observacao || null,
      atributos_kmz: rascunho.atributos_kmz,
    })
  }

  function alternarTipoNoMapa(tipo: TipoAreaRisco) {
    setTiposVisiveisNoMapa(atuais => {
      const atualizados = new Set(atuais)
      if (atualizados.has(tipo)) atualizados.delete(tipo)
      else atualizados.add(tipo)
      return atualizados
    })
  }

  function alternarTodosTiposNoMapa() {
    setTiposVisiveisNoMapa(todosTiposVisiveisNoMapa ? new Set() : new Set(TIPOS))
  }

  function iniciarCadastro() {
    scrollAntesDoFormularioRef.current = painelRef.current?.scrollTop ?? 0
    setRascunho(novaArea(filtro === 'Todas' ? 'Encostas' : filtro))
    setEditandoId(null)
    setIndiceImportacaoNoRascunho(null)
    setModoMapa('marcador')
    setLocalErro('')
    setRecolhido(false)
  }

  function abrirEdicao(area: AreaRisco) {
    if (area.ocorrencia_id != null) {
      setLocalErro('Esta interdição é gerenciada pela ocorrência vinculada. Abra a ocorrência para alterá-la.')
      return
    }
    if (!agenteLogado || !senhaAgente) {
      setLocalErro('Não foi possível validar a senha do agente desta sessão.')
      return
    }
    setLocalErro('')
    setIndiceImportacaoNoRascunho(null)
    setPortao({ tipo: 'editar', area })
  }

  function abrirExclusao(area: AreaRisco) {
    if (area.ocorrencia_id != null) {
      setLocalErro('Esta interdição é gerenciada pela ocorrência vinculada. Abra a ocorrência para alterá-la.')
      return
    }
    if (!agenteLogado || !senhaAgente) {
      setLocalErro('Não foi possível validar a senha do agente desta sessão.')
      return
    }
    setLocalErro('')
    setPortao({ tipo: 'excluir', area })
  }

  function concluirAutorizacao() {
    if (!portao) return
    if (portao.tipo === 'editar') {
      const area = portao.area
      scrollAntesDoFormularioRef.current = painelRef.current?.scrollTop ?? 0
      setRascunho({
        tipo: area.tipo,
        latitude: area.latitude,
        longitude: area.longitude,
        poligono: clonarGeometriaAreaRisco(area.poligono),
        data_inicio: area.data_inicio.slice(0, 10),
        limite_precipitacao_mm: String(area.limite_precipitacao_mm),
        referencia: area.referencia ?? '',
        observacao: area.observacao ?? '',
        atributos_kmz: area.atributos_kmz ?? [],
      })
      setEditandoId(area.id)
      setIndiceImportacaoNoRascunho(null)
      setModoMapa(null)
      setLocalErro('')
      setRecolhido(false)
    } else {
      void excluirArea(portao.area)
    }
    setPortao(null)
  }

  function fecharFormulario() {
    setRascunho(null)
    setEditandoId(null)
    setIndiceImportacaoNoRascunho(null)
    setModoMapa(null)
  }

  async function excluirArea(area: AreaRisco) {
    try {
      setLocalErro('')
      await onExcluir(area.id)
    } catch (e) {
      setLocalErro(e instanceof Error ? e.message : 'Não foi possível excluir a área.')
    }
  }

  function atualizarRascunho(partial: Partial<DraftArea>) {
    setRascunho(atual => atual ? { ...atual, ...partial } : atual)
  }

  async function importarArquivoKmz(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!arquivo) return

    setProcessandoKmz(true)
    setLocalErro('')
    setMensagemKmz('Preparando a leitura do arquivo…')
    try {
      const poligonos = await importarPoligonosKmz(arquivo, setMensagemKmz)
      const tipoBase = rascunho?.tipo ?? (filtro === 'Todas' ? 'Encostas' : filtro)
      setPoligonosImportados(poligonos)
      setPoligonosImportadosConcluidos(new Set())
      setTiposImportados(poligonos.map(poligono => poligono.tipo ?? tipoBase))
      setPoligonoImportadoSelecionado(0)
      setIndiceImportacaoNoRascunho(0)
      setTipoBaseImportacao(tipoBase)
      setVersaoImportacao(versao => versao + 1)
      setRascunho(criarRascunhoImportado(poligonos[0], tipoBase))
      setEditandoId(null)
      setModoMapa(null)
      setRecolhido(false)
      setMensagemKmz(`${poligonos.length} polígono(s) encontrado(s). Revise o tipo de cada área e salve tudo de uma vez ou edite contornos individualmente.`)
    } catch (e) {
      setMensagemKmz(e instanceof Error ? e.message : 'Não foi possível ler o arquivo KMZ/KML.')
    } finally {
      setProcessandoKmz(false)
    }
  }

  function carregarPoligonoImportado(indice = poligonoImportadoSelecionado) {
    const poligonoImportado = poligonosImportados[indice]
    if (!poligonoImportado || poligonosImportadosConcluidos.has(indice)) return
    const tipoSelecionado = tiposImportados[indice] ?? tipoBaseImportacao ?? rascunho?.tipo ?? 'Encostas'
    setPoligonoImportadoSelecionado(indice)
    setIndiceImportacaoNoRascunho(indice)
    const draft = criarRascunhoImportado(poligonoImportado, tipoSelecionado)
    setRascunho({
      ...draft,
      tipo: tipoSelecionado,
      limite_precipitacao_mm: tipoSelecionado === 'Interdições' ? '0' : '30',
    })
    setEditandoId(null)
    setModoMapa(null)
    setLocalErro('')
    setRecolhido(false)
    setMensagemKmz(`Contorno “${poligonoImportado.nome}” carregado no formulário. Revise os dados e salve a área.`)
  }

  function alterarTipoImportado(indice: number, tipo: TipoAreaRisco) {
    setTiposImportados(atuais => atuais.map((atual, item) => item === indice ? tipo : atual))
    if (indiceImportacaoNoRascunho === indice && !editandoId) {
      atualizarRascunho({
        tipo,
        limite_precipitacao_mm: tipo === 'Interdições'
          ? '0'
          : rascunho?.tipo === 'Interdições' ? '30' : rascunho?.limite_precipitacao_mm ?? '30',
      })
    }
  }

  function alterarTipoRascunho(tipo: TipoAreaRisco) {
    atualizarRascunho({
      tipo,
      limite_precipitacao_mm: tipo === 'Interdições'
        ? '0'
        : rascunho?.tipo === 'Interdições'
          ? '30'
          : rascunho?.limite_precipitacao_mm ?? '30',
    })
    if (indiceImportacaoNoRascunho != null && !editandoId) {
      setTiposImportados(atuais => atuais.map((atual, indice) =>
        indice === indiceImportacaoNoRascunho ? tipo : atual,
      ))
    }
  }

  async function salvarTodosImportados() {
    if (!poligonosImportados.length) return
    const entradas: AreaRiscoInput[] = []
    for (const [indice, importado] of poligonosImportados.entries()) {
      if (poligonosImportadosConcluidos.has(indice)) continue
      const usarRascunho = indice === indiceImportacaoNoRascunho && rascunho && !editandoId
      const tipo = usarRascunho ? rascunho.tipo : tiposImportados[indice] ?? tipoBaseImportacao ?? 'Encostas'
      const limite = tipo === 'Interdições'
        ? 0
        : Number(usarRascunho ? rascunho.limite_precipitacao_mm : '30')
      if (tipo !== 'Interdições' && (!Number.isFinite(limite) || limite < 0)) {
        setLocalErro(`Informe um limite de chuva válido para “${importado.nome}”.`)
        return
      }
      entradas.push({
        tipo,
        latitude: usarRascunho ? rascunho.latitude ?? importado.latitude : importado.latitude,
        longitude: usarRascunho ? rascunho.longitude ?? importado.longitude : importado.longitude,
        poligono: usarRascunho ? rascunho.poligono : importado.poligono,
        data_inicio: usarRascunho ? rascunho.data_inicio : importado.data_inicio ?? dataHoje(),
        limite_precipitacao_mm: limite,
        referencia: (usarRascunho ? rascunho.referencia : importado.referencia ?? importado.nome).trim() || null,
        observacao: (usarRascunho ? rascunho.observacao : importado.observacao ?? '').trim() || null,
        atributos_kmz: usarRascunho ? rascunho.atributos_kmz : importado.atributos ?? [],
      })
    }
    if (!entradas.length) return

    try {
      setLocalErro('')
      await onSalvarLote(entradas)
      const quantidade = entradas.length
      setPoligonosImportados([])
      setPoligonosImportadosConcluidos(new Set())
      setTiposImportados([])
      setPoligonoImportadoSelecionado(0)
      setIndiceImportacaoNoRascunho(null)
      setTipoBaseImportacao(null)
      setRascunho(null)
      setEditandoId(null)
      setModoMapa(null)
      setMensagemKmz(`${quantidade} área(s) foram salvas no Supabase. Você pode clicar em cada polígono para consultar os dados ou editar pelo mapa.`)
      if (window.matchMedia('(max-width: 700px)').matches) setRecolhido(true)
    } catch (e) {
      setLocalErro(e instanceof Error ? e.message : 'Não foi possível salvar as áreas importadas.')
    }
  }

  async function exportarKmz() {
    if (!areasParaExportar.length) return
    setProcessandoKmz(true)
    setMensagemKmz('')
    try {
      const { arquivo, quantidade } = await exportarPoligonosKmz(areasParaExportar)
      const url = URL.createObjectURL(arquivo)
      const link = document.createElement('a')
      link.href = url
      link.download = `areas_risco_lafaiete_${dataHoje()}.kmz`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMensagemKmz(`${quantidade} polígono(s) exportado(s) em KMZ.`)
    } catch (e) {
      setMensagemKmz(e instanceof Error ? e.message : 'Não foi possível gerar o KMZ.')
    } finally {
      setProcessandoKmz(false)
    }
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!rascunho) return
    if (rascunho.latitude == null || rascunho.longitude == null) {
      setLocalErro('Marque a localização no mapa antes de salvar.')
      return
    }
    const isInterdicao = rascunho.tipo === 'Interdições'
    const limite = isInterdicao ? 0 : Number(rascunho.limite_precipitacao_mm)
    if (!isInterdicao && (!Number.isFinite(limite) || limite < 0)) {
      setLocalErro('Informe um limite de precipitação válido, em milímetros.')
      return
    }
    const input: AreaRiscoInput = {
      tipo: rascunho.tipo,
      latitude: rascunho.latitude,
      longitude: rascunho.longitude,
      poligono: rascunho.poligono,
      data_inicio: rascunho.data_inicio,
      limite_precipitacao_mm: limite,
      referencia: rascunho.referencia.trim() || null,
      observacao: rascunho.observacao.trim() || null,
      atributos_kmz: rascunho.atributos_kmz,
    }
    try {
      setLocalErro('')
      if (editandoId) await onEditar(editandoId, input)
      else await onSalvar(input)
      if (indiceImportacaoNoRascunho != null) {
        const concluidos = new Set(poligonosImportadosConcluidos)
        concluidos.add(indiceImportacaoNoRascunho)
        setPoligonosImportadosConcluidos(concluidos)
        const proximoIndice = poligonosImportados.findIndex((_, indice) => !concluidos.has(indice))
        if (proximoIndice >= 0) {
          setPoligonoImportadoSelecionado(proximoIndice)
          setIndiceImportacaoNoRascunho(proximoIndice)
          const proximoTipo = tiposImportados[proximoIndice] ?? tipoBaseImportacao ?? rascunho.tipo
          const proximoRascunho = criarRascunhoImportado(poligonosImportados[proximoIndice], proximoTipo)
          setRascunho({
            ...proximoRascunho,
            tipo: proximoTipo,
            limite_precipitacao_mm: proximoTipo === 'Interdições' ? '0' : '30',
          })
          setEditandoId(null)
          setModoMapa(null)
          setMensagemKmz(`Área registrada. O próximo contorno, “${poligonosImportados[proximoIndice].nome}”, foi carregado para revisão.`)
        } else {
          const totalImportado = poligonosImportados.length
          setPoligonosImportados([])
          setPoligonosImportadosConcluidos(new Set())
          setTiposImportados([])
          setPoligonoImportadoSelecionado(0)
          setIndiceImportacaoNoRascunho(null)
          setTipoBaseImportacao(null)
          setRascunho(null)
          setEditandoId(null)
          setModoMapa(null)
          setMensagemKmz(`${totalImportado} área(s) da importação foram cadastradas.`)
          if (window.matchMedia('(max-width: 700px)').matches) setRecolhido(true)
        }
      } else {
        setRascunho(null)
        setEditandoId(null)
        setModoMapa(null)
        if (window.matchMedia('(max-width: 700px)').matches) setRecolhido(true)
      }
    } catch (e) {
      setLocalErro(e instanceof Error ? e.message : 'Não foi possível salvar a área.')
    }
  }

  const mapModeLabel = modoMapa === 'marcador'
    ? 'Clique no mapa para posicionar o ponto de referência.'
    : modoMapa === 'poligono'
      ? `Clique no mapa para adicionar vértices (${rascunho ? contarVerticesAreaRisco(rascunho.poligono) : 0}).`
      : ''

  return (
    <>
      <EnquadrarPoligonosImportados poligonos={poligonosImportados} versao={versaoImportacao} />
      <InteracaoMapa
        modo={modoMapa}
        aoMarcar={(latitude, longitude) => {
          atualizarRascunho({ latitude, longitude })
          setModoMapa('poligono')
          setLocalErro('')
        }}
        aoAdicionarPonto={ponto => atualizarRascunho({
          poligono: adicionarVertice(rascunho?.poligono ?? [], ponto),
        })}
      />
      {poligonosImportados.map((importado, indice) => (
        !poligonosImportadosConcluidos.has(indice) && (
          <Polygon
            key={`imported-draft-${versaoImportacao}-${indice}`}
            positions={importado.poligono}
            pathOptions={{
              color: indice === indiceImportacaoNoRascunho ? '#fbbf24' : '#67d8f2',
              weight: indice === indiceImportacaoNoRascunho ? 3 : 2,
              fillColor: indice === indiceImportacaoNoRascunho ? '#fbbf24' : '#67d8f2',
              fillOpacity: indice === indiceImportacaoNoRascunho ? 0.12 : 0.06,
              dashArray: '6 5',
              bubblingMouseEvents: false,
            }}
            eventHandlers={{ click: () => carregarPoligonoImportado(indice) }}
          >
            <Tooltip sticky>{importado.nome} · importado, ainda não salvo</Tooltip>
                      <PopupInformacaoKmz
                importado={importado}
                tipoSelecionado={tiposImportados[indice] ?? importado.tipo ?? tipoBaseImportacao ?? undefined}
                onEditar={() => carregarPoligonoImportado(indice)}
              />
          </Polygon>
        )
      ))}
      {areasNoMapa.map(area => {
        const previsto = previsaoPorArea[area.id]
        const emAlerta = area.tipo !== 'Interdições' && previsto != null && Number.isFinite(previsto) && previsto > area.limite_precipitacao_mm
        const cor = CORES[area.tipo]
        return (
          <Fragment key={`area-layer-${area.id}`}>
            {areaRiscoTemPoligono(area.poligono) && (
              <Polygon
                positions={area.poligono}
                pathOptions={{
                  color: cor,
                  weight: emAlerta ? 4 : 2,
                  fillColor: cor,
                  fillOpacity: emAlerta ? 0.3 : 0.17,
                  className: emAlerta ? 'arm-polygon-alerta' : undefined,
                }}
              >
                <PopupAreaRisco
                  area={area}
                  cor={cor}
                  emAlerta={emAlerta}
                  previsto={previsto}
                  onEditar={() => abrirEdicao(area)}
                  onExcluir={() => abrirExclusao(area)}
                  onAbrirOcorrencia={onAbrirOcorrencia}
                />
              </Polygon>
            )}
            <Marker
              position={[area.latitude, area.longitude]}
              icon={iconeArea(area.tipo, emAlerta)}
              zIndexOffset={emAlerta ? 900 : 400}
            >
              <Tooltip direction="top" offset={[0, -28]} permanent={emAlerta} className={emAlerta ? 'arm-tooltip-alerta' : 'arm-tooltip'}>
                {emAlerta ? 'ALERTA · ' : ''}{area.tipo}
              </Tooltip>
              <PopupAreaRisco
                area={area}
                cor={cor}
                emAlerta={emAlerta}
                previsto={previsto}
                onEditar={() => abrirEdicao(area)}
                onExcluir={() => abrirExclusao(area)}
                onAbrirOcorrencia={onAbrirOcorrencia}
              />
            </Marker>
          </Fragment>
        )
      })}
      {rascunho && areaRiscoTemPoligono(rascunho.poligono) && (
        <Polygon
          positions={rascunho.poligono}
          pathOptions={{ color: CORES[rascunho.tipo], weight: 3, fillColor: CORES[rascunho.tipo], fillOpacity: 0.24, dashArray: '7 5' }}
        />
      )}
      {rascunho && rascunho.latitude != null && rascunho.longitude != null && (
        <Marker position={[rascunho.latitude, rascunho.longitude]} icon={iconeArea(rascunho.tipo)} zIndexOffset={1000}>
          <Tooltip permanent direction="top" offset={[0, -25]}>Ponto de referência</Tooltip>
        </Marker>
      )}
      {rascunho?.poligono.flatMap((poligono, indicePoligono) =>
        poligono.flatMap((anel, indiceAnel) =>
          anel.map((ponto, indiceVertice) => (
            <Marker
              key={`draft-vertex-${indicePoligono}-${indiceAnel}-${indiceVertice}`}
              position={ponto}
              draggable
              icon={L.divIcon({
                className: 'arm-vertex-shell',
                html: '<span class="arm-vertex" aria-hidden="true"></span>',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              })}
              eventHandlers={{
                dragend(event) {
                  const novaPosicao = event.target.getLatLng()
                  atualizarRascunho({
                    poligono: reposicionarVertice(
                      rascunho?.poligono ?? [],
                      indicePoligono,
                      indiceAnel,
                      indiceVertice,
                      [novaPosicao.lat, novaPosicao.lng],
                    ),
                  })
                },
              }}
            />
          )),
        ),
      )}
      {painelHost && createPortal(
        <div
          ref={painelRef}
          className={`arm-panel${recolhido ? ' arm-panel-recolhido' : ''}${formularioAberto ? ' arm-panel-form-active' : ''}${modoMapa ? ' arm-panel-map-mode' : ''}${modoTv ? ' arm-panel-tv' : ''}`}
        >
        <div className="arm-panel-head">
          <div className="arm-head-mark" aria-hidden="true"><span /></div>
          <div className="arm-head-copy">
            <h2>
              <button
                type="button"
                className="arm-head-copy-toggle"
                aria-label={recolhido ? 'Expandir painel de áreas de risco' : 'Recolher painel de áreas de risco'}
                aria-expanded={!recolhido}
                data-testid="button-titulo-painel-riscos"
                onClick={() => setRecolhido(value => !value)}
              >
                <span className="arm-eyebrow">DEFESA CIVIL · LAFAIETE</span>
                <span>Áreas de risco</span>
              </button>
            </h2>
          </div>
          <button
            type="button"
            className={`arm-sound-toggle${alertaSonoroAtivo ? ' arm-sound-toggle-active' : ''}`}
            aria-label={`${alertaSonoroAtivo ? 'Desativar' : 'Ativar'} alerta sonoro de chuva`}
            aria-pressed={alertaSonoroAtivo}
            title={`${alertaSonoroAtivo ? 'Desativar' : 'Ativar'} alerta sonoro de chuva`}
            data-testid="toggle-alerta-sonoro-areas-risco"
            onClick={onAlternarAlertaSonoro}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              {alertaSonoroAtivo
                ? <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>
                : <><path d="m16 9 5 6" /><path d="m21 9-5 6" /></>}
            </svg>
            <span>Som {alertaSonoroAtivo ? 'ligado' : 'desligado'}</span>
          </button>
          <button
            type="button"
            className="arm-collapse"
            aria-label={recolhido ? 'Expandir painel' : 'Recolher painel'}
            title={recolhido ? 'Mostrar áreas de risco' : 'Ocultar áreas de risco'}
            aria-expanded={!recolhido}
            data-testid="button-recolher-painel-riscos"
            onClick={() => setRecolhido(value => !value)}
          >
            <span aria-hidden="true">{recolhido ? '↓' : '↑'}</span>
          </button>
          {modoTv && (
            <button
              type="button"
              className="arm-add-tv"
              aria-label="Cadastrar área de risco"
              title="Cadastrar área de risco"
              data-testid="button-nova-area-tv"
              onClick={iniciarCadastro}
              disabled={Boolean(rascunho)}
            >
              <span aria-hidden="true">+</span>
            </button>
          )}
          {!modoTv && (
            <button
              type="button"
              className="arm-add-tv arm-add-mobile"
              aria-label="Cadastrar área de risco"
              title="Cadastrar área de risco"
              data-testid="button-nova-area-mobile"
              onClick={iniciarCadastro}
              disabled={Boolean(rascunho)}
            >
              <span aria-hidden="true">+</span>
            </button>
          )}
        </div>
        {!recolhido && (
          <>
            <div className="arm-summary">
              <div><strong data-testid="text-total-areas">{areas.length}</strong><span>locais mapeados</span></div>
              <div className={alertas.length ? 'arm-alert-count arm-alert-count-active' : 'arm-alert-count'}>
                <strong data-testid="text-total-alertas">{alertas.length}</strong><span>em alerta</span>
              </div>
            </div>
            <div className="arm-forecast-note" data-testid="text-fonte-previsao">
              Previsão acumulada em 24 h nas áreas de risco · Open-Meteo
            </div>
            <div className="arm-sound-note" data-testid="status-alerta-sonoro">
              {alertaSonoroAtivo
                ? alertas.length > 0
                  ? `Alerta ativo em ${alertas.length} área(s) · repetição sonora a cada 15 s`
                  : 'Som ligado · aguardando previsão acima do limite'
                : 'Som desligado'}
            </div>
            {alertas.length > 0 && (
              <div className="arm-alert-banner" role="status" data-testid="status-alerta-precipitacao">
                <span className="arm-alert-pulse" />
                <div><strong>ATENÇÃO · CHUVA ACIMA DO LIMITE</strong><span>{alertas.length} área(s) exigem acompanhamento</span></div>
              </div>
            )}
            <div className="arm-toolbar">
                <span>ÁREAS DE RISCO</span>
              <input
                ref={arquivoCadastroKmzRef}
                className="arm-kmz-map-input"
                type="file"
                accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml"
                aria-label="Arquivo KMZ ou KML para cadastrar áreas de risco"
                onChange={event => void importarArquivoKmz(event)}
                disabled={processandoKmz || salvando || Boolean(rascunho)}
                data-testid="input-importar-kmz-para-cadastro"
              />
              <button
                type="button"
                onClick={() => arquivoCadastroKmzRef.current?.click()}
                disabled={processandoKmz || salvando || Boolean(rascunho)}
                data-testid="button-importar-kmz-para-cadastro"
              >
                {processandoKmz ? 'Lendo KMZ…' : 'Importar para cadastro'}
              </button>
              <button type="button" onClick={iniciarCadastro} data-testid="button-nova-area" disabled={Boolean(rascunho)}>
                <span aria-hidden="true">+</span> {filtro === 'Interdições' ? 'Nova interdição' : 'Nova área'}
              </button>
            </div>
            {carregando ? (
              <div className="arm-loading" role="status" data-testid="status-carregando-areas">
                <i /><i /><i /> Atualizando áreas…
              </div>
            ) : (
              <>
                <div className="arm-map-layer-heading">
                  <div>
                    <span>TIPOS NO MAPA</span>
                  </div>
                  <button
                    type="button"
                    onClick={alternarTodosTiposNoMapa}
                    aria-label={todosTiposVisiveisNoMapa ? 'Ocultar todas as classificações do mapa' : 'Exibir todas as classificações no mapa'}
                    title={todosTiposVisiveisNoMapa ? 'Ocultar todas as classificações do mapa' : 'Exibir todas as classificações no mapa'}
                    data-testid="toggle-mapa-todas-areas"
                  >
                    {todosTiposVisiveisNoMapa ? 'Nenhuma' : 'Todas'}
                  </button>
                </div>
                <div className="arm-types" aria-label="Filtrar lista por tipo e selecionar tipos visíveis no mapa">
                  <button
                    type="button"
                    className={`arm-type-row arm-type-all${filtro === 'Todas' ? ' arm-type-selected' : ''}`}
                    onClick={() => setFiltro('Todas')}
                    aria-label="Filtrar lista por todas as áreas"
                    aria-pressed={filtro === 'Todas'}
                    data-testid="filter-area-todas"
                  >
                    <span className="arm-type-symbol">ALL</span><span className="arm-type-name">Todas as áreas</span><b>{areas.length}</b>
                  </button>
                  {TIPOS.map(tipo => {
                    const visivelNoMapa = tiposVisiveisNoMapa.has(tipo)
                    return (
                      <div className="arm-type-entry" key={tipo}>
                        <button
                          type="button"
                          className={`arm-type-row${filtro === tipo ? ' arm-type-selected' : ''}`}
                          onClick={() => setFiltro(tipo)}
                          aria-label={`Filtrar lista por ${tipo}`}
                          aria-pressed={filtro === tipo}
                          title={tipo}
                          data-testid={`filter-area-${TIPOS.indexOf(tipo)}`}
                        >
                          <span className="arm-type-symbol" style={{ '--arm-type-color': CORES[tipo] } as CSSProperties}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><g dangerouslySetInnerHTML={{ __html: ICONES[tipo] }} /></svg>
                          </span>
                          <span className="arm-type-name">{ROTULOS_TIPOS_COMPACTOS[tipo] ?? tipo}</span><b>{contagens[tipo]}</b>
                        </button>
                        <button
                          type="button"
                          className={`arm-map-toggle${visivelNoMapa ? ' arm-map-toggle-active' : ''}`}
                          onClick={() => alternarTipoNoMapa(tipo)}
                          aria-label={`${visivelNoMapa ? 'Ocultar' : 'Exibir'} áreas de ${tipo} no mapa`}
                          aria-pressed={visivelNoMapa}
                          title={`${visivelNoMapa ? 'Ocultar' : 'Exibir'} ${tipo} no mapa`}
                          data-testid={`toggle-mapa-area-${TIPOS.indexOf(tipo)}`}
                        >
                          <span aria-hidden="true">{visivelNoMapa ? '✓' : '—'}</span>
                        </button>
                      </div>
                    )
                  })}
                </div>
                {tiposVisiveisNoMapa.size === 0 && (
                  <div className="arm-map-layer-empty" role="status" data-testid="status-sem-tipos-no-mapa">
                    Nenhum tipo marcado: as áreas de risco estão ocultas no mapa.
                  </div>
                )}
              </>
            )}
            {areasVisiveis.length === 0 ? !carregando && (
              <div className="arm-empty" data-testid="status-sem-areas">
                <span className="arm-empty-rule" />
                <strong>
                  {filtro === 'Todas'
                    ? 'Nenhuma área cadastrada'
                    : filtro === 'Interdições'
                      ? 'Nenhuma interdição cadastrada'
                      : `Sem áreas de ${filtro.toLowerCase()}`}
                </strong>
                <span>Marque um ponto no mapa para cadastrar.</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="arm-list-toggle"
                  aria-expanded={listaAreasAberta}
                  aria-controls="arm-area-list"
                  onClick={() => setListaAreasAberta(value => !value)}
                  data-testid="toggle-lista-areas"
                >
                  <span>{listaAreasAberta ? 'Ocultar locais' : `Locais (${areasVisiveis.length})`}</span>
                  <span aria-hidden="true">{listaAreasAberta ? '−' : '+'}</span>
                </button>
                {listaAreasAberta && (
                  <div className="arm-area-list" id="arm-area-list" data-testid="list-areas-risco">
                    {areasVisiveis.map(area => {
                      const previsao = previsaoPorArea[area.id]
                      const alerta = previsao != null && Number.isFinite(previsao) && previsao > area.limite_precipitacao_mm
                      return (
                        <div className={`arm-area-row${alerta ? ' arm-area-row-alerta' : ''}`} key={area.id} data-testid={`row-area-${area.id}`}>
                          <span className="arm-area-color" style={{ backgroundColor: CORES[area.tipo] }} />
                          <div className="arm-area-copy">
                            <strong>{area.tipo}{alerta && <span className="arm-alert-tag">ALERTA</span>}</strong>
                            <span>{area.referencia || `Início ${formatarData(area.data_inicio)}`}</span>
                          </div>
                          <span className="arm-rain-value" data-testid={`status-previsao-area-${area.id}`}>
                            {area.tipo === 'Interdições'
                              ? area.ocorrencia_id != null ? `Ocorrência #${area.ocorrencia_id}` : 'Interdição'
                              : previsao == null ? '—' : formatarPrecipitacao(previsao)}
                          </span>
                          {area.ocorrencia_id != null ? (
                            <button
                              type="button"
                              aria-label={`Abrir ocorrência ${area.ocorrencia_id}`}
                              data-testid={`button-abrir-ocorrencia-lista-${area.id}`}
                              onClick={() => onAbrirOcorrencia?.(area.ocorrencia_id!)}
                            >
                              Abrir
                            </button>
                          ) : <>
                            <button type="button" aria-label={`Editar ${area.tipo}`} data-testid={`button-editar-lista-${area.id}`} onClick={() => abrirEdicao(area)}>Editar</button>
                            <button type="button" aria-label={`Excluir ${area.tipo}`} className="arm-delete-inline" data-testid={`button-excluir-lista-${area.id}`} onClick={() => abrirExclusao(area)}>×</button>
                          </>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
            {erro && <div className="arm-error" role="alert" data-testid="status-erro-servidor">{erro}</div>}
            {localErro && <div className="arm-error" role="alert" data-testid="status-erro-local">{localErro}</div>}
            {rascunho && (
              <div className="arm-form-card" ref={node => {
                if (node) L.DomEvent.disableClickPropagation(node)
              }}>
                <div className="arm-form-heading">
                  <div><span className="arm-eyebrow">{editandoId ? 'ATUALIZAÇÃO DE CADASTRO' : 'NOVO REGISTRO'}</span><h3>{editandoId ? 'Editar área de risco' : rascunho.tipo === 'Interdições' ? 'Cadastrar interdição' : 'Cadastrar área'}</h3></div>
                  <button type="button" aria-label="Fechar formulário" data-testid="button-fechar-formulario-area" onClick={fecharFormulario}>×</button>
                </div>
                <div className="arm-kmz-tools" data-testid="area-risco-kmz">
                  <input
                    ref={arquivoKmzRef}
                    className="arm-kmz-file-input"
                    type="file"
                    accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml"
                    aria-label="Arquivo KMZ ou KML com polígonos"
                    onChange={event => void importarArquivoKmz(event)}
                    disabled={processandoKmz || salvando}
                    data-testid="input-importar-area-kmz"
                  />
                  <span className="arm-kmz-copy">Importe contornos e confira os dados no mapa antes de cadastrar. Nenhum rascunho é salvo automaticamente.</span>
                  <div className="arm-kmz-actions">
                    <button
                      type="button"
                      onClick={() => arquivoKmzRef.current?.click()}
                      disabled={processandoKmz || salvando}
                      data-testid="button-importar-area-kmz"
                    >
                      {processandoKmz ? 'Lendo…' : 'Importar KMZ/KML'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportarKmz()}
                      disabled={processandoKmz || salvando || areasParaExportar.length === 0}
                      data-testid="button-exportar-area-kmz"
                    >
                      Exportar KMZ ({areasParaExportar.length})
                    </button>
                  </div>
                  {poligonosImportados.length > 0 && (
                    <div className="arm-kmz-import-selection">
                      <label className="arm-field">
                        <span>Contorno para editar · {poligonosImportadosConcluidos.size}/{poligonosImportados.length} cadastrados</span>
                        <select
                          value={poligonoImportadoSelecionado}
                          onChange={event => setPoligonoImportadoSelecionado(Number(event.target.value))}
                          data-testid="select-poligono-importado-kmz"
                        >
                          {poligonosImportados.map((poligono, indice) => (
                            <option key={`${indice}-${poligono.nome}`} value={indice}>
                              {poligonosImportadosConcluidos.has(indice) ? '✓ ' : ''}
                              {indice + 1}. {poligono.nome} · {contarVerticesAreaRisco(poligono.poligono)} vértices
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => carregarPoligonoImportado()}
                        disabled={poligonosImportadosConcluidos.has(poligonoImportadoSelecionado)}
                        data-testid="button-carregar-poligono-kmz"
                      >
                        Carregar contorno para editar
                      </button>
                      <span>Você também pode tocar em um contorno tracejado no mapa para editar seus dados e vértices.</span>
                      <details className="arm-kmz-batch" open>
                        <summary>Revisar tipos e salvar as {quantidadeImportadaPendente} áreas restantes</summary>
                        <p>Escolha o tipo de risco para cada contorno. Os atributos originais do KMZ também serão guardados.</p>
                        <div className="arm-kmz-batch-rows">
                          {poligonosImportados.map((poligono, indice) => (
                            <label className="arm-kmz-batch-row" key={`${indice}-${poligono.nome}`}>
                              <span>{poligonosImportadosConcluidos.has(indice) ? '✓ ' : ''}{indice + 1}. {poligono.nome}</span>
                              <select
                                value={tiposImportados[indice] ?? tipoBaseImportacao ?? 'Encostas'}
                                onChange={event => alterarTipoImportado(indice, event.target.value as TipoAreaRisco)}
                                aria-label={`Tipo de risco para ${poligono.nome}`}
                                data-testid={`select-tipo-poligono-importado-${indice}`}
                                disabled={poligonosImportadosConcluidos.has(indice)}
                              >
                                {TIPOS.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
                              </select>
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="arm-kmz-save-all"
                          onClick={() => void salvarTodosImportados()}
                          disabled={salvando || processandoKmz || quantidadeImportadaPendente === 0}
                          data-testid="button-salvar-todas-areas-kmz"
                        >
                          {salvando ? 'Salvando no Supabase…' : `Salvar restantes no Supabase (${quantidadeImportadaPendente})`}
                        </button>
                      </details>
                    </div>
                  )}
                  {mensagemKmz && <span className="arm-kmz-status" role="status" data-testid="status-area-kmz">{mensagemKmz}</span>}
                </div>
                <form onSubmit={salvar}>
                  <label className="arm-field">
                    <span>Tipo de registro</span>
                    <select
                      value={rascunho.tipo}
                      onChange={event => alterarTipoRascunho(event.target.value as TipoAreaRisco)}
                      data-testid="select-tipo-risco"
                    >
                      {TIPOS.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
                    </select>
                  </label>
                  <div className="arm-map-instructions">
                    <div className="arm-step-row"><b className={rascunho.latitude != null ? 'arm-step-done' : ''}>01</b><span>{rascunho.latitude == null ? 'Posicione o ponto de referência' : `${rascunho.latitude.toFixed(5)}, ${rascunho.longitude?.toFixed(5)}`}</span></div>
                    <button type="button" className={modoMapa === 'marcador' ? 'arm-map-action arm-map-action-active' : 'arm-map-action'} data-testid="button-marcar-localizacao" onClick={() => setModoMapa('marcador')}>Marcar no mapa</button>
                    <div className="arm-step-row"><b className={areaRiscoTemPoligono(rascunho.poligono) ? 'arm-step-done' : ''}>02</b><span>Perímetro · opcional · {contarVerticesAreaRisco(rascunho.poligono)} vértice(s)</span></div>
                    <div className="arm-draw-actions">
                      <button type="button" className={modoMapa === 'poligono' ? 'arm-map-action arm-map-action-active' : 'arm-map-action'} disabled={rascunho.latitude == null} data-testid="button-desenhar-poligono" onClick={() => setModoMapa('poligono')}>Adicionar vértices</button>
                      <button type="button" className="arm-quiet-action" disabled={!contarVerticesAreaRisco(rascunho.poligono)} data-testid="button-desfazer-vertice" onClick={() => atualizarRascunho({ poligono: desfazerUltimoVertice(rascunho.poligono) })}>Desfazer</button>
                      <button type="button" className="arm-quiet-action" disabled={!contarVerticesAreaRisco(rascunho.poligono)} data-testid="button-limpar-poligono" onClick={() => atualizarRascunho({ poligono: [] })}>Limpar</button>
                    </div>
                    {modoMapa && <div className="arm-map-mode" role="status" data-testid="status-modo-mapa">{mapModeLabel}</div>}
                    {contarVerticesAreaRisco(rascunho.poligono) > 0 && <div className="arm-vertex-hint">Arraste os nós no mapa para ajustar o contorno.</div>}
                  </div>
                  <div className="arm-field-grid">
                    <label className="arm-field"><span>{rascunho.tipo === 'Interdições' ? 'Início da interdição' : 'Início do risco'}</span><input type="date" value={rascunho.data_inicio} onChange={event => atualizarRascunho({ data_inicio: event.target.value })} required data-testid="input-data-inicio" /></label>
                    {rascunho.tipo !== 'Interdições' && (
                      <label className="arm-field"><span>Limite de chuva <small>mm</small></span><input type="number" min="0" step="0.1" placeholder="Ex.: 35" value={rascunho.limite_precipitacao_mm} onChange={event => atualizarRascunho({ limite_precipitacao_mm: event.target.value })} required data-testid="input-limite-precipitacao" /></label>
                    )}
                  </div>
                  <label className="arm-field"><span>Referência local <small>opcional</small></span><input type="text" maxLength={120} placeholder="Rua, bairro ou ponto próximo" value={rascunho.referencia} onChange={event => atualizarRascunho({ referencia: event.target.value })} data-testid="input-referencia-local" /></label>
                  <label className="arm-field"><span>Observações <small>opcional</small></span><textarea rows={2} maxLength={500} placeholder="Condição observada, acesso ou orientação à equipe" value={rascunho.observacao} onChange={event => atualizarRascunho({ observacao: event.target.value })} data-testid="input-observacao-risco" /></label>
                  {(localErro || erro) && <div className="arm-error" role="alert" data-testid="status-erro-formulario">{localErro || erro}</div>}
                  <div className="arm-form-actions">
                    <button type="button" className="arm-cancel" data-testid="button-cancelar-area" disabled={salvando} onClick={fecharFormulario}>Cancelar</button>
                    <button type="submit" className="arm-submit" data-testid="button-salvar-area" disabled={salvando}>
                      {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Registrar área'}
                    </button>
                  </div>
                </form>
              </div>
            )}
            <div className="arm-panel-foot">
              <span className="arm-foot-dot" /> Operador: <strong>{agenteLogado || 'Não identificado'}</strong>
            </div>
          </>
        )}
      </div>,
      painelHost,
      )}
      {portao && (
        <ModalSenha
          titulo={portao.tipo === 'editar' ? 'Autorizar edição de área' : 'Autorizar exclusão de área'}
          senhaCorreta={senhaAgente || ''}
          onConfirmar={concluirAutorizacao}
          onCancelar={() => setPortao(null)}
        />
      )}
    </>
  )
}
