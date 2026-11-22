import { createClient } from '@supabase/supabase-js'
import { registerPaeAuthRoutes } from './paeAuth.js'

const PRIORIDADES_PAE = new Set(['baixa', 'media', 'alta', 'critica'])
const MAX_FOTOS_PAE = 8
const MAX_FOTO_PAE_BYTES = 3 * 1024 * 1024
const MAX_TOTAL_FOTOS_PAE_BYTES = 8 * 1024 * 1024

function texto(valor, limite = 2000) {
  return typeof valor === 'string' ? valor.trim().slice(0, limite) : ''
}

function listaAgentes(valor) {
  if (!Array.isArray(valor)) return []
  return [...new Set(valor.map(agente => texto(String(agente), 100)).filter(Boolean))]
}

function listaMateriais(valor) {
  if (!Array.isArray(valor)) return null
  if (valor.length > 50) return null
  const materiais = valor.map(item => ({
    nome: texto(item?.nome, 120),
    quantidade: Number(item?.quantidade),
    unidade: texto(item?.unidade, 32) || 'un.',
  }))
  if (materiais.some(item => !item.nome || !Number.isFinite(item.quantidade) || item.quantidade <= 0)) return null
  return materiais
}

function listaFotos(valor) {
  if (!Array.isArray(valor) || valor.length > MAX_FOTOS_PAE) return null
  let totalBytes = 0
  const fotos = []
  for (const foto of valor) {
    const dataUrl = typeof foto?.dataUrl === 'string' ? foto.dataUrl : ''
    if (!/^data:image\/(?:webp|jpeg|png);base64,/i.test(dataUrl)) return null
    const dados = dataUrl.slice(dataUrl.indexOf(',') + 1)
    const bytes = Math.floor((dados.length * 3) / 4)
    totalBytes += bytes
    if (bytes > MAX_FOTO_PAE_BYTES || totalBytes > MAX_TOTAL_FOTOS_PAE_BYTES) return null
    const latitude = foto.latitude == null ? null : Number(foto.latitude)
    const longitude = foto.longitude == null ? null : Number(foto.longitude)
    fotos.push({
      dataUrl,
      legenda: texto(foto.legenda, 180),
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
    })
  }
  return fotos
}

export function validarNovoEventoPae(payload) {
  const inicioEm = payload?.inicio_em ?? payload?.inicioEm ?? null
  const inicioData = inicioEm ? new Date(inicioEm) : null
  const evento = {
    id: texto(payload?.id, 100),
    nome: texto(payload?.nome, 120),
    acionadoPor: texto(payload?.acionado_por ?? payload?.acionadoPor, 100),
    descricao: texto(payload?.descricao, 2000),
    tipoEvento: texto(payload?.tipo_evento ?? payload?.tipoEvento, 120),
    objetivos: texto(payload?.objetivos, 3000),
    responsavel: texto(payload?.responsavel, 100),
    inicioEm: inicioData && Number.isFinite(inicioData.getTime()) ? inicioData.toISOString() : null,
  }
  if (!evento.id || !evento.nome || !evento.acionadoPor) return { erro: 'Informe o nome do evento e quem o acionou.' }
  if (inicioEm && !evento.inicioEm) return { erro: 'Data de início do evento inválida.' }
  if (!evento.responsavel) evento.responsavel = evento.acionadoPor
  return { evento }
}

