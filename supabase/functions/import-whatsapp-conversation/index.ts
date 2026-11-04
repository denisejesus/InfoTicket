import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * TicketFlow - Import WhatsApp Conversation Edge Function v1.2.0
 * Importa uma conversa ativa do WhatsApp (Chat4u), cria o chamado na tabela `tickets`
 * vinculando Organização (`client_organization_id`) e Solicitante (`cliente_id`),
 * calcula `sla_vencimento` dinamicamente a partir de `sla_padrao_horas` da empresa,
 * reconstrói todo o histórico de mensagens em `ticket_messages` com `is_imported: true` (anti-loop)
 * e suporta `action: "preview"` para leitura rápida das últimas interações antes de gerar o chamado.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ImportConversationPayload {
  action?: "preview" | "import";
  company_id: string;
  channel_id?: string;
  conversation_id: number | string;
  client_organization_id?: string;
  cliente_id?: string;
  operador_id?: string | null;
  contact_name?: string;
  contact_phone?: string;
  custom_subject?: string;
  prioridade?: string;
  sla_padrao_horas?: number | null;
  sla_vencimento?: string;
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

    const payload: ImportConversationPayload = await req.json();
    const {
      action = "import",
      company_id,
      conversation_id,
      client_organization_id,
      cliente_id,
      operador_id,
      contact_name,
      contact_phone,
      custom_subject,
      prioridade,
      sla_padrao_horas: payloadSlaHoras,
      sla_vencimento: payloadSlaVencimento,
    } = payload;

    const isPreviewOnly = action === "preview";

    if (!company_id || !conversation_id || (!isPreviewOnly && (!client_organization_id || !cliente_id))) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Parâmetros obrigatórios ausentes: company_id, conversation_id, Organização e Solicitante são obrigatórios.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Configuração do servidor incompleta (service role ausente).",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // 1. Busca as credenciais e o prazo padrão de SLA da empresa ativa
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("id, razao_social, chatwoot_url, chatwoot_api_access_token, chatwoot_account_id, sla_padrao_horas")
      .eq("id", company_id)
      .single();

    if (companyErr || !company) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Empresa não encontrada no banco de dados.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { chatwoot_url, chatwoot_api_access_token, chatwoot_account_id } = company;
    if (!chatwoot_url || !chatwoot_api_access_token || !chatwoot_account_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "As credenciais de integração do WhatsApp não estão configuradas para esta empresa.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanBaseUrl = chatwoot_url.replace(/\/+$/, "");
    const headers = {
      "api_access_token": chatwoot_api_access_token,
      "Content-Type": "application/json",
    };

    // 2. Busca o histórico completo de mensagens da conversa no Chatwoot
    const messagesEndpoint = `${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/conversations/${conversation_id}/messages`;
    console.log(`📥 [Import WhatsApp Conversation] Buscando histórico: ${messagesEndpoint}`);

    let rawMessages: any[] = [];
    const msgRes = await fetch(messagesEndpoint, { method: "GET", headers });
    if (msgRes.ok) {
      const msgJson = await msgRes.json();
      rawMessages = Array.isArray(msgJson?.payload)
        ? msgJson.payload
        : Array.isArray(msgJson?.data?.payload)
        ? msgJson.data.payload
        : Array.isArray(msgJson)
        ? msgJson
        : [];
    } else {
      // Fallback: busca detalhes da conversa que também traz mensagens
      const convEndpoint = `${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/conversations/${conversation_id}`;
      const convRes = await fetch(convEndpoint, { method: "GET", headers });
      if (convRes.ok) {
        const convJson = await convRes.json();
        rawMessages = Array.isArray(convJson?.messages) ? convJson.messages : [];
      }
    }

    // Filtra apenas mensagens de conteúdo real (message_type 0 = incoming, 1 = outgoing; ignora eventos de atividade vazios message_type = 2 sem texto relevante)
    const validMessages = rawMessages
      .filter((m: any) => {
        const hasContent = m?.content && String(m.content).trim().length > 0;
        const hasAttachments = Array.isArray(m?.attachments) && m.attachments.length > 0;
        // Ignora mensagens de atividade interna do sistema Chatwoot (message_type === 2)
        if (m?.message_type === 2 || m?.message_type === "activity") return false;
        return hasContent || hasAttachments;
      })
      .sort((a: any, b: any) => {
        const tA = typeof a.created_at === "number" ? a.created_at * 1000 : new Date(a.created_at || 0).getTime();
        const tB = typeof b.created_at === "number" ? b.created_at * 1000 : new Date(b.created_at || 0).getTime();
        return tA - tB;
      });

    // Se a requisição for apenas de preview (leitura rápida das últimas 5 mensagens antes de gerar chamado)
    if (isPreviewOnly) {
      const fallbackContactName = contact_name?.trim() || "Cliente";
      const lastFive = validMessages.slice(-5).map((m: any) => {
        const isIncoming = m.message_type === 0 || m.message_type === "incoming";
        const senderName =
          m?.sender?.name ||
          (isIncoming ? fallbackContactName : "Atendente");

        let contentStr = m.content ? String(m.content).trim() : "";
        if (!contentStr && Array.isArray(m.attachments) && m.attachments.length > 0) {
          contentStr = "(Mensagem de mídia / anexo)";
        }

        const createdIso = m.created_at
          ? typeof m.created_at === "number"
            ? new Date(m.created_at * 1000).toISOString()
            : new Date(m.created_at).toISOString()
          : new Date().toISOString();

        return {
          id: m.id,
          sender: senderName,
          is_incoming: isIncoming,
          content: contentStr || "(Sem texto)",
          created_at: createdIso,
        };
      });

      return new Response(
        JSON.stringify({
          success: true,
          preview_messages: lastFive,
          total_messages: validMessages.length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Monta o Assunto e a Descrição Inicial do Chamado
    const displayContact = contact_name?.trim() || contact_phone?.trim() || `Conversa #${conversation_id}`;
    const finalSubject =
      custom_subject?.trim() ||
      `Atendimento WhatsApp #${conversation_id} - ${displayContact}`;

    const firstIncomingMessage =
      validMessages.find((m: any) => m.message_type === 0 || m.message_type === "incoming")?.content ||
      validMessages[0]?.content ||
      `Atendimento importado do WhatsApp (${displayContact}).`;

    // Cálculo dinâmico de SLA baseado no sla_padrao_horas da empresa
    let slaVencimentoIso = payloadSlaVencimento;
    if (!slaVencimentoIso) {
      const slaHoras =
        typeof company.sla_padrao_horas === "number" && company.sla_padrao_horas > 0
          ? company.sla_padrao_horas
          : typeof payloadSlaHoras === "number" && payloadSlaHoras > 0
          ? payloadSlaHoras
          : null;

      if (slaHoras && slaHoras > 0) {
        const slaDate = new Date();
        slaDate.setTime(slaDate.getTime() + slaHoras * 60 * 60 * 1000);
        slaVencimentoIso = slaDate.toISOString();
      }
    }

    // 4. INSERT na tabela `tickets`
    const { data: createdTicket, error: ticketInsertErr } = await supabase
      .from("tickets")
      .insert({
        company_id,
        client_organization_id,
        cliente_id,
        operador_id: operador_id || null,
        assunto: finalSubject,
        descricao: String(firstIncomingMessage).trim(),
        status: operador_id ? "Em Andamento" : "Aberto",
        prioridade: prioridade || "Média",
        sla_vencimento: slaVencimentoIso || null,
        chatwoot_conversation_id: Number(conversation_id) || String(conversation_id),
      })
      .select("id")
      .single();

    if (ticketInsertErr || !createdTicket) {
      console.error("❌ Erro ao criar ticket na importação:", ticketInsertErr?.message);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Não foi possível criar o chamado no banco: ${ticketInsertErr?.message || "Erro desconhecido"}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newTicketId = createdTicket.id;

    // 5. Recria a linha do tempo na tabela `ticket_messages`
    if (validMessages.length > 0) {
      const messagesPayload = validMessages.map((m: any) => {
        const isIncoming = m.message_type === 0 || m.message_type === "incoming";
        const isPrivate = Boolean(m.private);

        // Converte timestamp Unix (segundos) ou string ISO para ISO 8601
        let createdIso = new Date().toISOString();
        if (m.created_at) {
          createdIso =
            typeof m.created_at === "number"
              ? new Date(m.created_at * 1000).toISOString()
              : new Date(m.created_at).toISOString();
        }

        let contentStr = m.content ? String(m.content).trim() : "";
        if (Array.isArray(m.attachments) && m.attachments.length > 0) {
          const urls = m.attachments
            .map((att: any) => att.data_url || att.file_url)
            .filter(Boolean);
          if (urls.length > 0) {
            contentStr = contentStr
              ? `${contentStr}\n\n[Anexo WhatsApp]: ${urls.join("\n")}`
              : `[Anexo WhatsApp]: ${urls.join("\n")}`;
          }
        }

        return {
          ticket_id: newTicketId,
          company_id,
          user_id: isIncoming ? cliente_id : operador_id || cliente_id,
          content: contentStr || "(Mensagem de mídia)",
          is_internal_note: isPrivate,
          is_imported: true,
          channel: "whatsapp",
          created_at: createdIso,
        };
      });

      const { error: msgInsertErr } = await supabase
        .from("ticket_messages")
        .insert(messagesPayload);

      if (msgInsertErr) {
        console.warn("⚠️ Aviso ao inserir histórico de mensagens importadas:", msgInsertErr.message);
      }
    } else {
      // Caso a conversa ainda não possua mensagens retornadas, registra a mensagem inicial como importada
      await supabase.from("ticket_messages").insert({
        ticket_id: newTicketId,
        company_id,
        user_id: cliente_id,
        content: String(firstIncomingMessage).trim(),
        is_internal_note: false,
        is_imported: true,
        channel: "whatsapp",
      });
    }

    // 6. Registra log de auditoria da importação
    try {
      await supabase.from("audit_logs").insert({
        company_id,
        ticket_id: newTicketId,
        user_id: operador_id || cliente_id,
        acao: `Importou conversa ativa do WhatsApp (#${conversation_id}) com ${validMessages.length} mensagem(ns) no histórico.`,
      });
    } catch (auditErr) {
      console.warn("⚠️ Aviso ao registrar auditoria de importação:", auditErr);
    }

    console.log(`✅ Conversa #${conversation_id} importada com sucesso! Novo Chamado ID: ${newTicketId}`);

    return new Response(
      JSON.stringify({
        success: true,
        ticket_id: newTicketId,
        imported_messages_count: validMessages.length,
        message: "Conversa importada e transformada em chamado com sucesso!",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("❌ [Import WhatsApp Conversation] Erro inesperado:", err.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "Erro interno ao importar conversa do WhatsApp.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

