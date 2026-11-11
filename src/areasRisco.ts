export const TIPOS_AREAS_RISCO = [
  'Encostas',
  'Erosões',
  'Drenagem',
  'Alagamentos',
  'Deslizamentos',
  'Problemas de vias',
  'Obras',
  'Interdições',
] as const

export type TipoAreaRisco = typeof TIPOS_AREAS_RISCO[number]
export type CoordenadaAreaRisco = [number, number]
export type AnelAreaRisco = CoordenadaAreaRisco[]
export type PoligonoAreaRisco = AnelAreaRisco[]
export type GeometriaAreaRisco = PoligonoAreaRisco[]
export type AtributoKmz = { campo: string; valor: string }

export interface AreaRisco {
  id: string
  tipo: TipoAreaRisco
  latitude: number
  longitude: number
  poligono: GeometriaAreaRisco
  data_inicio: string
  limite_precipitacao_mm: number
  referencia: string | null
  observacao: string | null
  atributos_kmz: AtributoKmz[]
  criado_por: string
  created_at: string
  ocorrencia_id?: number | null
}

export type AreaRiscoInput = Omit<AreaRisco, 'id' | 'criado_por' | 'created_at'>

function coordenadaValida(valor: unknown): valor is CoordenadaAreaRisco {
  return Array.isArray(valor)
    && valor.length >= 2
    && Number.isFinite(Number(valor[0]))
    && Number.isFinite(Number(valor[1]))
    && Number(valor[0]) >= -90
    && Number(valor[0]) <= 90
    && Number(valor[1]) >= -180
    && Number(valor[1]) <= 180
}

function normalizarAnel(valor: unknown): AnelAreaRisco | null {
  if (!Array.isArray(valor)) return null
  const pontos: AnelAreaRisco = []
  for (const ponto of valor) {
    if (!coordenadaValida(ponto)) return null
    pontos.push([Number(ponto[0]), Number(ponto[1])])
  }
  return pontos
}

/**
 * Normaliza o formato antigo (uma lista de coordenadas) e o formato atual
 * (componentes → anéis → coordenadas) para uma geometria multipolígono.
 */
export function normalizarGeometriaAreaRisco(valor: unknown): GeometriaAreaRisco | null {
  if (!Array.isArray(valor)) return null
  if (valor.length === 0) return []

  if (coordenadaValida(valor[0])) {
    const anel = normalizarAnel(valor)
    return anel ? [[anel]] : null
  }

  const geometria: GeometriaAreaRisco = []
  for (const poligono of valor) {
    if (!Array.isArray(poligono)) return null
    const aneis: PoligonoAreaRisco = []
    for (const anel of poligono) {
      const normalizado = normalizarAnel(anel)
      if (!normalizado) return null
      aneis.push(normalizado)
    }
    geometria.push(aneis)
  }
  return geometria
}

export function areaRiscoTemPoligono(geometria: GeometriaAreaRisco): boolean {
  return geometria.some(poligono => poligono.some(anel => anel.length >= 3))
}

export function contarVerticesAreaRisco(geometria: GeometriaAreaRisco): number {
  return geometria.reduce(
    (total, poligono) => total + poligono.reduce((soma, anel) => soma + anel.length, 0),
    0,
  )
}

export function listarCoordenadasAreaRisco(geometria: GeometriaAreaRisco): CoordenadaAreaRisco[] {
  return geometria.flatMap(poligono => poligono.flatMap(anel => anel))
}

export function clonarGeometriaAreaRisco(geometria: GeometriaAreaRisco): GeometriaAreaRisco {
  return geometria.map(poligono => poligono.map(anel => anel.map(([latitude, longitude]) => [latitude, longitude])))
}

export const ESTILO_AREA_RISCO: Record<TipoAreaRisco, { cor: string; icone: string }> = {
  Encostas: { cor: '#d97706', icone: 'slope' },
  'Erosões': { cor: '#b4533c', icone: 'erosion' },
  Drenagem: { cor: '#087e9b', icone: 'drainage' },
  Alagamentos: { cor: '#2457c5', icone: 'flood' },
  Deslizamentos: { cor: '#b4233b', icone: 'landslide' },
  'Problemas de vias': { cor: '#7854a8', icone: 'road' },
  Obras: { cor: '#5c7b36', icone: 'works' },
  Interdições: { cor: '#c2410c', icone: 'closure' },
}