export function validarNovoChamadoPae(payload) {
  const chamado = {
    id: texto(payload?.id, 100),
    eventoId: texto(payload?.evento_id ?? payload?.eventoId, 100),
    acionadoPor: texto(payload?.acionado_por ?? payload?.acionadoPor, 100),
    endereco: texto(payload?.endereco, 500),
    referencia: texto(payload?.referencia, 250),
    bairro: texto(payload?.bairro, 120),
    municipio: texto(payload?.municipio, 120),
    latitude: Number(payload?.latitude),
    longitude: Number(payload?.longitude),
    tipoRisco: texto(payload?.tipo_risco ?? payload?.tipoRisco, 120),
    cobrade: texto(payload?.cobrade, 120),
    canalEntrada: texto(payload?.canal_entrada ?? payload?.canalEntrada, 40) || 'interno',
    descricao: texto(payload?.descricao, 3000),
    prioridade: texto(payload?.prioridade, 20),
    justificativaPrioridade: texto(payload?.justificativa_prioridade ?? payload?.justificativaPrioridade, 1000),
    agentesEnvolvidos: listaAgentes(payload?.agentes_envolvidos ?? payload?.agentesEnvolvidos),
  }
  if (!chamado.id || !chamado.eventoId || !chamado.acionadoPor || !chamado.endereco || !chamado.tipoRisco) {
    return { erro: 'Evento, endereço, tipo de risco e agente que acionou são obrigatórios.' }
  }
  if (!Number.isFinite(chamado.latitude) || chamado.latitude < -90 || chamado.latitude > 90
      || !Number.isFinite(chamado.longitude) || chamado.longitude < -180 || chamado.longitude > 180) {
    return { erro: 'Localização inválida. Localize o endereço antes de salvar.' }
  }
  if (chamado.agentesEnvolvidos.length === 0) return { erro: 'Selecione pelo menos um agente.' }
  if (!PRIORIDADES_PAE.has(chamado.prioridade)) chamado.prioridade = 'media'
  return { chamado }
}

export function validarTriagemPae(payload) {
  const triagem = {
    agente: texto(payload?.agente, 100),
    prioridade: texto(payload?.prioridade, 20),
    justificativa: texto(payload?.justificativa, 1000),
    cobrade: texto(payload?.cobrade, 120),
  }
  if (!triagem.agente || !triagem.justificativa || !PRIORIDADES_PAE.has(triagem.prioridade)) {
    return { erro: 'Informe responsável, prioridade válida e justificativa da triagem.' }
  }
  return { triagem }
}

export function validarConclusaoPae(payload) {
  const agente = texto(payload?.agente, 100)
  const observacao = texto(payload?.observacao, 3000)
  const relato = texto(payload?.relato, 6000)
  const materiaisGastos = listaMateriais(payload?.materiais_gastos ?? payload?.materiaisGastos)
  const fotos = listaFotos(payload?.fotos)
  if (!agente || !relato) return { erro: 'Informe o agente e o relato do atendimento.' }
  if (!materiaisGastos) return { erro: 'Confira os materiais e quantidades registrados.' }
  if (!fotos) return { erro: 'As fotos são inválidas ou excedem o limite permitido.' }
  return { conclusao: { agente, observacao, relato, materiaisGastos, fotos } }
}

async function exigirAcessoPae(req, res, next) {
  const authorization = req.headers.authorization || ''
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token) {
    return res.status(401).json({ error: 'Entre com uma conta autorizada para acessar o PAE.' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({ error: 'A autenticação interna do PAE não está configurada neste servidor.' })
  }

  try {
    const autenticado = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: sessao, error: erroSessao } = await autenticado.auth.getUser(token)
    if (erroSessao || !sessao.user) {
      return res.status(401).json({ error: 'A sessão do PAE é inválida ou expirou. Entre novamente.' })
    }

    const { data: acesso, error: erroAcesso } = await autenticado
      .from('pae_usuarios_autorizados')
      .select('agente')
      .eq('usuario_id', sessao.user.id)
      .eq('ativo', true)
      .maybeSingle()
    if (erroAcesso) {
      return res.status(503).json({ error: 'Não foi possível validar a autorização interna do PAE.' })
    }

    const agente = typeof acesso?.agente === 'string' ? acesso.agente.trim() : ''
    if (!agente) {
      return res.status(403).json({ error: 'Esta conta não está autorizada para acessar o PAE.' })
    }

    req.paeIdentity = { userId: sessao.user.id, agente }
    return next()
  } catch {
    return res.status(503).json({ error: 'Não foi possível validar a sessão do PAE.' })
  }
}

function erroHttp(res, status, message) {
  return res.status(status).json({ error: message })
}

function uuid() {
  return crypto.randomUUID()
}

