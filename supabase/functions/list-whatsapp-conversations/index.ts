import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * TicketFlow - List WhatsApp Conversations Edge Function v1.0.0
 * Lista as conversas abertas de um Canal de WhatsApp (inbox_id) da empresa ativa
 * GET /api/v1/accounts/{account_id}/conversations?inbox_id={inbox_id}&status=open
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface ListConversationsPayload {
  channel_id: string;
  company_id: string;
}

serve(async (req: Request) => {
  // Tratamento de pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Método não permitido. Utilize POST." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let payload: ListConversationsPayload;
    if (req.method === "POST") {
      payload = await req.json();
    } else {
      const url = new URL(req.url);
      payload = {
        channel_id: url.searchParams.get("channel_id") || "",
        company_id: url.searchParams.get("company_id") || "",
      };
    }

    const { channel_id, company_id } = payload;

    if (!channel_id || !company_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Parâmetros obrigatórios ausentes: channel_id e company_id.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Configuração do servidor incompleta (credenciais de serviço ausentes).",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // 1. Busca credenciais da empresa ativa
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("id, razao_social, chatwoot_url, chatwoot_api_access_token, chatwoot_account_id, chatwoot_inbox_id")
      .eq("id", company_id)
      .single();

    if (companyErr || !company) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Empresa não localizada no banco de dados.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { chatwoot_url, chatwoot_api_access_token, chatwoot_account_id } = company;
    if (!chatwoot_url || !chatwoot_api_access_token || !chatwoot_account_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "As credenciais de integração do WhatsApp ainda não foram configuradas para esta empresa.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Resolve o inbox_id a partir do channel_id selecionado na tabela chatwoot_channels
    let targetInboxId: string | number = channel_id;
    let channelName = "Canal Principal";

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channel_id);
    if (isUuid) {
      const { data: channelRow } = await supabase
        .from("chatwoot_channels")
        .select("id, inbox_id, nome")
        .eq("id", channel_id)
        .eq("company_id", company_id)
        .maybeSingle();

      if (channelRow?.inbox_id) {
        targetInboxId = channelRow.inbox_id;
        channelName = channelRow.nome || channelName;
      }
    } else {
      const { data: channelByInbox } = await supabase
        .from("chatwoot_channels")
        .select("id, inbox_id, nome")
        .eq("inbox_id", String(channel_id))
        .eq("company_id", company_id)
        .maybeSingle();

      if (channelByInbox) {
        targetInboxId = channelByInbox.inbox_id;
        channelName = channelByInbox.nome || channelName;
      }
    }

    const cleanBaseUrl = chatwoot_url.replace(/\/+$/, "");
    const endpoint = `${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/conversations?inbox_id=${encodeURIComponent(
      String(targetInboxId)
    )}&status=open`;

    console.log(`📲 [List WhatsApp Conversations] Consultando conversas abertas: ${endpoint}`);

    const cwResponse = await fetch(endpoint, {
      method: "GET",
      headers: {
        "api_access_token": chatwoot_api_access_token,
        "Content-Type": "application/json",
      },
    });

    if (!cwResponse.ok) {
      const errBody = await cwResponse.text().catch(() => "");
      console.error(`❌ Erro HTTP ${cwResponse.status} ao listar conversas:`, errBody);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Não foi possível consultar as conversas do canal selecionado (HTTP ${cwResponse.status}).`,
          details: errBody,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cwJson = await cwResponse.json();
    // Na API v1 do Chatwoot, a lista fica em data.payload ou payload
    const rawConversations: any[] = Array.isArray(cwJson?.data?.payload)
      ? cwJson.data.payload
      : Array.isArray(cwJson?.payload)
      ? cwJson.payload
      : Array.isArray(cwJson)
      ? cwJson
      : [];

    // 3. Verifica quais conversas já possuem chamado vinculado nesta empresa
    const { data: existingTickets } = await supabase
      .from("tickets")
      .select("id, chatwoot_conversation_id, assunto, status")
      .eq("company_id", company_id);

    const existingConvMap = new Map<string, { ticket_id: string; status: string }>();
    (existingTickets || []).forEach((t: any) => {
      if (t.chatwoot_conversation_id) {
        existingConvMap.set(String(t.chatwoot_conversation_id), {
          ticket_id: t.id,
          status: t.status,
        });
      } else if (t.assunto) {
        const match = String(t.assunto).match(/#(\d+)/);
        if (match && match[1]) {
          existingConvMap.set(match[1], {
            ticket_id: t.id,
            status: t.status,
          });
        }
      }
    });

    const conversations = rawConversations.map((conv: any) => {
      const sender = conv?.meta?.sender || conv?.contact || {};
      const messages = Array.isArray(conv?.messages) ? conv.messages : [];
      const lastMsgObj =
        conv?.last_non_activity_message ||
        messages[messages.length - 1] ||
        null;

      const lastMessageText =
        lastMsgObj?.content ||
        conv?.last_message?.content ||
        "Conversa ativa no WhatsApp";

      const rawTimestamp =
        lastMsgObj?.created_at ||
        conv?.last_activity_at ||
        conv?.timestamp ||
        conv?.created_at;

      const lastActivityIso = rawTimestamp
        ? typeof rawTimestamp === "number"
          ? new Date(rawTimestamp * 1000).toISOString()
          : new Date(rawTimestamp).toISOString()
        : new Date().toISOString();

      const linkedTicket = existingConvMap.get(String(conv.id)) || null;

      return {
        conversation_id: conv.id,
        inbox_id: conv.inbox_id || targetInboxId,
        channel_name: channelName,
        contact_name: sender?.name || "Contato WhatsApp",
        contact_phone: sender?.phone_number || sender?.identifier || "",
        contact_email: sender?.email || "",
        contact_avatar: sender?.thumbnail || sender?.avatar_url || null,
        last_message: lastMessageText,
        last_activity_at: lastActivityIso,
        unread_count: conv?.unread_count || 0,
        status: conv?.status || "open",
        already_imported: Boolean(linkedTicket),
        existing_ticket_id: linkedTicket?.ticket_id || null,
        existing_ticket_status: linkedTicket?.status || null,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        inbox_id: targetInboxId,
        channel_name: channelName,
        count: conversations.length,
        conversations,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("❌ [List WhatsApp Conversations] Erro inesperado:", err.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "Erro interno ao listar conversas do WhatsApp.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

