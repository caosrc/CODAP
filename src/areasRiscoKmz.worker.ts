/// <reference lib="webworker" />
import { analisarArquivoKmz } from './areasRiscoKmzParser'
import type { PoligonoKmzImportado } from './areasRiscoKmz'

const worker = self as unknown as DedicatedWorkerGlobalScope

worker.onmessage = async (event: MessageEvent<{ arquivo: File }>) => {
  try {
    const poligonos = await analisarArquivoKmz(event.data.arquivo, mensagem => {
      worker.postMessage({ tipo: 'progresso', mensagem })
    })
    worker.postMessage({ tipo: 'resultado', poligonos } satisfies { tipo: 'resultado'; poligonos: PoligonoKmzImportado[] })
  } catch (erro) {
    worker.postMessage({
      tipo: 'erro',
      mensagem: erro instanceof Error ? erro.message : 'Não foi possível ler o arquivo KMZ/KML.',
    })
  }
}
