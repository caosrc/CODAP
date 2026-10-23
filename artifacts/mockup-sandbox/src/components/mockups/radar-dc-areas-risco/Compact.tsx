import { useEffect, useRef, useState } from 'react'
import './_group.css'
import AreasRiscoMapa from './AreasRiscoMapa'
import type { AreaRisco } from './areasRisco'

const MOCK_AREAS: AreaRisco[] = [
  {
    id: 'demo-encosta',
    tipo: 'Encostas',
    latitude: -20.66,
    longitude: -43.79,
    poligono: [],
    data_inicio: '2026-10-20',
    limite_precipitacao_mm: 25,
    referencia: 'Bairro São Dimas',
    observacao: null,
    criado_por: 'Equipe de demonstração',
    created_at: '2026-10-20T12:00:00.000Z',
  },
  {
    id: 'demo-alagamento',
    tipo: 'Alagamentos',
    latitude: -20.65,
    longitude: -43.78,
    poligono: [],
    data_inicio: '2026-10-21',
    limite_precipitacao_mm: 20,
    referencia: 'Rua do Campo',
    observacao: null,
    criado_por: 'Equipe de demonstração',
    created_at: '2026-10-21T12:00:00.000Z',
  },
  {
    id: 'demo-vias',
    tipo: 'Problemas de vias',
    latitude: -20.67,
    longitude: -43.80,
    poligono: [],
    data_inicio: '2026-10-22',
    limite_precipitacao_mm: 35,
    referencia: 'Acesso ao bairro',
    observacao: null,
    criado_por: 'Equipe de demonstração',
    created_at: '2026-10-22T12:00:00.000Z',
  },
]

export function Compact() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [painelHost, setPainelHost] = useState<HTMLDivElement | null>(null)

  useEffect(() => setPainelHost(hostRef.current), [])

  return (
    <main className="arm-preview-shell">
      <div className="arm-preview-map">
        <div className="arm-preview-map-lines" aria-hidden="true" />
        <div className="arm-preview-host" ref={hostRef} />
        {painelHost && (
          <AreasRiscoMapa
            painelHost={painelHost}
            modoTv={false}
            areas={MOCK_AREAS}
            previsaoPorArea={{ 'demo-encosta': 32, 'demo-alagamento': 11, 'demo-vias': 8 }}
            carregando={false}
            salvando={false}
            agenteLogado="Demonstração"
            senhaAgente="preview"
            erro={null}
            onSalvar={async () => undefined}
            onEditar={async () => undefined}
            onExcluir={async () => undefined}
          />
        )}
        <div className="arm-preview-label">PRÉVIA · DADOS DE EXEMPLO</div>
      </div>
    </main>
  )
}
