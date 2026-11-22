import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const COOKIE_SESSAO_APP = 'dc-app-session'
const DURACAO_SESSAO_SEGUNDOS = 30 * 24 * 60 * 60
const USUARIO_APP = String(process.env.APP_LOGIN_USERNAME || 'lafaiete').trim().toLowerCase()
const SENHA_APP = process.env.APP_LOGIN_PASSWORD || '1234'

function texto(valor, limite = 200) {
  return typeof valor === 'string' ? valor.trim().slice(0, limite) : ''
}

function compararSegredos(a, b) {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
}

function criarAssinatura(conteudo, segredo) {
  return createHmac('sha256', segredo).update(conteudo).digest('base64url')
}

function segredoDaSessao() {
  return process.env.SESSION_SECRET || ''
}

export function criarTokenAplicativo(usuario) {
  const segredo = segredoDaSessao()
  if (segredo.length < 32) throw new Error('A sessão do aplicativo não está configurada no servidor.')
  const payload = Buffer.from(JSON.stringify({
    usuario,
    exp: Math.floor(Date.now() / 1000) + DURACAO_SESSAO_SEGUNDOS,
  })).toString('base64url')
  return `${payload}.${criarAssinatura(payload, segredo)}`
}

function lerCookie(cookieHeader, nome) {
  const cookies = String(cookieHeader || '').split(';')
  for (const cookie of cookies) {
    const separador = cookie.indexOf('=')
    if (separador < 0) continue
    if (cookie.slice(0, separador).trim() === nome) {
      return cookie.slice(separador + 1).trim()
    }
  }
  return ''
}

export function lerSessaoAplicativoCookie(cookieHeader) {
  const token = lerCookie(cookieHeader, COOKIE_SESSAO_APP)
  const separador = token.indexOf('.')
  if (separador < 1) return null
  const payload = token.slice(0, separador)
  const assinatura = token.slice(separador + 1)
  const segredo = segredoDaSessao()
  if (segredo.length < 32) return null

  const esperada = criarAssinatura(payload, segredo)
  if (!compararSegredos(assinatura, esperada)) return null
  try {
    const sessao = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof sessao.usuario !== 'string' || sessao.exp <= Math.floor(Date.now() / 1000)) return null
    return sessao
  } catch {
    return null
  }
}

export function lerSessaoAplicativo(req) {
  return lerSessaoAplicativoCookie(req.headers.cookie)
}

