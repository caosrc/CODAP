// Netlify Function — Focos de Incêndio (NASA FIRMS)
// Satélites: VIIRS-SNPP · VIIRS-NOAA20 · VIIRS-NOAA21 · MODIS · GOES (geoest.)
// Espelha a lógica de server/index.js para o deploy no Netlify.

// Polígono do município de Ouro Branco - MG (IBGE 3146206)
// Divisa leste expandida ~5 km para incluir área limítrofe com Conselheiro Lafaiete
const OURO_BRANCO_POLIGONO = [
  [-20.393, -43.838],
  [-20.378, -43.710],
  [-20.382, -43.598],
  [-20.403, -43.480],
  [-20.478, -43.415],
  [-20.548, -43.410],
  [-20.603, -43.388],
  [-20.648, -43.468],
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
    const cols = line.split(',')
    const confRaw = (cols[idx('confidence')] || 'n').trim()
    let confidence = 'n'
    const confNum = parseInt(confRaw)
    if (!isNaN(confNum)) {
      if (fonteNome === 'MODIS') {
        // MODIS: 0-100 % de confiança
        confidence = confNum >= 70 ? 'h' : confNum >= 30 ? 'n' : 'l'
      } else {
        // GOES: 10/11=high, 30=nominal, 31-33=low; outros (>65)=high
        confidence = confNum <= 11 ? 'h' : confNum <= 30 ? 'n' : confNum <= 65 ? 'l' : 'h'
      }
    } else {
      const c0 = confRaw.toLowerCase()[0]
      confidence = c0 === 'h' ? 'h' : c0 === 'l' ? 'l' : 'n'
    }
    return {
      lat:      parseFloat(cols[idx('latitude')]),
      lng:      parseFloat(cols[idx('longitude')]),
      confidence,
      frp:      parseFloat(cols[idx('frp')]) || 0,
      data:     cols[idx('acq_date')] || '',
      hora:     cols[idx('acq_time')] || '',
      satelite: cols[idx('satellite')] || fonteNome,
      fonte:    fonteNome,
    }
  }).filter(f => !isNaN(f.lat) && !isNaN(f.lng))
}

// Remove focos duplicados: mesmo incêndio detectado por vários satélites.
// Considera duplicata se distância < 0.01° (~1 km); mantém o de maior FRP.
function deduplicarFocos(focos) {
  const out = []
  for (const f of focos) {
    const dup = out.find(r => Math.abs(r.lat - f.lat) < 0.01 && Math.abs(r.lng - f.lng) < 0.01)
    if (dup) { if (f.frp > dup.frp) Object.assign(dup, f) }
    else out.push({ ...f })
  }
  return out
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

  // bbox: oeste,sul,leste,norte (margem ~5 km; leste expandido para divisa)
  const bbox = '-43.95,-20.70,-43.35,-20.33'
  const base = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}`

  try {
    const [resSnpp, resN20, resN21, resMod, resGoes] = await Promise.allSettled([
      fetch(`${base}/VIIRS_SNPP_NRT/${bbox}/1`,   { signal: AbortSignal.timeout(14000) }),
      fetch(`${base}/VIIRS_NOAA20_NRT/${bbox}/1`, { signal: AbortSignal.timeout(14000) }),
      fetch(`${base}/VIIRS_NOAA21_NRT/${bbox}/1`, { signal: AbortSignal.timeout(14000) }),
      fetch(`${base}/MODIS_NRT/${bbox}/1`,          { signal: AbortSignal.timeout(14000) }),
      fetch(`${base}/GOES_NRT/${bbox}/1`,           { signal: AbortSignal.timeout(14000) }),
    ])

    const fontes = []

    const processar = async (r, nome, label) => {
      if (r.status === 'fulfilled' && r.value.ok) {
        const f = parsearFirmsCsv(await r.value.text(), nome)
        fontes.push(label)
        return f
      }
      return []
    }

    const grupos = await Promise.all([
      processar(resSnpp, 'VIIRS-SNPP',  'VIIRS-SNPP'),
      processar(resN20,  'VIIRS-N20',   'VIIRS-NOAA20'),
      processar(resN21,  'VIIRS-N21',   'VIIRS-NOAA21'),
      processar(resMod,  'MODIS',       'MODIS'),
      processar(resGoes, 'GOES',        'GOES'),
    ])

    const todos = grupos.flat().filter(f => pontoNoCidade(f.lat, f.lng))
    const focos = deduplicarFocos(todos)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600',
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
