import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * InfoTicket - Send Chatwoot Message Edge Function v1.11.4
 * Dispara mensagens reais via API do Chatwoot / Chat4u quando um operador responde com channel = 'whatsapp'
 * POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendChatwootPayload {
  message_id?: string;
  ticket_id: string;
  company_id: string;
  content?: string;
}

serve(async (req: Request) => {
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

    const payload: SendChatwootPayload = await req.json();
    console.log("📲 [Send Chatwoot Message] Payload recebido:", JSON.stringify(payload));

    const { message_id, ticket_id, company_id } = payload;

    if (!ticket_id || !company_id) {
      return new Response(
        JSON.stringify({ error: "Parâmetros obrigatórios ausentes (ticket_id, company_id)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("❌ Credenciais do Supabase ausentes.");
      return new Response(
        JSON.stringify({ error: "Configuração do servidor incompleta." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // 1. Busca as credenciais do Chatwoot da respectiva empresa
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("id, razao_social, chatwoot_url, chatwoot_api_access_token, chatwoot_account_id, chatwoot_inbox_id")
      .eq("id", company_id)
      .single();

    if (companyErr || !company) {
      console.error("❌ Empresa não encontrada:", companyErr?.message);
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { chatwoot_url, chatwoot_api_access_token, chatwoot_account_id, chatwoot_inbox_id } = company;

    if (!chatwoot_url || !chatwoot_api_access_token || !chatwoot_account_id) {
      console.warn(`⚠️ Chatwoot não configurado para a empresa ${company.razao_social} (ID: ${company_id})`);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Credenciais de WhatsApp (Chat4u/Chatwoot) incompletas na empresa.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Busca os dados do Chamado e da Mensagem
    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .select(`
        id,
        assunto,
        chatwoot_conversation_id,
        cliente:profiles!tickets_cliente_id_fkey(id, nome, email, whatsapp)
      `)
      .eq("id", ticket_id)
      .single();

    if (ticketErr || !ticket) {
      console.error("❌ Chamado não encontrado:", ticketErr?.message);
      return new Response(
        JSON.stringify({ error: "Chamado não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let messageContent = payload.content;
    if (message_id) {
      const { data: msg } = await supabase
        .from("ticket_messages")
        .select("content, channel, is_internal_note, is_imported")
        .eq("id", message_id)
        .maybeSingle();

      if (msg) {
        if (msg.is_internal_note || msg.is_imported) {
          console.log("ℹ️ Mensagem é uma nota interna ou histórico importado. Disparo no WhatsApp ignorado.");
          return new Response(
            JSON.stringify({ success: true, skipped: true, message: "Nota interna ou mensagem importada ignorada." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        messageContent = messageContent || msg.content;
      }
    }

    if (!messageContent) {
      return new Response(
        JSON.stringify({ error: "Conteúdo da mensagem não informado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanBaseUrl = chatwoot_url.replace(/\/+$/, "");

    // 3. Determina o ID da Conversa no Chatwoot
    // Prioridade 1: se já estiver registrado na coluna chatwoot_conversation_id
    let conversationId = ticket.chatwoot_conversation_id;

    // Prioridade 2: extrai do título se tiver formato "Atendimento WhatsApp Chat4u #1234 - Nome"
    if (!conversationId && ticket.assunto) {
      const match = ticket.assunto.match(/Chat(?:4u|woot)\s*#(\d+)/i);
      if (match && match[1]) {
        conversationId = parseInt(match[1], 10);
      }
    }

    // Prioridade 3: Se ainda não tiver conversationId, tenta localizar ou criar contato e conversa
    if (!conversationId) {
      const clienteNome = (ticket.cliente as any)?.nome || "Cliente InfoTicket";
      const clientePhone = (ticket.cliente as any)?.whatsapp || null;
      const clienteEmail = (ticket.cliente as any)?.email || null;

      console.log(`🔍 [Chatwoot] Tentando localizar ou criar contato para ${clienteNome}...`);

      if (chatwoot_inbox_id && (clientePhone || clienteEmail)) {
        try {
          // Cria contato no Chatwoot
          const contactRes = await fetch(`${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/contacts`, {
            method: "POST",
            headers: {
              "api_access_token": chatwoot_api_access_token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inbox_id: chatwoot_inbox_id,
              name: clienteNome,
              email: clienteEmail,
              phone_number: clientePhone,
            }),
          });

          const contactData = await contactRes.json();
          const contactId = contactData?.payload?.contact?.id || contactData?.id;

          if (contactId) {
            // Cria a conversa
            const convRes = await fetch(`${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/conversations`, {
              method: "POST",
              headers: {
                "api_access_token": chatwoot_api_access_token,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                inbox_id: chatwoot_inbox_id,
                contact_id: contactId,
              }),
            });

            if (convRes.ok) {
              const convData = await convRes.json();
              conversationId = convData?.id;

              // Salva conversationId no ticket para reutilização imediata
              if (conversationId) {
                await supabase
                  .from("tickets")
                  .update({ chatwoot_conversation_id: conversationId })
                  .eq("id", ticket.id);
                console.log(`✅ Nova conversa criada no Chatwoot #${conversationId} e vinculada ao chamado.`);
              }
            }
          }
        } catch (setupErr: any) {
          console.warn("⚠️ Aviso ao criar conversa sob demanda no Chatwoot:", setupErr.message);
        }
      }
    }

    if (!conversationId) {
      console.warn(`⚠️ Não foi possível identificar uma conversa no Chatwoot para o chamado #${ticket_id}`);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Conversa no Chatwoot não encontrada para este chamado.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Injeta a mensagem na conversa do Chatwoot
    const sendEndpoint = `${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/conversations/${conversationId}/messages`;
    console.log(`🚀 [Chatwoot API] Disparando mensagem para: ${sendEndpoint}`);

    const chatwootResponse = await fetch(sendEndpoint, {
      method: "POST",
      headers: {
        "api_access_token": chatwoot_api_access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: messageContent,
        message_type: "outgoing",
        private: false,
      }),
    });

    const responseData = await chatwootResponse.json().catch(() => ({}));

    if (!chatwootResponse.ok) {
      console.error("❌ Falha na API do Chatwoot:", JSON.stringify(responseData));
      return new Response(
        JSON.stringify({
          success: false,
          error: "Erro retornado pela API do Chatwoot.",
          details: responseData,
        }),
        { status: chatwootResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Mensagem entregue com sucesso no Chatwoot: ID ${responseData?.id}`);

    // 5. Registra em audit_logs
    await supabase.from("audit_logs").insert({
      company_id: company_id,
      ticket_id: ticket_id,
      acao: `Enviou mensagem via WhatsApp (Chat4u) na conversa #${conversationId}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Mensagem enviada com sucesso no Chatwoot.",
        chatwoot_message_id: responseData?.id,
        conversation_id: conversationId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("❌ [Send Chatwoot Message] Erro inesperado:", err.message);
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno na Edge Function." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
