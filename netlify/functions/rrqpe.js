export const handler = async () => {
  const tileUrl = String(process.env.RRQPE_TILES_URL || process.env.RRQPE_TILE_URL || '').trim()
  if (!tileUrl) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disponivel: false,
        fonte: 'GOES-16 RRQPE / NOAA',
        configuracaoNecessaria: 'RRQPE_TILES_URL',
        mensagem: 'A camada RRQPE precisa de um serviço de tiles HTTPS configurado no Netlify. A NOAA distribui o produto original como NetCDF, não como tiles XYZ.',
      }),
    }
  }
  if (!/^https:\/\//i.test(tileUrl) || !tileUrl.includes('{z}') || !tileUrl.includes('{x}') || !tileUrl.includes('{y}')) {
    return { statusCode: 503, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ erro: 'RRQPE_TILES_URL inválida' }) }
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disponivel: true, tileUrl, atualizadoEm: new Date().toISOString(), fonte: 'GOES-16 RRQPE / NOAA' }),
  }
}