import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.10.0";

/**
 * InfoTicket - Send Notification Edge Function v1.18.1
 * Motor assíncrono para interpolação de templates e disparo de notificações por E-mail Multi-Tenant
 * Consulta credenciais SMTP corporativas da tabela `companies` com base no `company_id`
 * Suporte a envio oficial direto via SMTP (Host, Porta, Usuário, Senha, From Email, From Name)
 * Isolação multi-tenant via company_id com variáveis dinâmicas ({{nome_cliente}}, {{ticket_id}}, etc.)
 * Tratamento de erros e auditoria de produção com registro de falhas e sucessos em `audit_logs`
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

serve(async (req: Request) => {
  // Tratamento de pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Cliente Supabase fora do try interno para poder registrar falhas em audit_logs
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const supabase = (supabaseUrl && supabaseServiceRoleKey)
    ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } })
    : null;

  let currentCompanyId: string | null = null;
  let currentTicketId: string | null = null;
  let currentUserId: string | null = null;

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Método não permitido. Utilize POST." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: NotificationPayload = await req.json();
    console.log("📨 [Send Notification v1.12.0] Payload recebido:", JSON.stringify(payload));

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
    const normalizedEventType: NotificationEventType = (
      event_type === "novo_chamado" ? "new_ticket" :
      event_type === "mudanca_status" ? "status_change" :
      event_type === "nova_mensagem" ? "new_message" :
      event_type
    );

    let recipientEmails: string[] = [];
    let finalAssunto = "";
    let finalCorpo = "";
    let companyName = "InfoTicket";

    // -------------------------------------------------------------
    // CASO 1: BOAS-VINDAS / NOVO USUÁRIO (welcome_email)
    // Pode ocorrer sem ticket_id vinculado (ex: trigger de auth.users ou cadastro)
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

      // Busca template da empresa, se houver company_id
      let templateAssunto = `Bem-vindo ao InfoTicket - {{nome_empresa}}`;
      let templateCorpo = `Olá, {{nome_cliente}}!\n\nSeu acesso ao portal InfoTicket foi criado com sucesso.\n\nEmpresa: {{nome_empresa}}\nE-mail de acesso: {{email_cliente}}\nSenha temporária: {{senha_temporaria}}\n\nAcesse o portal e altere sua senha no primeiro login: {{portal_url}}\n\nAtenciosamente,\nEquipe {{nome_empresa}}`;

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
        "{{portal_url}}": Deno.env.get("PUBLIC_APP_URL") || "https://infoticket.app",
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
      // CASO 2: NOTIFICAÇÕES VINCULADAS A TICKET (status_change, new_message, etc.)
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

      // Busca o template customizado
      const { data: template } = await supabase
        .from("communication_templates")
        .select("*")
        .eq("company_id", ticket.company_id)
        .eq("tipo", normalizedEventType)
        .maybeSingle();

      let defaultTemplateAssunto = `[InfoTicket] Atualização no Chamado #${ticket.id.substring(0, 8)} - {{assunto}}`;
      let defaultTemplateCorpo = `Olá, {{nome_cliente}}!\n\nHouve uma atualização no seu chamado #{{ticket_id}} ("{{assunto}}").\nStatus atual: {{status_atual}}\n\nAcesse: {{ticket_link}}\n\nAtenciosamente,\n{{nome_empresa}}`;

      if (normalizedEventType === "ticket_atribuido") {
        defaultTemplateAssunto = `[InfoTicket] Chamado Delegado a Você: #${ticket.id.substring(0, 8)} - {{assunto}}`;
        defaultTemplateCorpo = `Olá, {{nome_operador}}!\n\nO chamado #{{ticket_id}} ("{{assunto}}") aberto por {{nome_cliente}} foi atribuído a você como operador responsável.\n\nPrioridade: {{prioridade}}\nPrazo SLA: {{sla_prazo}}\n\nAcesse o chamado para atendimento: {{ticket_link}}\n\nBom trabalho!\n{{nome_empresa}}`;
      } else if (normalizedEventType === "new_message") {
        defaultTemplateAssunto = `[InfoTicket] Nova mensagem no Chamado #${ticket.id.substring(0, 8)} - {{assunto}}`;
        defaultTemplateCorpo = `Olá!\n\nHá uma nova mensagem registrada no chamado #{{ticket_id}} ("{{assunto}}") por {{nome_remetente}}:\n\n"{{mensagem_resumo}}"\n\nAcesse para responder: {{ticket_link}}\n\nAtenciosamente,\n{{nome_empresa}}`;
      }

      const assuntoTemplate = template?.assunto || defaultTemplateAssunto;
      const corpoTemplate = template?.corpo_mensagem || defaultTemplateCorpo;

      // Monta variáveis
      const clienteNome = ticket.cliente?.nome || "Cliente";
      const clienteEmail = ticket.cliente?.email;
      const operadorNome = ticket.operador?.nome || "Operador Responsável";
      const operadorEmail = ticket.operador?.email;
      const ticketShortId = ticket.id.substring(0, 8);
      const appUrl = Deno.env.get("PUBLIC_APP_URL") || "https://infoticket.app";
      const ticketLink = `${appUrl}/tickets/${ticket.id}`;

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
        "{{assunto}}": ticket.assunto,
        "{{status_atual}}": ticket.status,
        "{{prioridade}}": ticket.prioridade || "Média",
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

      // -------------------------------------------------------------
      // Determinação dos Destinatários com regras completas
      // -------------------------------------------------------------
      if (normalizedEventType === "ticket_atribuido") {
        if (operadorEmail) {
          recipientEmails = [operadorEmail];
        }
      } else if (normalizedEventType === "status_change") {
        // Gerente, Gestor, Operador e Cliente
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
        // Interações: notifica a equipe (Operador, Gerentes/Gestores) e o Cliente
        // Excluindo o próprio autor da mensagem para não gerar loop
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
        // novo_chamado, csat, etc.
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

    // -------------------------------------------------------------
    // DISPARO DE E-MAIL MULTI-TENANT (Fase 18.1 - SMTP Corporativo)
    // -------------------------------------------------------------
    let providerStatus = "mocked";
    let providerErrorDetails: string | null = null;

    // Busca credenciais SMTP da empresa ativa
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
      // 1. PRIORIDADE: Disparo via Servidor SMTP Corporativo da Empresa (Multi-Tenant)
      const portNum = Number(companySmtp!.smtp_port);
      const isSecurePort = portNum === 465;
      const fromAddr = companySmtp!.smtp_from_email?.trim() || companySmtp!.smtp_user!.trim();
      const fromName = companySmtp!.smtp_from_name?.trim() || companyName;

      console.log(`📡 [Send Notification v1.18.1] Enviando via SMTP Corporativo do Tenant (${companySmtp!.smtp_host}:${portNum})`);

      try {
        const transporter = nodemailer.createTransport({
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
        });

        // Envia para todos os destinatários elegíveis
        const info = await transporter.sendMail({
          from: `"${fromName}" <${fromAddr}>`,
          to: recipientEmails.join(", "),
          subject: finalAssunto,
          text: finalCorpo,
        });

        providerStatus = "sent_via_tenant_smtp";
        console.log(`✅ [SMTP Tenant] E-mail corporativo enviado com sucesso! MessageID: ${info.messageId}`);
      } catch (smtpErr: any) {
        providerStatus = "tenant_smtp_error";
        providerErrorDetails = smtpErr.message;
        console.error("❌ [SMTP Tenant] Falha ao despachar e-mail corporativo:", smtpErr.message);
      }

    } else {
      // 2. FALLBACK: Se o Tenant ainda não configurou SMTP próprio, verifica chaves globais
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
              text: finalCorpo,
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
              content: [{ type: "text/plain", value: finalCorpo }],
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

    // -------------------------------------------------------------
    // REGISTRO DE LOG / AUDITORIA DE PRODUÇÃO
    // -------------------------------------------------------------
    const isFailure = providerStatus.includes("error") || providerStatus.includes("exception");
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
      } catch (logErr) {
        console.warn("⚠️ Aviso ao gravar audit_logs:", logErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: !isFailure,
        message: isFailure ? "Falha ao enviar e-mail pelo provedor oficial." : "Notificação processada com sucesso.",
        event_type: normalizedEventType,
        recipients: recipientEmails,
        subject: finalAssunto,
        provider_status: providerStatus,
        error_details: providerErrorDetails,
      }),
      { status: isFailure ? 502 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      } catch (_) {
        // preserva
      }
    }

    return new Response(
      JSON.stringify({ error: err.message || "Erro interno na Edge Function." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

