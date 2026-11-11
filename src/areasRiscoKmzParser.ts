import JSZip from 'jszip'
import {
  TIPOS_AREAS_RISCO,
  type AnelAreaRisco,
  type CoordenadaAreaRisco,
  type GeometriaAreaRisco,
  type TipoAreaRisco,
} from './areasRisco'
import type { PoligonoKmzImportado } from './areasRiscoKmz'

const TAMANHO_MAXIMO_ARQUIVO = 20 * 1024 * 1024
const TAMANHO_MAXIMO_KML = 50 * 1024 * 1024
const MAXIMO_POLIGONOS = 500
const MAXIMO_VERTICES = 10_000
const MAXIMO_VERTICES_IMPORTACAO = 250_000

interface PoligonoKmlCandidato {
  limitesExternos: string[]
  limitesInternos: string[]
}

export interface CandidatoPoligonoKmz {
  nome: string
  ponto: [number, number] | null
  tipo?: TipoAreaRisco
  data_inicio?: string
  limite_precipitacao_mm?: number
  referencia: string
  observacao?: string
  poligonos: PoligonoKmlCandidato[]
}

function descendentesComNome(parent: Document | Element, nome: string): Element[] {
  const resultado: Element[] = []
  const pilha = Array.from(parent.children).reverse()
  while (pilha.length) {
    const elemento = pilha.pop()!
    if (elemento.localName === nome) resultado.push(elemento)
    for (let indice = elemento.children.length - 1; indice >= 0; indice--) {
      pilha.push(elemento.children[indice])
    }
  }
  return resultado
}

function primeiroDescendenteComNome(parent: Document | Element, nome: string) {
  const pilha = Array.from(parent.children).reverse()
  while (pilha.length) {
    const elemento = pilha.pop()!
    if (elemento.localName === nome) return elemento
    for (let indice = elemento.children.length - 1; indice >= 0; indice--) {
      pilha.push(elemento.children[indice])
    }
  }
  return null
}

function textoKml(parent: Document | Element, nome: string) {
  return primeiroDescendenteComNome(parent, nome)?.textContent?.trim() ?? ''
}

function normalizarChave(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function lerCoordenadas(texto: string, rotulo: string): AnelAreaRisco {
  const pontos: Array<[number, number]> = []
  const tuplas = texto.trim().split(/\s+/).filter(Boolean)
  if (tuplas.length === 0) throw new Error(`${rotulo}: o anel não contém coordenadas.`)
  for (const tupla of tuplas) {
    const partes = tupla.split(',')
    if (partes.length < 2 || partes.length > 3 || !partes[0].trim() || !partes[1].trim()) {
      throw new Error(`${rotulo}: há uma coordenada malformada. Use longitude,latitude[,altitude].`)
    }
    const [lonTexto, latTexto, altitudeTexto] = partes
    const longitude = Number(lonTexto)
    const latitude = Number(latTexto)
    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || (altitudeTexto != null && altitudeTexto.trim() !== '' && !Number.isFinite(Number(altitudeTexto)))
    ) {
      throw new Error(`${rotulo}: há uma coordenada fora dos limites geográficos ou inválida.`)
    }
    pontos.push([latitude, longitude])
    if (pontos.length > MAXIMO_VERTICES) {
      throw new Error(`${rotulo}: o anel ultrapassa o limite de ${MAXIMO_VERTICES.toLocaleString('pt-BR')} vértices.`)
    }
  }

  const primeiro = pontos[0]
  const ultimo = pontos[pontos.length - 1]
  if (!primeiro || !ultimo || primeiro[0] !== ultimo[0] || primeiro[1] !== ultimo[1]) {
    throw new Error(`${rotulo}: anel aberto; o primeiro e o último ponto precisam coincidir.`)
  }
  pontos.pop()
  if (pontos.length < 3) throw new Error(`${rotulo}: o anel precisa ter pelo menos três vértices.`)

  const coordenadasUnicas = new Set(pontos.map(([latitude, longitude]) => `${latitude},${longitude}`))
  if (coordenadasUnicas.size !== pontos.length) {
    throw new Error(`${rotulo}: o anel repete vértices e não forma um contorno válido.`)
  }

  const areaDupla = pontos.reduce((soma, ponto, indice) => {
    const proximo = pontos[(indice + 1) % pontos.length]
    return soma + ponto[1] * proximo[0] - proximo[1] * ponto[0]
  }, 0)
  if (Math.abs(areaDupla) < 1e-12) throw new Error(`${rotulo}: o anel não delimita uma área.`)

  for (let indice = 0; indice < pontos.length; indice++) {
    const anterior = pontos[(indice + pontos.length - 1) % pontos.length]
    const atual = pontos[indice]
    const seguintePonto = pontos[(indice + 1) % pontos.length]
    const colinearidade = orientacao(anterior, atual, seguintePonto)
    const voltaSobreTrecho = (anterior[0] - atual[0]) * (seguintePonto[0] - atual[0])
      + (anterior[1] - atual[1]) * (seguintePonto[1] - atual[1]) > 1e-10
    if (Math.abs(colinearidade) <= 1e-10 && voltaSobreTrecho) {
      throw new Error(`${rotulo}: há trechos sobrepostos no anel; revise a ordem dos vértices.`)
    }

    const seguinte = (indice + 1) % pontos.length
    for (let outro = indice + 1; outro < pontos.length; outro++) {
      const outroSeguinte = (outro + 1) % pontos.length
      if (seguinte === outro || (indice === 0 && outroSeguinte === 0)) continue
      if (segmentosSeInterceptam(pontos[indice], pontos[seguinte], pontos[outro], pontos[outroSeguinte])) {
        throw new Error(`${rotulo}: o anel se cruza; revise a ordem dos vértices.`)
      }
    }
  }
  return pontos
}

