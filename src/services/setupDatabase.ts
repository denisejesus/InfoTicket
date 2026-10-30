import { supabase } from '../lib/supabase';
const supabaseAdmin = supabase;

export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    cnpj VARCHAR(20) UNIQUE,
    status_trial VARCHAR(50) DEFAULT 'ativo',
    data_vencimento TIMESTAMPTZ,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Super Admin', 'Gestor', 'Gerente', 'Operador', 'Cliente')),
    avatar_url TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_company ON public.tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_cliente ON public.tickets(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tickets_operador ON public.tickets(operador_id);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Acesso a companies') THEN
    CREATE POLICY "Acesso a companies" ON public.companies FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Acesso a profiles') THEN
    CREATE POLICY "Acesso a profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Acesso a tickets') THEN
    CREATE POLICY "Acesso a tickets" ON public.tickets FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;
`;

export interface SetupResult {
  success: boolean;
  message: string;
  details?: any;
}

/**
 * Executa o setup das tabelas usando a API de Gestão do Supabase (SQL API)
 */
export async function runDatabaseSetup(): Promise<SetupResult> {
  const managementToken = import.meta.env.VITE_SUPABASE_MANAGEMENT_TOKEN;
  const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_REF || 'vrkhkifhkztttukuxbwz';

  if (!managementToken) {
    return {
      success: false,
      message: 'Token de gerenciamento do Supabase (VITE_SUPABASE_MANAGEMENT_TOKEN) não configurado.',
    };
  }

  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${managementToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: SCHEMA_SQL }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        success: false,
        message: `Falha ao executar query via Supabase Management API: ${response.statusText}`,
        details: errData,
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: 'Tabelas multi-tenant (companies, profiles, tickets) criadas com sucesso!',
      details: data,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Erro inesperado ao executar o setup do banco de dados.',
      details: error,
    };
  }
}

/**
 * Verifica o status de conexão com o Supabase e checa se as tabelas existem
 */
export async function checkDatabaseHealth() {
  try {
    const { data: companies, error: compErr } = await supabase.from('companies').select('id').limit(1);
    const { data: profiles, error: profErr } = await supabase.from('profiles').select('id').limit(1);
    const { data: tickets, error: tickErr } = await supabase.from('tickets').select('id').limit(1);

    return {
      connected: !compErr && !profErr && !tickErr,
      companiesExists: !compErr,
      profilesExists: !profErr,
      ticketsExists: !tickErr,
      errors: {
        companies: compErr?.message,
        profiles: profErr?.message,
        tickets: tickErr?.message,
      },
    };
  } catch (err: any) {
    return {
      connected: false,
      companiesExists: false,
      profilesExists: false,
      ticketsExists: false,
      error: err.message,
    };
  }
}

/**
 * Cria dados de demonstração (seed) para o primeiro tenant
 */
export async function seedDemoData(): Promise<SetupResult> {
  try {
    // 1. Criar ou obter Empresa Demo
    let { data: company, error: compError } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('cnpj', '12.345.678/0001-90')
      .maybeSingle();

    if (!company) {
      const { data: newComp, error: insertCompError } = await supabaseAdmin
        .from('companies')
        .insert({
          nome: 'Acme Corporação Brasil',
          cnpj: '12.345.678/0001-90',
          status_trial: 'ativo',
          data_vencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (insertCompError) throw insertCompError;
      company = newComp;
    }

    if (!company) throw new Error('Não foi possível obter a empresa para o seed.');

    // 2. Criar ou obter Perfis Demo
    const mockProfiles = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        company_id: company.id,
        nome: 'Carlos Eduardo',
        email: 'carlos.admin@acme.com',
        role: 'Gestor',
        avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        company_id: company.id,
        nome: 'Mariana Silva',
        email: 'mariana.suporte@acme.com',
        role: 'Operador',
        avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        company_id: company.id,
        nome: 'TechLog Soluções',
        email: 'contato@techlog.com.br',
        role: 'Cliente',
        avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
      },
    ];

    for (const p of mockProfiles) {
      await supabaseAdmin.from('profiles').upsert(p, { onConflict: 'id' });
    }

    // 3. Criar Chamados Demo
    const mockTickets = [
      {
        company_id: company.id,
        cliente_id: '33333333-3333-3333-3333-333333333333',
        operador_id: '22222222-2222-2222-2222-222222222222',
        assunto: 'Instabilidade na emissão de NF-e via API',
        descricao: 'Clientes relatam timeout ao tentar emitir notas fiscais pelo gateway integrado no período das 14h.',
        status: 'em_andamento',
        prioridade: 'alta',
      },
      {
        company_id: company.id,
        cliente_id: '33333333-3333-3333-3333-333333333333',
        operador_id: '22222222-2222-2222-2222-222222222222',
        assunto: 'Dúvida sobre permissões de novo operador',
        descricao: 'Precisamos conceder acesso a um novo analista sem permissão de exclusão de chamados.',
        status: 'aberto',
        prioridade: 'media',
      },
      {
        company_id: company.id,
        cliente_id: '33333333-3333-3333-3333-333333333333',
        operador_id: '11111111-1111-1111-1111-111111111111',
        assunto: 'Integração Webhook do canal de atendimento',
        descricao: 'Configuração concluída com sucesso no endpoint de homologação.',
        status: 'resolvido',
        prioridade: 'baixa',
        resumo_conclusao: 'Webhook validado e testado com 100% de entregas registradas.',
      },
    ];

    for (const t of mockTickets) {
      await (supabaseAdmin.from('tickets') as any).insert(t);
    }

    return {
      success: true,
      message: 'Dados demonstrativos inseridos com sucesso!',
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Erro ao inserir dados de demonstração.',
      details: error,
    };
  }
}
