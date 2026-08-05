// Netlify Function — Focos de Incêndio (NASA FIRMS: VIIRS-SNPP + GOES-16)
// Espelha a lógica do Express em server/index.js para o deploy no Netlify.

// Polígono simplificado do município de Ouro Branco - MG (IBGE 3146206)
// Cada par é [lat, lng]; ray-casting determina se o ponto está dentro do limite municipal
const OURO_BRANCO_POLIGONO = [
  [-20.393, -43.838],
  [-20.378, -43.710],
  [-20.382, -43.598],
  [-20.403, -43.493],
  [-20.478, -43.446],
  [-20.548, -43.449],
  [-20.603, -43.478],
  [-20.648, -43.560],
  [-20.651, -43.648],
  [-20.630, -43.752],
  [-20.601, -43.843],
  [-20.518, -43.862],
  [-20.440, -43.851],
]

function pontoNoCidade(lat, lng) {
  const poly = OURO_BRANCO_POLIGONO
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i]
    const [yj, xj] = poly[j]
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function parsearFirmsCsv(csv, fonteNome) {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',')
  const idx = (name) => headers.indexOf(name)
  return lines.slice(1).map(line => {
    const c = line.split(',')
    const confRaw = (c[idx('confidence')] || 'n').trim()
    // GOES usa numérico: 10=high, 11=saturated, 30=nominal, 31-33=low/filtered
    let confidence = confRaw
    if (!isNaN(parseInt(confRaw))) {
      const n = parseInt(confRaw)
      confidence = n <= 11 ? 'h' : n <= 30 ? 'n' : 'l'
    }
    return {
      lat: parseFloat(c[idx('latitude')]),
      lng: parseFloat(c[idx('longitude')]),
      confidence,
      frp: parseFloat(c[idx('frp')]) || 0,
      data: c[idx('acq_date')] || '',
      hora: c[idx('acq_time')] || '',
      satelite: c[idx('satellite')] || fonteNome,
      fonte: fonteNome,
    }
  }).filter(f => !isNaN(f.lat) && !isNaN(f.lng))
}

export const handler = async () => {
  const firmsKey = process.env.FIRMS_MAP_KEY
  if (!firmsKey) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focos: [], configurado: false, fontes: [], msg: 'FIRMS_MAP_KEY não configurada' }),
    }
  }

  // bbox de Ouro Branco - MG: oeste,sul,leste,norte (com margem de ~5 km)
  const bbox = '-43.95,-20.70,-43.40,-20.33'
  const base = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}`

  try {
    const [resViirs, resGoes] = await Promise.allSettled([
      fetch(`${base}/VIIRS_SNPP_NRT/${bbox}/1`, { signal: AbortSignal.timeout(12000) }),
      fetch(`${base}/GOES_NRT/${bbox}/1`,        { signal: AbortSignal.timeout(12000) }),
    ])

    let focosViirs = [], focosGoes = [], fontes = []

    if (resViirs.status === 'fulfilled' && resViirs.value.ok) {
      focosViirs = parsearFirmsCsv(await resViirs.value.text(), 'VIIRS')
      fontes.push('VIIRS-SNPP')
    }
    if (resGoes.status === 'fulfilled' && resGoes.value.ok) {
      focosGoes = parsearFirmsCsv(await resGoes.value.text(), 'GOES')
      fontes.push('GOES-16')
    }

    const todosFocos = [...focosViirs, ...focosGoes]
    const focos = todosFocos.filter(f => pontoNoCidade(f.lat, f.lng))

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600', // 10 min — igual ao cache do Express
      },
      body: JSON.stringify({
        focos,
        configurado: true,
        fontes,
        atualizadoEm: new Date().toISOString(),
      }),
    }
  } catch (e) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focos: [], configurado: true, fontes: [], erro: e?.message }),
    }
  }
}
