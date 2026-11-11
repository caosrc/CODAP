import JSZip from 'jszip'
import { TIPOS_AREAS_RISCO, type TipoAreaRisco } from './areasRisco'
import type { PoligonoKmzImportado } from './areasRiscoKmz'

const TAMANHO_MAXIMO_ARQUIVO = 20 * 1024 * 1024
const TAMANHO_MAXIMO_KML = 50 * 1024 * 1024
const MAXIMO_POLIGONOS = 500
const MAXIMO_VERTICES = 10_000
const MAXIMO_VERTICES_IMPORTACAO = 250_000

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

function lerCoordenadas(texto: string): Array<[number, number]> {
  const pontos: Array<[number, number]> = []
  for (const tupla of texto.trim().split(/\s+/)) {
    if (!tupla) continue
    const [lonTexto, latTexto] = tupla.split(',')
    const longitude = Number(lonTexto)
    const latitude = Number(latTexto)
    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) continue
    pontos.push([latitude, longitude])
    if (pontos.length > MAXIMO_VERTICES) {
      throw new Error(`O contorno ultrapassa o limite de ${MAXIMO_VERTICES.toLocaleString('pt-BR')} vértices.`)
    }
  }

  const primeiro = pontos[0]
  const ultimo = pontos[pontos.length - 1]
  if (primeiro && ultimo && primeiro[0] === ultimo[0] && primeiro[1] === ultimo[1]) pontos.pop()
  return pontos
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

function analisarKml(conteudo: string): PoligonoKmzImportado[] {
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

  const resultado: PoligonoKmzImportado[] = []
  let totalVertices = 0
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
    const poligonos = descendentesComNome(placemark, 'Polygon')

    for (const polygon of poligonos) {
      const limiteExterno = primeiroDescendenteComNome(polygon, 'outerBoundaryIs')
      const coordenadas = textoKml(limiteExterno ?? polygon, 'coordinates')
      const poligono = lerCoordenadas(coordenadas)
      const verticesUnicos = new Set(poligono.map(([lat, lon]) => `${lat},${lon}`))
      if (poligono.length < 3 || verticesUnicos.size < 3) continue
      totalVertices += poligono.length
      if (totalVertices > MAXIMO_VERTICES_IMPORTACAO) {
        throw new Error(`O arquivo ultrapassa o limite de ${MAXIMO_VERTICES_IMPORTACAO.toLocaleString('pt-BR')} vértices no total.`)
      }
      if (resultado.length >= MAXIMO_POLIGONOS) {
        throw new Error(`O arquivo ultrapassa o limite de ${MAXIMO_POLIGONOS} polígonos por importação.`)
      }

      const latitude = pontoImportado?.[0] ?? poligono.reduce((soma, ponto) => soma + ponto[0], 0) / poligono.length
      const longitude = pontoImportado?.[1] ?? poligono.reduce((soma, ponto) => soma + ponto[1], 0) / poligono.length
      resultado.push({
        nome,
        poligono,
        latitude,
        longitude,
        tipo,
        data_inicio: dataInicio,
        limite_precipitacao_mm: limite != null && Number.isFinite(limite) && limite >= 0 ? limite : undefined,
        referencia,
        observacao: observacao || undefined,
      })
    }
  }

  if (!resultado.length) {
    throw new Error('Nenhum polígono válido foi encontrado no KMZ/KML.')
  }
  return resultado
}

export async function analisarArquivoKmz(
  arquivo: File,
  atualizarProgresso: (mensagem: string) => void,
): Promise<PoligonoKmzImportado[]> {
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
    return analisarKml(new TextDecoder().decode(bytes))
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
  atualizarProgresso('Analisando polígonos…')
  return analisarKml(conteudo)
}
