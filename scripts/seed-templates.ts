/**
 * InfoTicket - Seed de Templates Padrão de Comunicação (v1.21.0)
 * Inicializa os templates padrão na tabela public.communication_templates
 * com suporte completo a variáveis dinâmicas de contexto
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

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://vrkhkifhkztttukuxbwz.supabase.co';
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

if (!serviceRoleKey) {
  console.error('❌ VITE_SUPABASE_SERVICE_ROLE_KEY não encontrada no .env');
  process.exit(1);
}

if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = class DummyWebSocket {};
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { createClient: () => null as any },
});

function getEmailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0f172a; padding: 24px 32px; text-align: left; border-bottom: 2px solid #3b82f6; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
    .body { padding: 32px; font-size: 15px; line-height: 1.6; color: #334155; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; margin-top: 16px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2); }
    .info-box { background: #f1f5f9; border-left: 4px solid #2563eb; padding: 14px 18px; border-radius: 6px; margin: 18px 0; }
    .footer { background: #f8fafc; padding: 20px 32px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>{{nome_empresa}}</h1>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p style="margin: 0;">Este é um e-mail automático gerado pelo sistema InfoTicket. Por favor, não responda diretamente a esta mensagem.</p>
    </div>
  </div>
</body>
</html>`;
}

// 1. Template: Nova Interação / Mensagem
const newInteractionHtml = getEmailWrapper(`
  <p>Olá {{nome_cliente}},</p>
  <p>Uma nova interação foi registrada no seu chamado <b>#{{ticket_id}}</b> ("{{assunto}}").</p>
  
  <div class="info-box">
    <b>Status: {{status}}</b><br>
    <span style="font-size: 13px; color: #475569;">Autor da Mensagem: {{nome_remetente}}</span>
    <p style="margin: 10px 0 0 0; font-style: italic; color: #1e293b;">"{{mensagem_resumo}}"</p>
  </div>

  <p>Para visualizar todos os detalhes ou responder à mensagem, clique no botão abaixo:</p>
  <p style="text-align: center; margin: 28px 0;">
    <a href="{{link_chamado}}" class="btn">Ver Chamado</a>
  </p>

  <p style="margin-top: 24px; font-size: 14px; color: #64748b;">
    Atenciosamente,<br>
    <b>Equipe de Atendimento {{nome_empresa}}</b>
  </p>
`);

// 2. Template: Criação de Usuário / Boas-Vindas
const welcomeEmailHtml = getEmailWrapper(`
  <p>Olá {{nome_cliente}},</p>
  <p>Seu acesso ao portal de atendimento <b>InfoTicket</b> foi criado com sucesso pela empresa <b>{{nome_empresa}}</b>.</p>
  
  <div class="info-box">
    <p style="margin: 0 0 8px 0;"><b>Seus dados de acesso:</b></p>
    <div><b>E-mail:</b> {{email_cliente}}</div>
    <div><b>Senha temporária:</b> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #0f172a;">{{senha_temporaria}}</code></div>
  </div>

  <p>Recomendamos que você acesse a plataforma e altere sua senha no primeiro login para garantir a segurança da sua conta.</p>
  
  <p style="text-align: center; margin: 28px 0;">
    <a href="{{link_chamado}}" class="btn">Acessar Portal InfoTicket</a>
  </p>

  <p style="margin-top: 24px; font-size: 14px; color: #64748b;">
    Atenciosamente,<br>
    <b>Equipe de Suporte {{nome_empresa}}</b>
  </p>
`);

// 3. Template: Alteração de Status
const statusChangeHtml = getEmailWrapper(`
  <p>Olá {{nome_cliente}},</p>
  <p>O status do seu chamado <b>#{{ticket_id}}</b> ("{{assunto}}") foi atualizado.</p>
  
  <div class="info-box">
    <p style="margin: 0; font-size: 16px;"><b>Status: {{status}}</b></p>
    <p style="margin: 6px 0 0 0; font-size: 13px; color: #475569;">Prioridade: <b>{{prioridade}}</b> | Prazo SLA: <b>{{sla_prazo}}</b></p>
  </div>

  <p>Você pode acompanhar o andamento da sua solicitação em tempo real diretamente pelo portal:</p>
  <p style="text-align: center; margin: 28px 0;">
    <a href="{{link_chamado}}" class="btn">Ver Chamado</a>
  </p>

  <p style="margin-top: 24px; font-size: 14px; color: #64748b;">
    Atenciosamente,<br>
    <b>Equipe de Atendimento {{nome_empresa}}</b>
  </p>
`);

// 4. Template: Abertura de Chamado
const newTicketHtml = getEmailWrapper(`
  <p>Olá {{nome_cliente}},</p>
  <p>Confirmamos a abertura da sua solicitação <b>#{{ticket_id}}</b> ("{{assunto}}").</p>
  
  <div class="info-box">
    <b>Status: {{status}}</b><br>
    <span style="font-size: 13px; color: #475569;">Prazo Estimado (SLA): <b>{{sla_prazo}}</b> | Prioridade: <b>{{prioridade}}</b></span>
  </div>

  <p>Nossa equipe técnica já foi acionada. Clique no botão abaixo para acompanhar:</p>
  <p style="text-align: center; margin: 28px 0;">
    <a href="{{link_chamado}}" class="btn">Ver Chamado</a>
  </p>

  <p style="margin-top: 24px; font-size: 14px; color: #64748b;">
    Atenciosamente,<br>
    <b>Equipe de Atendimento {{nome_empresa}}</b>
  </p>
`);

async function runSeedTemplates() {
  console.log('🚀 [InfoTicket v1.18.3] Semeando templates HTML profissionais...');

  try {
    // 1. Busca todas as empresas
    const { data: companies, error: compError } = await supabase
      .from('companies')
      .select('id, razao_social');

    if (compError) {
      throw new Error(`Erro ao buscar companies: ${compError.message}`);
    }

    if (!companies || companies.length === 0) {
      console.log('⚠️ Nenhuma empresa encontrada.');
      return;
    }

    console.log(`📋 Encontradas ${companies.length} empresa(s) no sistema.`);

    // 2. Insere/atualiza os templates para cada empresa
    for (const comp of companies) {
      console.log(`🏢 Semeando templates para: ${comp.razao_social} (${comp.id})`);

      const templates = [
        {
          company_id: comp.id,
          tipo: 'welcome_email',
          assunto: 'Bem-vindo ao InfoTicket - {{nome_empresa}}',
          corpo_mensagem: welcomeEmailHtml,
        },
        {
          company_id: comp.id,
          tipo: 'new_ticket',
          assunto: '[InfoTicket] Chamado Aberto: #{{ticket_id}} - {{assunto}}',
          corpo_mensagem: newTicketHtml,
        },
        {
          company_id: comp.id,
          tipo: 'status_change',
          assunto: '[InfoTicket] Atualização de Status: Chamado #{{ticket_id}}',
          corpo_mensagem: statusChangeHtml,
        },
        {
          company_id: comp.id,
          tipo: 'new_message',
          assunto: '[InfoTicket] Nova Interação no Chamado #{{ticket_id}}',
          corpo_mensagem: newInteractionHtml,
        },
      ];

      for (const tpl of templates) {
        const { error: upsertErr } = await supabase
          .from('communication_templates')
          .upsert(
            {
              ...tpl,
              atualizado_em: new Date().toISOString(),
            },
            { onConflict: 'company_id,tipo' }
          );

        if (upsertErr) {
          console.warn(`  ⚠️ Erro ao inserir template ${tpl.tipo}:`, upsertErr.message);
        } else {
          console.log(`  ✅ Template '${tpl.tipo}' gravado com sucesso.`);
        }
      }
    }

    console.log('🎉 [InfoTicket v1.18.3] Todos os templates HTML foram semeados com sucesso!');
  } catch (error: any) {
    console.error('❌ Erro ao semear templates de comunicação:', error.message);
    process.exit(1);
  }
}

runSeedTemplates();