function orientacao(a: CoordenadaAreaRisco, b: CoordenadaAreaRisco, c: CoordenadaAreaRisco) {
  return (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1])
}

function pontoNoSegmento(ponto: CoordenadaAreaRisco, inicio: CoordenadaAreaRisco, fim: CoordenadaAreaRisco) {
  const epsilon = 1e-10
  return Math.abs(orientacao(inicio, fim, ponto)) <= epsilon
    && ponto[1] >= Math.min(inicio[1], fim[1]) - epsilon
    && ponto[1] <= Math.max(inicio[1], fim[1]) + epsilon
    && ponto[0] >= Math.min(inicio[0], fim[0]) - epsilon
    && ponto[0] <= Math.max(inicio[0], fim[0]) + epsilon
}

function segmentosSeInterceptam(
  a: CoordenadaAreaRisco,
  b: CoordenadaAreaRisco,
  c: CoordenadaAreaRisco,
  d: CoordenadaAreaRisco,
) {
  const o1 = orientacao(a, b, c)
  const o2 = orientacao(a, b, d)
  const o3 = orientacao(c, d, a)
  const o4 = orientacao(c, d, b)
  const epsilon = 1e-10
  if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon))
    && ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) return true
  return (Math.abs(o1) <= epsilon && pontoNoSegmento(c, a, b))
    || (Math.abs(o2) <= epsilon && pontoNoSegmento(d, a, b))
    || (Math.abs(o3) <= epsilon && pontoNoSegmento(a, c, d))
    || (Math.abs(o4) <= epsilon && pontoNoSegmento(b, c, d))
}

function aneisSeInterceptam(anelA: AnelAreaRisco, anelB: AnelAreaRisco) {
  for (let indiceA = 0; indiceA < anelA.length; indiceA++) {
    const a = anelA[indiceA]
    const b = anelA[(indiceA + 1) % anelA.length]
    for (let indiceB = 0; indiceB < anelB.length; indiceB++) {
      const c = anelB[indiceB]
      const d = anelB[(indiceB + 1) % anelB.length]
      if (segmentosSeInterceptam(a, b, c, d)) return true
    }
  }
  return false
}

function pontoDentroDoAnel(ponto: CoordenadaAreaRisco, anel: AnelAreaRisco) {
  let dentro = false
  for (let indice = 0, anterior = anel.length - 1; indice < anel.length; anterior = indice++) {
    const a = anel[indice]
    const b = anel[anterior]
    if (pontoNoSegmento(ponto, a, b)) return false
    const cruza = (a[0] > ponto[0]) !== (b[0] > ponto[0])
      && ponto[1] < ((b[1] - a[1]) * (ponto[0] - a[0])) / (b[0] - a[0]) + a[1]
    if (cruza) dentro = !dentro
  }
  return dentro
}

function validarAnelInterno(anelExterno: AnelAreaRisco, anelInterno: AnelAreaRisco, rotulo: string) {
  if (aneisSeInterceptam(anelExterno, anelInterno)
    || !anelInterno.every(ponto => pontoDentroDoAnel(ponto, anelExterno))) {
    throw new Error(`${rotulo}: o contorno interno precisa ficar totalmente dentro do contorno externo, sem tocá-lo.`)
  }
}

