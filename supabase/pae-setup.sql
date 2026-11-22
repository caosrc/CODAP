-- SQL consolidado para configurar o Supabase do app Defesa Civil e o módulo PAE.
-- Execute o arquivo inteiro uma vez no SQL Editor do Supabase.
-- A ordem abaixo é intencional: tabelas base, compatibilidade e depois autenticação/fluxos PAE.
-- O script não apaga dados. Não execute add_pae_agent_password_access.sql; este app usa a sessão interna do servidor.
-- Não habilite logins anônimos no Supabase.
-- As tabelas gerais mantêm as políticas públicas do app original; as tabelas PAE são restritas a agentes autorizados.


-- ===== supabase/supabase-completo.sql =====

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
  atributos_kmz JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(atributos_kmz) = 'array'),
  criado_por TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ocorrencia_id BIGINT REFERENCES public.ocorrencias(id) ON DELETE CASCADE
);

COMMENT ON COLUMN public.areas_risco.poligono IS
  'Geometria multipolígono em JSON: componentes > anéis (externo e internos) > coordenadas [latitude, longitude]. Listas antigas de coordenadas continuam sendo lidas como um único contorno.';

-- Mantém o schema completo compatível com bancos que já tinham areas_risco.
ALTER TABLE public.areas_risco
  ADD COLUMN IF NOT EXISTS ocorrencia_id BIGINT,
  ADD COLUMN IF NOT EXISTS atributos_kmz JSONB NOT NULL DEFAULT '[]'::jsonb;

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


-- ===== supabase/migrations/add_missing_columns.sql =====

-- Migração: adicionar todas as colunas novas que estão faltando no Supabase
-- Execute no Supabase: https://app.supabase.com → SQL Editor → colar e clicar em Run

-- ── ocorrencias ─────────────────────────────────────────────────────────────
ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS focos_incendio JSONB DEFAULT NULL;
ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS poligono_area_queimada JSONB DEFAULT NULL;
ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS chuva NUMERIC;
ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS hora_inicio VARCHAR(5);
ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS hora_fim VARCHAR(5);
ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS horas_total NUMERIC(5,2);
ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS horas_sobreaviso NUMERIC(5,2);
ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS descricoes_fotos JSONB DEFAULT '[]';
ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS telefone_proprietario TEXT;

-- ── materiais ────────────────────────────────────────────────────────────────
ALTER TABLE materiais ADD COLUMN IF NOT EXISTS foto TEXT;
ALTER TABLE materiais ADD COLUMN IF NOT EXISTS foto_placa TEXT;
ALTER TABLE materiais ADD COLUMN IF NOT EXISTS foto_thumb TEXT;
ALTER TABLE materiais ADD COLUMN IF NOT EXISTS quantidade INTEGER NOT NULL DEFAULT 1;

-- ── emprestimos ──────────────────────────────────────────────────────────────
ALTER TABLE emprestimos ADD COLUMN IF NOT EXISTS quantidade INTEGER NOT NULL DEFAULT 1;
ALTER TABLE emprestimos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'emprestimo';

-- ── equipamentos_campo ───────────────────────────────────────────────────────
ALTER TABLE equipamentos_campo ADD COLUMN IF NOT EXISTS quantidade INTEGER NOT NULL DEFAULT 1;
ALTER TABLE equipamentos_campo ADD COLUMN IF NOT EXISTS prazo_dias INTEGER DEFAULT NULL;
ALTER TABLE equipamentos_campo ADD COLUMN IF NOT EXISTS data_recolha_prevista DATE DEFAULT NULL;

-- ── planejamentos ────────────────────────────────────────────────────────────
ALTER TABLE planejamentos ADD COLUMN IF NOT EXISTS confirmacoes_agentes JSONB DEFAULT '[]';
ALTER TABLE planejamentos ADD COLUMN IF NOT EXISTS fotos_evento JSONB DEFAULT '[]';
ALTER TABLE planejamentos ADD COLUMN IF NOT EXISTS horario_fim TEXT;
ALTER TABLE planejamentos ADD COLUMN IF NOT EXISTS pontos_extras JSONB DEFAULT '[]';


-- ===== supabase/migrations/add_pae_radar_dc.sql =====

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


-- ===== supabase/migrations/add_pae_authenticated_access.sql =====

-- Restringe os registros do PAE a usuários Supabase Auth autorizados pela coordenação.
-- A migração é aditiva: não apaga nem altera os registros operacionais existentes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pae_usuarios_autorizados (
  usuario_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agente TEXT NOT NULL CHECK (length(trim(agente)) BETWEEN 1 AND 100),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pae_usuarios_autorizados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pae_usuarios_autorizados FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pae_usuarios_autorizados TO authenticated;

DROP POLICY IF EXISTS pae_usuario_autorizado_consulta_propria
  ON public.pae_usuarios_autorizados;
CREATE POLICY pae_usuario_autorizado_consulta_propria
  ON public.pae_usuarios_autorizados
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() AND ativo = TRUE);

CREATE OR REPLACE FUNCTION public.pae_usuario_autorizado()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.pae_usuarios_autorizados
     WHERE usuario_id = auth.uid()
       AND ativo = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.pae_agente_autorizado()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT agente
    FROM public.pae_usuarios_autorizados
   WHERE usuario_id = auth.uid()
     AND ativo = TRUE
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.pae_usuario_autorizado() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pae_agente_autorizado() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pae_usuario_autorizado() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pae_agente_autorizado() TO authenticated;

