-- Etapa 1 do PAE: triagem, classificação complementar e validação.
-- A migração é aditiva e preserva os registros já existentes.

ALTER TABLE public.pae_eventos
  ADD COLUMN IF NOT EXISTS tipo_evento TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS objetivos TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS responsavel TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS inicio_em TIMESTAMPTZ;

ALTER TABLE public.pae_chamados
  ADD COLUMN IF NOT EXISTS cobrade TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS canal_entrada TEXT NOT NULL DEFAULT 'interno',
  ADD COLUMN IF NOT EXISTS referencia TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bairro TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS municipio TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS justificativa_prioridade TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS triado_por TEXT,
  ADD COLUMN IF NOT EXISTS triado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validado_por TEXT,
  ADD COLUMN IF NOT EXISTS validado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_suspensao_cancelamento TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pae_chamados'::regclass
       AND conname = 'pae_chamados_status_check'
       AND pg_get_constraintdef(oid) ILIKE '%concluido_em_campo%'
  ) THEN
    ALTER TABLE public.pae_chamados DROP CONSTRAINT IF EXISTS pae_chamados_status_check;
    UPDATE public.pae_chamados SET status = 'validado' WHERE status = 'concluido';
    ALTER TABLE public.pae_chamados
      ADD CONSTRAINT pae_chamados_status_check
      CHECK (status IN ('novo', 'triado', 'em_atendimento', 'concluido_em_campo', 'validado', 'suspenso', 'cancelado'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pae_chamados_evento_status_triagem_idx
  ON public.pae_chamados (evento_id, status, prioridade, criado_em);

CREATE OR REPLACE FUNCTION public.pae_criar_evento_detalhado(
  p_id TEXT,
  p_nome TEXT,
  p_acionado_por TEXT,
  p_descricao TEXT,
  p_tipo_evento TEXT,
  p_objetivos TEXT,
  p_responsavel TEXT,
  p_inicio_em TIMESTAMPTZ
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

  INSERT INTO public.pae_eventos (
    id, nome, acionado_por, descricao, tipo_evento, objetivos, responsavel, inicio_em
  ) VALUES (
    p_id, trim(p_nome), trim(p_acionado_por), COALESCE(trim(p_descricao), ''),
    COALESCE(trim(p_tipo_evento), ''), COALESCE(trim(p_objetivos), ''),
    COALESCE(NULLIF(trim(p_responsavel), ''), trim(p_acionado_por)),
    COALESCE(p_inicio_em, NOW())
  ) RETURNING * INTO novo;

  INSERT INTO public.pae_historico (id, evento_id, acao, detalhes, realizado_por)
  VALUES (
    gen_random_uuid()::text, novo.id, 'evento_criado',
    jsonb_build_object('nome', novo.nome, 'tipo_evento', novo.tipo_evento),
    novo.acionado_por
  );
  RETURN novo;
END;
$$;

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
  IF COALESCE(cardinality(p_agentes_envolvidos), 0) = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos um agente.';
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
    ARRAY(SELECT DISTINCT trim(agent) FROM unnest(p_agentes_envolvidos) AS agentes(agent) WHERE length(trim(agent)) > 0)
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

CREATE OR REPLACE FUNCTION public.pae_triar_chamado(
  p_chamado_id TEXT,
  p_agente TEXT,
  p_prioridade TEXT,
  p_justificativa TEXT,
  p_cobrade TEXT DEFAULT ''
) RETURNS public.pae_chamados
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE chamado public.pae_chamados;
BEGIN
  IF length(trim(COALESCE(p_agente, ''))) = 0
     OR length(trim(COALESCE(p_justificativa, ''))) = 0
     OR COALESCE(p_prioridade, '') NOT IN ('baixa', 'media', 'alta', 'critica') THEN
    RAISE EXCEPTION 'Informe responsável, prioridade válida e justificativa da triagem.';
  END IF;
  SELECT * INTO chamado FROM public.pae_chamados
   WHERE id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chamado não encontrado.'; END IF;
  IF chamado.status NOT IN ('novo', 'triado') THEN
    RAISE EXCEPTION 'A triagem não pode ser alterada após o início do atendimento.';
  END IF;

  UPDATE public.pae_chamados
     SET status = 'triado', prioridade = p_prioridade,
         justificativa_prioridade = trim(p_justificativa),
         cobrade = COALESCE(trim(p_cobrade), ''),
         triado_por = trim(p_agente), triado_em = NOW(), atualizado_em = NOW()
   WHERE id = chamado.id RETURNING * INTO chamado;
  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (
    gen_random_uuid()::text, chamado.evento_id, chamado.id, 'chamado_triado',
    jsonb_build_object('prioridade', chamado.prioridade, 'cobrade', chamado.cobrade,
                       'justificativa', chamado.justificativa_prioridade),
    trim(p_agente)
  );
  RETURN chamado;
END;
$$;

CREATE OR REPLACE FUNCTION public.pae_atualizar_localizacao(
  p_chamado_id TEXT,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_realizado_por TEXT
) RETURNS public.pae_chamados
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE chamado public.pae_chamados;
DECLARE latitude_anterior DOUBLE PRECISION;
DECLARE longitude_anterior DOUBLE PRECISION;
BEGIN
  IF p_latitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90
     OR p_longitude IS NULL OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Coordenadas inválidas.';
  END IF;
  SELECT * INTO chamado FROM public.pae_chamados
   WHERE id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chamado não encontrado.'; END IF;
  latitude_anterior := chamado.latitude;
  longitude_anterior := chamado.longitude;

  UPDATE public.pae_chamados SET latitude = p_latitude, longitude = p_longitude,
         atualizado_em = NOW()
   WHERE id = chamado.id RETURNING * INTO chamado;
  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (
    gen_random_uuid()::text, chamado.evento_id, chamado.id, 'localizacao_atualizada',
    jsonb_build_object('latitude_anterior', latitude_anterior, 'longitude_anterior', longitude_anterior,
                       'latitude', p_latitude, 'longitude', p_longitude),
    COALESCE(NULLIF(trim(p_realizado_por), ''), 'Agente não identificado')
  );
  RETURN chamado;
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
  IF chamado.status <> 'triado' THEN
    RAISE EXCEPTION 'Faça a triagem do chamado antes de iniciar o atendimento.';
  END IF;

  UPDATE public.pae_chamados SET status = 'em_atendimento', atualizado_em = NOW()
   WHERE id = chamado.id RETURNING * INTO chamado;
  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (gen_random_uuid()::text, chamado.evento_id, chamado.id, 'atendimento_iniciado', '{}'::jsonb, trim(p_agente));
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
  IF chamado.status <> 'em_atendimento' THEN
    RAISE EXCEPTION 'Inicie o atendimento antes de registrar a conclusão em campo.';
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
    gen_random_uuid()::text, chamado.id, trim(p_agente), COALESCE(trim(p_observacao), ''),
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
     SET status = 'concluido_em_campo', atualizado_em = NOW()
   WHERE id = chamado.id RETURNING * INTO chamado;
  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (
    gen_random_uuid()::text, chamado.evento_id, chamado.id, 'atendimento_concluido_em_campo',
    jsonb_build_object('fotos', jsonb_array_length(COALESCE(p_fotos, '[]'::jsonb)),
                       'materiais', jsonb_array_length(COALESCE(p_materiais_gastos, '[]'::jsonb))),
    trim(p_agente)
  );
  RETURN jsonb_build_object('chamado', to_jsonb(chamado), 'atendimento', to_jsonb(atendimento));
END;
$$;

CREATE OR REPLACE FUNCTION public.pae_validar_chamado(
  p_chamado_id TEXT,
  p_validado_por TEXT
) RETURNS public.pae_chamados
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE chamado public.pae_chamados;
DECLARE responsavel_evento TEXT;
BEGIN
  SELECT c.* INTO chamado
    FROM public.pae_chamados c
   WHERE c.id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chamado não encontrado.'; END IF;
  SELECT COALESCE(NULLIF(e.responsavel, ''), e.acionado_por) INTO responsavel_evento
    FROM public.pae_eventos e WHERE e.id = chamado.evento_id;
  IF trim(COALESCE(p_validado_por, '')) <> responsavel_evento THEN
    RAISE EXCEPTION 'Somente o responsável pelo evento pode validar a conclusão.';
  END IF;
  IF chamado.status <> 'concluido_em_campo' THEN
    RAISE EXCEPTION 'Somente chamados concluídos em campo podem ser validados.';
  END IF;

  UPDATE public.pae_chamados
     SET status = 'validado', validado_por = trim(p_validado_por),
         validado_em = NOW(), atualizado_em = NOW()
   WHERE id = chamado.id RETURNING * INTO chamado;
  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (gen_random_uuid()::text, chamado.evento_id, chamado.id, 'chamado_validado', '{}'::jsonb, trim(p_validado_por));
  RETURN chamado;
END;
$$;

CREATE OR REPLACE FUNCTION public.pae_suspender_cancelar_chamado(
  p_chamado_id TEXT,
  p_status TEXT,
  p_motivo TEXT,
  p_realizado_por TEXT
) RETURNS public.pae_chamados
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE chamado public.pae_chamados;
BEGIN
  IF p_status NOT IN ('suspenso', 'cancelado')
     OR length(trim(COALESCE(p_motivo, ''))) = 0
     OR length(trim(COALESCE(p_realizado_por, ''))) = 0 THEN
    RAISE EXCEPTION 'Informe se o chamado será suspenso ou cancelado e registre o motivo.';
  END IF;
  SELECT * INTO chamado FROM public.pae_chamados
   WHERE id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chamado não encontrado.'; END IF;
  IF chamado.status IN ('validado', 'suspenso', 'cancelado') THEN
    RAISE EXCEPTION 'Este chamado não pode mais ser alterado.';
  END IF;

  UPDATE public.pae_chamados
     SET status = p_status, motivo_suspensao_cancelamento = trim(p_motivo),
         atualizado_em = NOW()
   WHERE id = chamado.id RETURNING * INTO chamado;
  INSERT INTO public.pae_historico (id, evento_id, chamado_id, acao, detalhes, realizado_por)
  VALUES (
    gen_random_uuid()::text, chamado.evento_id, chamado.id, 'chamado_' || p_status,
    jsonb_build_object('motivo', trim(p_motivo)), trim(p_realizado_por)
  );
  RETURN chamado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pae_criar_evento_detalhado(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pae_criar_chamado_detalhado(TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pae_triar_chamado(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pae_atualizar_localizacao(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pae_validar_chamado(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pae_suspender_cancelar_chamado(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
