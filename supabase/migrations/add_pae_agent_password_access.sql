-- Permite entrar no PAE com o PIN do agente selecionado no aplicativo.
-- A sessão anônima do Supabase recebe autorização apenas depois da validação
-- do PIN; as políticas existentes continuam exigindo pae_usuarios_autorizados.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.pae_agentes_senhas (
  agente TEXT PRIMARY KEY CHECK (length(trim(agente)) BETWEEN 1 AND 100),
  senha_hash TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pae_agente_login_tentativas (
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agente TEXT NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  bloqueado_ate TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, agente)
);

ALTER TABLE public.pae_agentes_senhas
  ADD COLUMN IF NOT EXISTS senha_hash TEXT,
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.pae_agente_login_tentativas
  ADD COLUMN IF NOT EXISTS usuario_id UUID,
  ADD COLUMN IF NOT EXISTS agente TEXT,
  ADD COLUMN IF NOT EXISTS tentativas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado_ate TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS pae_agentes_senhas_agente_uidx
  ON public.pae_agentes_senhas (agente);
CREATE UNIQUE INDEX IF NOT EXISTS pae_agente_login_tentativas_usuario_agente_uidx
  ON public.pae_agente_login_tentativas (usuario_id, agente);

ALTER TABLE public.pae_agentes_senhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pae_agente_login_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pae_agentes_senhas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pae_agente_login_tentativas FROM PUBLIC, anon, authenticated;

-- Os PINs são guardados como hashes bcrypt, nunca em texto aberto na tabela.
-- ON CONFLICT DO NOTHING preserva PINs alterados posteriormente pela equipe.
SET LOCAL search_path = public, extensions;
INSERT INTO public.pae_agentes_senhas (agente, senha_hash)
VALUES
  ('Alexandre', crypt('4668', gen_salt('bf', 12))),
  ('Arthur', crypt('1234', gen_salt('bf', 12))),
  ('Lucas', crypt('0356', gen_salt('bf', 12))),
  ('Junior', crypt('1234', gen_salt('bf', 12))),
  ('Rosane', crypt('1969', gen_salt('bf', 12)))
ON CONFLICT (agente) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pae_autenticar_agente(
  p_agente TEXT,
  p_senha TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  usuario UUID := auth.uid();
  agente_informado TEXT := left(trim(COALESCE(p_agente, '')), 100);
  hash_senha TEXT;
  tentativas_atuais INTEGER;
  bloqueio TIMESTAMPTZ;
BEGIN
  -- Somente uma sessão Supabase anônima pode ser associada ao PIN operacional.
  IF usuario IS NULL
     OR auth.role() <> 'authenticated'
     OR COALESCE((auth.jwt() ->> 'is_anonymous')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  IF agente_informado = '' OR length(COALESCE(p_senha, '')) > 32 THEN
    RETURN FALSE;
  END IF;

  SELECT senha_hash
    INTO hash_senha
    FROM public.pae_agentes_senhas
   WHERE agente = agente_informado AND ativo = TRUE;
  IF hash_senha IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.pae_agente_login_tentativas (usuario_id, agente)
  VALUES (usuario, agente_informado)
  ON CONFLICT (usuario_id, agente) DO NOTHING;

  SELECT tentativas, bloqueado_ate
    INTO tentativas_atuais, bloqueio
    FROM public.pae_agente_login_tentativas
   WHERE usuario_id = usuario AND agente = agente_informado
   FOR UPDATE;

  IF bloqueio IS NOT NULL AND bloqueio > NOW() THEN
    RETURN FALSE;
  END IF;
  IF bloqueio IS NOT NULL THEN
    tentativas_atuais := 0;
  END IF;

  IF crypt(COALESCE(p_senha, ''), hash_senha) IS DISTINCT FROM hash_senha THEN
    tentativas_atuais := COALESCE(tentativas_atuais, 0) + 1;
    UPDATE public.pae_agente_login_tentativas
       SET tentativas = tentativas_atuais,
           bloqueado_ate = CASE
             WHEN tentativas_atuais >= 5 THEN NOW() + INTERVAL '15 minutes'
             ELSE NULL
           END,
           atualizado_em = NOW()
     WHERE usuario_id = usuario AND agente = agente_informado;
    RETURN FALSE;
  END IF;

  UPDATE public.pae_agente_login_tentativas
     SET tentativas = 0, bloqueado_ate = NULL, atualizado_em = NOW()
   WHERE usuario_id = usuario AND agente = agente_informado;

  INSERT INTO public.pae_usuarios_autorizados (usuario_id, agente, ativo)
  VALUES (usuario, agente_informado, TRUE)
  ON CONFLICT (usuario_id) DO UPDATE
    SET agente = EXCLUDED.agente,
        ativo = TRUE;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.pae_autenticar_agente(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pae_autenticar_agente(TEXT, TEXT) TO authenticated;

COMMIT;