DO $$
DECLARE
  tabela TEXT;
  politica RECORD;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'pae_eventos', 'pae_chamados', 'pae_atendimentos', 'pae_fotos', 'pae_historico'
  ] LOOP
    FOR politica IN
      SELECT policyname
        FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = tabela
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', politica.policyname, tabela);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY pae_acesso_interno ON public.%I FOR ALL TO authenticated USING (public.pae_usuario_autorizado()) WITH CHECK (public.pae_usuario_autorizado())',
      tabela
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', tabela);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', tabela);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.pae_aplicar_identidade_operacional()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  agente_autorizado TEXT := public.pae_agente_autorizado();
  responsavel_evento TEXT;
  agentes_chamado TEXT[];
BEGIN
  IF agente_autorizado IS NULL THEN
    RAISE EXCEPTION 'Usuário sem acesso autorizado ao PAE.';
  END IF;

  IF TG_TABLE_NAME = 'pae_eventos' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.acionado_por := agente_autorizado;
      NEW.responsavel := agente_autorizado;
    END IF;
  ELSIF TG_TABLE_NAME = 'pae_chamados' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.acionado_por := agente_autorizado;
    ELSE
      IF NEW.status = 'triado'
         AND (
           OLD.status IS DISTINCT FROM NEW.status
           OR OLD.prioridade IS DISTINCT FROM NEW.prioridade
           OR OLD.justificativa_prioridade IS DISTINCT FROM NEW.justificativa_prioridade
           OR OLD.cobrade IS DISTINCT FROM NEW.cobrade
         ) THEN
        NEW.triado_por := agente_autorizado;
      END IF;

      IF NEW.status IN ('em_atendimento', 'concluido_em_campo')
         AND OLD.status IS DISTINCT FROM NEW.status THEN
        IF NOT (agente_autorizado = ANY(COALESCE(NEW.agentes_envolvidos, ARRAY[]::TEXT[]))) THEN
          RAISE EXCEPTION 'Somente agente designado pode iniciar ou concluir o atendimento.';
        END IF;
      END IF;

      IF NEW.status = 'validado' AND OLD.status IS DISTINCT FROM NEW.status THEN
        SELECT COALESCE(NULLIF(e.responsavel, ''), e.acionado_por)
          INTO responsavel_evento
          FROM public.pae_eventos e
         WHERE e.id = NEW.evento_id;
        IF agente_autorizado IS DISTINCT FROM responsavel_evento THEN
          RAISE EXCEPTION 'Somente o responsável pelo evento pode validar a conclusão.';
        END IF;
        NEW.validado_por := agente_autorizado;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'pae_atendimentos' THEN
    SELECT agentes_envolvidos
      INTO agentes_chamado
      FROM public.pae_chamados
     WHERE id = NEW.chamado_id;
    IF NOT (agente_autorizado = ANY(COALESCE(agentes_chamado, ARRAY[]::TEXT[]))) THEN
      RAISE EXCEPTION 'Somente agente designado pode registrar o atendimento.';
    END IF;
    NEW.agente := agente_autorizado;
  ELSIF TG_TABLE_NAME = 'pae_historico' THEN
    NEW.realizado_por := agente_autorizado;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pae_eventos_identidade_autorizada ON public.pae_eventos;
CREATE TRIGGER pae_eventos_identidade_autorizada
  BEFORE INSERT ON public.pae_eventos
  FOR EACH ROW EXECUTE FUNCTION public.pae_aplicar_identidade_operacional();

DROP TRIGGER IF EXISTS pae_chamados_identidade_autorizada ON public.pae_chamados;
CREATE TRIGGER pae_chamados_identidade_autorizada
  BEFORE INSERT OR UPDATE ON public.pae_chamados
  FOR EACH ROW EXECUTE FUNCTION public.pae_aplicar_identidade_operacional();

DROP TRIGGER IF EXISTS pae_atendimentos_identidade_autorizada ON public.pae_atendimentos;
CREATE TRIGGER pae_atendimentos_identidade_autorizada
  BEFORE INSERT OR UPDATE ON public.pae_atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.pae_aplicar_identidade_operacional();

DROP TRIGGER IF EXISTS pae_historico_identidade_autorizada ON public.pae_historico;
CREATE TRIGGER pae_historico_identidade_autorizada
  BEFORE INSERT ON public.pae_historico
  FOR EACH ROW EXECUTE FUNCTION public.pae_aplicar_identidade_operacional();

-- As funções antigas do PAE eram SECURITY DEFINER; com RLS restrita, devem
-- executar sob o usuário autenticado para que as políticas também sejam aplicadas.
DO $$
DECLARE
  rotina RECORD;
BEGIN
  FOR rotina IN
    SELECT p.oid::regprocedure AS assinatura, p.prorettype
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND left(p.proname, 4) = 'pae_'
  LOOP
    IF rotina.prorettype <> 'trigger'::regtype
       AND rotina.assinatura::TEXT NOT LIKE '%pae_usuario_autorizado%'
       AND rotina.assinatura::TEXT NOT LIKE '%pae_agente_autorizado%' THEN
      EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', rotina.assinatura);
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', rotina.assinatura);
    IF rotina.prorettype <> 'trigger'::regtype THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', rotina.assinatura);
    END IF;
  END LOOP;
END $$;

COMMIT;


-- ===== supabase/migrations/add_pae_triage_timeline.sql =====

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


-- ===== supabase/migrations/add_pae_dispatch.sql =====

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

NOTIFY pgrst, 'reload schema';
