import { useEffect, useState } from 'react'
import { Pane, TileLayer } from 'react-leaflet'

export default function CamadaNuvensGoes({
  ativa,
  url,
  nomePane,
  maxZoom,
  opacidade = 0.5,
}: {
  ativa: boolean
  url: string
  nomePane: string
  maxZoom: number
  opacidade?: number
}) {
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    if (!ativa) return
    const atualizar = () => {
      if (document.visibilityState === 'visible') setVersao(Date.now())
    }
    const frame = window.requestAnimationFrame(atualizar)
    const intervalo = window.setInterval(atualizar, 10 * 60 * 1000)
    document.addEventListener('visibilitychange', atualizar)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', atualizar)
    }
  }, [ativa])

  if (!ativa) return null
  const separador = url.includes('?') ? '&' : '?'

  return (
    <Pane name={nomePane} style={{ zIndex: 410 }}>
      <TileLayer
        key={`${url}:${versao}`}
        url={`${url}${separador}atualizado=${versao}`}
        opacity={opacidade}
        maxNativeZoom={8}
        maxZoom={maxZoom}
        attribution='Cloud imagery &copy; <a href="https://gis.nnvl.noaa.gov/arcgis/rest/services/GOES/GOES_current/ImageServer" target="_blank" rel="noreferrer">NOAA GOES</a>'
        updateWhenZooming={false}
        updateWhenIdle
      />
    </Pane>
  )
}
