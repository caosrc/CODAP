import { useMemo } from 'react'
import { TileLayer } from 'react-leaflet'
import type { ControleLinhaTempoRadar, QuadroRadarChuva } from './radarTimeline'

interface Props {
  host: string
  quadros: QuadroRadarChuva[]
  quadroReserva?: QuadroRadarChuva | null
  quadroSelecionado?: QuadroRadarChuva | null
  opacity: number
  maxZoom: number
}

export function ControleHistoricoRadar({
  controle,
  temaEscuro = false,
}: {
  controle: ControleLinhaTempoRadar
  temaEscuro?: boolean
}) {
  const { quadros, quadroAtual, indiceAtual, animando } = controle
  if (quadros.length < 2 || !quadroAtual) return null

  const horario = new Date(quadroAtual.time * 1000).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={`mapa-chuva-historico${temaEscuro ? ' mapa-chuva-historico--escuro' : ''}`}>
      <div className="mapa-chuva-historico-topo">
        <button
          type="button"
          onClick={controle.alternarAnimacao}
          aria-pressed={animando}
          title="Animar os quadros observados disponíveis; isso não é previsão"
        >
          {animando ? '⏸ Pausar' : '▶ Animar histórico'}
        </button>
        <button
          type="button"
          className={controle.aoVivo ? 'ao-vivo' : ''}
          onClick={controle.irAoVivo}
          aria-pressed={controle.aoVivo}
        >
          ● Ao vivo
        </button>
        <strong>{horario}</strong>
      </div>
      <input
        type="range"
        min={0}
        max={quadros.length - 1}
        step={1}
        value={indiceAtual}
        aria-label="Selecionar horário dos quadros históricos de chuva"
        onChange={evento => controle.selecionar(quadros[Number(evento.target.value)].time)}
      />
      <div className="mapa-chuva-historico-escala">
        <span>{new Date(quadros[0].time * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        <span>Quadro {indiceAtual + 1} de {quadros.length} · horários de geração</span>
        <span>{new Date(quadros[quadros.length - 1].time * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <small>Histórico observado, não é nowcasting nem previsão de chuva.</small>
    </div>
  )
}

export default function RadarChuvaAnimado({
  host,
  quadros,
  quadroReserva,
  quadroSelecionado,
  opacity,
  maxZoom,
}: Props) {
  const quadroAtual = useMemo(() => {
    const fonte = quadros.length > 0 ? quadros : quadroReserva ? [quadroReserva] : []
    const validos = fonte.filter(validarQuadro).sort((a, b) => a.time - b.time)
    return validos.find(quadro => quadro.time === quadroSelecionado?.time) ?? validos.at(-1)
  }, [quadros, quadroReserva, quadroSelecionado])
  if (!host || !quadroAtual) return null

  return (
    <TileLayer
      key={`${quadroAtual.time}:${quadroAtual.path}`}
      url={`${host.replace(/\/$/, '')}${quadroAtual.path}/256/{z}/{x}/{y}/2/1_0.png`}
      opacity={opacity}
      attribution='Weather data by <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>'
      maxNativeZoom={7}
      maxZoom={maxZoom}
      tileSize={256}
      updateWhenZooming={false}
      updateWhenIdle
    />
  )
}
