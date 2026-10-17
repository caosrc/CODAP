-- Áreas de risco do Mapa Meteorológico do Radar DC
CREATE TABLE IF NOT EXISTS public.areas_risco (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'Encostas',
    'Erosões',
    'Drenagem',
    'Alagamentos',
    'Deslizamentos',
    'Problemas de vias',
    'Obras'
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.areas_risco
  ADD COLUMN IF NOT EXISTS poligono JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS areas_risco_tipo_idx ON public.areas_risco (tipo);
CREATE INDEX IF NOT EXISTS areas_risco_created_at_idx ON public.areas_risco (created_at DESC);

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
