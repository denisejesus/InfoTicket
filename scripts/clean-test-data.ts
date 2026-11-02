/**
 * InfoTicket - Script de Limpeza de Dados de Teste v1.0.0
 * Remove com segurança todos os dados operacionais e de empresas de teste no Supabase,
 * preservando estritamente a empresa Master "Infocast" e o perfil master de "denise@infocast-web.com.br".
 * 
 * Execução: npm run db:clean
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// Polyfill para WebSocket no Node < 22 caso necessário pelo realtime-js
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class DummyWebSocket {} as any;
}

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

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Configurações do Supabase ausentes no .env (VITE_SUPABASE_URL ou VITE_SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MASTER_EMAIL = 'denise@infocast-web.com.br';
const MASTER_COMPANY_NAME = 'Infocast';

async function cleanTestData() {
  console.log('=====================================================');
  console.log('🧹 InfoTicket - Iniciando Limpeza de Dados de Teste');
  console.log('=====================================================');

  try {
    // a) Localizar a empresa master "Infocast"
    console.log(`\n🔍 Localizando empresa Master "${MASTER_COMPANY_NAME}"...`);
    const { data: companies, error: compErr } = await supabase
      .from('companies')
      .select('id, razao_social')
      .ilike('razao_social', `%${MASTER_COMPANY_NAME}%`);

    if (compErr || !companies || companies.length === 0) {
      throw new Error(`Empresa Master "${MASTER_COMPANY_NAME}" não encontrada no banco de dados! Abortando por segurança.`);
    }

    const masterCompany = companies.find(c => c.razao_social.trim().toLowerCase() === MASTER_COMPANY_NAME.toLowerCase()) || companies[0];
    const masterCompanyId = masterCompany.id;

    console.log(`✅ Empresa Master identificada: ${masterCompany.razao_social} (ID: ${masterCompanyId})`);

    // Validação de segurança para garantir a existência do perfil Master
    const { data: masterProfiles } = await supabase
      .from('profiles')
      .select('id, email, nome')
      .eq('email', MASTER_EMAIL);

    console.log(`👤 Perfil Master localizado: ${masterProfiles?.length || 0} conta(s) com e-mail ${MASTER_EMAIL}`);

    // b & c) Excluir dados operacionais que NÃO pertençam à Infocast respeitando a ordem de FKs
    console.log('\n--- Removendo registros operacionais de teste (company_id != Master) ---');

    // 1. audit_logs
    process.stdout.write('1. Excluindo audit_logs de teste... ');
    const { count: auditCount, error: auditErr } = await supabase
      .from('audit_logs')
      .delete({ count: 'exact' })
      .neq('company_id', masterCompanyId);
    if (auditErr) console.warn(`Aviso em audit_logs: ${auditErr.message}`);
    else console.log(`Removidos: ${auditCount ?? 0}`);

    // 2. ticket_attachments
    process.stdout.write('2. Excluindo ticket_attachments de teste... ');
    const { count: attachCount, error: attachErr } = await supabase
      .from('ticket_attachments')
      .delete({ count: 'exact' })
      .neq('company_id', masterCompanyId);
    if (attachErr) console.warn(`Aviso em ticket_attachments: ${attachErr.message}`);
    else console.log(`Removidos: ${attachCount ?? 0}`);

    // 3. ticket_messages
    process.stdout.write('3. Excluindo ticket_messages de teste... ');
    const { count: msgCount, error: msgErr } = await supabase
      .from('ticket_messages')
      .delete({ count: 'exact' })
      .neq('company_id', masterCompanyId);
    if (msgErr) console.warn(`Aviso em ticket_messages: ${msgErr.message}`);
    else console.log(`Removidos: ${msgCount ?? 0}`);

    // 4. tickets
    process.stdout.write('4. Excluindo tickets de teste... ');
    const { count: ticketCount, error: ticketErr } = await supabase
      .from('tickets')
      .delete({ count: 'exact' })
      .neq('company_id', masterCompanyId);
    if (ticketErr) console.warn(`Aviso em tickets: ${ticketErr.message}`);
    else console.log(`Removidos: ${ticketCount ?? 0}`);

    // 5. macros (se existir)
    process.stdout.write('5. Excluindo macros de teste... ');
    const { count: macroCount, error: macroErr } = await supabase
      .from('macros')
      .delete({ count: 'exact' })
      .neq('company_id', masterCompanyId);
    if (macroErr) console.warn(`Aviso em macros: ${macroErr.message}`);
    else console.log(`Removidos: ${macroCount ?? 0}`);

    // 6. chatwoot_channels
    process.stdout.write('6. Excluindo chatwoot_channels de teste... ');
    const { count: channelCount, error: channelErr } = await supabase
      .from('chatwoot_channels')
      .delete({ count: 'exact' })
      .neq('company_id', masterCompanyId);
    if (channelErr) console.warn(`Aviso em chatwoot_channels: ${channelErr.message}`);
    else console.log(`Removidos: ${channelCount ?? 0}`);

    // 7. communication_templates
    process.stdout.write('7. Excluindo communication_templates de empresas de teste... ');
    const { count: templateCount, error: templateErr } = await supabase
      .from('communication_templates')
      .delete({ count: 'exact' })
      .neq('company_id', masterCompanyId);
    if (templateErr) console.warn(`Aviso em communication_templates: ${templateErr.message}`);
    else console.log(`Removidos: ${templateCount ?? 0}`);

    // 8. client_organizations
    process.stdout.write('8. Excluindo client_organizations de teste... ');
    const { count: orgCount, error: orgErr } = await supabase
      .from('client_organizations')
      .delete({ count: 'exact' })
      .neq('company_id', masterCompanyId);
    if (orgErr) console.warn(`Aviso em client_organizations: ${orgErr.message}`);
    else console.log(`Removidos: ${orgCount ?? 0}`);

    // d) Excluir perfis de teste da tabela profiles
    console.log('\n--- Removendo perfis de usuários de teste ---');
    console.log(`Preservando estritamente: ${MASTER_EMAIL} e usuários vinculados à empresa Master.`);

    const { count: profCount, error: profErr } = await supabase
      .from('profiles')
      .delete({ count: 'exact' })
      .neq('email', MASTER_EMAIL)
      .neq('company_id', masterCompanyId);

    if (profErr) {
      console.error(`❌ Erro ao excluir perfis de teste: ${profErr.message}`);
    } else {
      console.log(`✅ Perfis de teste removidos: ${profCount ?? 0}`);
    }

    // e) Excluir empresas que não sejam "Infocast"
    console.log('\n--- Removendo empresas de teste ---');
    const { count: compDeleteCount, error: compDelErr } = await supabase
      .from('companies')
      .delete({ count: 'exact' })
      .neq('id', masterCompanyId);

    if (compDelErr) {
      console.error(`❌ Erro ao excluir empresas de teste: ${compDelErr.message}`);
    } else {
      console.log(`✅ Empresas de teste removidas: ${compDeleteCount ?? 0}`);
    }

    console.log('\n=====================================================');
    console.log('🎉 Dados de teste removidos com sucesso. Infocast mantida.');
    console.log('=====================================================');

  } catch (error: any) {
    console.error('\n❌ Erro durante o processo de limpeza:', error.message || error);
    process.exit(1);
  }
}

cleanTestData();
