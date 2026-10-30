-- =========================================================================
-- InfoTicket - Multi-tenant Database Schema v1.12.0
-- Tabelas: companies, client_organizations, profiles, tickets
-- =========================================================================

-- 1. Habilitar extensão para geração de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Empresas (Multi-Tenant)
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    cnpj VARCHAR(20) UNIQUE,
    status_trial VARCHAR(50) DEFAULT 'ativo', -- 'ativo', 'expirado', 'convertido'
    data_vencimento TIMESTAMPTZ,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 2.1 Tabela de Organizações Clientes (Arquitetura B2B2B)
CREATE TABLE IF NOT EXISTS public.client_organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Perfis de Usuários (Profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- referencia auth.users.id ou gerado via postgres
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    client_organization_id UUID REFERENCES public.client_organizations(id) ON DELETE SET NULL,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Super Admin', 'Gestor', 'Gerente', 'Operador', 'Cliente')),
    avatar_url TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Suporte retroativo caso as tabelas já existam
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_organization_id UUID REFERENCES public.client_organizations(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- 4. Tabela de Chamados (Tickets)
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    client_organization_id UUID REFERENCES public.client_organizations(id) ON DELETE SET NULL,
    cliente_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    operador_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assunto VARCHAR(255) NOT NULL,
    descricao TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_andamento', 'aguardando_cliente', 'resolvido', 'fechado')),
    prioridade VARCHAR(20) DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
    resumo_conclusao TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Suporte retroativo caso a tabela tickets já exista
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS client_organization_id UUID REFERENCES public.client_organizations(id) ON DELETE SET NULL;

-- Índices para performance e consultas multi-tenant
CREATE INDEX IF NOT EXISTS idx_client_organizations_company ON public.client_organizations(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_client_org ON public.profiles(client_organization_id);
CREATE INDEX IF NOT EXISTS idx_tickets_company ON public.tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_client_org ON public.tickets(client_organization_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_cliente ON public.tickets(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tickets_operador ON public.tickets(operador_id);

-- 5. Ativação de Row Level Security (RLS)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS padrão para desenvolvimento (Permitir acesso completo via chave anon/service_role para setup e prototipagem)
CREATE POLICY "Acesso a companies" ON public.companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a client_organizations" ON public.client_organizations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a tickets" ON public.tickets FOR ALL USING (true) WITH CHECK (true);

-- 6. Tabela de Anexos do Chamado (ticket_attachments - Fase 13)
CREATE TABLE IF NOT EXISTS public.ticket_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.ticket_messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT,
    file_type VARCHAR(100),
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON public.ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_company ON public.ticket_attachments(company_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_message ON public.ticket_attachments(message_id);

ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso a ticket_attachments" ON public.ticket_attachments FOR ALL USING (true) WITH CHECK (true);

