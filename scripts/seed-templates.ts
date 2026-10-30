/**
 * InfoTicket - Seed de Templates Padrão de Comunicação (v1.11.1)
 * Insere na tabela communication_templates os 3 modelos básicos requeridos:
 * 1. Abertura (new_ticket)
 * 2. Mudança de Status (status_change)
 * 3. Nova Mensagem (new_message)
 * Utilizando estritamente as variáveis {{nome_cliente}} e {{ticket_id}}
 */
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

async function executeSql(sql: string) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${managementToken}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro na API do Supabase (${response.status}): ${errorText}`);
  }

  return await response.json();
}

async function runSeedTemplates() {
  console.log('🚀 [InfoTicket] Iniciando Seed de Templates Básicos de Comunicação (v1.11.1)...');

  try {
    // 1. Obtém as empresas existentes no banco
    const companies = await executeSql(`SELECT id, razao_social FROM public.companies;`);
    
    if (!companies || companies.length === 0) {
      console.log('⚠️ Nenhuma empresa encontrada. Utilizando ID padrão da Master Infocast.');
    } else {
      console.log(`📋 Encontradas ${companies.length} empresa(s) no sistema.`);
    }

    // 2. Query SQL para semear os 3 modelos básicos para TODAS as empresas ativas
    // Modelo 1: Abertura (new_ticket)
    // Modelo 2: Mudança de Status (status_change)
    // Modelo 3: Nova Mensagem (new_message)
    const seedSql = `
      -- Inserção ou atualização dos 3 templates padrão para cada empresa cadastrada
      DO $$
      DECLARE
          c RECORD;
      BEGIN
          FOR c IN SELECT id, razao_social FROM public.companies LOOP
              -- 1. Modelo de Abertura de Chamado (Novo Chamado)
              INSERT INTO public.communication_templates (company_id, tipo, assunto, corpo_mensagem)
              VALUES (
                  c.id,
                  'new_ticket',
                  'Chamado #{{ticket_id}} Aberto',
                  'Olá {{nome_cliente}}, recebemos a sua solicitação com o identificador #{{ticket_id}}.\n\nNossa equipe técnica já está analisando o caso e dará retorno em breve.\n\nAtenciosamente,\nEquipe de Atendimento'
              )
              ON CONFLICT (company_id, tipo) DO UPDATE SET
                  assunto = EXCLUDED.assunto,
                  corpo_mensagem = EXCLUDED.corpo_mensagem,
                  atualizado_em = NOW();

              -- 2. Modelo de Mudança de Status
              INSERT INTO public.communication_templates (company_id, tipo, assunto, corpo_mensagem)
              VALUES (
                  c.id,
                  'status_change',
                  'Atualização: Chamado #{{ticket_id}}',
                  'Olá {{nome_cliente}}, o seu chamado mudou para o estado: {{status_atual}}.\n\nEstamos trabalhando para concluir o atendimento o mais rápido possível.\n\nAtenciosamente,\nEquipe de Atendimento'
              )
              ON CONFLICT (company_id, tipo) DO UPDATE SET
                  assunto = EXCLUDED.assunto,
                  corpo_mensagem = EXCLUDED.corpo_mensagem,
                  atualizado_em = NOW();

              -- 3. Modelo de Nova Mensagem
              INSERT INTO public.communication_templates (company_id, tipo, assunto, corpo_mensagem)
              VALUES (
                  c.id,
                  'new_message',
                  'Nova interação no chamado #{{ticket_id}}',
                  'Olá {{nome_cliente}}, há uma nova mensagem da nossa equipa no chamado #{{ticket_id}}.\n\nPor favor aceda ao portal para verificar os detalhes da resposta.\n\nAtenciosamente,\nEquipe de Atendimento'
              )
              ON CONFLICT (company_id, tipo) DO UPDATE SET
                  assunto = EXCLUDED.assunto,
                  corpo_mensagem = EXCLUDED.corpo_mensagem,
                  atualizado_em = NOW();

          END LOOP;
      END $$;
    `;

    console.log('⏳ Gravando templates padrão com as tags {{nome_cliente}} e {{ticket_id}}...');
    await executeSql(seedSql);

    console.log('✅ [InfoTicket] Templates de Abertura, Mudança de Status e Nova Mensagem semeados com sucesso!');
  } catch (error: any) {
    console.error('❌ Erro ao semear templates de comunicação:', error.message);
    process.exit(1);
  }
}

runSeedTemplates();
