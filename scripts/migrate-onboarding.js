import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const MIGRATION_SQL = `
-- Adicionar colunas de endereço na tabela companies caso não existam
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS cep VARCHAR(15);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS numero VARCHAR(30);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS complemento VARCHAR(150);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS bairro VARCHAR(100);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS cidade VARCHAR(100);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS estado VARCHAR(10);

-- Adicionar coluna whatsapp na tabela profiles caso não exista
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30);

-- Garantir que a policy de insert em companies e profiles permita o cadastro público via anon/auth
DROP POLICY IF EXISTS "Cadastro publico companies" ON public.companies;
CREATE POLICY "Cadastro publico companies" ON public.companies
FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Cadastro publico profiles" ON public.profiles;
CREATE POLICY "Cadastro publico profiles" ON public.profiles
FOR INSERT WITH CHECK (true);
`;

async function runMigration() {
  console.log('🚀 [InfoTicket] Aplicando migração da Fase 2 (Onboarding - Endereço e WhatsApp)...');
  console.log(`📡 Project Ref: ${projectRef}`);

  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${managementToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: MIGRATION_SQL }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Falha na API Supabase: ${err}`);
    }

    console.log('✅ [InfoTicket] Colunas de endereço em "companies" e "whatsapp" em "profiles" criadas/atualizadas com sucesso!');
    console.log('✅ [InfoTicket] Políticas de RLS para cadastro público habilitadas.');
    console.log('🎉 Migração da Fase 2 concluída!');
  } catch (error) {
    console.error('❌ [InfoTicket] Erro na migração:', error.message);
    process.exit(1);
  }
}

runMigration();
