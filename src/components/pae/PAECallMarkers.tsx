import { useMemo } from 'react'
import L from 'leaflet'
import { Marker, Popup } from 'react-leaflet'
import type { PaeChamado } from '../../paeTypes'
import './pae.css'

export interface PAECallMarkersProps {
  chamados: PaeChamado[]
  onSelecionarChamado: (chamado: PaeChamado) => void
}

const prioridadeLabel: Record<PaeChamado['prioridade'], string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
}

const statusLabel: Record<PaeChamado['status'], string> = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

function criarIcone(chamado: PaeChamado) {
  const cor = chamado.status === 'novo' ? '#df514c'
    : chamado.status === 'em_atendimento' ? '#318fca'
      : chamado.status === 'concluido' ? '#4da98b' : '#8696a4'
  const html = `<span style="--marker-color:${cor}" class="pae-map-marker pae-map-marker--${chamado.prioridade}" aria-hidden="true"><i></i></span>`
  return L.divIcon({
    className: 'pae-map-marker-shell',
    html,
    iconSize: [34, 42],
    iconAnchor: [17, 36],
    popupAnchor: [0, -32],
  })
}

export default function PAECallMarkers({ chamados, onSelecionarChamado }: PAECallMarkersProps) {
  const markers = useMemo(
    () => chamados.filter(chamado => Number.isFinite(chamado.latitude) && Number.isFinite(chamado.longitude)),
    [chamados],
  )

  return (
    <>
      {markers.map(chamado => (
        <Marker
          key={chamado.id}
          position={[chamado.latitude, chamado.longitude]}
          icon={criarIcone(chamado)}
          eventHandlers={{ click: () => onSelecionarChamado(chamado) }}
          alt={`Chamado ${chamado.tipoRisco}, prioridade ${prioridadeLabel[chamado.prioridade]}`}
          riseOnHover
        >
          <Popup className="pae-map-popup">
            <article className="pae-popup-content" data-testid={`popup-call-${chamado.id}`}>
              <div className="pae-popup-topline"><span>{chamado.tipoRisco}</span><b className={`priority-${chamado.prioridade}`}>{prioridadeLabel[chamado.prioridade]}</b></div>
              <strong className="pae-popup-address">{chamado.endereco}</strong>
              <p>{chamado.descricao}</p>
              <div className="pae-popup-meta"><span>{statusLabel[chamado.status]}</span><span>{chamado.agentesEnvolvidos.length} agente(s)</span></div>
              {chamado.atendimento?.fotos[0] && <img className="pae-popup-photo" src={chamado.atendimento.fotos[0].dataUrl} alt={chamado.atendimento.fotos[0].legenda || 'Foto do atendimento'} />}
              <button type="button" onClick={() => onSelecionarChamado(chamado)} data-testid={`button-open-map-call-${chamado.id}`}>Abrir chamado <span aria-hidden="true">→</span></button>
            </article>
          </Popup>
        </Marker>
      ))}
    </>
  )
}
