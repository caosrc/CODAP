import {
  criarSessaoSupabasePae,
  lerSessaoAplicativoCookie,
} from '../../server/paeAuth.js'

function resposta(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  }
}

export const handler = async event => {
  if (event.httpMethod !== 'POST') return resposta(405, { error: 'Método não permitido.' })
  const cookie = event.headers?.cookie || event.headers?.Cookie || ''
  if (!lerSessaoAplicativoCookie(cookie)) {
    return resposta(401, { error: 'Entre no aplicativo para abrir o PAE.' })
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return resposta(400, { error: 'Dados do agente inválidos.' })
  }
  const agente = typeof body.agente === 'string' ? body.agente.trim().slice(0, 100) : ''
  if (!agente) return resposta(400, { error: 'Não foi possível identificar o agente selecionado.' })

  try {
    return resposta(200, await criarSessaoSupabasePae(agente))
  } catch (error) {
    const status = Number(error?.status) || 503
    if (status >= 500) console.error('[PAE auth] Falha ao preparar sessão:', error?.message || 'erro desconhecido')
    return resposta(status, {
      error: error instanceof Error ? error.message : 'Não foi possível abrir o PAE.',
    })
  }
}