async function carregarChamado(query, id) {
  const result = await query(
    `SELECT c.*,
            a.id AS atendimento_id,
            a.agente AS atendimento_agente,
            a.observacao AS atendimento_observacao,
            a.relato AS atendimento_relato,
            a.materiais_gastos AS atendimento_materiais_gastos,
            a.concluido_em AS atendimento_concluido_em,
            COALESCE(
              json_agg(json_build_object(
                'id', f.id, 'data_url', f.data_url, 'legenda', f.legenda,
                'agente', f.agente, 'criado_em', f.criado_em,
                'latitude', f.latitude, 'longitude', f.longitude
              ) ORDER BY f.criado_em)
              FILTER (WHERE f.id IS NOT NULL),
              '[]'::json
            ) AS atendimento_fotos
       FROM pae_chamados c
       LEFT JOIN pae_atendimentos a ON a.chamado_id = c.id
       LEFT JOIN pae_fotos f ON f.atendimento_id = a.id
      WHERE c.id = $1
      GROUP BY c.id, a.id`,
    [id],
  )
  return result.rows[0] ?? null
}

export function registerPaeRoutes(app, { query, pool, broadcastParaTodos, enviarPushParaAgentes, vapidConfigured }) {
  registerPaeAuthRoutes(app)
  app.use('/api/pae', exigirAcessoPae)
  app.use('/api/push/pae', exigirAcessoPae)

  app.get('/api/pae', async (_req, res) => {
    try {
      const [eventos, chamados] = await Promise.all([
        query('SELECT * FROM pae_eventos ORDER BY criado_em DESC'),
        query(
          `SELECT c.*,
                  a.id AS atendimento_id,
                  a.agente AS atendimento_agente,
                  a.observacao AS atendimento_observacao,
                  a.relato AS atendimento_relato,
                  a.materiais_gastos AS atendimento_materiais_gastos,
                  a.concluido_em AS atendimento_concluido_em,
                  COALESCE(
                    json_agg(json_build_object(
                      'id', f.id, 'data_url', f.data_url, 'legenda', f.legenda,
                      'agente', f.agente, 'criado_em', f.criado_em,
                      'latitude', f.latitude, 'longitude', f.longitude
                    ) ORDER BY f.criado_em)
                    FILTER (WHERE f.id IS NOT NULL),
                    '[]'::json
                  ) AS atendimento_fotos
             FROM pae_chamados c
             LEFT JOIN pae_atendimentos a ON a.chamado_id = c.id
             LEFT JOIN pae_fotos f ON f.atendimento_id = a.id
            GROUP BY c.id, a.id
            ORDER BY c.criado_em DESC`,
        ),
      ])
      res.json({ eventos: eventos.rows, chamados: chamados.rows })
    } catch (err) {
      res.status(500).json({ error: err.message || 'Não foi possível carregar o PAE.' })
    }
  })

  app.get('/api/pae/eventos/:id/historico', async (req, res) => {
    try {
      const chamadoId = texto(req.query?.chamado_id, 100) || null
      const result = await query(
        `SELECT id, evento_id, chamado_id, acao, detalhes, realizado_por, criado_em
           FROM pae_historico
          WHERE evento_id = $1 AND ($2::text IS NULL OR chamado_id = $2)
          ORDER BY criado_em ASC, id ASC`,
        [req.params.id, chamadoId],
      )
      res.json(result.rows)
    } catch (err) {
      res.status(500).json({ error: err.message || 'Não foi possível carregar o histórico do PAE.' })
    }
  })

  app.post('/api/pae/eventos', async (req, res) => {
    const agente = req.paeIdentity.agente
    const resultado = validarNovoEventoPae({
      ...req.body,
      acionadoPor: agente,
      responsavel: agente,
    })
    if (resultado.erro) return erroHttp(res, 400, resultado.erro)
    const evento = resultado.evento
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const salvo = await client.query(
        `INSERT INTO pae_eventos (
           id, nome, acionado_por, descricao, tipo_evento, objetivos, responsavel, inicio_em
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()))
         RETURNING *`,
        [evento.id, evento.nome, evento.acionadoPor, evento.descricao,
          evento.tipoEvento, evento.objetivos, evento.responsavel, evento.inicioEm],
      )
      await client.query(
        `INSERT INTO pae_historico (id, evento_id, acao, detalhes, realizado_por)
         VALUES ($1, $2, 'evento_criado', $3::jsonb, $4)`,
        [uuid(), evento.id, JSON.stringify({
          nome: evento.nome, tipo_evento: evento.tipoEvento, objetivos: evento.objetivos,
          responsavel: evento.responsavel, inicio_em: evento.inicioEm,
        }), evento.acionadoPor],
      )
      await client.query('COMMIT')
      broadcastParaTodos({ tipo: 'pae_atualizado', id: evento.id })
      res.status(201).json(salvo.rows[0])
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      res.status(500).json({ error: err.message || 'Não foi possível abrir o evento.' })
    } finally {
      client.release()
    }
  })

  app.post('/api/pae/chamados', async (req, res) => {
    const resultado = validarNovoChamadoPae({
      ...req.body,
      acionadoPor: req.paeIdentity.agente,
    })
    if (resultado.erro) return erroHttp(res, 400, resultado.erro)
    const chamado = resultado.chamado
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const evento = await client.query(
        'SELECT id FROM pae_eventos WHERE id = $1 AND status = $2 FOR UPDATE',
        [chamado.eventoId, 'ativo'],
      )
      if (!evento.rows[0]) {
        await client.query('ROLLBACK')
        return erroHttp(res, 404, 'O evento não existe ou já foi encerrado.')
      }
      const salvo = await client.query(
        `INSERT INTO pae_chamados (
           id, evento_id, acionado_por, endereco, latitude, longitude,
           tipo_risco, cobrade, canal_entrada, referencia, bairro, municipio,
           descricao, prioridade, justificativa_prioridade, agentes_envolvidos
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [chamado.id, chamado.eventoId, chamado.acionadoPor, chamado.endereco,
          chamado.latitude, chamado.longitude, chamado.tipoRisco, chamado.cobrade,
          chamado.canalEntrada, chamado.referencia, chamado.bairro, chamado.municipio,
          chamado.descricao, chamado.prioridade, chamado.justificativaPrioridade,
          chamado.agentesEnvolvidos],
      )
      await client.query(
        `INSERT INTO pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
         VALUES ($1, $2, $3, 'chamado_criado', $4::jsonb, $5)`,
        [uuid(), chamado.eventoId, chamado.id,
          JSON.stringify({
            tipo_risco: chamado.tipoRisco, cobrade: chamado.cobrade,
            endereco: chamado.endereco, prioridade: chamado.prioridade,
            agentes_envolvidos: chamado.agentesEnvolvidos,
          }), chamado.acionadoPor],
      )
      await client.query('COMMIT')
      broadcastParaTodos({ tipo: 'pae_atualizado', id: chamado.id })
      res.status(201).json(salvo.rows[0])
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      res.status(500).json({ error: err.message || 'Não foi possível registrar o chamado.' })
    } finally {
      client.release()
    }
  })

  app.post('/api/pae/chamados/:id/triagem', async (req, res) => {
    const resultado = validarTriagemPae({
      ...req.body,
      agente: req.paeIdentity.agente,
    })
    if (resultado.erro) return erroHttp(res, 400, resultado.erro)
    const { agente, prioridade, justificativa, cobrade } = resultado.triagem
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const encontrado = await client.query(
        'SELECT * FROM pae_chamados WHERE id = $1 FOR UPDATE',
        [req.params.id],
      )
      const chamado = encontrado.rows[0]
      if (!chamado) {
        await client.query('ROLLBACK')
        return erroHttp(res, 404, 'Chamado não encontrado.')
      }
      if (!['novo', 'triado'].includes(chamado.status)) {
        await client.query('ROLLBACK')
        return erroHttp(res, 409, 'A triagem não pode ser alterada após o início do atendimento.')
      }
      const atualizado = await client.query(
        `UPDATE pae_chamados
            SET status = 'triado', prioridade = $2, justificativa_prioridade = $3,
                cobrade = $4, triado_por = $5, triado_em = NOW(), atualizado_em = NOW()
          WHERE id = $1 RETURNING *`,
        [chamado.id, prioridade, justificativa, cobrade, agente],
      )
      await client.query(
        `INSERT INTO pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
         VALUES ($1, $2, $3, 'chamado_triado', $4::jsonb, $5)`,
        [uuid(), chamado.evento_id, chamado.id,
          JSON.stringify({ prioridade, cobrade, justificativa }), agente],
      )
      await client.query('COMMIT')
      broadcastParaTodos({ tipo: 'pae_atualizado', id: chamado.id })
      res.json(atualizado.rows[0])
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      res.status(500).json({ error: err.message || 'Não foi possível triar o chamado.' })
    } finally {
      client.release()
    }
  })

  app.patch('/api/pae/chamados/:id/localizacao', async (req, res) => {
    const latitude = Number(req.body?.latitude)
    const longitude = Number(req.body?.longitude)
    const realizadoPor = req.paeIdentity.agente
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return erroHttp(res, 400, 'Coordenadas inválidas.')
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const encontrado = await client.query(
        'SELECT * FROM pae_chamados WHERE id = $1 FOR UPDATE',
        [req.params.id],
      )
      const chamado = encontrado.rows[0]
      if (!chamado) {
        await client.query('ROLLBACK')
        return erroHttp(res, 404, 'Chamado não encontrado.')
      }
      const atualizado = await client.query(
        `UPDATE pae_chamados SET latitude = $2, longitude = $3, atualizado_em = NOW()
          WHERE id = $1 RETURNING *`,
        [chamado.id, latitude, longitude],
      )
      await client.query(
        `INSERT INTO pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
         VALUES ($1, $2, $3, 'localizacao_atualizada', $4::jsonb, $5)`,
        [uuid(), chamado.evento_id, chamado.id,
          JSON.stringify({
            latitudeAnterior: Number(chamado.latitude), longitudeAnterior: Number(chamado.longitude),
            latitude, longitude,
          }), realizadoPor],
      )
      await client.query('COMMIT')
      broadcastParaTodos({ tipo: 'pae_atualizado', id: chamado.id })
      res.json(atualizado.rows[0])
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      res.status(500).json({ error: err.message || 'Não foi possível atualizar a localização do chamado.' })
    } finally {
      client.release()
    }
  })

  app.post('/api/pae/chamados/:id/validar', async (req, res) => {
    const agente = req.paeIdentity.agente
    if (!agente) return erroHttp(res, 400, 'Responsável pela validação obrigatório.')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const encontrado = await client.query(
        `SELECT c.*, COALESCE(NULLIF(e.responsavel, ''), e.acionado_por) AS responsavel_evento
           FROM pae_chamados c JOIN pae_eventos e ON e.id = c.evento_id
          WHERE c.id = $1 FOR UPDATE OF c`,
        [req.params.id],
      )
      const chamado = encontrado.rows[0]
      if (!chamado) {
        await client.query('ROLLBACK')
        return erroHttp(res, 404, 'Chamado não encontrado.')
      }
      if (agente !== chamado.responsavel_evento) {
        await client.query('ROLLBACK')
        return erroHttp(res, 403, 'Somente o responsável pelo evento pode validar a conclusão.')
      }
      if (chamado.status !== 'concluido_em_campo') {
        await client.query('ROLLBACK')
        return erroHttp(res, 409, 'Somente chamados concluídos em campo podem ser validados.')
      }
      const atualizado = await client.query(
        `UPDATE pae_chamados
            SET status = 'validado', validado_por = $2, validado_em = NOW(), atualizado_em = NOW()
          WHERE id = $1 RETURNING *`,
        [chamado.id, agente],
      )
      await client.query(
        `INSERT INTO pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
         VALUES ($1, $2, $3, 'chamado_validado', '{}'::jsonb, $4)`,
        [uuid(), chamado.evento_id, chamado.id, agente],
      )
      await client.query('COMMIT')
      broadcastParaTodos({ tipo: 'pae_atualizado', id: chamado.id })
      res.json(atualizado.rows[0])
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      res.status(500).json({ error: err.message || 'Não foi possível validar o chamado.' })
    } finally {
      client.release()
    }
  })

  app.post('/api/pae/chamados/:id/suspender-cancelar', async (req, res) => {
    const status = texto(req.body?.status, 20)
    const motivo = texto(req.body?.motivo, 1000)
    const agente = req.paeIdentity.agente
    if (!['suspenso', 'cancelado'].includes(status) || !motivo || !agente) {
      return erroHttp(res, 400, 'Informe a ação, o motivo e o agente responsável.')
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const encontrado = await client.query(
        'SELECT * FROM pae_chamados WHERE id = $1 FOR UPDATE',
        [req.params.id],
      )
      const chamado = encontrado.rows[0]
      if (!chamado) {
        await client.query('ROLLBACK')
        return erroHttp(res, 404, 'Chamado não encontrado.')
      }
      if (['validado', 'suspenso', 'cancelado'].includes(chamado.status)) {
        await client.query('ROLLBACK')
        return erroHttp(res, 409, 'Este chamado não pode mais ser alterado.')
      }
      const atualizado = await client.query(
        `UPDATE pae_chamados
            SET status = $2, motivo_suspensao_cancelamento = $3, atualizado_em = NOW()
          WHERE id = $1 RETURNING *`,
        [chamado.id, status, motivo],
      )
      await client.query(
        `INSERT INTO pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [uuid(), chamado.evento_id, chamado.id, `chamado_${status}`,
          JSON.stringify({ motivo }), agente],
      )
      await client.query('COMMIT')
      broadcastParaTodos({ tipo: 'pae_atualizado', id: chamado.id })
      res.json(atualizado.rows[0])
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      res.status(500).json({ error: err.message || 'Não foi possível atualizar a situação do chamado.' })
    } finally {
      client.release()
    }
  })

  app.post('/api/pae/chamados/:id/iniciar', async (req, res) => {
    const agente = req.paeIdentity.agente
    if (!agente) return erroHttp(res, 400, 'Agente obrigatório.')
    try {
      const atual = await query('SELECT * FROM pae_chamados WHERE id = $1', [req.params.id])
      const chamado = atual.rows[0]
      if (!chamado) return erroHttp(res, 404, 'Chamado não encontrado.')
      if (!chamado.agentes_envolvidos.includes(agente)) {
        return erroHttp(res, 403, 'Somente agentes selecionados podem iniciar o atendimento.')
      }
      if (chamado.status === 'em_atendimento') return res.json(chamado)
      if (chamado.status !== 'triado') return erroHttp(res, 409, 'Faça a triagem do chamado antes de iniciar o atendimento.')

      const atualizado = await query(
        `UPDATE pae_chamados
            SET status = 'em_atendimento', atualizado_em = NOW()
          WHERE id = $1 AND status = 'triado'
          RETURNING *`,
        [req.params.id],
      )
      if (!atualizado.rows[0]) return erroHttp(res, 409, 'O estado do chamado mudou. Atualize e tente novamente.')
      await query(
        `INSERT INTO pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
         VALUES ($1, $2, $3, 'atendimento_iniciado', '{}'::jsonb, $4)`,
        [uuid(), chamado.evento_id, chamado.id, agente],
      )
      broadcastParaTodos({ tipo: 'pae_atualizado', id: chamado.id })
      res.json(atualizado.rows[0])
    } catch (err) {
      res.status(500).json({ error: err.message || 'Não foi possível iniciar o atendimento.' })
    }
  })

  app.post('/api/pae/chamados/:id/concluir', async (req, res) => {
    const resultado = validarConclusaoPae({
      ...req.body,
      agente: req.paeIdentity.agente,
    })
    if (resultado.erro) return erroHttp(res, 400, resultado.erro)
    const conclusao = resultado.conclusao
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const encontrado = await client.query(
        'SELECT * FROM pae_chamados WHERE id = $1 FOR UPDATE',
        [req.params.id],
      )
      const chamado = encontrado.rows[0]
      if (!chamado) {
        await client.query('ROLLBACK')
        return erroHttp(res, 404, 'Chamado não encontrado.')
      }
      if (!chamado.agentes_envolvidos.includes(conclusao.agente)) {
        await client.query('ROLLBACK')
        return erroHttp(res, 403, 'Somente agentes selecionados podem concluir este chamado.')
      }
      if (chamado.status !== 'em_atendimento') {
        await client.query('ROLLBACK')
        return erroHttp(res, 409, 'Inicie o atendimento antes de registrar a conclusão em campo.')
      }

      const atendimentoId = uuid()
      await client.query(
        `INSERT INTO pae_atendimentos (id, chamado_id, agente, observacao, relato, materiais_gastos)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [atendimentoId, chamado.id, conclusao.agente, conclusao.observacao,
          conclusao.relato, JSON.stringify(conclusao.materiaisGastos)],
      )
      for (const foto of conclusao.fotos) {
        await client.query(
          `INSERT INTO pae_fotos (
             id, atendimento_id, data_url, legenda, agente, latitude, longitude
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuid(), atendimentoId, foto.dataUrl, foto.legenda, conclusao.agente,
            foto.latitude, foto.longitude],
        )
      }
      const atualizado = await client.query(
        `UPDATE pae_chamados SET status = 'concluido_em_campo', atualizado_em = NOW()
          WHERE id = $1 RETURNING *`,
        [chamado.id],
      )
      await client.query(
        `UPDATE pae_atendimentos SET concluido_em = NOW() WHERE id = $1`,
        [atendimentoId],
      )
      await client.query(
        `INSERT INTO pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
         VALUES ($1, $2, $3, 'atendimento_concluido_em_campo', $4::jsonb, $5)`,
        [uuid(), chamado.evento_id, chamado.id,
          JSON.stringify({ fotos: conclusao.fotos.length,
            materiais: conclusao.materiaisGastos.length }), conclusao.agente],
      )
      await client.query('COMMIT')
      broadcastParaTodos({ tipo: 'pae_atualizado', id: chamado.id })
      const registroCompleto = await carregarChamado(query, chamado.id)
      res.json(registroCompleto || atualizado.rows[0])
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      res.status(500).json({ error: err.message || 'Não foi possível concluir o chamado.' })
    } finally {
      client.release()
    }
  })

  app.post('/api/push/pae', async (req, res) => {
    const agentes = listaAgentes(req.body?.agentes)
    const tipo = texto(req.body?.tipo, 30)
    const remetente = req.paeIdentity.agente
    const tipoRisco = texto(req.body?.tipoRisco, 120)
    const endereco = texto(req.body?.endereco, 300)
    const agente = req.paeIdentity.agente
    if (!['novo_chamado', 'chamado_concluido'].includes(tipo) || agentes.length === 0) {
      return erroHttp(res, 400, 'Dados da notificação incompletos.')
    }
    if (!vapidConfigured) return res.json({ enviados: 0, pushAtivo: false })
    const payload = {
      title: tipo === 'novo_chamado' ? 'PAE — novo chamado de risco' : 'PAE — atendimento concluído',
      body: tipo === 'novo_chamado'
        ? `${tipoRisco || 'Risco registrado'} · ${endereco || 'Localização registrada'}`
        : `${tipoRisco || 'Risco'} atendido por ${agente || 'equipe'} · ${endereco || ''}`,
      tag: `pae-${tipo}-${texto(req.body?.chamadoId, 100) || Date.now()}`,
      url: '/',
      tipo: 'pae',
      chamadoId: texto(req.body?.chamadoId, 100),
    }
    try {
      const enviados = await enviarPushParaAgentes(agentes, payload, remetente || null)
      res.json({ enviados, pushAtivo: true })
    } catch (err) {
      res.status(500).json({ error: err.message || 'Não foi possível enviar as notificações push.' })
    }
  })
}
