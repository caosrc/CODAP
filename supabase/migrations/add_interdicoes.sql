-- Interdições registradas diretamente ou sincronizadas com ocorrências.
-- Pode ser executada novamente sem apagar registros.

CREATE TABLE IF NOT EXISTS public.areas_risco (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  poligono JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(poligono) = 'array'),
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  limite_precipitacao_mm NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (limite_precipitacao_mm >= 0),
  referencia TEXT,
  observacao TEXT,
  criado_por TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ocorrencia_id BIGINT REFERENCES public.ocorrencias(id) ON DELETE CASCADE
);

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

-- Atualiza o CHECK antigo sem depender do nome gerado pela versão anterior.
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

CREATE INDEX IF NOT EXISTS areas_risco_tipo_idx
  ON public.areas_risco (tipo);
CREATE INDEX IF NOT EXISTS areas_risco_created_at_idx
  ON public.areas_risco (created_at DESC);
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

ALTER TABLE public.areas_risco ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS codap_acesso ON public.areas_risco;
CREATE POLICY codap_acesso ON public.areas_risco
  FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.areas_risco TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'areas_risco'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.areas_risco;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
