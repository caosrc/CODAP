-- Etapa 2 do PAE: designação com aceite, recusa e pedido de reforço.
-- Migração aditiva; preserva registros existentes e mantém RLS para usuários autorizados.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pae_atribuicoes (
  id TEXT PRIMARY KEY,
  chamado_id TEXT NOT NULL REFERENCES public.pae_chamados(id),
  agentes_designados TEXT[] NOT NULL DEFAULT '{}',
  designado_por TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'designada',
  aceito_por TEXT,
  respondido_por TEXT,
  respondido_em TIMESTAMPTZ,
  motivo_recusa TEXT NOT NULL DEFAULT '',
  reforco_status TEXT NOT NULL DEFAULT 'nenhum',
  reforco_solicitado_por TEXT,
  reforco_motivo TEXT NOT NULL DEFAULT '',
  reforco_solicitado_em TIMESTAMPTZ,
  reforco_agentes TEXT[] NOT NULL DEFAULT '{}',
  reforco_atendido_por TEXT,
  reforco_atendido_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pae_atribuicoes
  ADD COLUMN IF NOT EXISTS chamado_id TEXT,
  ADD COLUMN IF NOT EXISTS agentes_designados TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS designado_por TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'designada',
  ADD COLUMN IF NOT EXISTS aceito_por TEXT,
  ADD COLUMN IF NOT EXISTS respondido_por TEXT,
  ADD COLUMN IF NOT EXISTS respondido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_recusa TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reforco_status TEXT NOT NULL DEFAULT 'nenhum',
  ADD COLUMN IF NOT EXISTS reforco_solicitado_por TEXT,
  ADD COLUMN IF NOT EXISTS reforco_motivo TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reforco_solicitado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reforco_agentes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reforco_atendido_por TEXT,
  ADD COLUMN IF NOT EXISTS reforco_atendido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pae_atribuicoes'::regclass
       AND conname = 'pae_atribuicoes_chamado_id_fkey'
  ) THEN
    ALTER TABLE public.pae_atribuicoes
      ADD CONSTRAINT pae_atribuicoes_chamado_id_fkey
      FOREIGN KEY (chamado_id) REFERENCES public.pae_chamados(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pae_atribuicoes'::regclass
       AND conname = 'pae_atribuicoes_status_check'
  ) THEN
    ALTER TABLE public.pae_atribuicoes
      ADD CONSTRAINT pae_atribuicoes_status_check
      CHECK (status IN ('designada', 'aceita', 'recusada', 'substituida', 'cancelada', 'concluida'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pae_atribuicoes'::regclass
       AND conname = 'pae_atribuicoes_reforco_status_check'
  ) THEN
    ALTER TABLE public.pae_atribuicoes
      ADD CONSTRAINT pae_atribuicoes_reforco_status_check
      CHECK (reforco_status IN ('nenhum', 'solicitado', 'atendido'));
  END IF;

  -- Chamados sem equipe agora podem aguardar triagem antes do despacho.
  FOR constraint_record IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.pae_chamados'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%cardinality(agentes_envolvidos)%'
  LOOP
    EXECUTE format('ALTER TABLE public.pae_chamados DROP CONSTRAINT %I', constraint_record.conname);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS pae_atribuicoes_chamado_criado_idx
  ON public.pae_atribuicoes (chamado_id, criado_em DESC);

-- Mantém uma única designação aberta por chamado. A linha anterior permanece
-- para auditoria quando o coordenador substitui a equipe.
CREATE UNIQUE INDEX IF NOT EXISTS pae_atribuicoes_chamado_ativa_idx
  ON public.pae_atribuicoes (chamado_id)
  WHERE status IN ('designada', 'aceita');

-- Registra a equipe que já havia sido indicada antes desta etapa sem apagar
-- nem alterar os chamados existentes.
INSERT INTO public.pae_atribuicoes (
  id, chamado_id, agentes_designados, designado_por, status, aceito_por, respondido_por,
  respondido_em, criado_em, atualizado_em
)
SELECT gen_random_uuid()::text,
       c.id,
       c.agentes_envolvidos,
       COALESCE(NULLIF(e.responsavel, ''), e.acionado_por),
       CASE
         WHEN c.status IN ('em_atendimento') THEN 'aceita'
         WHEN c.status IN ('concluido_em_campo', 'validado') THEN 'concluida'
         WHEN c.status IN ('suspenso', 'cancelado') THEN 'cancelada'
         ELSE 'designada'
       END,
       CASE WHEN c.status = 'em_atendimento' THEN c.agentes_envolvidos[1] ELSE NULL END,
       CASE WHEN c.status = 'em_atendimento' THEN c.agentes_envolvidos[1] ELSE NULL END,
       CASE WHEN c.status = 'em_atendimento' THEN c.atualizado_em ELSE NULL END,
       c.criado_em,
       c.atualizado_em
  FROM public.pae_chamados c
  JOIN public.pae_eventos e ON e.id = c.evento_id
 WHERE cardinality(COALESCE(c.agentes_envolvidos, ARRAY[]::TEXT[])) > 0
   AND NOT EXISTS (
     SELECT 1 FROM public.pae_atribuicoes a WHERE a.chamado_id = c.id
   );

ALTER TABLE public.pae_atribuicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pae_atribuicoes_acesso_interno ON public.pae_atribuicoes;
CREATE POLICY pae_atribuicoes_acesso_interno
  ON public.pae_atribuicoes
  FOR SELECT TO authenticated
  USING (public.pae_usuario_autorizado());
REVOKE ALL ON TABLE public.pae_atribuicoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pae_atribuicoes TO authenticated;

-- Chamados podem ser abertos antes de a equipe ser designada.
CREATE OR REPLACE FUNCTION public.pae_criar_chamado_detalhado(
  p_id TEXT,
  p_evento_id TEXT,
  p_acionado_por TEXT,
  p_endereco TEXT,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_tipo_risco TEXT,
  p_cobrade TEXT,
  p_canal_entrada TEXT,
  p_referencia TEXT,
  p_bairro TEXT,
  p_municipio TEXT,
  p_descricao TEXT,
  p_prioridade TEXT,
  p_justificativa_prioridade TEXT,
  p_agentes_envolvidos TEXT[]
) RETURNS public.pae_chamados
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE novo public.pae_chamados;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pae_eventos WHERE id = p_evento_id AND status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'O evento não existe ou já foi encerrado.';
  END IF;
  IF length(trim(COALESCE(p_endereco, ''))) = 0
     OR length(trim(COALESCE(p_tipo_risco, ''))) = 0
     OR length(trim(COALESCE(p_acionado_por, ''))) = 0 THEN
    RAISE EXCEPTION 'Endereço, tipo de risco e agente que acionou são obrigatórios.';
  END IF;
  IF p_latitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90
     OR p_longitude IS NULL OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Coordenadas inválidas.';
  END IF;
  IF COALESCE(p_prioridade, '') NOT IN ('baixa', 'media', 'alta', 'critica') THEN
    RAISE EXCEPTION 'Prioridade inválida.';
  END IF;

  INSERT INTO public.pae_chamados (
    id, evento_id, acionado_por, endereco, latitude, longitude,
    tipo_risco, cobrade, canal_entrada, referencia, bairro, municipio,
    descricao, prioridade, justificativa_prioridade, agentes_envolvidos
  ) VALUES (
    p_id, p_evento_id, trim(p_acionado_por), trim(p_endereco), p_latitude, p_longitude,
    trim(p_tipo_risco), COALESCE(trim(p_cobrade), ''), COALESCE(NULLIF(trim(p_canal_entrada), ''), 'interno'),
    COALESCE(trim(p_referencia), ''), COALESCE(trim(p_bairro), ''), COALESCE(trim(p_municipio), ''),
    COALESCE(trim(p_descricao), ''), p_prioridade, COALESCE(trim(p_justificativa_prioridade), ''),
    ARRAY(SELECT DISTINCT trim(agent)
            FROM unnest(COALESCE(p_agentes_envolvidos, ARRAY[]::TEXT[])) AS agentes(agent)
           WHERE length(trim(agent)) > 0)
  ) RETURNING * INTO novo;

  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (
    gen_random_uuid()::text, novo.evento_id, novo.id, 'chamado_criado',
    jsonb_build_object(
      'tipo_risco', novo.tipo_risco, 'endereco', novo.endereco,
      'prioridade', novo.prioridade, 'agentes_envolvidos', to_jsonb(novo.agentes_envolvidos)
    ),
    novo.acionado_por
  );
  RETURN novo;
END;
$$;

CREATE OR REPLACE FUNCTION public.pae_designar_chamado(
  p_chamado_id TEXT,
  p_agentes TEXT[]
) RETURNS public.pae_atribuicoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  ator TEXT := public.pae_agente_autorizado();
  chamado public.pae_chamados;
  responsavel_evento TEXT;
  agentes TEXT[];
  atribuicao public.pae_atribuicoes;
BEGIN
  IF ator IS NULL THEN RAISE EXCEPTION 'Usuário sem acesso autorizado ao PAE.'; END IF;
  agentes := ARRAY(
    SELECT DISTINCT trim(agent)
      FROM unnest(COALESCE(p_agentes, ARRAY[]::TEXT[])) AS agentes_input(agent)
     WHERE length(trim(agent)) > 0
  );
  IF COALESCE(cardinality(agentes), 0) = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos um agente para a designação.';
  END IF;

  SELECT c, COALESCE(NULLIF(e.responsavel, ''), e.acionado_por)
    INTO chamado, responsavel_evento
    FROM public.pae_chamados c
    JOIN public.pae_eventos e ON e.id = c.evento_id
   WHERE c.id = p_chamado_id
   FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chamado não encontrado.'; END IF;
  IF ator IS DISTINCT FROM responsavel_evento THEN
    RAISE EXCEPTION 'Somente o responsável pelo evento pode designar a equipe.';
  END IF;
  IF chamado.status <> 'triado' THEN
    RAISE EXCEPTION 'A equipe só pode ser designada após a triagem e antes do início do atendimento.';
  END IF;

  UPDATE public.pae_atribuicoes
     SET status = 'substituida', atualizado_em = NOW()
   WHERE chamado_id = chamado.id AND status IN ('designada', 'aceita');

  INSERT INTO public.pae_atribuicoes (
    id, chamado_id, agentes_designados, designado_por, status
  ) VALUES (
    gen_random_uuid()::text, chamado.id, agentes, ator, 'designada'
  ) RETURNING * INTO atribuicao;

  UPDATE public.pae_chamados
     SET agentes_envolvidos = agentes, atualizado_em = NOW()
   WHERE id = chamado.id;

  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (
    gen_random_uuid()::text, chamado.evento_id, chamado.id, 'chamado_designado',
    jsonb_build_object('agentes', to_jsonb(agentes), 'atribuicao_id', atribuicao.id),
    ator
  );
  RETURN atribuicao;
END;
$$;

CREATE OR REPLACE FUNCTION public.pae_responder_atribuicao(
  p_atribuicao_id TEXT,
  p_aceitar BOOLEAN,
  p_motivo TEXT DEFAULT ''
) RETURNS public.pae_atribuicoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  ator TEXT := public.pae_agente_autorizado();
  chamado public.pae_chamados;
  atribuicao public.pae_atribuicoes;
BEGIN
  IF ator IS NULL THEN RAISE EXCEPTION 'Usuário sem acesso autorizado ao PAE.'; END IF;
  IF p_aceitar IS NULL THEN RAISE EXCEPTION 'Informe se a missão será aceita ou recusada.'; END IF;
  SELECT c.* INTO chamado
    FROM public.pae_chamados c
    JOIN public.pae_atribuicoes a ON a.chamado_id = c.id
   WHERE a.id = p_atribuicao_id
   FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Designação não encontrada.'; END IF;

  SELECT * INTO atribuicao
    FROM public.pae_atribuicoes
   WHERE id = p_atribuicao_id
   FOR UPDATE;
  IF atribuicao.status <> 'designada' THEN
    RAISE EXCEPTION 'Esta designação já foi respondida ou substituída.';
  END IF;
  IF chamado.status <> 'triado' THEN
    RAISE EXCEPTION 'O chamado não está mais disponível para aceite.';
  END IF;
  IF NOT (ator = ANY(COALESCE(atribuicao.agentes_designados, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION 'Somente um agente designado pode responder à missão.';
  END IF;
  IF NOT COALESCE(p_aceitar, FALSE) AND length(trim(COALESCE(p_motivo, ''))) = 0 THEN
    RAISE EXCEPTION 'Informe o motivo da recusa.';
  END IF;

  UPDATE public.pae_atribuicoes
     SET status = CASE WHEN p_aceitar THEN 'aceita' ELSE 'recusada' END,
         aceito_por = CASE WHEN p_aceitar THEN ator ELSE NULL END,
         respondido_por = ator,
         respondido_em = NOW(),
         motivo_recusa = CASE WHEN p_aceitar THEN '' ELSE trim(p_motivo) END,
         atualizado_em = NOW()
   WHERE id = p_atribuicao_id
   RETURNING * INTO atribuicao;

  IF NOT p_aceitar THEN
    UPDATE public.pae_chamados
       SET agentes_envolvidos = ARRAY[]::TEXT[], atualizado_em = NOW()
     WHERE id = chamado.id;
  END IF;

  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (
    gen_random_uuid()::text, chamado.evento_id, chamado.id,
    CASE WHEN p_aceitar THEN 'atribuicao_aceita' ELSE 'atribuicao_recusada' END,
    jsonb_build_object(
      'atribuicao_id', atribuicao.id,
      'motivo', CASE WHEN p_aceitar THEN '' ELSE trim(p_motivo) END
    ),
    ator
  );
  RETURN atribuicao;
END;
$$;

CREATE OR REPLACE FUNCTION public.pae_solicitar_reforco(
  p_atribuicao_id TEXT,
  p_motivo TEXT
) RETURNS public.pae_atribuicoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  ator TEXT := public.pae_agente_autorizado();
  chamado public.pae_chamados;
  atribuicao public.pae_atribuicoes;
BEGIN
  IF ator IS NULL THEN RAISE EXCEPTION 'Usuário sem acesso autorizado ao PAE.'; END IF;
  IF length(trim(COALESCE(p_motivo, ''))) = 0 THEN
    RAISE EXCEPTION 'Informe o motivo do pedido de reforço.';
  END IF;
  SELECT c.* INTO chamado
    FROM public.pae_chamados c
    JOIN public.pae_atribuicoes a ON a.chamado_id = c.id
   WHERE a.id = p_atribuicao_id
   FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Designação não encontrada.'; END IF;
  SELECT * INTO atribuicao FROM public.pae_atribuicoes
   WHERE id = p_atribuicao_id FOR UPDATE;
  IF atribuicao.status <> 'aceita'
     OR chamado.status NOT IN ('triado', 'em_atendimento') THEN
    RAISE EXCEPTION 'O reforço só pode ser solicitado por uma equipe que aceitou o chamado ativo.';
  END IF;
  IF NOT (ator = ANY(COALESCE(atribuicao.agentes_designados, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION 'Somente um agente da equipe designada pode solicitar reforço.';
  END IF;
  IF atribuicao.reforco_status = 'solicitado' THEN
    RAISE EXCEPTION 'Já existe um pedido de reforço aguardando resposta.';
  END IF;

  UPDATE public.pae_atribuicoes
     SET reforco_status = 'solicitado',
         reforco_solicitado_por = ator,
         reforco_motivo = trim(p_motivo),
         reforco_solicitado_em = NOW(),
         reforco_agentes = ARRAY[]::TEXT[],
         reforco_atendido_por = NULL,
         reforco_atendido_em = NULL,
         atualizado_em = NOW()
   WHERE id = p_atribuicao_id
   RETURNING * INTO atribuicao;
  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (
    gen_random_uuid()::text, chamado.evento_id, chamado.id, 'reforco_solicitado',
    jsonb_build_object('atribuicao_id', atribuicao.id, 'motivo', trim(p_motivo)),
    ator
  );
  RETURN atribuicao;
END;
$$;

CREATE OR REPLACE FUNCTION public.pae_atender_reforco(
  p_atribuicao_id TEXT,
  p_agentes TEXT[]
) RETURNS public.pae_atribuicoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  ator TEXT := public.pae_agente_autorizado();
  chamado public.pae_chamados;
  responsavel_evento TEXT;
  atribuicao public.pae_atribuicoes;
  novos_agentes TEXT[];
  todos_agentes TEXT[];
BEGIN
  IF ator IS NULL THEN RAISE EXCEPTION 'Usuário sem acesso autorizado ao PAE.'; END IF;
  novos_agentes := ARRAY(
    SELECT DISTINCT trim(agent)
      FROM unnest(COALESCE(p_agentes, ARRAY[]::TEXT[])) AS agentes_input(agent)
     WHERE length(trim(agent)) > 0
  );
  IF COALESCE(cardinality(novos_agentes), 0) = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos um agente para o reforço.';
  END IF;

  SELECT c, COALESCE(NULLIF(e.responsavel, ''), e.acionado_por)
    INTO chamado, responsavel_evento
    FROM public.pae_chamados c
    JOIN public.pae_eventos e ON e.id = c.evento_id
    JOIN public.pae_atribuicoes a ON a.chamado_id = c.id
   WHERE a.id = p_atribuicao_id
   FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Designação não encontrada.'; END IF;
  SELECT * INTO atribuicao FROM public.pae_atribuicoes
   WHERE id = p_atribuicao_id FOR UPDATE;
  IF ator IS DISTINCT FROM responsavel_evento THEN
    RAISE EXCEPTION 'Somente o responsável pelo evento pode designar o reforço.';
  END IF;
  IF atribuicao.status <> 'aceita'
     OR atribuicao.reforco_status <> 'solicitado'
     OR chamado.status NOT IN ('triado', 'em_atendimento') THEN
    RAISE EXCEPTION 'Não há um pedido de reforço aguardando resposta.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(novos_agentes) AS novo(agent)
    WHERE novo.agent = ANY(COALESCE(atribuicao.agentes_designados, ARRAY[]::TEXT[]))
  ) THEN
    RAISE EXCEPTION 'O reforço deve incluir agentes que ainda não estejam designados.';
  END IF;

  todos_agentes := ARRAY(
    SELECT DISTINCT agente
      FROM unnest(
        COALESCE(atribuicao.agentes_designados, ARRAY[]::TEXT[]) || novos_agentes
      ) AS lista(agente)
  );
  UPDATE public.pae_atribuicoes
     SET agentes_designados = todos_agentes,
         reforco_status = 'atendido',
         reforco_agentes = novos_agentes,
         reforco_atendido_por = ator,
         reforco_atendido_em = NOW(),
         atualizado_em = NOW()
   WHERE id = p_atribuicao_id
   RETURNING * INTO atribuicao;
  UPDATE public.pae_chamados
     SET agentes_envolvidos = todos_agentes, atualizado_em = NOW()
   WHERE id = chamado.id;
  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (
    gen_random_uuid()::text, chamado.evento_id, chamado.id, 'reforco_designado',
    jsonb_build_object(
      'atribuicao_id', atribuicao.id,
      'agentes_adicionados', to_jsonb(novos_agentes),
      'motivo', atribuicao.reforco_motivo
    ),
    ator
  );
  RETURN atribuicao;
END;
$$;

-- O agente efetivo vem da conta autenticada; o texto enviado pelo cliente não
-- define identidade nem permite iniciar sem uma designação aceita.
CREATE OR REPLACE FUNCTION public.pae_iniciar_chamado(
  p_chamado_id TEXT,
  p_agente TEXT
) RETURNS public.pae_chamados
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  chamado public.pae_chamados;
  atribuicao public.pae_atribuicoes;
  ator TEXT := public.pae_agente_autorizado();
BEGIN
  IF ator IS NULL THEN RAISE EXCEPTION 'Usuário sem acesso autorizado ao PAE.'; END IF;
  SELECT * INTO chamado FROM public.pae_chamados
   WHERE id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chamado não encontrado.'; END IF;
  IF NOT (ator = ANY(COALESCE(chamado.agentes_envolvidos, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION 'Somente um agente designado pode iniciar o atendimento.';
  END IF;
  IF chamado.status <> 'triado' THEN
    RAISE EXCEPTION 'O chamado deve estar triado antes do início do atendimento.';
  END IF;
  SELECT * INTO atribuicao FROM public.pae_atribuicoes
   WHERE chamado_id = chamado.id AND status = 'aceita'
   ORDER BY criado_em DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A equipe precisa aceitar a designação antes de iniciar o atendimento.';
  END IF;
  IF NOT (ator = ANY(COALESCE(atribuicao.agentes_designados, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION 'Somente um agente da equipe que aceitou pode iniciar o atendimento.';
  END IF;

  UPDATE public.pae_chamados SET status = 'em_atendimento', atualizado_em = NOW()
   WHERE id = chamado.id RETURNING * INTO chamado;
  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (
    gen_random_uuid()::text, chamado.evento_id, chamado.id, 'atendimento_iniciado',
    jsonb_build_object('atribuicao_id', atribuicao.id), ator
  );
  RETURN chamado;
END;
$$;

-- Encerra a designação sem apagar seu registro ou a respectiva linha do tempo.
CREATE OR REPLACE FUNCTION public.pae_finalizar_atribuicao_chamado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('concluido_em_campo', 'validado') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.pae_atribuicoes
       SET status = 'concluida', atualizado_em = NOW()
     WHERE chamado_id = NEW.id AND status IN ('designada', 'aceita');
  ELSIF NEW.status IN ('suspenso', 'cancelado') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.pae_atribuicoes
       SET status = 'cancelada', atualizado_em = NOW()
     WHERE chamado_id = NEW.id AND status IN ('designada', 'aceita');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pae_chamado_finalizar_atribuicao ON public.pae_chamados;
CREATE TRIGGER pae_chamado_finalizar_atribuicao
  AFTER UPDATE OF status ON public.pae_chamados
  FOR EACH ROW EXECUTE FUNCTION public.pae_finalizar_atribuicao_chamado();

REVOKE ALL ON FUNCTION public.pae_designar_chamado(TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pae_responder_atribuicao(TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pae_solicitar_reforco(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pae_atender_reforco(TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pae_iniciar_chamado(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pae_designar_chamado(TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pae_responder_atribuicao(TEXT, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pae_solicitar_reforco(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pae_atender_reforco(TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pae_iniciar_chamado(TEXT, TEXT) TO authenticated;

COMMIT;
