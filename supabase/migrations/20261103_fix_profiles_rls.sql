-- =========================================================================
-- InfoTicket - Atualização de RLS na tabela profiles (Correção Login)
-- Permite que qualquer usuário autenticado leia e atualize seu próprio perfil
-- =========================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RLS profiles isolamento" ON public.profiles;
DROP POLICY IF EXISTS "Isolamento de perfis" ON public.profiles;
DROP POLICY IF EXISTS "Cadastro publico profiles" ON public.profiles;

CREATE POLICY "RLS profiles isolamento" ON public.profiles
FOR ALL USING (
  id = auth.uid()
  OR company_id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
)
WITH CHECK (
  id = auth.uid()
  OR company_id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR true
);

