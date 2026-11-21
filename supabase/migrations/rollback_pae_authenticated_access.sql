-- ATENÇÃO: este rollback reabre os dados do PAE ao papel anon.
-- Use somente para reversão emergencial e após aprovar conscientemente a exposição.
-- Os registros operacionais não são apagados; a lista de usuários autorizados é removida.

BEGIN;

DROP TRIGGER IF EXISTS pae_eventos_identidade_autorizada ON public.pae_eventos;
DROP TRIGGER IF EXISTS pae_chamados_identidade_autorizada ON public.pae_chamados;
DROP TRIGGER IF EXISTS pae_atendimentos_identidade_autorizada ON public.pae_atendimentos;
DROP TRIGGER IF EXISTS pae_historico_identidade_autorizada ON public.pae_historico;
DROP FUNCTION IF EXISTS public.pae_aplicar_identidade_operacional();

DROP POLICY IF EXISTS pae_usuario_autorizado_consulta_propria
  ON public.pae_usuarios_autorizados;
DROP TABLE IF EXISTS public.pae_usuarios_autorizados;
DROP FUNCTION IF EXISTS public.pae_usuario_autorizado();
DROP FUNCTION IF EXISTS public.pae_agente_autorizado();

DO $$
DECLARE
  tabela TEXT;
  rotina RECORD;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'pae_eventos', 'pae_chamados', 'pae_atendimentos', 'pae_fotos', 'pae_historico'
  ] LOOP
    DROP POLICY IF EXISTS pae_acesso_interno ON public.pae_eventos;
    EXECUTE format(
      'CREATE POLICY pae_acesso_atual ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      tabela
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated',
      tabela
    );
  END LOOP;

  FOR rotina IN
    SELECT p.oid::regprocedure AS assinatura, p.prorettype
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND left(p.proname, 4) = 'pae_'
       AND p.prorettype <> 'trigger'::regtype
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', rotina.assinatura);
  END LOOP;
END $$;

COMMIT;
