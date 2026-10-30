-- =========================================================================
-- InfoTicket - Multi-tenant Database Schema v1.12.0
-- Tabelas: companies, client_organizations, profiles, tickets, ticket_messages, macros, audit_logs, communication_templates + Triggers
-- =========================================================================

-- 1. Habilitar extensão para geração de UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Empresas (Multi-Tenant)
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    razao_social VARCHAR(255) NOT NULL,
    cnpj VARCHAR(20) UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'Ativo',
    trial_ends_at TIMESTAMPTZ,
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    client_organization_id UUID REFERENCES public.client_organizations(id) ON DELETE SET NULL,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Super Admin', 'Gestor', 'Gerente', 'Operador', 'Cliente')),
    recebe_notificacoes BOOLEAN DEFAULT TRUE,
    avatar_url TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Suporte retroativo caso as tabelas já existam
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_organization_id UUID REFERENCES public.client_organizations(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'Ativo';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(50);
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- Tabela de Canais / Caixas de Entrada Chatwoot (Fase 16)
CREATE TABLE IF NOT EXISTS public.chatwoot_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    inbox_id VARCHAR(50) NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chatwoot_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chatwoot_channels_company_isolation ON public.chatwoot_channels;
CREATE POLICY chatwoot_channels_company_isolation ON public.chatwoot_channels
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.role = 'Super Admin' OR profiles.company_id = chatwoot_channels.company_id)
        )
    );

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

-- Suporte retroativo caso a tabela tickets já exista
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS client_organization_id UUID REFERENCES public.client_organizations(id) ON DELETE SET NULL;

