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
