-- Estrutura inicial do PAE integrado ao Radar DC.
-- Migração aditiva: não altera nem remove tabelas existentes.

CREATE TABLE IF NOT EXISTS public.pae_eventos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 120),
  acionado_por TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'encerrado')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pae_chamados (
  id TEXT PRIMARY KEY,
  evento_id TEXT NOT NULL REFERENCES public.pae_eventos(id),
  acionado_por TEXT NOT NULL,
  endereco TEXT NOT NULL CHECK (length(trim(endereco)) BETWEEN 1 AND 500),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  tipo_risco TEXT NOT NULL CHECK (length(trim(tipo_risco)) BETWEEN 1 AND 120),
  descricao TEXT NOT NULL DEFAULT '',
  prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'critica')),
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_atendimento', 'concluido', 'cancelado')),
  agentes_envolvidos TEXT[] NOT NULL DEFAULT '{}',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cardinality(agentes_envolvidos) > 0)
);

CREATE TABLE IF NOT EXISTS public.pae_atendimentos (
  id TEXT PRIMARY KEY,
  chamado_id TEXT NOT NULL UNIQUE REFERENCES public.pae_chamados(id),
  agente TEXT NOT NULL,
  observacao TEXT NOT NULL DEFAULT '',
  relato TEXT NOT NULL CHECK (length(trim(relato)) > 0),
  materiais_gastos JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(materiais_gastos) = 'array'),
  concluido_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pae_fotos (
  id TEXT PRIMARY KEY,
  atendimento_id TEXT NOT NULL REFERENCES public.pae_atendimentos(id),
  data_url TEXT NOT NULL CHECK (data_url LIKE 'data:image/%'),
  legenda TEXT NOT NULL DEFAULT '',
  agente TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pae_historico (
  id TEXT PRIMARY KEY,
  evento_id TEXT NOT NULL REFERENCES public.pae_eventos(id),
  chamado_id TEXT REFERENCES public.pae_chamados(id),
  acao TEXT NOT NULL,
  detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  realizado_por TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pae_eventos_status_criado_idx
  ON public.pae_eventos (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS pae_chamados_evento_status_idx
  ON public.pae_chamados (evento_id, status, criado_em DESC);
CREATE INDEX IF NOT EXISTS pae_chamados_mapa_idx
  ON public.pae_chamados (latitude, longitude);
CREATE INDEX IF NOT EXISTS pae_fotos_atendimento_idx
  ON public.pae_fotos (atendimento_id, criado_em);
CREATE INDEX IF NOT EXISTS pae_historico_chamado_idx
  ON public.pae_historico (chamado_id, criado_em DESC);

-- O PAE acompanha o modelo de acesso atualmente usado pelo aplicativo.
-- Não substitui a autenticação por perfil; essa proteção foi aceita como escopo atual.
ALTER TABLE public.pae_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pae_chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pae_atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pae_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pae_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pae_acesso_atual ON public.pae_eventos;
CREATE POLICY pae_acesso_atual ON public.pae_eventos
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pae_acesso_atual ON public.pae_chamados;
CREATE POLICY pae_acesso_atual ON public.pae_chamados
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pae_acesso_atual ON public.pae_atendimentos;
CREATE POLICY pae_acesso_atual ON public.pae_atendimentos
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pae_acesso_atual ON public.pae_fotos;
CREATE POLICY pae_acesso_atual ON public.pae_fotos
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pae_acesso_atual ON public.pae_historico;
CREATE POLICY pae_acesso_atual ON public.pae_historico
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.pae_eventos, public.pae_chamados, public.pae_atendimentos,
  public.pae_fotos, public.pae_historico
TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.pae_criar_evento(
  p_id TEXT, p_nome TEXT, p_acionado_por TEXT, p_descricao TEXT DEFAULT ''
) RETURNS public.pae_eventos
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE novo public.pae_eventos;
BEGIN
  IF length(trim(COALESCE(p_nome, ''))) NOT BETWEEN 1 AND 120
     OR length(trim(COALESCE(p_acionado_por, ''))) = 0 THEN
    RAISE EXCEPTION 'Informe o nome do evento e quem o acionou.';
  END IF;

  INSERT INTO public.pae_eventos (id, nome, acionado_por, descricao)
  VALUES (p_id, trim(p_nome), trim(p_acionado_por), COALESCE(trim(p_descricao), ''))
  RETURNING * INTO novo;

  INSERT INTO public.pae_historico (id, evento_id, acao, detalhes, realizado_por)
  VALUES (gen_random_uuid()::text, novo.id, 'evento_criado',
          jsonb_build_object('nome', novo.nome), novo.acionado_por);
  RETURN novo;
END;
$$;

CREATE OR REPLACE FUNCTION public.pae_criar_chamado(
  p_id TEXT,
  p_evento_id TEXT,
  p_acionado_por TEXT,
  p_endereco TEXT,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_tipo_risco TEXT,
  p_descricao TEXT,
  p_prioridade TEXT,
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
  IF COALESCE(cardinality(p_agentes_envolvidos), 0) = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos um agente.';
  END IF;

  INSERT INTO public.pae_chamados (
    id, evento_id, acionado_por, endereco, latitude, longitude,
    tipo_risco, descricao, prioridade, agentes_envolvidos
  ) VALUES (
    p_id, p_evento_id, trim(p_acionado_por), trim(p_endereco), p_latitude, p_longitude,
    trim(p_tipo_risco), COALESCE(trim(p_descricao), ''),
    CASE WHEN p_prioridade IN ('baixa', 'media', 'alta', 'critica') THEN p_prioridade ELSE 'media' END,
    ARRAY(SELECT DISTINCT trim(agent) FROM unnest(p_agentes_envolvidos) AS agentes(agent) WHERE length(trim(agent)) > 0)
  )
  RETURNING * INTO novo;

  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (gen_random_uuid()::text, novo.evento_id, novo.id, 'chamado_criado',
          jsonb_build_object('tipo_risco', novo.tipo_risco, 'endereco', novo.endereco,
                             'agentes_envolvidos', to_jsonb(novo.agentes_envolvidos)),
          novo.acionado_por);
  RETURN novo;
END;
$$;

CREATE OR REPLACE FUNCTION public.pae_iniciar_chamado(
  p_chamado_id TEXT, p_agente TEXT
) RETURNS public.pae_chamados
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE chamado public.pae_chamados;
BEGIN
  SELECT * INTO chamado FROM public.pae_chamados
  WHERE id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chamado não encontrado.'; END IF;
  IF NOT (trim(p_agente) = ANY(chamado.agentes_envolvidos)) THEN
    RAISE EXCEPTION 'Somente agentes selecionados podem atender este chamado.';
  END IF;
  IF chamado.status = 'novo' THEN
    UPDATE public.pae_chamados
    SET status = 'em_atendimento', atualizado_em = NOW()
    WHERE id = chamado.id RETURNING * INTO chamado;
    INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
    VALUES (gen_random_uuid()::text, chamado.evento_id, chamado.id, 'atendimento_iniciado',
            '{}'::jsonb, trim(p_agente));
  ELSIF chamado.status <> 'em_atendimento' THEN
    RAISE EXCEPTION 'Este chamado não pode mais ser iniciado.';
  END IF;
  RETURN chamado;
END;
$$;

CREATE OR REPLACE FUNCTION public.pae_concluir_chamado(
  p_chamado_id TEXT,
  p_agente TEXT,
  p_observacao TEXT,
  p_relato TEXT,
  p_materiais_gastos JSONB,
  p_fotos JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  chamado public.pae_chamados;
  atendimento public.pae_atendimentos;
BEGIN
  SELECT * INTO chamado FROM public.pae_chamados
  WHERE id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chamado não encontrado.'; END IF;
  IF NOT (trim(p_agente) = ANY(chamado.agentes_envolvidos)) THEN
    RAISE EXCEPTION 'Somente agentes selecionados podem concluir este chamado.';
  END IF;
  IF chamado.status NOT IN ('novo', 'em_atendimento') THEN
    RAISE EXCEPTION 'Este chamado já foi encerrado.';
  END IF;
  IF length(trim(COALESCE(p_relato, ''))) = 0 THEN
    RAISE EXCEPTION 'Informe o que ocorreu durante o atendimento.';
  END IF;
  IF jsonb_typeof(COALESCE(p_materiais_gastos, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_fotos, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Materiais e fotos devem ser listas.';
  END IF;

  INSERT INTO public.pae_atendimentos (
    id, chamado_id, agente, observacao, relato, materiais_gastos, concluido_em
  ) VALUES (
    chamado.id, chamado.id, trim(p_agente), COALESCE(trim(p_observacao), ''),
    trim(p_relato), COALESCE(p_materiais_gastos, '[]'::jsonb), NOW()
  ) RETURNING * INTO atendimento;

  INSERT INTO public.pae_fotos (
    id, atendimento_id, data_url, legenda, agente, latitude, longitude
  )
  SELECT gen_random_uuid()::text, atendimento.id,
         foto->>'dataUrl', COALESCE(foto->>'legenda', ''), trim(p_agente),
         NULLIF(foto->>'latitude', '')::double precision,
         NULLIF(foto->>'longitude', '')::double precision
  FROM jsonb_array_elements(COALESCE(p_fotos, '[]'::jsonb)) AS foto
  WHERE COALESCE(foto->>'dataUrl', '') LIKE 'data:image/%';

  UPDATE public.pae_chamados
  SET status = 'concluido', atualizado_em = NOW()
  WHERE id = chamado.id RETURNING * INTO chamado;

  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (
    gen_random_uuid()::text, chamado.evento_id, chamado.id, 'atendimento_concluido',
    jsonb_build_object('fotos', jsonb_array_length(COALESCE(p_fotos, '[]'::jsonb))),
    trim(p_agente)
  );
  RETURN jsonb_build_object('chamado', to_jsonb(chamado), 'atendimento', to_jsonb(atendimento));
END;
$$;

GRANT EXECUTE ON FUNCTION public.pae_criar_evento(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pae_criar_chamado(TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pae_iniciar_chamado(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pae_concluir_chamado(TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO anon, authenticated;

DO $$
DECLARE tabela TEXT;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'pae_eventos', 'pae_chamados', 'pae_atendimentos', 'pae_fotos', 'pae_historico'
  ] LOOP
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tabela
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tabela);
      END IF;
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
  END LOOP;
END $$;
