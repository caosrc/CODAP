import './_group.css'
import './ChuvaCentro24h.css'
import { ChuvaCentro24h } from './ChuvaCentro24h'

const estacaoDemo = {
  nome: 'Centro de Conselheiro Lafaiete (CEMADEN)',
  codigo: '3121',
  dataHora: '23/10/2026 17:00',
  acumulados: {
    umaHora: 0.8,
    seisHoras: 5.4,
    dozeHoras: 14.1,
    vinteQuatroHoras: 18.6,
  },
}

export function Current() {
  return (
    <main className="chuva-demo-current">
      <ChuvaCentro24h estacao={estacaoDemo} />
    </main>
  )
}

export default Current