export function criarCookieSessaoApp(token, maxAge = DURACAO_SESSAO_SEGUNDOS, secure = true) {
  return `${COOKIE_SESSAO_APP}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}

export function validarCredenciaisAplicativo(usuario, senha) {
  return texto(usuario, 100).toLowerCase() === USUARIO_APP &&
    typeof senha === 'string' && senha.length <= 256 && compararSegredos(senha, SENHA_APP)
}

function obterClientesSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) throw new Error('A autenticação interna do PAE não está configurada no servidor.')
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: WebSocket },
  }
  return {
    admin: createClient(url, serviceKey, options),
    autenticacao: createClient(url, anonKey, options),
  }
}

function criarEmailInterno(agente) {
  const nome = agente.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agente'
  const identificador = createHash('sha256').update(agente).digest('hex').slice(0, 10)
  return `pae-${nome}-${identificador}@example.com`
}

function senhaInternaPae(agente) {
  return createHmac('sha256', segredoDaSessao())
    .update(`pae-auth:v1:${agente}`).digest('base64url')
}

async function buscarUsuarioInterno(admin, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const usuario = data.users.find(item => item.email?.toLowerCase() === email.toLowerCase())
    if (usuario) return usuario
    if (data.users.length < 200) return null
  }
  return null
}

async function obterOuCriarUsuarioPae(admin, agente) {
  const email = criarEmailInterno(agente)
  const senha = senhaInternaPae(agente)
  const { data: perfis, error: erroPerfis } = await admin
    .from('pae_usuarios_autorizados')
    .select('usuario_id, agente, ativo')
    .eq('agente', agente)
  if (erroPerfis) {
    const codigo = String(erroPerfis.code || '')
    const mensagem = String(erroPerfis.message || 'erro sem mensagem do Supabase')
    console.error('[PAE auth] Falha ao consultar pae_usuarios_autorizados:', codigo, mensagem)

    if (
      codigo === '42P01' ||
      codigo === 'PGRST205' ||
      /does not exist|could not find the table/i.test(mensagem)
    ) {
      throw new Error(
        'A tabela de acesso interno do PAE não está disponível no Supabase. ' +
        'Execute supabase/pae-setup.sql no SQL Editor do mesmo projeto. ' +
        'Se já executou, atualize o schema cache em Supabase > Settings > API.',
      )
    }

    if (
      codigo === 'PGRST301' ||
      /invalid api key|invalid jwt|unauthorized|permission denied/i.test(mensagem)
    ) {
      throw new Error(
        'O Supabase recusou a chave do servidor. Confirme que SUPABASE_SERVICE_ROLE_KEY ' +
        'pertence ao mesmo projeto de SUPABASE_URL.',
      )
    }

    throw new Error(`Falha ao consultar a migração de acesso do PAE (${codigo || 'sem código'}): ${mensagem}`)
  }

  let usuarioInterno = null
  let perfilInterno = null
  for (const perfil of perfis || []) {
    const { data, error } = await admin.auth.admin.getUserById(perfil.usuario_id)
    if (error) continue
    if (data.user?.email?.toLowerCase() === email.toLowerCase()) {
      usuarioInterno = data.user
      perfilInterno = perfil
      break
    }
  }

  if (perfilInterno && perfilInterno.ativo !== true) {
    throw Object.assign(new Error('O acesso deste agente ao PAE está desativado.'), { status: 403 })
  }

  if (!usuarioInterno) usuarioInterno = await buscarUsuarioInterno(admin, email)
  if (!usuarioInterno) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { pae_agente: agente, pae_acesso_interno: true },
    })
    if (error) {
      usuarioInterno = await buscarUsuarioInterno(admin, email)
      if (!usuarioInterno) throw error
    } else {
      usuarioInterno = data.user
    }
  }

  if (perfilInterno && perfilInterno.agente !== agente) {
    throw Object.assign(new Error('A identidade interna do agente não corresponde ao perfil autorizado.'), { status: 403 })
  }

  if (!perfilInterno) {
    const { error } = await admin.from('pae_usuarios_autorizados').upsert({
      usuario_id: usuarioInterno.id,
      agente,
      ativo: true,
    }, { onConflict: 'usuario_id' })
    if (error) throw new Error('Não foi possível preparar o acesso interno do agente no Supabase.')
  }

  return { usuario: usuarioInterno, email, senha }
}

export async function criarSessaoSupabasePae(agente) {
  const { admin, autenticacao } = obterClientesSupabase()
  const { usuario, email, senha } = await obterOuCriarUsuarioPae(admin, agente)
  let autenticado = await autenticacao.auth.signInWithPassword({ email, password: senha })
  if (/invalid login credentials/i.test(autenticado.error?.message || '') && usuario.id) {
    const atualizado = await admin.auth.admin.updateUserById(usuario.id, { password: senha, email_confirm: true })
    if (!atualizado.error) {
      autenticado = await autenticacao.auth.signInWithPassword({ email, password: senha })
    }
  }
  if (autenticado.error || !autenticado.data.session || !autenticado.data.user) {
    throw new Error('Não foi possível iniciar a sessão interna do PAE.')
  }
  return {
    usuario: { userId: autenticado.data.user.id, agente },
    session: {
      access_token: autenticado.data.session.access_token,
      refresh_token: autenticado.data.session.refresh_token,
    },
  }
}

export function registerPaeAuthRoutes(app) {
  app.post('/api/app/login', (req, res) => {
    const usuario = texto(req.body?.usuario, 100).toLowerCase()
    const senha = typeof req.body?.senha === 'string' ? req.body.senha : ''
    if (segredoDaSessao().length < 32) {
      return res.status(503).json({ error: 'A sessão do aplicativo não está configurada no servidor.' })
    }
    if (!validarCredenciaisAplicativo(usuario, senha)) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' })
    }
    try {
      const encaminhadoComoHttps = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
      res.append('Set-Cookie', criarCookieSessaoApp(
        criarTokenAplicativo(usuario),
        DURACAO_SESSAO_SEGUNDOS,
        req.secure || encaminhadoComoHttps,
      ))
      res.set('Cache-Control', 'no-store').json({ ok: true })
    } catch {
      res.status(503).json({ error: 'Não foi possível iniciar a sessão do aplicativo.' })
    }
  })

  app.get('/api/app/session', (req, res) => {
    if (!lerSessaoAplicativo(req)) {
      return res.status(401).json({ error: 'Entre novamente no aplicativo para continuar.' })
    }
    res.set('Cache-Control', 'no-store').json({ ok: true })
  })

  app.post('/api/pae/session', async (req, res) => {
    if (!lerSessaoAplicativo(req)) {
      return res.status(401).json({ error: 'Entre no aplicativo para abrir o PAE.' })
    }
    const agente = texto(req.body?.agente, 100)
    if (!agente) return res.status(400).json({ error: 'Não foi possível identificar o agente selecionado.' })

    try {
      const resultado = await criarSessaoSupabasePae(agente)
      res.set('Cache-Control', 'no-store').json(resultado)
    } catch (error) {
      const status = Number(error?.status) || 503
      if (status >= 500) console.error('[PAE auth] Falha ao preparar sessão:', error?.message || 'erro desconhecido')
      res.status(status).json({
        error: error instanceof Error ? error.message : 'Não foi possível abrir o PAE.',
      })
    }
  })
}
