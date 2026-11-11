-- Preserve all extended attributes imported from KMZ/KML placemarks.
-- Safe to run on existing areas_risco tables; existing records default to an empty array.
ALTER TABLE public.areas_risco
  ADD COLUMN IF NOT EXISTS atributos_kmz JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.areas_risco
  DROP CONSTRAINT IF EXISTS areas_risco_atributos_kmz_check;

ALTER TABLE public.areas_risco
  DROP CONSTRAINT IF EXISTS areas_risco_atributos_kmz_array_check;

ALTER TABLE public.areas_risco
  ADD CONSTRAINT areas_risco_atributos_kmz_array_check
  CHECK (jsonb_typeof(atributos_kmz) = 'array');

COMMENT ON COLUMN public.areas_risco.atributos_kmz IS
  'Lista de campos originais do KMZ/KML importado, como {campo, valor}.';

NOTIFY pgrst, 'reload schema';
