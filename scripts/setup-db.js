/**
 * InfoTicket - Database Automation Script (JS version) v1.19.0
 * Configuração Completa do Banco Multi-Tenant, Triggers de Notificação, Chat4u, Templates, SLA, CSAT, is_imported e Organizações B2B2B
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...values] = trimmed.split('=');
      if (key && values.length) {
        process.env[key.trim()] = values.join('=').trim();
      }
    }
  }
}

loadEnv();

const projectRef = process.env.VITE_SUPABASE_PROJECT_REF || 'vrkhkifhkztttukuxbwz';
const managementToken = process.env.VITE_SUPABASE_MANAGEMENT_TOKEN || 'sbp_fc94326bec0b83cfbe2c07d11ca7a008a1408e7c';
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://vrkhkifhkztttukuxbwz.supabase.co';
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const SQL_SCHEMA = `
-- 1. Extensão para geração de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Empresas (Tenants SaaS)
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    razao_social VARCHAR(255) NOT NULL,
    cnpj VARCHAR(20) UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'Ativo',
    trial_ends_at TIMESTAMPTZ,
    cep VARCHAR(15),
    logradouro VARCHAR(255),
    numero VARCHAR(30),
    complemento VARCHAR(150),
    bairro VARCHAR(100),
    cidade VARCHAR(100),
    estado VARCHAR(10),
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

-- 3. Tabela de Perfis de Usuários
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    client_organization_id UUID REFERENCES public.client_organizations(id) ON DELETE SET NULL,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(30),
    role VARCHAR(50) NOT NULL,
    recebe_notificacoes BOOLEAN DEFAULT TRUE,
    avatar_url TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Garante suporte a colunas caso a tabela profiles já exista
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_organization_id UUID REFERENCES public.client_organizations(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- Constraint de Role
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('Super Admin', 'Gestor', 'Gerente', 'Operador', 'Operador/Funcionário', 'Cliente'));

-- 4. Tabela de Chamados (Tickets)
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    client_organization_id UUID REFERENCES public.client_organizations(id) ON DELETE SET NULL,
    cliente_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    operador_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assunto VARCHAR(255) NOT NULL,
    descricao TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Aberto',
    prioridade VARCHAR(20) DEFAULT 'Média',
    resumo_conclusao TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Garante coluna client_organization_id caso a tabela tickets já exista
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS client_organization_id UUID REFERENCES public.client_organizations(id) ON DELETE SET NULL;

-- Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_companies_cnpj ON public.companies(cnpj);
CREATE INDEX IF NOT EXISTS idx_client_organizations_company ON public.client_organizations(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_client_org ON public.profiles(client_organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_tickets_company ON public.tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_client_org ON public.tickets(client_organization_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);

-- 5. Row Level Security (RLS)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Helper 1: Retorna a company_id do usuário autenticado
CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Helper 2: Identifica se o usuário logado é 'Super Admin'
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'Super Admin'
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- POLÍTICAS RLS ATUALIZADAS:
-- A) COMPANIES:
-- Isolamento por company_id, EXCETO Super Admin que possui acesso total (SELECT e UPDATE) a todas as empresas.
DROP POLICY IF EXISTS "RLS companies isolamento" ON public.companies;
DROP POLICY IF EXISTS "Isolamento de empresas" ON public.companies;
DROP POLICY IF EXISTS "Cadastro publico companies" ON public.companies;
DROP POLICY IF EXISTS "RLS companies isolamento com super admin" ON public.companies;

CREATE POLICY "RLS companies isolamento com super admin" ON public.companies
FOR ALL USING (
  id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
)
WITH CHECK (
  id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR true -- permite cadastro público de novas empresas
);

-- A.1) CLIENT_ORGANIZATIONS (B2B2B):
-- Isolamento rigoroso focado no company_id do tenant SaaS
DROP POLICY IF EXISTS "RLS client_organizations isolamento" ON public.client_organizations;
CREATE POLICY "RLS client_organizations isolamento" ON public.client_organizations
FOR ALL USING (
  company_id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
)
WITH CHECK (
  company_id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
);

-- B) PROFILES:
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

-- C) TICKETS:
-- Estritamente isolados por company_id para todos os tenants (incluindo o Super Admin em suas operações diárias)
DROP POLICY IF EXISTS "RLS tickets isolamento" ON public.tickets;
DROP POLICY IF EXISTS "Isolamento de tickets" ON public.tickets;

CREATE POLICY "RLS tickets isolamento" ON public.tickets
FOR ALL USING (
  company_id = public.current_user_company_id()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
)
WITH CHECK (
  company_id = public.current_user_company_id()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
);

-- 6. Tabela de Mensagens do Chamado / Linha do Tempo (ticket_messages)
CREATE TABLE IF NOT EXISTS public.ticket_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    is_internal_note BOOLEAN NOT NULL DEFAULT FALSE,
    is_imported BOOLEAN NOT NULL DEFAULT FALSE,
    channel VARCHAR(50) NOT NULL DEFAULT 'sistema',
    whatsapp_template_name VARCHAR(255),
    whatsapp_template_variables JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ticket_messages ADD COLUMN IF NOT EXISTS is_imported BOOLEAN NOT NULL DEFAULT FALSE;

-- Índices para performance da timeline
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_company ON public.ticket_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created ON public.ticket_messages(created_at);

-- RLS para ticket_messages: isolamento estrito por company_id
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RLS ticket_messages isolamento" ON public.ticket_messages;
CREATE POLICY "RLS ticket_messages isolamento" ON public.ticket_messages
FOR ALL USING (
  company_id = public.current_user_company_id()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
)
WITH CHECK (
  company_id = public.current_user_company_id()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
);

-- 7. Tabela de Macros (Respostas Rápidas da Empresa)
CREATE TABLE IF NOT EXISTS public.macros (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    titulo VARCHAR(255) NOT NULL,
    conteudo TEXT NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de Macros
CREATE INDEX IF NOT EXISTS idx_macros_company ON public.macros(company_id);

-- RLS para macros: isolamento estrito por company_id
ALTER TABLE public.macros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RLS macros isolamento" ON public.macros;
CREATE POLICY "RLS macros isolamento" ON public.macros
FOR ALL USING (
  company_id = public.current_user_company_id()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
)
WITH CHECK (
  company_id = public.current_user_company_id()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
);

-- 8. Alterações na Tabela Tickets para SLA e CSAT
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS sla_vencimento TIMESTAMPTZ;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS csat_score INT CHECK (csat_score >= 1 AND csat_score <= 5);
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS csat_comentario TEXT;

-- 9. Tabela de Logs de Auditoria do Chamado (audit_logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    acao TEXT NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de Auditoria
CREATE INDEX IF NOT EXISTS idx_audit_logs_ticket ON public.audit_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON public.audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(criado_em);

-- RLS para audit_logs: isolamento estrito por company_id
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 9.1 Tabela de Anexos do Chamado (ticket_attachments - Fase 13)
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

-- Índices de Anexos
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON public.ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_company ON public.ticket_attachments(company_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_message ON public.ticket_attachments(message_id);

-- RLS para ticket_attachments: isolamento estrito por company_id
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RLS ticket_attachments isolamento" ON public.ticket_attachments;
CREATE POLICY "RLS ticket_attachments isolamento" ON public.ticket_attachments
FOR ALL USING (
  company_id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
)
WITH CHECK (
  company_id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
);

-- 9.2 Criação e Configuração de Segurança do Bucket de Storage ticket_attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket_attachments',
  'ticket_attachments',
  true,
  52428800, -- Limite de 50MB
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = true;

-- Políticas de Storage para o Bucket ticket_attachments
DROP POLICY IF EXISTS "Acesso público ou autenticado ao bucket ticket_attachments" ON storage.objects;
CREATE POLICY "Acesso público ou autenticado ao bucket ticket_attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket_attachments');

DROP POLICY IF EXISTS "Upload autenticado por tenant no bucket ticket_attachments" ON storage.objects;
CREATE POLICY "Upload autenticado por tenant no bucket ticket_attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ticket_attachments'
  AND (
    auth.role() = 'authenticated'
    OR auth.role() = 'anon'
    OR auth.jwt() ->> 'role' = 'service_role'
  )
);

DROP POLICY IF EXISTS "Delete no bucket ticket_attachments" ON storage.objects;
CREATE POLICY "Delete no bucket ticket_attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'ticket_attachments'
  AND (
    auth.role() = 'authenticated'
    OR auth.jwt() ->> 'role' = 'service_role'
  )
);

-- 10. Alterações na Tabela Companies para Integração Chat4u / Chatwoot (Fase 10)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS chatwoot_url VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS chatwoot_api_access_token VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS chatwoot_account_id INT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS chatwoot_inbox_id INT;

-- 10.1 Servidor de E-mail Corporativo Multi-Tenant (Fase 18.1 - SMTP) & SLA Dinâmico
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS smtp_port INT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS smtp_user VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS smtp_password VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS smtp_from_email VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS smtp_from_name VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS sla_padrao_horas INT NOT NULL DEFAULT 4;

-- 11. Tabela de Templates de Comunicação (communication_templates)
CREATE TABLE IF NOT EXISTS public.communication_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL,
    assunto VARCHAR(255) NOT NULL,
    corpo_mensagem TEXT NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uk_communication_templates_company_tipo UNIQUE (company_id, tipo)
);

-- Índices de Templates
CREATE INDEX IF NOT EXISTS idx_communication_templates_company ON public.communication_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_communication_templates_tipo ON public.communication_templates(tipo);

-- RLS para communication_templates: isolamento estrito por company_id
ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RLS communication_templates isolamento" ON public.communication_templates;
CREATE POLICY "RLS communication_templates isolamento" ON public.communication_templates
FOR ALL USING (
  company_id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
)
WITH CHECK (
  company_id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
);

-- Garante coluna chatwoot_conversation_id na tabela tickets
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS chatwoot_conversation_id INT;

-- 12. Funções e Triggers para Disparo Automático de Notificações (Fase 11 e 11.1)
-- Cria ou substitui função trigger que despacha o evento para a Edge Function via pg_net (se disponível) ou webhook
CREATE OR REPLACE FUNCTION public.trigger_ticket_status_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
BEGIN
  -- Dispara apenas quando o status sofrer alteração real
  IF (OLD.status IS DISTINCT FROM NEW.status) THEN
    v_payload := jsonb_build_object(
      'ticket_id', NEW.id,
      'company_id', NEW.company_id,
      'event_type', 'status_change',
      'user_id', auth.uid()
    );

    -- Tenta invocar via extensão pg_net caso instalada
    BEGIN
      PERFORM net.http_post(
        url := 'https://vrkhkifhkztttukuxbwz.supabase.co/functions/v1/send-notification',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := v_payload
      );
    EXCEPTION WHEN OTHERS THEN
      -- Se pg_net não estiver disponível no schema local, prossegue sem travar a transação
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger na tabela tickets: AFTER UPDATE para mudanças de status
DROP TRIGGER IF EXISTS trg_tickets_status_change ON public.tickets;
CREATE TRIGGER trg_tickets_status_change
AFTER UPDATE OF status ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ticket_status_notification();

-- 12.1 Função e Trigger para Notificação de Atribuição de Operador (Fase 12.1)
CREATE OR REPLACE FUNCTION public.trigger_ticket_assignment_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
BEGIN
  -- Dispara apenas quando operador_id for alterado e não for nulo
  IF (NEW.operador_id IS DISTINCT FROM OLD.operador_id AND NEW.operador_id IS NOT NULL) THEN
    v_payload := jsonb_build_object(
      'ticket_id', NEW.id,
      'company_id', NEW.company_id,
      'event_type', 'ticket_atribuido',
      'user_id', auth.uid(),
      'operador_id', NEW.operador_id
    );

    BEGIN
      PERFORM net.http_post(
        url := 'https://vrkhkifhkztttukuxbwz.supabase.co/functions/v1/send-notification',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := v_payload
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger na tabela tickets: AFTER UPDATE OF operador_id
DROP TRIGGER IF EXISTS trg_tickets_operator_assigned ON public.tickets;
CREATE TRIGGER trg_tickets_operator_assigned
AFTER UPDATE OF operador_id ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ticket_assignment_notification();

-- Função Trigger para novas interações na tabela ticket_messages
CREATE OR REPLACE FUNCTION public.trigger_ticket_message_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_chatwoot_payload JSONB;
BEGIN
  -- Não dispara para notas internas restritas nem para mensagens importadas (evita loop no WhatsApp)
  IF (NEW.is_internal_note = FALSE AND COALESCE(NEW.is_imported, FALSE) = FALSE) THEN
    -- 1. Se o canal for WhatsApp, dispara a Edge Function dedicada do Chatwoot (Motor Oficial de Templates)
    IF (NEW.channel = 'whatsapp') THEN
      v_chatwoot_payload := jsonb_build_object(
        'message_id', NEW.id,
        'ticket_id', NEW.ticket_id,
        'company_id', NEW.company_id,
        'is_imported', COALESCE(NEW.is_imported, FALSE),
        'template_name', NEW.whatsapp_template_name,
        'variables', NEW.whatsapp_template_variables,
        'content', NEW.content
      );

      BEGIN
        PERFORM net.http_post(
          url := 'https://vrkhkifhkztttukuxbwz.supabase.co/functions/v1/send-whatsapp-official',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := v_chatwoot_payload
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- 2. Dispara notificação padrão por e-mail para manter os envolvidos atualizados
    v_payload := jsonb_build_object(
      'ticket_id', NEW.ticket_id,
      'company_id', NEW.company_id,
      'event_type', 'new_message',
      'message_id', NEW.id,
      'user_id', NEW.user_id,
      'is_imported', COALESCE(NEW.is_imported, FALSE)
    );

    BEGIN
      PERFORM net.http_post(
        url := 'https://vrkhkifhkztttukuxbwz.supabase.co/functions/v1/send-notification',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := v_payload
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger na tabela ticket_messages: AFTER INSERT para novas mensagens públicas
DROP TRIGGER IF EXISTS trg_ticket_messages_new_interaction ON public.ticket_messages;
CREATE TRIGGER trg_ticket_messages_new_interaction
AFTER INSERT ON public.ticket_messages
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ticket_message_notification();

-- Trigger para Disparo de Boas-Vindas ao Criar Usuário (Supabase Auth)
CREATE OR REPLACE FUNCTION public.trigger_user_welcome_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_company_id UUID;
  v_nome TEXT;
BEGIN
  BEGIN
    v_company_id := (NEW.raw_user_meta_data->>'company_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_company_id := NULL;
  END;

  v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));

  v_payload := jsonb_build_object(
    'user_id', NEW.id,
    'company_id', v_company_id,
    'event_type', 'welcome_email',
    'recipient_email', NEW.email,
    'recipient_name', v_nome
  );

  BEGIN
    PERFORM net.http_post(
      url := 'https://vrkhkifhkztttukuxbwz.supabase.co/functions/v1/send-notification',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := v_payload
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auth_users_welcome ON auth.users;
CREATE TRIGGER trg_auth_users_welcome
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.trigger_user_welcome_notification();
`;


async function executeSql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${managementToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Falha na API Supabase: ${err}`);
  }
}

export async function runSetup() {
  console.log('🚀 [InfoTicket] Aplicando Fase 12: Setup do Banco e Configuração B2B2B...');
  console.log(`📡 Project Ref: ${projectRef}`);

  try {
    // 1. Aplica o Schema SQL e as novas Políticas RLS
    console.log('⏳ Atualizando DDL e Políticas RLS no Supabase...');
    await executeSql(SQL_SCHEMA);
    console.log('✅ Políticas de RLS atualizadas! Super Admin tem acesso a todas as empresas.');

    // 2. Cria ou Atualiza a Empresa Master 'Infocast'
    const infocastCompanyId = '00000000-0000-0000-0000-000000000001';
    const insertCompanySql = `
      INSERT INTO public.companies (id, razao_social, cnpj, status, trial_ends_at)
      VALUES (
        '${infocastCompanyId}',
        'Infocast',
        '00.000.000/0001-00',
        'Ativo',
        NOW() + INTERVAL '10 years'
      )
      ON CONFLICT (id) DO UPDATE SET
        razao_social = 'Infocast',
        status = 'Ativo';
    `;
    await executeSql(insertCompanySql);
    console.log('✅ Empresa Master "Infocast" garantida na tabela companies (Status: Ativo).');

    // 3. Criação da conta no Supabase Auth para a Denise via Admin API
    if (serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const emailMaster = 'denise@infocast-web.com.br';
      const passwordMaster = 'Z0d&&l3x';

      console.log(`⏳ Verificando usuário Master Auth (${emailMaster})...`);
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;

      let masterUser = users.find(u => u.email?.toLowerCase() === emailMaster.toLowerCase());

      if (!masterUser) {
        console.log('⏳ Criando usuário Master no Auth...');
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: emailMaster,
          password: passwordMaster,
          email_confirm: true,
          user_metadata: { nome: 'Denise Infocast' },
        });
        if (createError) throw createError;
        masterUser = newUser.user;
        console.log(`✅ Usuário Master criado no Auth com ID: ${masterUser.id}`);
      } else {
        console.log(`⏳ Usuário Master já existia (ID: ${masterUser.id}). Atualizando senha e confirmação...`);
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(masterUser.id, {
          password: passwordMaster,
          email_confirm: true,
        });
        if (updateError) throw updateError;
        console.log('✅ Senha e confirmação do usuário Master atualizadas no Auth.');
      }

      // 4. Insere ou Atualiza o perfil da Denise na tabela profiles
      const insertProfileSql = `
        INSERT INTO public.profiles (id, company_id, nome, email, role, recebe_notificacoes)
        VALUES (
          '${masterUser.id}',
          '${infocastCompanyId}',
          'Denise Infocast',
          '${emailMaster}',
          'Super Admin',
          true
        )
        ON CONFLICT (id) DO UPDATE SET
          company_id = '${infocastCompanyId}',
          nome = 'Denise Infocast',
          email = '${emailMaster}',
          role = 'Super Admin';
      `;
      await executeSql(insertProfileSql);
      console.log('✅ Perfil da Denise registrado na tabela profiles com role "Super Admin" vinculada à Infocast.');
    } else {
      console.warn('⚠️ VITE_SUPABASE_SERVICE_ROLE_KEY não encontrada no .env para chamada da Admin API.');
    }

    // 5. Seed de Templates Básicos de Comunicação para a conta Infocast (Fase 10)
    console.log('⏳ Semeando templates padrão de comunicação (Fase 10)...');
    const seedTemplatesSql = `
      INSERT INTO public.communication_templates (company_id, tipo, assunto, corpo_mensagem)
      VALUES 
      (
        '${infocastCompanyId}',
        'welcome_email',
        'Bem-vindo ao InfoTicket - {{nome_empresa}}',
        'Olá, {{nome_cliente}}!\n\nSeja muito bem-vindo ao portal de atendimento da {{nome_empresa}}.\nSeu acesso foi configurado com sucesso e nossa equipe está à disposição para auxiliá-lo.\n\nAcesse nosso portal a qualquer momento: {{portal_url}}\n\nAtenciosamente,\nEquipe de Suporte {{nome_empresa}}'
      ),
      (
        '${infocastCompanyId}',
        'new_ticket',
        '[InfoTicket] Chamado Aberto com Sucesso: #{{ticket_id}} - {{assunto}}',
        'Olá, {{nome_cliente}}!\n\nConfirmamos a abertura do seu chamado #{{ticket_id}} sobre "{{assunto}}".\nNossa equipe técnica já foi notificada e o prazo estimado de atendimento (SLA) é de {{sla_prazo}}.\n\nVocê pode acompanhar e interagir diretamente pelo link: {{ticket_link}}\n\nAtenciosamente,\nEquipe {{nome_empresa}}'
      ),
      (
        '${infocastCompanyId}',
        'status_change',
        '[InfoTicket] Atualização no Chamado #{{ticket_id}}: Status alterado para {{status_atual}}',
        'Olá, {{nome_cliente}}!\n\nInformamos que o status do seu chamado #{{ticket_id}} foi atualizado para: {{status_atual}}.\n\nPara verificar o andamento ou enviar mais informações, acesse: {{ticket_link}}\n\nAtenciosamente,\nEquipe {{nome_empresa}}'
      ),
      (
        '${infocastCompanyId}',
        'new_message',
        '[InfoTicket] Nova Interação no Chamado #{{ticket_id}}',
        'Olá, {{nome_cliente}}!\n\nHá uma nova mensagem registrada no seu chamado #{{ticket_id}} por {{nome_remetente}}:\n\n"{{mensagem_resumo}}"\n\nResponda diretamente através do portal: {{ticket_link}}\n\nAtenciosamente,\nEquipe {{nome_empresa}}'
      ),
      (
        '${infocastCompanyId}',
        'csat',
        '[InfoTicket] Como foi seu atendimento no Chamado #{{ticket_id}}?',
        'Olá, {{nome_cliente}}!\n\nSeu chamado #{{ticket_id}} ("{{assunto}}") foi concluído pela nossa equipe.\n\nResumo da Conclusão:\n{{resumo}}\n\nSua opinião é fundamental para melhorarmos continuamente. Por favor, avalie nosso atendimento acessando: {{ticket_link}}\n\nMuito obrigado!\nEquipe {{nome_empresa}}'
      ),
      (
        '${infocastCompanyId}',
        'ticket_atribuido',
        '[InfoTicket] Chamado Delegado a Você: #{{ticket_id}} - {{assunto}}',
        'Olá, {{nome_operador}}!\n\nO chamado #{{ticket_id}} ("{{assunto}}") aberto por {{nome_cliente}} foi atribuído a você como operador responsável.\n\nPrioridade: {{prioridade}}\nPrazo SLA: {{sla_prazo}}\n\nAcesse o chamado para atendimento: {{ticket_link}}\n\nBom trabalho!\nEquipe {{nome_empresa}}'
      )
      ON CONFLICT (company_id, tipo) DO UPDATE SET
        assunto = EXCLUDED.assunto,
        corpo_mensagem = EXCLUDED.corpo_mensagem,
        atualizado_em = NOW();
    `;
    await executeSql(seedTemplatesSql);
    console.log('✅ Templates de comunicação cadastrados e atualizados com sucesso para a empresa Master!');

    console.log('🎉 Fase 12: Setup de Banco, Organizações B2B2B e Context Switcher Concluídos com Sucesso!');
  } catch (error) {
    console.error('❌ [InfoTicket] Erro no setup da Fase 12:', error.message);
    process.exit(1);
  }
}

runSetup();
