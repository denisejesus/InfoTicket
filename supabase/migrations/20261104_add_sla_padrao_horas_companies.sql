-- =========================================================================
-- InfoTicket - Migration: SLA Dinâmico por Empresa (Multi-Tenant)
-- Adiciona a coluna sla_padrao_horas na tabela public.companies
-- =========================================================================

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS sla_padrao_horas INT NOT NULL DEFAULT 4;

-- Garante que registros existentes sem valor tenham o padrão inicial de 4 horas
UPDATE public.companies
SET sla_padrao_horas = 4
WHERE sla_padrao_horas IS NULL;

