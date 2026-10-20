-- CODAP — schema completo para o projeto Supabase na nuvem.
-- Execute este arquivo uma vez no SQL Editor do projeto Supabase.
-- Ele é idempotente: pode ser executado novamente sem apagar os dados.

CREATE TABLE IF NOT EXISTS public.ocorrencias (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT, natureza TEXT, subnatureza TEXT, nivel_risco TEXT,
  status_oc TEXT DEFAULT 'ativo', fotos JSONB DEFAULT '[]'::jsonb,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION, endereco TEXT,
  proprietario TEXT, telefone_proprietario TEXT, situacao TEXT, recomendacao TEXT, conclusao TEXT,
  data_ocorrencia TEXT, hora_inicio TEXT, hora_fim TEXT,
  horas_total NUMERIC(5,2), horas_sobreaviso NUMERIC(5,2),
  agentes JSONB DEFAULT '[]'::jsonb,
  responsavel_registro TEXT, vistorias JSONB DEFAULT '[]'::jsonb,
  descricoes_fotos JSONB DEFAULT '[]'::jsonb,
  focos_incendio JSONB, poligono_area_queimada JSONB, chuva NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ocorrencias
  ADD COLUMN IF NOT EXISTS telefone_proprietario TEXT;

CREATE TABLE IF NOT EXISTS public.escala_estado (
  id INTEGER PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.checklists_viatura (
  id BIGSERIAL PRIMARY KEY,
  data_checklist TEXT, km TEXT, placa TEXT, motorista TEXT,
  fotos_avarias JSONB DEFAULT '[]'::jsonb,
  foto_frontal TEXT, foto_traseira TEXT, foto_direita TEXT, foto_esquerda TEXT,
  itens JSONB DEFAULT '{}'::jsonb, observacoes TEXT, assinatura_data TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.materiais (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'escritorio',
  descricao TEXT, observacoes TEXT, foto TEXT, foto_thumb TEXT, foto_placa TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT materiais_categoria_check CHECK (categoria IN ('escritorio', 'ferramental'))
);

CREATE TABLE IF NOT EXISTS public.emprestimos (
  id BIGSERIAL PRIMARY KEY,
  material_id TEXT REFERENCES public.materiais(id) ON DELETE CASCADE,
  material_codigo TEXT, material_nome TEXT, responsavel TEXT NOT NULL,
  cpf TEXT, secretaria TEXT, prazo_dias INTEGER NOT NULL DEFAULT 7,
  quantidade INTEGER NOT NULL DEFAULT 1, tipo TEXT NOT NULL DEFAULT 'emprestimo',
  data_emprestimo TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_devolucao_prevista DATE, condicao_equipamento TEXT, observacoes TEXT,
  agente_emprestador TEXT, assinatura_data TEXT, devolvido_em TIMESTAMPTZ,
  devolvido_obs TEXT, devolvido_recebedor TEXT, devolvido_foto TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.equipamentos_campo (
  id BIGSERIAL PRIMARY KEY,
  material_id TEXT REFERENCES public.materiais(id) ON DELETE SET NULL,
  material_nome TEXT, fotos JSONB DEFAULT '[]'::jsonb,
  latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
  rua TEXT, numero TEXT, bairro TEXT, observacao TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1, prazo_dias INTEGER,
  data_recolha_prevista DATE, status TEXT NOT NULL DEFAULT 'ativo',
  agente TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.checklists_ferramental (
  id BIGSERIAL PRIMARY KEY,
  ferramenta_id TEXT NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  quantidade_cadastrada INTEGER NOT NULL,
  quantidade_conferida INTEGER NOT NULL,
  condicao TEXT NOT NULL,
  item_faltante TEXT, justificativa TEXT, realizado_por TEXT,
  data_checklist TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sos_ativos_db (
  id TEXT PRIMARY KEY, agente TEXT NOT NULL,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION, bateria INTEGER, audio TEXT,
  timestamp BIGINT NOT NULL, visualizadores JSONB DEFAULT '[]'::jsonb,
  mensagens JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.planejamentos (
  id TEXT PRIMARY KEY, tipo TEXT, nome TEXT, descricao TEXT, local TEXT,
  data_inicio TEXT, data_fim TEXT, horario TEXT, horario_fim TEXT,
  publico_estimado TEXT, status TEXT DEFAULT 'planejado',
  equipe JSONB DEFAULT '[]'::jsonb,
  agentes_defesa_civil JSONB DEFAULT '[]'::jsonb,
  materiais JSONB DEFAULT '[]'::jsonb, itens_mapa JSONB DEFAULT '[]'::jsonb,
  pontos_extras JSONB DEFAULT '[]'::jsonb,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION, observacoes TEXT, risco TEXT,
  criado_por TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmacoes_agentes JSONB NOT NULL DEFAULT '[]'::jsonb,
  fotos_evento JSONB NOT NULL DEFAULT '[]'::jsonb, conclusao TEXT
);

CREATE TABLE IF NOT EXISTS public.radar_bilhetes (
  id TEXT PRIMARY KEY, texto TEXT NOT NULL, data TEXT NOT NULL, hora TEXT NOT NULL,
  prioridade TEXT NOT NULL DEFAULT 'normal', concluido BOOLEAN NOT NULL DEFAULT FALSE,
  criado_por TEXT NOT NULL, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo TEXT NOT NULL DEFAULT 'lembrete',
  agentes_envolvidos TEXT[] NOT NULL DEFAULT '{}',
  confirmacoes_agentes JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.areas_risco (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'Encostas', 'Erosões', 'Drenagem', 'Alagamentos',
    'Deslizamentos', 'Problemas de vias', 'Obras', 'Interdições'
  )),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  poligono JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(poligono) = 'array'),
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  limite_precipitacao_mm NUMERIC(8, 2) NOT NULL CHECK (limite_precipitacao_mm >= 0),
  referencia TEXT,
  observacao TEXT,
  criado_por TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ocorrencia_id BIGINT REFERENCES public.ocorrencias(id) ON DELETE CASCADE
);

-- Mantém o schema completo compatível com bancos que já tinham areas_risco.
ALTER TABLE public.areas_risco
  ADD COLUMN IF NOT EXISTS ocorrencia_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.areas_risco'::regclass
      AND conname = 'areas_risco_ocorrencia_id_fkey'
  ) THEN
    ALTER TABLE public.areas_risco
      ADD CONSTRAINT areas_risco_ocorrencia_id_fkey
      FOREIGN KEY (ocorrencia_id)
      REFERENCES public.ocorrencias(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  restricao RECORD;
BEGIN
  FOR restricao IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.areas_risco'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.areas_risco DROP CONSTRAINT %I', restricao.conname);
  END LOOP;
END $$;

ALTER TABLE public.areas_risco
  ADD CONSTRAINT areas_risco_tipo_check
  CHECK (tipo IN (
    'Encostas', 'Erosões', 'Drenagem', 'Alagamentos',
    'Deslizamentos', 'Problemas de vias', 'Obras', 'Interdições'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS areas_risco_ocorrencia_id_uidx
  ON public.areas_risco (ocorrencia_id)
  WHERE ocorrencia_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sincronizar_interdicao_ocorrencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  data_inicio_interdicao DATE := CURRENT_DATE;
  observacao_interdicao TEXT;
  referencia_interdicao TEXT;
  responsavel_interdicao TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.areas_risco WHERE ocorrencia_id = OLD.id;
    RETURN OLD;
  END IF;

  IF lower(btrim(coalesce(NEW.natureza, ''))) NOT IN (
       'interdição', 'interdição de via', 'interdição de imóvel'
     )
     OR lower(btrim(coalesce(NEW.status_oc, 'ativo'))) IN (
       'resolvido', 'resolvida', 'encerrado', 'encerrada', 'concluido', 'concluído', 'concluida', 'concluída'
     ) THEN
    DELETE FROM public.areas_risco WHERE ocorrencia_id = NEW.id;
    RETURN NEW;
  END IF;

  IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
    RAISE EXCEPTION 'Uma ocorrência de interdição ativa precisa de latitude e longitude para aparecer no mapa.'
      USING ERRCODE = '23514';
  END IF;

  IF coalesce(NEW.data_ocorrencia, '') ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN
      data_inicio_interdicao := NEW.data_ocorrencia::DATE;
    EXCEPTION WHEN others THEN
      data_inicio_interdicao := coalesce(NEW.created_at::DATE, CURRENT_DATE);
    END;
  ELSE
    data_inicio_interdicao := coalesce(NEW.created_at::DATE, CURRENT_DATE);
  END IF;

  observacao_interdicao := nullif(
    concat_ws(E'\n',
      nullif(btrim(NEW.situacao), ''),
      nullif(btrim(NEW.recomendacao), ''),
      nullif(btrim(NEW.conclusao), '')
    ),
    ''
  );
  referencia_interdicao := coalesce(
    nullif(btrim(NEW.endereco), ''),
    'Ocorrência #' || NEW.id::TEXT
  );
  responsavel_interdicao := coalesce(
    nullif(btrim(NEW.responsavel_registro), ''),
    'Ocorrência #' || NEW.id::TEXT
  );

  INSERT INTO public.areas_risco (
    tipo, latitude, longitude, poligono, data_inicio,
    limite_precipitacao_mm, referencia, observacao, criado_por, ocorrencia_id
  )
  VALUES (
    'Interdições', NEW.lat, NEW.lng, '[]'::JSONB, data_inicio_interdicao,
    0, referencia_interdicao, observacao_interdicao, responsavel_interdicao, NEW.id
  )
  ON CONFLICT (ocorrencia_id) WHERE ocorrencia_id IS NOT NULL
  DO UPDATE SET
    tipo = EXCLUDED.tipo,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    data_inicio = EXCLUDED.data_inicio,
    limite_precipitacao_mm = 0,
    referencia = EXCLUDED.referencia,
    observacao = EXCLUDED.observacao,
    criado_por = EXCLUDED.criado_por,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sincronizar_interdicao_ocorrencia ON public.ocorrencias;
CREATE TRIGGER sincronizar_interdicao_ocorrencia
  AFTER INSERT OR UPDATE OR DELETE ON public.ocorrencias
  FOR EACH ROW
  EXECUTE FUNCTION public.sincronizar_interdicao_ocorrencia();
CREATE INDEX IF NOT EXISTS areas_risco_tipo_idx ON public.areas_risco (tipo);
CREATE INDEX IF NOT EXISTS areas_risco_created_at_idx ON public.areas_risco (created_at DESC);

CREATE TABLE IF NOT EXISTS public.curral_registros (
  id BIGSERIAL PRIMARY KEY, especie TEXT NOT NULL, porte TEXT NOT NULL, sexo TEXT,
  identificacao TEXT, local_descricao TEXT NOT NULL, observacoes TEXT,
  latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL,
  precisao_gps DOUBLE PRECISION, capturado_em TEXT NOT NULL,
  fotos JSONB NOT NULL DEFAULT '[]'::jsonb, status TEXT NOT NULL DEFAULT 'encontrado',
  criado_por TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.procon_relatorios (
  id TEXT PRIMARY KEY,
  tipo_documento TEXT NOT NULL DEFAULT 'termo_constatacao',
  numero_processo TEXT, status TEXT NOT NULL DEFAULT 'pendente',
  dados JSONB NOT NULL, criado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id TEXT PRIMARY KEY, agente TEXT, endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.monitoramento_cnl_cotas (
  id INTEGER PRIMARY KEY, atencao DOUBLE PRECISION NOT NULL,
  alerta DOUBLE PRECISION NOT NULL, transbordamento DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibilidade com bases que já tinham tabelas, mas faltavam colunas.
ALTER TABLE public.ocorrencias ADD COLUMN IF NOT EXISTS hora_inicio TEXT;
ALTER TABLE public.ocorrencias ADD COLUMN IF NOT EXISTS hora_fim TEXT;
ALTER TABLE public.ocorrencias ADD COLUMN IF NOT EXISTS horas_total NUMERIC(5,2);
ALTER TABLE public.ocorrencias ADD COLUMN IF NOT EXISTS horas_sobreaviso NUMERIC(5,2);
ALTER TABLE public.ocorrencias ADD COLUMN IF NOT EXISTS descricoes_fotos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.ocorrencias ADD COLUMN IF NOT EXISTS focos_incendio JSONB;
ALTER TABLE public.ocorrencias ADD COLUMN IF NOT EXISTS poligono_area_queimada JSONB;
ALTER TABLE public.ocorrencias ADD COLUMN IF NOT EXISTS chuva NUMERIC;
ALTER TABLE public.materiais ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'escritorio';
ALTER TABLE public.materiais ADD COLUMN IF NOT EXISTS foto_thumb TEXT;
ALTER TABLE public.materiais ADD COLUMN IF NOT EXISTS quantidade INTEGER NOT NULL DEFAULT 1;
UPDATE public.materiais SET categoria = 'escritorio'
  WHERE categoria IS NULL OR categoria NOT IN ('escritorio', 'ferramental');
ALTER TABLE public.materiais DROP CONSTRAINT IF EXISTS materiais_categoria_check;
ALTER TABLE public.materiais ADD CONSTRAINT materiais_categoria_check
  CHECK (categoria IN ('escritorio', 'ferramental'));
ALTER TABLE public.emprestimos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'emprestimo';
ALTER TABLE public.emprestimos ADD COLUMN IF NOT EXISTS quantidade INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.equipamentos_campo ADD COLUMN IF NOT EXISTS quantidade INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.equipamentos_campo ADD COLUMN IF NOT EXISTS prazo_dias INTEGER;
ALTER TABLE public.equipamentos_campo ADD COLUMN IF NOT EXISTS data_recolha_prevista DATE;
ALTER TABLE public.planejamentos ADD COLUMN IF NOT EXISTS horario_fim TEXT;
ALTER TABLE public.planejamentos ADD COLUMN IF NOT EXISTS pontos_extras JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.planejamentos ADD COLUMN IF NOT EXISTS confirmacoes_agentes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.planejamentos ADD COLUMN IF NOT EXISTS fotos_evento JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.planejamentos ADD COLUMN IF NOT EXISTS conclusao TEXT;
ALTER TABLE public.radar_bilhetes ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'lembrete';
ALTER TABLE public.radar_bilhetes ADD COLUMN IF NOT EXISTS agentes_envolvidos TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.radar_bilhetes ADD COLUMN IF NOT EXISTS confirmacoes_agentes JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.procon_relatorios ADD COLUMN IF NOT EXISTS tipo_documento TEXT NOT NULL DEFAULT 'termo_constatacao';
ALTER TABLE public.procon_relatorios ADD COLUMN IF NOT EXISTS numero_processo TEXT;

CREATE INDEX IF NOT EXISTS ocorrencias_created_at_idx ON public.ocorrencias (created_at DESC);
CREATE INDEX IF NOT EXISTS materiais_nome_idx ON public.materiais (nome);
CREATE INDEX IF NOT EXISTS emprestimos_created_at_idx ON public.emprestimos (created_at DESC);
CREATE INDEX IF NOT EXISTS equipamentos_campo_status_idx ON public.equipamentos_campo (status);
CREATE INDEX IF NOT EXISTS checklists_ferramental_data_idx ON public.checklists_ferramental (data_checklist DESC);
CREATE INDEX IF NOT EXISTS planejamentos_criado_em_idx ON public.planejamentos (criado_em DESC);
CREATE INDEX IF NOT EXISTS radar_bilhetes_data_hora_idx ON public.radar_bilhetes (data, hora, criado_em);
CREATE INDEX IF NOT EXISTS curral_registros_created_at_idx ON public.curral_registros (created_at DESC);

-- As tabelas são acessadas diretamente pelo frontend com a chave anon.
ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists_viatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emprestimos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipamentos_campo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists_ferramental ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_ativos_db ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planejamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_bilhetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas_risco ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curral_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procon_relatorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoramento_cnl_cotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS codap_acesso ON public.ocorrencias;
CREATE POLICY codap_acesso ON public.ocorrencias FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.escala_estado;
CREATE POLICY codap_acesso ON public.escala_estado FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.checklists_viatura;
CREATE POLICY codap_acesso ON public.checklists_viatura FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.materiais;
CREATE POLICY codap_acesso ON public.materiais FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.emprestimos;
CREATE POLICY codap_acesso ON public.emprestimos FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.equipamentos_campo;
CREATE POLICY codap_acesso ON public.equipamentos_campo FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.checklists_ferramental;
CREATE POLICY codap_acesso ON public.checklists_ferramental FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.sos_ativos_db;
CREATE POLICY codap_acesso ON public.sos_ativos_db FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.planejamentos;
CREATE POLICY codap_acesso ON public.planejamentos FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.radar_bilhetes;
CREATE POLICY codap_acesso ON public.radar_bilhetes FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.areas_risco;
CREATE POLICY codap_acesso ON public.areas_risco FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.curral_registros;
CREATE POLICY codap_acesso ON public.curral_registros FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.procon_relatorios;
CREATE POLICY codap_acesso ON public.procon_relatorios FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.push_subscriptions;
CREATE POLICY codap_acesso ON public.push_subscriptions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS codap_acesso ON public.monitoramento_cnl_cotas;
CREATE POLICY codap_acesso ON public.monitoramento_cnl_cotas FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Habilita Realtime sem falhar se uma tabela já estiver publicada.
DO $$
DECLARE tabela TEXT;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'ocorrencias', 'materiais', 'emprestimos', 'equipamentos_campo',
    'sos_ativos_db', 'planejamentos', 'radar_bilhetes', 'areas_risco', 'curral_registros',
    'procon_relatorios', 'escala_estado', 'checklists_viatura',
    'checklists_ferramental'
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