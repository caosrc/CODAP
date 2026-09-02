export const handler = async () => {
  const tileUrl = String(process.env.RRQPE_TILES_URL || '').trim()
  if (!tileUrl) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disponivel: false,
        fonte: 'GOES-16 RRQPE / NOAA',
        mensagem: 'A camada RRQPE precisa de um serviço de tiles HTTPS configurado no Netlify.',
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