-- Índices para buscas multi-tenant de alta performance
CREATE INDEX IF NOT EXISTS idx_companies_cnpj ON public.companies(cnpj);
CREATE INDEX IF NOT EXISTS idx_client_organizations_company ON public.client_organizations(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_client_org ON public.profiles(client_organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
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

-- Função auxiliar 1: Extrair a company_id do usuário autenticado
CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Função auxiliar 2: Verifica se o usuário autenticado possui role 'Super Admin'
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'Super Admin'
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Políticas de RLS para 'companies'
-- Tenants acessam somente sua empresa; Super Admin tem permissão de leitura (SELECT) e atualização (UPDATE) em TODAS as empresas.
DROP POLICY IF EXISTS "Isolamento de empresas" ON public.companies;
DROP POLICY IF EXISTS "RLS companies isolamento com super admin" ON public.companies;
CREATE POLICY "RLS companies isolamento com super admin" ON public.companies
FOR ALL
USING (
  id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
)
WITH CHECK (
  id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR true
);

-- Políticas de RLS para 'client_organizations' (B2B2B)
DROP POLICY IF EXISTS "RLS client_organizations isolamento" ON public.client_organizations;
CREATE POLICY "RLS client_organizations isolamento" ON public.client_organizations
FOR ALL
USING (
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

-- Políticas de RLS para 'profiles'
DROP POLICY IF EXISTS "Isolamento de perfis" ON public.profiles;
DROP POLICY IF EXISTS "RLS profiles isolamento" ON public.profiles;
CREATE POLICY "RLS profiles isolamento" ON public.profiles
FOR ALL
USING (
  company_id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL
)
WITH CHECK (
  company_id = public.current_user_company_id()
  OR public.is_super_admin()
  OR auth.jwt() ->> 'role' = 'service_role'
  OR true
);

-- Políticas de RLS para 'tickets'
-- Estritamente isolados por company_id (incluindo o Super Admin nas operações diárias da sua própria empresa)
DROP POLICY IF EXISTS "Isolamento de tickets" ON public.tickets;
DROP POLICY IF EXISTS "RLS tickets isolamento" ON public.tickets;
CREATE POLICY "RLS tickets isolamento" ON public.tickets
FOR ALL
USING (
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
    channel VARCHAR(50) NOT NULL DEFAULT 'sistema',
    whatsapp_template_name VARCHAR(255),
    whatsapp_template_variables JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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

DROP POLICY IF EXISTS "RLS audit_logs isolamento" ON public.audit_logs;
CREATE POLICY "RLS audit_logs isolamento" ON public.audit_logs
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
  52428800,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = true;

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

-- =========================================================================
-- 9. SEED DE DADOS (Empresa Master Infocast e Empresa Demo)
-- =========================================================================

-- Inserir Empresa Master 'Infocast' (Dona do SaaS)
INSERT INTO public.companies (id, razao_social, cnpj, status, trial_ends_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Infocast',
    '00.000.000/0001-00',
    'Ativo',
    NOW() + INTERVAL '10 years'
)
ON CONFLICT (id) DO UPDATE SET
    razao_social = 'Infocast',
    status = 'Ativo';

-- Inserir Empresa de Demonstração (Tenant Cliente)
INSERT INTO public.companies (id, razao_social, cnpj, status, trial_ends_at)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'TechLog Logística & Transportes S/A',
    '12.345.678/0001-90',
    'Ativo',
    NOW() + INTERVAL '30 days'
)
ON CONFLICT (id) DO UPDATE SET
    razao_social = EXCLUDED.razao_social,
    cnpj = EXCLUDED.cnpj,
    status = EXCLUDED.status;

-- Inserir Perfis de Usuários (Gestor, Operadores, Clientes)
INSERT INTO public.profiles (id, company_id, nome, email, role, recebe_notificacoes, avatar_url)
VALUES
    (
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        'Carlos Eduardo Santana',
        'carlos.gestor@techlog.com.br',
        'Gestor',
        true,
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
    ),
    (
        'b0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000001',
        'Mariana Silva Rocha',
        'mariana.suporte@techlog.com.br',
        'Operador',
        true,
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80'
    ),
    (
        'b0000000-0000-0000-0000-000000000003',
        'a0000000-0000-0000-0000-000000000001',
        'Rodrigo Mendes',
        'rodrigo.operacoes@techlog.com.br',
        'Operador',
        false,
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80'
    ),
    (
        'b0000000-0000-0000-0000-000000000004',
        'a0000000-0000-0000-0000-000000000001',
        'Distribuidora Alvorada Ltda',
        'compras@alvorada.com.br',
        'Cliente',
        true,
        'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=120&auto=format&fit=crop&q=80'
    ),
    (
        'b0000000-0000-0000-0000-000000000005',
        'a0000000-0000-0000-0000-000000000001',
        'Varejo Express Brasil',
        'contato@varejoexpress.com',
        'Cliente',
        true,
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80'
    )
ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    recebe_notificacoes = EXCLUDED.recebe_notificacoes;

-- Inserir Tickets de Exemplo
INSERT INTO public.tickets (
    id,
    company_id,
    cliente_id,
    operador_id,
    assunto,
    descricao,
    status,
    prioridade,
    resumo_conclusao,
    criado_em
)
VALUES
    (
        'c0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000004',
        'b0000000-0000-0000-0000-000000000002',
        'Instabilidade na emissão de NF-e via API',
        'Clientes relatam erro 504 Gateway Timeout ao tentar emitir notas fiscais pelo gateway integrado no período da tarde.',
        'Em Andamento',
        'Alta',
        NULL,
        NOW() - INTERVAL '45 minutes'
    ),
    (
        'c0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000005',
        NULL,
        'Falha no upload de comprovantes em lote',
        'Ao submeter arquivos PDF com mais de 5MB, o sistema não conclui o processamento assíncrono.',
        'Aberto',
        'Urgente',
        NULL,
        NOW() - INTERVAL '15 minutes'
    ),
    (
        'c0000000-0000-0000-0000-000000000003',
        'a0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000004',
        'b0000000-0000-0000-0000-000000000003',
        'Dúvida sobre permissões de novo operador',
        'Solicitamos orientação sobre as restrições de papéis de usuários entre Gerente e Operador.',
        'Aguardando Cliente',
        'Média',
        NULL,
        NOW() - INTERVAL '3 hours'
    ),
    (
        'c0000000-0000-0000-0000-000000000004',
        'a0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000005',
        'b0000000-0000-0000-0000-000000000001',
        'Configuração de Webhook de Notificações',
        'Webhook homologado e testado com sucesso no endpoint de produção.',
        'Resolvido',
        'Baixa',
        'Endpoint validado com payload de teste e resposta HTTP 200 confirmada.',
        NOW() - INTERVAL '1 day'
    )
ON CONFLICT (id) DO NOTHING;

-- 10. Alterações para Integração Chat4u / Chatwoot e Templates de Comunicação (Fase 10)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS chatwoot_url VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS chatwoot_api_access_token VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS chatwoot_account_id INT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS chatwoot_inbox_id INT;

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

CREATE INDEX IF NOT EXISTS idx_communication_templates_company ON public.communication_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_communication_templates_tipo ON public.communication_templates(tipo);

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

-- Seed de Templates Básicos para Infocast
INSERT INTO public.communication_templates (company_id, tipo, assunto, corpo_mensagem)
VALUES 
(
  '00000000-0000-0000-0000-000000000001',
  'welcome_email',
  'Bem-vindo ao InfoTicket - {{nome_empresa}}',
  'Olá, {{nome_cliente}}!\n\nSeja muito bem-vindo ao portal de atendimento da {{nome_empresa}}.\nSeu acesso foi configurado com sucesso e nossa equipe está à disposição para auxiliá-lo.\n\nAcesse nosso portal a qualquer momento: {{portal_url}}\n\nAtenciosamente,\nEquipe de Suporte {{nome_empresa}}'
),
(
  '00000000-0000-0000-0000-000000000001',
  'new_ticket',
  '[InfoTicket] Chamado Aberto com Sucesso: #{{ticket_id}} - {{assunto}}',
  'Olá, {{nome_cliente}}!\n\nConfirmamos a abertura do seu chamado #{{ticket_id}} sobre "{{assunto}}".\nNossa equipe técnica já foi notificada e o prazo estimado de atendimento (SLA) é de {{sla_prazo}}.\n\nVocê pode acompanhar e interagir diretamente pelo link: {{ticket_link}}\n\nAtenciosamente,\nEquipe {{nome_empresa}}'
),
(
  '00000000-0000-0000-0000-000000000001',
  'status_change',
  '[InfoTicket] Atualização no Chamado #{{ticket_id}}: Status alterado para {{status_atual}}',
  'Olá, {{nome_cliente}}!\n\nInformamos que o status do seu chamado #{{ticket_id}} foi atualizado para: {{status_atual}}.\n\nPara verificar o andamento ou enviar mais informações, acesse: {{ticket_link}}\n\nAtenciosamente,\nEquipe {{nome_empresa}}'
),
(
  '00000000-0000-0000-0000-000000000001',
  'new_message',
  '[InfoTicket] Nova Interação no Chamado #{{ticket_id}}',
  'Olá, {{nome_cliente}}!\n\nHá uma nova mensagem registrada no seu chamado #{{ticket_id}} por {{nome_remetente}}:\n\n"{{mensagem_resumo}}"\n\nResponda diretamente através do portal: {{ticket_link}}\n\nAtenciosamente,\nEquipe {{nome_empresa}}'
),
(
  '00000000-0000-0000-0000-000000000001',
  'csat',
  '[InfoTicket] Como foi seu atendimento no Chamado #{{ticket_id}}?',
  'Olá, {{nome_cliente}}!\n\nSeu chamado #{{ticket_id}} ("{{assunto}}") foi concluído pela nossa equipe.\n\nResumo da Conclusão:\n{{resumo}}\n\nSua opinião é fundamental para melhorarmos continuamente. Por favor, avalie nosso atendimento acessando: {{ticket_link}}\n\nMuito obrigado!\nEquipe {{nome_empresa}}'
)
ON CONFLICT (company_id, tipo) DO UPDATE SET
  assunto = EXCLUDED.assunto,
  corpo_mensagem = EXCLUDED.corpo_mensagem,
  atualizado_em = NOW();

-- 11. Triggers e Funções para Automação de Notificações (Fase 11)
CREATE OR REPLACE FUNCTION public.trigger_ticket_status_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) THEN
    v_payload := jsonb_build_object(
      'ticket_id', NEW.id,
      'company_id', NEW.company_id,
      'event_type', 'status_change',
      'user_id', auth.uid()
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

DROP TRIGGER IF EXISTS trg_tickets_status_change ON public.tickets;
CREATE TRIGGER trg_tickets_status_change
AFTER UPDATE OF status ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ticket_status_notification();

-- Trigger para Notificação de Atribuição de Operador (Fase 12.1)
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

DROP TRIGGER IF EXISTS trg_tickets_operator_assigned ON public.tickets;
CREATE TRIGGER trg_tickets_operator_assigned
AFTER UPDATE OF operador_id ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ticket_assignment_notification();

-- Garante coluna chatwoot_conversation_id na tabela tickets
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS chatwoot_conversation_id INT;

CREATE OR REPLACE FUNCTION public.trigger_ticket_message_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_chatwoot_payload JSONB;
BEGIN
  IF (NEW.is_internal_note = FALSE) THEN
    -- Disparo dedicado para o WhatsApp Oficial via API do Chatwoot quando channel = 'whatsapp'
    IF (NEW.channel = 'whatsapp') THEN
      v_chatwoot_payload := jsonb_build_object(
        'message_id', NEW.id,
        'ticket_id', NEW.ticket_id,
        'company_id', NEW.company_id,
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

    -- Disparo da notificação por e-mail via send-notification
    v_payload := jsonb_build_object(
      'ticket_id', NEW.ticket_id,
      'company_id', NEW.company_id,
      'event_type', 'new_message',
      'message_id', NEW.id,
      'user_id', NEW.user_id
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

DROP TRIGGER IF EXISTS trg_ticket_messages_new_interaction ON public.ticket_messages;
CREATE TRIGGER trg_ticket_messages_new_interaction
AFTER INSERT ON public.ticket_messages
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ticket_message_notification();