function lerPoligonoKml(polygon: PoligonoKmlCandidato, rotulo: string): AnelAreaRisco[] {
  if (polygon.limitesExternos.length !== 1) {
    throw new Error(`${rotulo}: cada polígono precisa ter exatamente um contorno externo.`)
  }
  const externo = lerCoordenadas(polygon.limitesExternos[0], `${rotulo}, contorno externo`)
  const internos = polygon.limitesInternos.map((coordenadas, indice) =>
    lerCoordenadas(coordenadas, `${rotulo}, contorno interno ${indice + 1}`),
  )

  for (let indice = 0; indice < internos.length; indice++) {
    const anel = internos[indice]
    validarAnelInterno(externo, anel, `${rotulo}, contorno interno ${indice + 1}`)
    for (let anterior = 0; anterior < indice; anterior++) {
      const outro = internos[anterior]
      if (
        aneisSeInterceptam(outro, anel)
        || pontoDentroDoAnel(anel[0], outro)
        || pontoDentroDoAnel(outro[0], anel)
      ) {
        throw new Error(`${rotulo}: os contornos internos se cruzam ou se sobrepõem.`)
      }
    }
  }
  return [externo, ...internos]
}

function metadadosDoPlacemark(placemark: Element) {
  const valores = new Map<string, string>()
  for (const tag of descendentesComNome(placemark, 'Data')) {
    const chave = tag.getAttribute('name')
    const valor = textoKml(tag, 'value') || tag.textContent?.trim() || ''
    if (chave && valor) valores.set(normalizarChave(chave), valor)
  }
  for (const tag of descendentesComNome(placemark, 'SimpleData')) {
    const chave = tag.getAttribute('name')
    const valor = tag.textContent?.trim() ?? ''
    if (chave && valor) valores.set(normalizarChave(chave), valor)
  }
  return valores
}

function metadado(dados: Map<string, string>, ...chaves: string[]) {
  for (const chave of chaves) {
    const valor = dados.get(normalizarChave(chave))
    if (valor) return valor.trim()
  }
  return ''
}

function tipoValido(valor: string): TipoAreaRisco | undefined {
  const chave = normalizarChave(valor)
  return TIPOS_AREAS_RISCO.find(tipo => normalizarChave(tipo) === chave)
}

