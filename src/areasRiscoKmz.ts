import {
  areaRiscoTemPoligono,
  ESTILO_AREA_RISCO,
  type AnelAreaRisco,
  type AreaRiscoInput,
  type GeometriaAreaRisco,
  type TipoAreaRisco,
} from './areasRisco'

export interface PoligonoKmzImportado {
  nome: string
  poligono: GeometriaAreaRisco
  latitude: number
  longitude: number
  tipo?: TipoAreaRisco
  data_inicio?: string
  limite_precipitacao_mm?: number
  referencia?: string
  observacao?: string
}

type ImportacaoWorkerMensagem =
  | { tipo: 'progresso'; mensagem: string }
  | { tipo: 'resultado'; poligonos: PoligonoKmzImportado[] }
  | { tipo: 'erro'; mensagem: string }

export function importarPoligonosKmz(
  arquivo: File,
  aoAtualizarProgresso?: (mensagem: string) => void,
): Promise<PoligonoKmzImportado[]> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./areasRiscoKmz.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      reject(new Error('Não foi possível iniciar a leitura do arquivo. Atualize a página e tente novamente.'))
      return
    }

    worker.onmessage = (event: MessageEvent<ImportacaoWorkerMensagem>) => {
      const mensagem = event.data
      if (mensagem.tipo === 'progresso') {
        aoAtualizarProgresso?.(mensagem.mensagem)
      } else if (mensagem.tipo === 'resultado') {
        worker.terminate()
        resolve(mensagem.poligonos)
      } else {
        worker.terminate()
        reject(new Error(mensagem.mensagem))
      }
    }
    worker.onerror = () => {
      worker.terminate()
      reject(new Error('Ocorreu um erro ao ler o KMZ/KML. Verifique se o arquivo está íntegro e tente novamente.'))
    }
    worker.postMessage({ arquivo })
  })
}

function escaparXml(valor: string | number | null | undefined) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function coordenadasKml(pontos: AnelAreaRisco) {
  const fechados = pontos.length
    && (pontos[0][0] !== pontos[pontos.length - 1][0] || pontos[0][1] !== pontos[pontos.length - 1][1])
    ? [...pontos, pontos[0]]
    : pontos
  return fechados.map(([latitude, longitude]) => `${longitude},${latitude},0`).join(' ')
}

function poligonoKml(aneis: AnelAreaRisco[]) {
  const [externo, ...internos] = aneis
  if (!externo) return ''
  const limiteExterno = `<outerBoundaryIs><LinearRing><coordinates>${coordenadasKml(externo)}</coordinates></LinearRing></outerBoundaryIs>`
  const limitesInternos = internos.map(anel =>
    `<innerBoundaryIs><LinearRing><coordinates>${coordenadasKml(anel)}</coordinates></LinearRing></innerBoundaryIs>`,
  ).join('')
  return `<Polygon>${limiteExterno}${limitesInternos}</Polygon>`
}

function corKml(hex: string, opacidade: string) {
  const rgb = hex.replace('#', '')
  return `${opacidade}${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`
}

export async function exportarPoligonosKmz(areas: AreaRiscoInput[]) {
  const comPoligono = areas.filter(area => areaRiscoTemPoligono(area.poligono))
  if (!comPoligono.length) {
    throw new Error('Nenhuma área com polígono cadastrado está disponível para exportação.')
  }

  const tipos = Array.from(new Set(comPoligono.map(area => area.tipo)))
  const estiloPorTipo = new Map(tipos.map((tipo, indice) => [tipo, `tipo-${indice}`]))
  const estilos = tipos.map(tipo => {
    const cor = ESTILO_AREA_RISCO[tipo].cor
    return `<Style id="${estiloPorTipo.get(tipo)}"><LineStyle><color>${corKml(cor, 'ff')}</color><width>2</width></LineStyle><PolyStyle><color>${corKml(cor, '55')}</color><fill>1</fill><outline>1</outline></PolyStyle></Style>`
  }).join('')

  const marcacoes = comPoligono.map(area => {
    const nome = area.referencia || area.tipo
    const dados = [
      ['tipo', area.tipo],
      ['referencia', area.referencia],
      ['observacao', area.observacao],
      ['data_inicio', area.data_inicio],
      ['limite_precipitacao_mm', area.limite_precipitacao_mm],
    ].map(([chave, valor]) => `<Data name="${chave}"><value>${escaparXml(valor)}</value></Data>`).join('')
    const geometrias = area.poligono.map(poligonoKml).join('')
    return `<Placemark><name>${escaparXml(nome)}</name><styleUrl>#${estiloPorTipo.get(area.tipo)}</styleUrl><ExtendedData>${dados}</ExtendedData><MultiGeometry>${geometrias}<Point><coordinates>${area.longitude},${area.latitude},0</coordinates></Point></MultiGeometry></Placemark>`
  }).join('')

  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Áreas de risco — Defesa Civil Lafaiete</name>${estilos}${marcacoes}</Document></kml>`
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file('doc.kml', kml)
  const arquivo = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.google-earth.kmz',
    compression: 'DEFLATE',
  })
  return { arquivo, quantidade: comPoligono.length }
}
