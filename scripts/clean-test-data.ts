/**
 * InfoTicket - Script de Limpeza de Dados de Teste v1.2.0
 * Remove com segurança todos os dados operacionais e de empresas de teste no Supabase:
 * - Remove todos os chamados de teste (tickets, ticket_messages, ticket_attachments) da Infocast
 * - Remove a organização cliente de teste "Casa Eloy"
 * - Remove todos os perfis e usuários do Auth, preservando estritamente "denise@infocast-web.com.br"
 * - Paginação exaustiva para varrer e remover 100% dos usuários fantasmas em auth.users
 * - Preserva a empresa Master "Infocast" e suas configurações (SMTP, Chatwoot/Chat4u)
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
  console.log('🧹 InfoTicket - Iniciando Limpeza de Dados de Teste v1.2.0');
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

    if (!masterProfiles || masterProfiles.length === 0) {
      throw new Error(`Perfil Master "${MASTER_EMAIL}" não encontrado! Abortando para evitar perda de acesso.`);
    }

    const masterUserId = masterProfiles[0].id;
    console.log(`👤 Perfil Master localizado e protegido: ${masterProfiles[0].nome} (${MASTER_EMAIL}, ID: ${masterUserId})`);

    // 1. Remover anexos e mensagens dos tickets
    console.log('\n--- 1. Removendo mensagens e anexos dos chamados de teste ---');
    const { count: attachCount, error: attachErr } = await supabase
      .from('ticket_attachments')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (attachErr) console.warn(`Aviso em ticket_attachments: ${attachErr.message}`);
    else console.log(`✅ Anexos removidos: ${attachCount ?? 0}`);

    const { count: msgCount, error: msgErr } = await supabase
      .from('ticket_messages')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (msgErr) console.warn(`Aviso em ticket_messages: ${msgErr.message}`);
    else console.log(`✅ Mensagens de chamados removidas: ${msgCount ?? 0}`);

    // 2. Remover todos os tickets de teste
    console.log('\n--- 2. Removendo todos os chamados de teste ---');
    const { count: ticketCount, error: ticketErr } = await supabase
      .from('tickets')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (ticketErr) console.warn(`Aviso em tickets: ${ticketErr.message}`);
    else console.log(`✅ Chamados de teste removidos: ${ticketCount ?? 0}`);

    // 3. Remover organização cliente "Casa Eloy"
    console.log('\n--- 3. Removendo organização cliente de teste (Casa Eloy) ---');
    const { count: orgCount, error: orgErr } = await supabase
      .from('client_organizations')
      .delete({ count: 'exact' })
      .ilike('nome', '%Casa Eloy%');
    if (orgErr) console.warn(`Aviso em client_organizations: ${orgErr.message}`);
    else console.log(`✅ Organizações de teste removidas: ${orgCount ?? 0}`);

    // 4. Remover usuários do Supabase Auth (auth.users) exceto denise@infocast-web.com.br
    // Executa varredura com paginação para garantir que todas as contas fantasmas sejam removidas
    console.log('\n--- 4. Removendo contas de teste do Supabase Auth (auth.users) ---');
    let hasMoreUsers = true;
    let page = 1;
    let totalAuthDeleted = 0;

    while (hasMoreUsers) {
      const { data: authList, error: authListErr } = await supabase.auth.admin.listUsers({
        page: page,
        perPage: 100,
      });

      if (authListErr) {
        console.warn(`Aviso ao listar auth.users (página ${page}): ${authListErr.message}`);
        break;
      }

      if (!authList || !authList.users || authList.users.length === 0) {
        hasMoreUsers = false;
        break;
      }

      let deletedInBatch = 0;
      for (const authUser of authList.users) {
        const userEmail = (authUser.email || '').trim().toLowerCase();
        if (userEmail !== MASTER_EMAIL.toLowerCase()) {
          console.log(`Removendo auth user: ${authUser.email} (ID: ${authUser.id})...`);
          const { error: delErr } = await supabase.auth.admin.deleteUser(authUser.id);
          if (delErr) {
            console.warn(`  ⚠️ Falha ao excluir auth user ${authUser.email}: ${delErr.message}`);
          } else {
            totalAuthDeleted++;
            deletedInBatch++;
          }
        }
      }

      // Se não removeu ninguém no lote (apenas continha a Denise), avança a página
      if (deletedInBatch === 0 || authList.users.length < 100) {
        if (authList.users.length < 100) {
          hasMoreUsers = false;
        } else {
          page++;
        }
      }
    }
    console.log(`✅ Total de usuários removidos do Supabase Auth: ${totalAuthDeleted}`);

    // 5. Remover perfis de teste da tabela profiles (exceto denise@infocast-web.com.br)
    console.log('\n--- 5. Removendo perfis de usuários de teste na tabela profiles ---');
    console.log(`Preservando estritamente: ${MASTER_EMAIL}`);
    const { count: profCount, error: profErr } = await supabase
      .from('profiles')
      .delete({ count: 'exact' })
      .neq('email', MASTER_EMAIL);

    if (profErr) {
      console.error(`❌ Erro ao excluir perfis de teste: ${profErr.message}`);
    } else {
      console.log(`✅ Perfis de teste removidos de public.profiles: ${profCount ?? 0}`);
    }

    // 6. Remover empresas que não sejam "Infocast"
    console.log('\n--- 6. Removendo eventuais outras empresas de teste ---');
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
    console.log('🎉 Limpeza concluída com sucesso!');
    console.log(`Preservada: Empresa Infocast e perfil ${MASTER_EMAIL}`);
    console.log('=====================================================');

  } catch (error: any) {
    console.error('\n❌ Erro durante o processo de limpeza:', error.message || error);
    process.exit(1);
  }
}

cleanTestData();

