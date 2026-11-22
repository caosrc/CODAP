import { lerSessaoAplicativoCookie } from '../../server/paeAuth.js'

function resposta(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  }
}

export const handler = async event => {
  if (event.httpMethod !== 'GET') return resposta(405, { error: 'Método não permitido.' })
  const cookie = event.headers?.cookie || event.headers?.Cookie || ''
  if (!lerSessaoAplicativoCookie(cookie)) {
    return resposta(401, { error: 'Entre novamente no aplicativo para continuar.' })
  }
  return resposta(200, { ok: true })
}
