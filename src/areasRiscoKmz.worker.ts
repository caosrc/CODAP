/// <reference lib="webworker" />
import {
  extrairKmlDoArquivo,
  validarCandidatosKml,
  type CandidatoPoligonoKmz,
} from './areasRiscoKmzParser'
import type { PoligonoKmzImportado } from './areasRiscoKmz'

const worker = self as unknown as DedicatedWorkerGlobalScope

worker.onmessage = async (event: MessageEvent<
  | { tipo: 'arquivo'; arquivo: File }
  | { tipo: 'validar'; candidatos: CandidatoPoligonoKmz[] }
>) => {
  if (event.data.tipo === 'validar') {
    try {
      const poligonos = validarCandidatosKml(event.data.candidatos)
      worker.postMessage({ tipo: 'resultado', poligonos } satisfies { tipo: 'resultado'; poligonos: PoligonoKmzImportado[] })
    } catch (erro) {
      worker.postMessage({
        tipo: 'erro',
        mensagem: erro instanceof Error ? erro.message : 'Não foi possível validar os polígonos do arquivo.',
      })
    }
    return
  }

  try {
    const conteudo = await extrairKmlDoArquivo(event.data.arquivo, mensagem => {
      worker.postMessage({ tipo: 'progresso', mensagem })
    })
    worker.postMessage({ tipo: 'kml', conteudo } satisfies { tipo: 'kml'; conteudo: string })
  } catch (erro) {
    worker.postMessage({
      tipo: 'erro',
      mensagem: erro instanceof Error ? erro.message : 'Não foi possível ler o arquivo KMZ/KML.',
    })
  }
}
