import { useEffect, useMemo, useState } from 'react'
import { TileLayer } from 'react-leaflet'

export type QuadroRadarChuva = {
  time: number
  path: string
}

interface Props {
  host: string
  quadros: QuadroRadarChuva[]
  quadroReserva?: QuadroRadarChuva | null
  opacity: number
  maxZoom: number
}

const INTERVALO_ANIMACAO_MS = 900

export default function RadarChuvaAnimado({
  host,
  quadros,
  quadroReserva,
  opacity,
  maxZoom,
}: Props) {
  const quadrosValidos = useMemo(() => {
    const fonte = quadros.length > 0 ? quadros : quadroReserva ? [quadroReserva] : []
    return fonte.filter(quadro =>
      Number.isFinite(quadro.time) &&
      typeof quadro.path === 'string' &&
      quadro.path.startsWith('/v2/radar/'),
    )
  }, [quadros, quadroReserva])
  const assinatura = quadrosValidos.map(quadro => `${quadro.time}:${quadro.path}`).join('|')
  const [indiceQuadro, setIndiceQuadro] = useState(0)

  useEffect(() => {
    setIndiceQuadro(0)
  }, [assinatura])

  useEffect(() => {
    if (quadrosValidos.length < 2) return
    const intervalo = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setIndiceQuadro(indice => (indice + 1) % quadrosValidos.length)
    }, INTERVALO_ANIMACAO_MS)
    return () => window.clearInterval(intervalo)
  }, [assinatura, quadrosValidos.length])

  const quadroAtual = quadrosValidos[indiceQuadro]
  if (!host || !quadroAtual) return null

  return (
    <TileLayer
      key="radar-chuva-animado"
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
