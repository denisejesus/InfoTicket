import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.10.0";

/**
 * InfoTicket - Send Notification Edge Function v1.18.4
 * Motor assíncrono para interpolação de templates e disparo de notificações por E-mail Multi-Tenant
 * Consulta credenciais SMTP corporativas da tabela `companies` com base no `company_id`
 * Renderiza templates HTML profissionais mapeados da tabela `communication_templates`
 * Suporte a envio oficial direto via SMTP (Host, Porta, Usuário, Senha, From Email, From Name)
 * Suporte automático a ambiente local (Inbucket porta 54324)
 * Configuração dinâmica de TLS/SSL (Porta 465 SSL, Porta 587/outras com requireTLS)
 * Isolamento de falhas de envio: erros de SMTP não travam o fluxo do usuário (HTTP 200)
 * Auditoria com registro de falhas e sucessos em `audit_logs`
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type NotificationEventType = 
  | "welcome_email" 
  | "new_ticket" 
  | "novo_chamado"
  | "status_change" 
  | "mudanca_status"
  | "new_message" 
  | "nova_mensagem"
  | "ticket_atribuido"
  | "csat";

interface NotificationPayload {
  ticket_id?: string;
  company_id?: string;
  event_type: NotificationEventType;
  user_id?: string;
  recipient_email?: string;
  recipient_name?: string;
  temp_password?: string;
  message_id?: string;
  custom_data?: Record<string, string>;
}

// Layout HTML de fallback caso a empresa ainda não tenha template cadastrado
function getDefaultHtmlWrapper(companyName: string, innerHtml: string): string {
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
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; margin-top: 16px; }
    .info-box { background: #f1f5f9; border-left: 4px solid #2563eb; padding: 14px 18px; border-radius: 6px; margin: 18px 0; }
    .footer { background: #f8fafc; padding: 20px 32px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${companyName}</h1>
    </div>
    <div class="body">
      ${innerHtml}
    </div>
    <div class="footer">
      <p style="margin: 0;">Este é um e-mail automático gerado pelo sistema InfoTicket.</p>
    </div>
  </div>
</body>
</html>`;
}

serve(async (req: Request) => {
  // Tratamento de pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const supabase = (supabaseUrl && supabaseServiceRoleKey)
    ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } })
    : null;

  let currentCompanyId: string | null = null;
  let currentTicketId: string | null = null;
  let currentUserId: string | null = null;
  let normalizedEventType: NotificationEventType = "new_ticket";

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Método não permitido. Utilize POST." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: NotificationPayload = await req.json();
    console.log("📨 [Send Notification v1.18.4] Payload recebido:", JSON.stringify(payload));

    const { ticket_id, company_id, event_type, user_id } = payload;
    currentCompanyId = company_id || null;
    currentTicketId = ticket_id || null;
    currentUserId = user_id || null;

    if (!event_type) {
      return new Response(
        JSON.stringify({ error: "Parâmetro obrigatório ausente: event_type." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!supabase) {
      console.error("❌ Credenciais do Supabase ausentes no ambiente.");
      return new Response(
        JSON.stringify({ error: "Configuração do servidor incompleta (SUPABASE_URL / SERVICE_ROLE)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normaliza o event_type
    normalizedEventType = (
      event_type === "novo_chamado" ? "new_ticket" :
      event_type === "mudanca_status" ? "status_change" :
      event_type === "nova_mensagem" ? "new_message" :
      event_type
    );

    let recipientEmails: string[] = [];
    let finalAssunto = "";
    let finalCorpo = "";
    let companyName = "InfoTicket";

    const appUrl = Deno.env.get("PUBLIC_APP_URL") || "https://infoticket.app";

    // -------------------------------------------------------------
    // CASO 1: BOAS-VINDAS / CRIAÇÃO DE USUÁRIO (welcome_email)
    // -------------------------------------------------------------
    if (normalizedEventType === "welcome_email") {
      let targetUserEmail = payload.recipient_email;
      let targetUserName = payload.recipient_name || "Cliente";

      // Se passou user_id, busca o perfil para obter tenant e dados cadastrais
      if (user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, nome, email, company_id, company:companies(id, razao_social)")
          .eq("id", user_id)
          .maybeSingle();

        if (profile) {
          targetUserEmail = targetUserEmail || profile.email;
          targetUserName = targetUserName || profile.nome;
          currentCompanyId = currentCompanyId || profile.company_id;
          companyName = (profile.company as any)?.razao_social || companyName;
        }
      }

      if (!targetUserEmail) {
        throw new Error("Destinatário de e-mail não informado para evento welcome_email.");
      }

      recipientEmails = [targetUserEmail];

      // Template padrão HTML
      let templateAssunto = `Bem-vindo ao InfoTicket - {{nome_empresa}}`;
      let templateCorpo = getDefaultHtmlWrapper("{{nome_empresa}}", `
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

      if (currentCompanyId) {
        const { data: tpl } = await supabase
          .from("communication_templates")
          .select("*")
          .eq("company_id", currentCompanyId)
          .eq("tipo", "welcome_email")
          .maybeSingle();

        if (tpl?.assunto) templateAssunto = tpl.assunto;
        if (tpl?.corpo_mensagem) templateCorpo = tpl.corpo_mensagem;
      }

      const tempPass = payload.temp_password || payload.custom_data?.senha || "Acesso inicial configurado pelo administrador";
      const vars: Record<string, string> = {
        "{{nome_cliente}}": targetUserName,
        "{{email_cliente}}": targetUserEmail,
        "{{nome_empresa}}": companyName,
        "{{senha_temporaria}}": tempPass,
        "{{portal_url}}": appUrl,
        "{{link_chamado}}": appUrl,
        "{{ticket_link}}": appUrl,
        ...(payload.custom_data || {}),
      };

      finalAssunto = templateAssunto;
      finalCorpo = templateCorpo;
      for (const [k, v] of Object.entries(vars)) {
        finalAssunto = finalAssunto.replaceAll(k, v);
        finalCorpo = finalCorpo.replaceAll(k, v);
      }

    } else {
      // -------------------------------------------------------------
      // CASO 2: NOTIFICAÇÕES VINCULADAS A TICKET (new_message, status_change, new_ticket, etc.)
      // -------------------------------------------------------------
      if (!ticket_id) {
        return new Response(
          JSON.stringify({ error: "Parâmetro ticket_id obrigatório para este evento." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Busca dados completos do chamado
      let ticketQuery = supabase
        .from("tickets")
        .select(`
          *,
          cliente:profiles!tickets_cliente_id_fkey(id, nome, email, recebe_notificacoes),
          operador:profiles!tickets_operador_id_fkey(id, nome, email, recebe_notificacoes),
          company:companies(id, razao_social)
        `)
        .eq("id", ticket_id);

      if (company_id) {
        ticketQuery = ticketQuery.eq("company_id", company_id);
      }

      const { data: ticket, error: ticketError } = await ticketQuery.single();

      if (ticketError || !ticket) {
        console.warn(`⚠️ Chamado #${ticket_id} não encontrado:`, ticketError?.message);
        return new Response(
          JSON.stringify({ error: "Chamado não encontrado." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      currentCompanyId = ticket.company_id;
      companyName = ticket.company?.razao_social || companyName;

      // Busca o template customizado na tabela communication_templates
      const { data: template } = await supabase
        .from("communication_templates")
        .select("*")
        .eq("company_id", ticket.company_id)
        .eq("tipo", normalizedEventType)
        .maybeSingle();

      const ticketShortId = ticket.id.substring(0, 8);
      const ticketLink = `${appUrl}/tickets/${ticket.id}`;

      // Monta defaults em HTML caso a tabela não tenha o registro
      let defaultTemplateAssunto = `[InfoTicket] Atualização no Chamado #${ticketShortId} - {{assunto}}`;
      let defaultTemplateCorpo = getDefaultHtmlWrapper("{{nome_empresa}}", `
        <p>Olá {{nome_cliente}},</p>
        <p>Houve uma atualização no seu chamado <b>#{{ticket_id}}</b> ("{{assunto}}").</p>
        <div class="info-box">
          <b>Status: {{status}}</b>
        </div>
        <p>Acesse o chamado para conferir os detalhes:</p>
        <p style="text-align: center; margin: 28px 0;">
          <a href="{{link_chamado}}" class="btn">Ver Chamado</a>
        </p>
        <p style="margin-top: 24px; font-size: 14px; color: #64748b;">
          Atenciosamente,<br>
          <b>Equipe {{nome_empresa}}</b>
        </p>
      `);

      if (normalizedEventType === "new_message") {
        defaultTemplateAssunto = `[InfoTicket] Nova Interação no Chamado #${ticketShortId}`;
        defaultTemplateCorpo = getDefaultHtmlWrapper("{{nome_empresa}}", `
          <p>Olá {{nome_cliente}},</p>
          <p>Uma nova interação foi registrada no seu chamado <b>#{{ticket_id}}</b> ("{{assunto}}").</p>
          <div class="info-box">
            <b>Status: {{status}}</b><br>
            <span style="font-size: 13px; color: #475569;">Autor: {{nome_remetente}}</span>
            <p style="margin: 10px 0 0 0; font-style: italic; color: #1e293b;">"{{mensagem_resumo}}"</p>
          </div>
          <p>Para responder ou visualizar o histórico completo, clique no botão abaixo:</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="{{link_chamado}}" class="btn">Ver Chamado</a>
          </p>
          <p style="margin-top: 24px; font-size: 14px; color: #64748b;">
            Atenciosamente,<br>
            <b>Equipe {{nome_empresa}}</b>
          </p>
        `);
      } else if (normalizedEventType === "status_change") {
        defaultTemplateAssunto = `[InfoTicket] Atualização de Status: Chamado #${ticketShortId}`;
        defaultTemplateCorpo = getDefaultHtmlWrapper("{{nome_empresa}}", `
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
            <b>Equipe {{nome_empresa}}</b>
          </p>
        `);
      } else if (normalizedEventType === "new_ticket") {
        defaultTemplateAssunto = `[InfoTicket] Chamado Aberto: #${ticketShortId} - {{assunto}}`;
        defaultTemplateCorpo = getDefaultHtmlWrapper("{{nome_empresa}}", `
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
            <b>Equipe {{nome_empresa}}</b>
          </p>
        `);
      } else if (normalizedEventType === "ticket_atribuido") {
        defaultTemplateAssunto = `[InfoTicket] Chamado Delegado a Você: #${ticketShortId} - {{assunto}}`;
        defaultTemplateCorpo = getDefaultHtmlWrapper("{{nome_empresa}}", `
          <p>Olá {{nome_operador}},</p>
          <p>O chamado <b>#{{ticket_id}}</b> ("{{assunto}}") aberto por {{nome_cliente}} foi atribuído a você como operador responsável.</p>
          <div class="info-box">
            <b>Prioridade:</b> {{prioridade}}<br>
            <b>Prazo SLA:</b> {{sla_prazo}}
          </div>
          <p style="text-align: center; margin: 28px 0;">
            <a href="{{link_chamado}}" class="btn">Ver Chamado</a>
          </p>
          <p style="margin-top: 24px; font-size: 14px; color: #64748b;">
            Bom trabalho!<br>
            <b>{{nome_empresa}}</b>
          </p>
        `);
      }

      const assuntoTemplate = template?.assunto || defaultTemplateAssunto;
      const corpoTemplate = template?.corpo_mensagem || defaultTemplateCorpo;

      // Monta variáveis
      const clienteNome = ticket.cliente?.nome || "Cliente";
      const clienteEmail = ticket.cliente?.email;
      const operadorNome = ticket.operador?.nome || "Operador Responsável";
      const operadorEmail = ticket.operador?.email;

      let slaPrazo = "Não informado";
      if (ticket.sla_vencimento) {
        slaPrazo = new Date(ticket.sla_vencimento).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      }

      let mensagemResumo = "Nova mensagem registrada.";
      let nomeRemetente = "Sistema";
      let remetenteId: string | null = null;

      if (payload.message_id) {
        const { data: msg } = await supabase
          .from("ticket_messages")
          .select("content, user_id, user:profiles(id, nome)")
          .eq("id", payload.message_id)
          .maybeSingle();

        if (msg) {
          mensagemResumo = msg.content;
          remetenteId = msg.user_id;
          nomeRemetente = (msg.user as any)?.nome || nomeRemetente;
        }
      }

      const variablesMap: Record<string, string> = {
        "{{nome_cliente}}": clienteNome,
        "{{nome_operador}}": operadorNome,
        "{{nome_empresa}}": companyName,
        "{{ticket_id}}": ticketShortId,
        "{{assunto}}": ticket.assunto || "Sem Assunto",
        "{{status}}": ticket.status,
        "{{status_atual}}": ticket.status,
        "{{prioridade}}": ticket.prioridade || "Média",
        "{{link_chamado}}": ticketLink,
        "{{ticket_link}}": ticketLink,
        "{{sla_prazo}}": slaPrazo,
        "{{resumo}}": ticket.resumo_conclusao || "Chamado concluído com êxito.",
        "{{mensagem_resumo}}": mensagemResumo,
        "{{nome_remetente}}": nomeRemetente,
        "{{portal_url}}": appUrl,
        ...(payload.custom_data || {}),
      };

      finalAssunto = assuntoTemplate;
      finalCorpo = corpoTemplate;
      for (const [tag, val] of Object.entries(variablesMap)) {
        finalAssunto = finalAssunto.replaceAll(tag, val);
        finalCorpo = finalCorpo.replaceAll(tag, val);
      }

      // Se o corpo do template for texto simples sem tags HTML, encapsula em parágrafos e wrapper HTML
      if (!/<[a-z][\s\S]*>/i.test(finalCorpo)) {
        const paragraphs = finalCorpo
          .split("\n\n")
          .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
          .join("");
        finalCorpo = getDefaultHtmlWrapper(companyName, paragraphs);
      }

      // -------------------------------------------------------------
      // Determinação dos Destinatários
      // -------------------------------------------------------------
      if (normalizedEventType === "ticket_atribuido") {
        if (operadorEmail) {
          recipientEmails = [operadorEmail];
        }
      } else if (normalizedEventType === "status_change") {
        const { data: managers } = await supabase
          .from("profiles")
          .select("email, role, recebe_notificacoes")
          .eq("company_id", ticket.company_id)
          .in("role", ["Gerente", "Gestor"]);

        const managerEmails = (managers || [])
          .filter((m: any) => {
            if (m.role === "Gerente") return true;
            if (m.role === "Gestor") return m.recebe_notificacoes !== false;
            return false;
          })
          .map((m: any) => m.email)
          .filter(Boolean);

        const opList = (operadorEmail && ticket.operador?.recebe_notificacoes !== false) ? [operadorEmail] : [];
        const clList = (clienteEmail && ticket.cliente?.recebe_notificacoes !== false) ? [clienteEmail] : [];

        recipientEmails = Array.from(new Set([...managerEmails, ...opList, ...clList]));

      } else if (normalizedEventType === "new_message") {
        const { data: managers } = await supabase
          .from("profiles")
          .select("id, email, role, recebe_notificacoes")
          .eq("company_id", ticket.company_id)
          .in("role", ["Gerente", "Gestor"]);

        const managerEmails = (managers || [])
          .filter((m: any) => m.id !== remetenteId && m.recebe_notificacoes !== false)
          .map((m: any) => m.email)
          .filter(Boolean);

        const opList = (operadorEmail && ticket.operador_id !== remetenteId && ticket.operador?.recebe_notificacoes !== false)
          ? [operadorEmail]
          : [];

        const clList = (clienteEmail && ticket.cliente_id !== remetenteId && ticket.cliente?.recebe_notificacoes !== false)
          ? [clienteEmail]
          : [];

        recipientEmails = Array.from(new Set([...managerEmails, ...opList, ...clList]));

      } else {
        const clList = (clienteEmail && ticket.cliente?.recebe_notificacoes !== false) ? [clienteEmail] : [];
        recipientEmails = clList;
      }
    }

    if (recipientEmails.length === 0) {
      console.log(`ℹ️ [Send Notification] Nenhum destinatário elegível para o evento ${normalizedEventType}.`);
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum destinatário elegível para envio." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✉️ [Email] Destinatários (${recipientEmails.length}):`, recipientEmails);
    console.log(`📌 [Email] Assunto: ${finalAssunto}`);

    // Cria versão texto puro a partir do HTML para fallback em clientes legados
    const plainTextFallback = finalCorpo
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    // -------------------------------------------------------------
    // DISPARO DE E-MAIL (Ambiente Local vs Multi-Tenant SMTP Corporativo)
    // -------------------------------------------------------------
    let providerStatus = "mocked";
    let providerErrorDetails: string | null = null;

    // Detecta se estamos rodando em ambiente local (Inbucket)
    const isLocalEnv = 
      Deno.env.get("IS_LOCAL") === "true" ||
      supabaseUrl.includes("localhost") ||
      supabaseUrl.includes("127.0.0.1") ||
      supabaseUrl.includes("kong");

    if (isLocalEnv) {
      // 1. AMBIENTE LOCAL: Inbucket (Porta 54324, sem autenticação)
      const inbucketHost = Deno.env.get("INBUCKET_HOST") || "127.0.0.1";
      const inbucketPort = Number(Deno.env.get("INBUCKET_PORT") || 54324);
      const fromAddr = "notificacoes@infoticket.local";
      const fromName = companyName || "InfoTicket Local";

      console.log(`🏠 [Send Notification v1.18.4] Ambiente Local Detectado! Usando Inbucket em ${inbucketHost}:${inbucketPort}`);

      try {
        const localTransporter = nodemailer.createTransport({
          host: inbucketHost,
          port: inbucketPort,
          secure: false,
          ignoreTLS: true,
          connectionTimeout: 5000,
          greetingTimeout: 5000,
          socketTimeout: 8000,
        });

        const info = await localTransporter.sendMail({
          from: `"${fromName}" <${fromAddr}>`,
          to: recipientEmails.join(", "),
          subject: finalAssunto,
          text: plainTextFallback,
          html: finalCorpo,
        });

        providerStatus = "sent_via_inbucket";
        console.log(`✅ [Inbucket Local] E-mail capturado com sucesso! MessageID: ${info.messageId}`);
      } catch (inbucketErr: any) {
        // Tenta fallback com host.docker.internal caso 127.0.0.1 falhe dentro do container Deno
        if (inbucketHost === "127.0.0.1") {
          try {
            console.log("🔄 Tentando Inbucket via host.docker.internal:54324...");
            const fallbackTransporter = nodemailer.createTransport({
              host: "host.docker.internal",
              port: inbucketPort,
              secure: false,
              ignoreTLS: true,
              connectionTimeout: 5000,
              greetingTimeout: 5000,
              socketTimeout: 8000,
            });

            const info = await fallbackTransporter.sendMail({
              from: `"${fromName}" <${fromAddr}>`,
              to: recipientEmails.join(", "),
              subject: finalAssunto,
              text: plainTextFallback,
              html: finalCorpo,
            });

            providerStatus = "sent_via_inbucket_docker";
            console.log(`✅ [Inbucket Docker] E-mail capturado com sucesso! MessageID: ${info.messageId}`);
          } catch (dockerErr: any) {
            providerStatus = "inbucket_error";
            providerErrorDetails = dockerErr.message;
            console.error("❌ [Inbucket Local] Falha ao enviar para Inbucket:", dockerErr.message);
          }
        } else {
          providerStatus = "inbucket_error";
          providerErrorDetails = inbucketErr.message;
          console.error("❌ [Inbucket Local] Falha ao enviar para Inbucket:", inbucketErr.message);
        }
      }

    } else {
      // 2. AMBIENTE PRODUÇÃO: Disparo via Servidor SMTP Corporativo da Empresa (Multi-Tenant)
      let companySmtp: {
        smtp_host?: string | null;
        smtp_port?: number | null;
        smtp_user?: string | null;
        smtp_password?: string | null;
        smtp_from_email?: string | null;
        smtp_from_name?: string | null;
      } | null = null;

      if (currentCompanyId) {
        const { data: comp } = await supabase
          .from("companies")
          .select("smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email, smtp_from_name")
          .eq("id", currentCompanyId)
          .maybeSingle();

        if (comp) {
          companySmtp = comp;
        }
      }

      const hasTenantSmtp = Boolean(
        companySmtp?.smtp_host &&
        companySmtp?.smtp_port &&
        companySmtp?.smtp_user &&
        companySmtp?.smtp_password
      );

      if (hasTenantSmtp) {
        const portNum = Number(companySmtp!.smtp_port);
        const isSecurePort = portNum === 465;
        const fromAddr = companySmtp!.smtp_from_email?.trim() || companySmtp!.smtp_user!.trim();
        const fromName = companySmtp!.smtp_from_name?.trim() || companyName;

        console.log(`📡 [Send Notification v1.18.4] Enviando via SMTP Corporativo (${companySmtp!.smtp_host}:${portNum}, secure: ${isSecurePort})`);

        try {
          const transporterConfig: any = {
            host: companySmtp!.smtp_host!.trim(),
            port: portNum,
            secure: isSecurePort,
            auth: {
              user: companySmtp!.smtp_user!.trim(),
              pass: companySmtp!.smtp_password!.trim(),
            },
            tls: {
              rejectUnauthorized: false,
            },
            connectionTimeout: 12000,
            greetingTimeout: 12000,
            socketTimeout: 18000,
          };

          // Para portas que não sejam 465 (ex: 587 STARTTLS), define secure: false e requireTLS: true
          if (!isSecurePort) {
            transporterConfig.secure = false;
            transporterConfig.requireTLS = true;
          }

          const transporter = nodemailer.createTransport(transporterConfig);

          // Isolamento de falhas: disparo protegido em bloco try/catch
          const info = await transporter.sendMail({
            from: `"${fromName}" <${fromAddr}>`,
            to: recipientEmails.join(", "),
            subject: finalAssunto,
            text: plainTextFallback,
            html: finalCorpo,
          });

          providerStatus = "sent_via_tenant_smtp";
          console.log(`✅ [SMTP Tenant] E-mail corporativo HTML enviado com sucesso! MessageID: ${info.messageId}`);
        } catch (smtpErr: any) {
          providerStatus = "tenant_smtp_error";
          providerErrorDetails = smtpErr.message;
          console.error("❌ [SMTP Tenant] Falha ao despachar e-mail corporativo:", smtpErr.message);
        }

      } else {
        // Fallback: Provedores de contingência (Resend / SendGrid)
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
        const emailSender = Deno.env.get("EMAIL_FROM") || "InfoTicket <notificacoes@infocast-web.com.br>";

        if (resendApiKey) {
          try {
            const resendRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: emailSender,
                to: recipientEmails,
                subject: finalAssunto,
                text: plainTextFallback,
                html: finalCorpo,
              }),
            });

            if (resendRes.ok) {
              providerStatus = "sent_via_resend";
              console.log("✅ E-mail enviado via Resend para:", recipientEmails);
            } else {
              const errText = await resendRes.text();
              providerStatus = "resend_error";
              providerErrorDetails = `HTTP ${resendRes.status}: ${errText}`;
              console.error("❌ Falha na API do Resend:", providerErrorDetails);
            }
          } catch (err: any) {
            providerStatus = "resend_exception";
            providerErrorDetails = err.message;
            console.error("❌ Exceção ao conectar no Resend:", err.message);
          }
        } else if (sendgridApiKey) {
          try {
            const sendgridRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${sendgridApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                personalizations: [{ to: recipientEmails.map((email) => ({ email })) }],
                from: { email: emailSender.match(/<([^>]+)>/)?.[1] || emailSender, name: companyName },
                subject: finalAssunto,
                content: [
                  { type: "text/plain", value: plainTextFallback },
                  { type: "text/html", value: finalCorpo }
                ],
              }),
            });

            if (sendgridRes.ok || sendgridRes.status === 202) {
              providerStatus = "sent_via_sendgrid";
              console.log("✅ E-mail enviado via SendGrid para:", recipientEmails);
            } else {
              const errText = await sendgridRes.text();
              providerStatus = "sendgrid_error";
              providerErrorDetails = `HTTP ${sendgridRes.status}: ${errText}`;
              console.error("❌ Falha na API do SendGrid:", providerErrorDetails);
            }
          } catch (err: any) {
            providerStatus = "sendgrid_exception";
            providerErrorDetails = err.message;
            console.error("❌ Exceção ao conectar no SendGrid:", err.message);
          }
        } else {
          console.warn("⚠️ Empresa não configurou SMTP próprio e não há chaves globais configuradas.");
          providerStatus = "no_smtp_configured";
          providerErrorDetails = "Servidor SMTP corporativo não configurado na empresa.";
        }
      }
    }

    // -------------------------------------------------------------
    // REGISTRO DE LOG / AUDITORIA DE PRODUÇÃO (audit_logs)
    // -------------------------------------------------------------
    const isFailure = providerStatus.includes("error") || providerStatus.includes("exception") || providerStatus === "no_smtp_configured";
    const logAction = isFailure
      ? `[FALHA DISPARO E-MAIL] Evento '${normalizedEventType}'. Erro: ${providerErrorDetails || providerStatus}`
      : `Disparou notificação por e-mail (${normalizedEventType}) para ${recipientEmails.join(", ")} [Status: ${providerStatus}]`;

    if (currentCompanyId && currentTicketId) {
      try {
        await supabase.from("audit_logs").insert({
          company_id: currentCompanyId,
          ticket_id: currentTicketId,
          user_id: currentUserId,
          acao: logAction,
        });
      } catch (logErr: any) {
        console.warn("⚠️ Aviso ao gravar audit_logs:", logErr.message);
      }
    }

    // ISOLAMENTO DE FALHAS: Não retorna status 500/502 para evitar travar o frontend
    return new Response(
      JSON.stringify({
        success: true,
        email_sent: !isFailure,
        message: isFailure ? "Notificação processada com falha no provedor de e-mail." : "Notificação processada com sucesso.",
        event_type: normalizedEventType,
        recipients: recipientEmails,
        subject: finalAssunto,
        provider_status: providerStatus,
        error_details: providerErrorDetails,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("❌ [Send Notification Fatal]:", err.message);

    // Registra falha fatal em audit_logs caso haja contexto
    if (supabase && currentCompanyId && currentTicketId) {
      try {
        await supabase.from("audit_logs").insert({
          company_id: currentCompanyId,
          ticket_id: currentTicketId,
          user_id: currentUserId,
          acao: `[ERRO FATAL E-MAIL] Falha na execução da Edge Function: ${err.message}`,
        });
      } catch (insertErr: any) {
        console.warn("⚠️ Falha ao registrar log fatal em audit_logs:", insertErr.message);
      }
    }

    // Retorna HTTP 200 com flag de erro para isolar completamente e evitar travar o frontend
    return new Response(
      JSON.stringify({
        success: false,
        email_sent: false,
        error: err.message || "Erro interno na Edge Function.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

