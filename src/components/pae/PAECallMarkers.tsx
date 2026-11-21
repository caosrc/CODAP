import { useMemo } from 'react'
import L from 'leaflet'
import { Marker, Popup } from 'react-leaflet'
import type { PaeChamado } from '../../paeTypes'
import './pae.css'

export interface PAECallMarkersProps {
  chamados: PaeChamado[]
  onSelecionarChamado: (chamado: PaeChamado) => void
  ajusteChamadoId?: string | null
  salvandoLocalizacaoId?: string | null
  onAtualizarLocalizacao?: (chamadoId: string, latitude: number, longitude: number) => void
}

const prioridadeLabel: Record<PaeChamado['prioridade'], string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
}

const statusLabel: Record<PaeChamado['status'], string> = {
  novo: 'Novo',
  triado: 'Triado',
  em_atendimento: 'Em atendimento',
  concluido_em_campo: 'Concluído em campo',
  validado: 'Validado',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
}

function criarIcone(chamado: PaeChamado) {
  const cor = chamado.status === 'novo' ? '#df514c'
    : chamado.atribuicao?.status === 'designada' || chamado.atribuicao?.status === 'aceita'
      ? '#e68a3c'
      : chamado.status === 'triado' ? '#e68a3c'
      : chamado.status === 'em_atendimento' || chamado.status === 'concluido_em_campo' ? '#318fca'
        : chamado.status === 'validado' ? '#4da98b' : '#8696a4'
  const html = `<span style="--marker-color:${cor}" class="pae-map-marker pae-map-marker--${chamado.prioridade}" aria-hidden="true"><i></i></span>`
  return L.divIcon({
    className: 'pae-map-marker-shell',
    html,
    iconSize: [34, 42],
    iconAnchor: [17, 36],
    popupAnchor: [0, -32],
  })
}

export default function PAECallMarkers({
  chamados,
  onSelecionarChamado,
  ajusteChamadoId = null,
  salvandoLocalizacaoId = null,
  onAtualizarLocalizacao,
}: PAECallMarkersProps) {
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
          draggable={ajusteChamadoId === chamado.id && Boolean(onAtualizarLocalizacao)}
          eventHandlers={{
            click: () => onSelecionarChamado(chamado),
            dragend: event => {
              if (!onAtualizarLocalizacao) return
              const point = (event.target as L.Marker).getLatLng()
              onAtualizarLocalizacao(chamado.id, point.lat, point.lng)
            },
          }}
          alt={`Chamado ${chamado.tipoRisco}, prioridade ${prioridadeLabel[chamado.prioridade]}`}
          riseOnHover
        >
          <Popup className="pae-map-popup">
            <article className="pae-popup-content" data-testid={`popup-call-${chamado.id}`}>
              <div className="pae-popup-topline"><span>{chamado.tipoRisco}</span><b className={`priority-${chamado.prioridade}`}>{prioridadeLabel[chamado.prioridade]}</b></div>
              <strong className="pae-popup-address">{chamado.endereco}</strong>
              <p>{chamado.descricao}</p>
            <div className="pae-popup-meta">
              <span>{chamado.atribuicao?.status === 'designada'
                ? 'Aguardando aceite'
                : chamado.atribuicao?.status === 'aceita'
                  ? 'Equipe confirmou'
                  : statusLabel[chamado.status]}</span>
              <span>{chamado.agentesEnvolvidos.length} agente(s)</span>
            </div>
              {chamado.atendimento?.fotos[0] && <img className="pae-popup-photo" src={chamado.atendimento.fotos[0].dataUrl} alt={chamado.atendimento.fotos[0].legenda || 'Foto do atendimento'} />}
              {salvandoLocalizacaoId === chamado.id && <small role="status">Salvando novo ponto…</small>}
              <button type="button" onClick={() => onSelecionarChamado(chamado)} data-testid={`button-open-map-call-${chamado.id}`}>Abrir chamado <span aria-hidden="true">→</span></button>
            </article>
          </Popup>
        </Marker>
      ))}
    </>
  )
}