function dataValida(valor: string): string | undefined {
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const brasileira = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const partes = iso
    ? [iso[1], iso[2], iso[3]]
    : brasileira
      ? [brasileira[3], brasileira[2], brasileira[1]]
      : null
  if (!partes) return undefined
  const [ano, mes, dia] = partes.map(Number)
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
    ? `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    : undefined
}

function coordenadaDoPonto(placemark: Element): [number, number] | null {
  const elementoPonto = primeiroDescendenteComNome(placemark, 'Point')
  const coordenadas = elementoPonto ? textoKml(elementoPonto, 'coordinates').split(/\s+/)[0] : ''
  if (!coordenadas) return null
  const [lonTexto, latTexto] = coordenadas.split(',')
  const latitude = Number(latTexto)
  const longitude = Number(lonTexto)
  if (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ) return null
  return [latitude, longitude]
}

export function extrairCandidatosKml(conteudo: string): CandidatoPoligonoKmz[] {
  if (conteudo.length > TAMANHO_MAXIMO_KML) {
    throw new Error('O KML dentro do arquivo é maior que o limite permitido.')
  }

  const documento = new DOMParser().parseFromString(conteudo, 'application/xml')
  if (
    documento.getElementsByTagName('parsererror').length
    || documento.getElementsByTagNameNS('*', 'parsererror').length
  ) {
    throw new Error('O arquivo não contém um KML válido.')
  }

  const resultado: CandidatoPoligonoKmz[] = []
  const placemarks = descendentesComNome(documento, 'Placemark')
  for (const placemark of placemarks) {
    const dados = metadadosDoPlacemark(placemark)
    const pontoImportado = coordenadaDoPonto(placemark)
    const nome = textoKml(placemark, 'name') || `Polígono ${resultado.length + 1}`
    const tipo = tipoValido(metadado(dados, 'tipo', 'type', 'categoria', 'category', 'risk_type'))
    const dataInicio = dataValida(metadado(dados, 'data_inicio', 'inicio', 'start_date', 'data', 'date'))
    const limiteTexto = metadado(
      dados,
      'limite_precipitacao_mm',
      'limite_precipitacao',
      'limite_chuva',
      'rain_limit_mm',
      'precipitation_limit',
    )
    const limite = limiteTexto ? Number(limiteTexto.replace(',', '.')) : undefined
    const referencia = metadado(dados, 'referencia', 'reference', 'local', 'endereco', 'address', 'bairro') || nome
    const observacao = metadado(dados, 'observacao', 'observation', 'notes', 'descricao', 'description')
    const elementosPoligono = descendentesComNome(placemark, 'Polygon')
    if (!elementosPoligono.length) continue
    if (resultado.length >= MAXIMO_POLIGONOS) {
      throw new Error(`O arquivo ultrapassa o limite de ${MAXIMO_POLIGONOS.toLocaleString('pt-BR')} áreas por importação.`)
    }

    resultado.push({
      nome,
      ponto: pontoImportado,
      tipo,
      data_inicio: dataInicio,
      limite_precipitacao_mm: limite != null && Number.isFinite(limite) && limite >= 0 ? limite : undefined,
      referencia,
      observacao: observacao || undefined,
      poligonos: elementosPoligono.map(polygon => ({
        limitesExternos: descendentesComNome(polygon, 'outerBoundaryIs')
          .map(limite => textoKml(limite, 'coordinates')),
        limitesInternos: descendentesComNome(polygon, 'innerBoundaryIs')
          .map(limite => textoKml(limite, 'coordinates')),
      })),
    })
  }

  if (!resultado.length) {
    throw new Error('Nenhum polígono válido foi encontrado no KMZ/KML.')
  }
  return resultado
}

export function validarCandidatosKml(candidatos: CandidatoPoligonoKmz[]): PoligonoKmzImportado[] {
  const resultado: PoligonoKmzImportado[] = []
  let totalVertices = 0

  for (const candidato of candidatos) {
    let geometria: GeometriaAreaRisco
    try {
      geometria = candidato.poligonos.map((polygon, indice) =>
        lerPoligonoKml(polygon, `“${candidato.nome}”, polígono ${indice + 1}`),
      )
    } catch (erro) {
      throw new Error(erro instanceof Error ? erro.message : `O contorno “${candidato.nome}” é inválido.`)
    }

    const pontosExternos = geometria.flatMap(poligono => poligono[0])
    totalVertices += geometria.reduce(
      (total, poligono) => total + poligono.reduce((soma, anel) => soma + anel.length, 0),
      0,
    )
    if (totalVertices > MAXIMO_VERTICES_IMPORTACAO) {
      throw new Error(`O arquivo ultrapassa o limite de ${MAXIMO_VERTICES_IMPORTACAO.toLocaleString('pt-BR')} vértices no total.`)
    }

    const latitude = candidato.ponto?.[0] ?? pontosExternos.reduce((soma, ponto) => soma + ponto[0], 0) / pontosExternos.length
    const longitude = candidato.ponto?.[1] ?? pontosExternos.reduce((soma, ponto) => soma + ponto[1], 0) / pontosExternos.length
    resultado.push({
      nome: candidato.nome,
      poligono: geometria,
      latitude,
      longitude,
      tipo: candidato.tipo,
      data_inicio: candidato.data_inicio,
      limite_precipitacao_mm: candidato.limite_precipitacao_mm,
      referencia: candidato.referencia,
      observacao: candidato.observacao,
    })
  }

  if (!resultado.length) {
    throw new Error('Nenhum polígono válido foi encontrado no KMZ/KML.')
  }
  return resultado
}

export async function extrairKmlDoArquivo(
  arquivo: File,
  atualizarProgresso: (mensagem: string) => void,
): Promise<string> {
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
    throw new Error('O arquivo excede o limite de 20 MB.')
  }

  atualizarProgresso('Abrindo arquivo…')
  const bytes = await arquivo.arrayBuffer()
  const assinatura = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4))
  const arquivoZip = arquivo.name.toLowerCase().endsWith('.kmz')
    || (assinatura[0] === 0x50 && assinatura[1] === 0x4b)
  if (!arquivoZip) {
    atualizarProgresso('Analisando polígonos…')
    const conteudo = new TextDecoder().decode(bytes)
    if (conteudo.length > TAMANHO_MAXIMO_KML) {
      throw new Error('O KML dentro do arquivo é maior que o limite permitido.')
    }
    return conteudo
  }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new Error('Não foi possível abrir o KMZ. Confira se o arquivo está íntegro.')
  }
  const arquivosKml = Object.values(zip.files).filter(item => !item.dir && /\.kml$/i.test(item.name))
  const selecionado = arquivosKml.find(item => /(^|\/)doc\.kml$/i.test(item.name)) ?? arquivosKml[0]
  if (!selecionado) throw new Error('O arquivo KMZ não contém nenhum documento KML.')

  atualizarProgresso('Descompactando o documento KMZ…')
  const conteudo = await selecionado.async('string', progresso => {
    atualizarProgresso(`Descompactando o documento KMZ… ${Math.floor(progresso.percent)}%`)
  })
  if (conteudo.length > TAMANHO_MAXIMO_KML) {
    throw new Error('O KML dentro do arquivo é maior que o limite permitido.')
  }
  return conteudo
}
