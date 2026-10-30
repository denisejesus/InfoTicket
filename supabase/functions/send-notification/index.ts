import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * InfoTicket - Send Notification Edge Function v1.11.3
 * Motor assíncrono para interpolação de templates e disparo de notificações por E-mail (Resend/SendGrid)
 * Isolação multi-tenant via company_id com variáveis dinâmicas ({{nome_cliente}}, {{ticket_id}}, etc.)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  ticket_id: string;
  company_id: string;
  event_type: NotificationEventType;
  user_id?: string;
  message_id?: string;
  custom_data?: Record<string, string>;
}

serve(async (req: Request) => {
  // Tratamento de pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Método não permitido. Utilize POST." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: NotificationPayload = await req.json();
    console.log("📨 [Send Notification] Payload recebido:", JSON.stringify(payload));

    const { ticket_id, company_id, event_type } = payload;

    if (!ticket_id || !company_id || !event_type) {
      return new Response(
        JSON.stringify({ error: "Parâmetros obrigatórios ausentes (ticket_id, company_id, event_type)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Inicialização do cliente Supabase com Service Role Key para leitura das tabelas com RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("❌ Credenciais do Supabase ausentes no ambiente.");
      return new Response(
        JSON.stringify({ error: "Configuração do servidor incompleta." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // 1. Busca os dados do Chamado, Cliente Solicitante e Empresa
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(`
        *,
        cliente:profiles!tickets_cliente_id_fkey(id, nome, email),
        operador:profiles!tickets_operador_id_fkey(id, nome, email),
        company:companies(id, razao_social)
      `)
      .eq("id", ticket_id)
      .eq("company_id", company_id)
      .single();

    if (ticketError || !ticket) {
      console.warn(`⚠️ Chamado #${ticket_id} não encontrado para o tenant ${company_id}:`, ticketError?.message);
      return new Response(
        JSON.stringify({ error: "Chamado não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Normaliza o event_type e busca o Template de Comunicação configurado pela empresa
    const normalizedEventType = (
      event_type === "novo_chamado" ? "new_ticket" :
      event_type === "mudanca_status" ? "status_change" :
      event_type === "nova_mensagem" ? "new_message" :
      event_type
    );

    const { data: template } = await supabase
      .from("communication_templates")
      .select("*")
      .eq("company_id", company_id)
      .eq("tipo", normalizedEventType)
      .maybeSingle();

    // Template fallback caso a empresa não tenha personalizado
    let defaultTemplateAssunto = `[InfoTicket] Atualização no Chamado #${ticket.id.substring(0, 8)} - {{assunto}}`;
    let defaultTemplateCorpo = `Olá, {{nome_cliente}}!\n\nHouve uma atualização no seu chamado #{{ticket_id}} ("{{assunto}}").\nStatus atual: {{status_atual}}\n\nAcesse: {{ticket_link}}\n\nAtenciosamente,\n{{nome_empresa}}`;

    if (normalizedEventType === "ticket_atribuido") {
      defaultTemplateAssunto = `[InfoTicket] Chamado Delegado a Você: #${ticket.id.substring(0, 8)} - {{assunto}}`;
      defaultTemplateCorpo = `Olá, {{nome_operador}}!\n\nO chamado #{{ticket_id}} ("{{assunto}}") aberto por {{nome_cliente}} foi atribuído a você como operador responsável.\n\nPrioridade: {{prioridade}}\nPrazo SLA: {{sla_prazo}}\n\nAcesse o chamado para atendimento: {{ticket_link}}\n\nBom trabalho!\n{{nome_empresa}}`;
    }

    const assuntoTemplate = template?.assunto || defaultTemplateAssunto;
    const corpoTemplate = template?.corpo_mensagem || defaultTemplateCorpo;

    // 3. Monta o mapa de variáveis para substituição
    const clienteNome = ticket.cliente?.nome || "Cliente";
    const clienteEmail = ticket.cliente?.email || "contato@cliente.com.br";
    const operadorNome = ticket.operador?.nome || "Operador Responsável";
    const operadorEmail = ticket.operador?.email;
    const empresaNome = ticket.company?.razao_social || "InfoTicket";
    const ticketShortId = ticket.id.substring(0, 8);
    const ticketLink = `https://infoticket.app/tickets/${ticket.id}`;
    
    let slaPrazo = "Não informado";
    if (ticket.sla_vencimento) {
      slaPrazo = new Date(ticket.sla_vencimento).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // Busca última mensagem caso seja evento 'new_message'
    let mensagemResumo = "Nova mensagem registrada pela equipe técnica.";
    let nomeRemetente = ticket.operador?.nome || "Operador";

    if (payload.message_id) {
      const { data: msg } = await supabase
        .from("ticket_messages")
        .select("content, user:profiles(nome)")
        .eq("id", payload.message_id)
        .maybeSingle();

      if (msg) {
        mensagemResumo = msg.content;
        nomeRemetente = (msg.user as any)?.nome || nomeRemetente;
      }
    }

    const variablesMap: Record<string, string> = {
      "{{nome_cliente}}": clienteNome,
      "{{nome_operador}}": operadorNome,
      "{{nome_empresa}}": empresaNome,
      "{{ticket_id}}": ticketShortId,
      "{{assunto}}": ticket.assunto,
      "{{status_atual}}": ticket.status,
      "{{prioridade}}": ticket.prioridade || "Média",
      "{{ticket_link}}": ticketLink,
      "{{sla_prazo}}": slaPrazo,
      "{{resumo}}": ticket.resumo_conclusao || "Chamado concluído com êxito.",
      "{{mensagem_resumo}}": mensagemResumo,
      "{{nome_remetente}}": nomeRemetente,
      "{{portal_url}}": "https://infoticket.app",
      ...(payload.custom_data || {}),
    };

    // 4. Substituição das variáveis no assunto e no corpo
    let finalAssunto = assuntoTemplate;
    let finalCorpo = corpoTemplate;

    for (const [tag, val] of Object.entries(variablesMap)) {
      finalAssunto = finalAssunto.replaceAll(tag, val);
      finalCorpo = finalCorpo.replaceAll(tag, val);
    }

    // Determina os destinatários do e-mail:
    let recipientEmails: string[] = [];

    if (normalizedEventType === "ticket_atribuido") {
      if (operadorEmail) {
        recipientEmails = [operadorEmail];
      } else {
        console.warn(`⚠️ Operador do chamado #${ticket.id} não possui e-mail cadastrado. Abortando envio.`);
        return new Response(
          JSON.stringify({ message: "Operador não possui e-mail cadastrado." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (normalizedEventType === "status_change") {
      // 1. Gerentes (obrigatório) e Gestores (se recebe_notificacoes !== false)
      const { data: managers } = await supabase
        .from("profiles")
        .select("email, role, recebe_notificacoes")
        .eq("company_id", company_id)
        .in("role", ["Gerente", "Gestor"]);

      const managerEmails = (managers || [])
        .filter((m: any) => {
          if (m.role === "Gerente") return true; // Gerente sempre recebe
          if (m.role === "Gestor") return m.recebe_notificacoes !== false;
          return false;
        })
        .map((m: any) => m.email)
        .filter(Boolean);

      // 2. Operador atribuído
      const operatorList = operadorEmail ? [operadorEmail] : [];

      // 3. Cliente solicitante
      const clientList = clienteEmail ? [clienteEmail] : [];

      // Combina e remove duplicatas / nulos
      recipientEmails = Array.from(new Set([...managerEmails, ...operatorList, ...clientList]));
      console.log("E-mail disparado para:", recipientEmails);
    } else {
      // Fallback para outros eventos (novo_chamado, nova_mensagem, csat)
      if (clienteEmail) {
        recipientEmails = [clienteEmail];
      }
    }

    console.log(`✉️ [Email] Destinatários (${recipientEmails.length}):`, recipientEmails, `| Evento: ${normalizedEventType}`);
    console.log(`📌 [Email] Assunto: ${finalAssunto}`);
    console.log(`📄 [Email] Corpo: \n${finalCorpo}`);

    // 5. Integração com Provedor de E-mail (ex: Resend, SendGrid ou SMTP)
    // Se houver uma chave RESEND_API_KEY configurada, realiza a chamada real
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    let providerStatus = "mocked";

    if (resendApiKey && recipientEmails.length > 0) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "InfoTicket <notificacoes@infocast-web.com.br>",
            to: recipientEmails,
            subject: finalAssunto,
            text: finalCorpo,
          }),
        });

        if (res.ok) {
          providerStatus = "sent_via_resend";
          console.log("✅ E-mail enviado com sucesso via Resend API para:", recipientEmails);
        } else {
          providerStatus = "resend_error";
          console.warn("⚠️ Falha na API do Resend, fallback para log local:", await res.text());
        }
      } catch (sendErr: any) {
        providerStatus = "resend_exception";
        console.warn("⚠️ Exceção ao contatar Resend:", sendErr.message);
      }
    } else {
      console.log("💡 [Email Mock] Resend API Key não informada no Deno.env. Disparo simulado e validado.");
    }

    // 6. Registra na tabela audit_logs o evento de envio de notificação
    await supabase
      .from("audit_logs")
      .insert({
        company_id: company_id,
        ticket_id: ticket.id,
        user_id: payload.user_id || ticket.operador_id || null,
        acao: `Disparou notificação por e-mail (${event_type}) para ${recipientEmails.join(", ")}`,
      })
      .select()
      .maybeSingle();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Notificação processada com sucesso.",
        event_type,
        recipients: recipientEmails,
        subject: finalAssunto,
        provider_status: providerStatus,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("❌ [Send Notification] Erro ao processar requisição:", err.message);
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno na Edge Function." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
