import {
  criarCookieSessaoApp,
  criarTokenAplicativo,
  validarCredenciaisAplicativo,
} from '../../server/paeAuth.js'

function resposta(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
    body: JSON.stringify(body),
  }
}

export const handler = async event => {
  if (event.httpMethod !== 'POST') return resposta(405, { error: 'Método não permitido.' })
  let dados
  try {
    dados = JSON.parse(event.body || '{}')
  } catch {
    return resposta(400, { error: 'Dados de acesso inválidos.' })
  }
  if (!validarCredenciaisAplicativo(dados.usuario, dados.senha)) {
    return resposta(401, { error: 'Usuário ou senha incorretos.' })
  }
  try {
    const token = criarTokenAplicativo(String(dados.usuario).trim().toLowerCase())
    return resposta(200, { ok: true }, { 'Set-Cookie': criarCookieSessaoApp(token) })
  } catch {
    return resposta(503, { error: 'A sessão do aplicativo não está configurada no servidor.' })
  }
}
