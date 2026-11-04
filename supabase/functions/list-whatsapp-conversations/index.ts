import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * TicketFlow - List WhatsApp Conversations Edge Function v1.2.0
 * Lista as conversas abertas de um Canal de WhatsApp (inbox_id) da empresa ativa
 * GET /api/v1/accounts/{account_id}/conversations?inbox_id={inbox_id}&status=open
 * Identifica apenas chamados ATIVOS ('Aberto', 'Em Atendimento', 'Em Andamento', 'Aguardando Cliente'),
 * ignorando chamados já concluídos ou fechados.
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
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // 3. Verifica quais conversas ou números de WhatsApp possuem chamado ATIVO nesta empresa (ignora Fechado/Resolvido/Concluído)
    const [{ data: existingTickets }, { data: companyProfiles }] = await Promise.all([
      supabase
        .from("tickets")
        .select("id, cliente_id, chatwoot_conversation_id, assunto, status, criado_em")
        .eq("company_id", company_id)
        .in("status", ["Aberto", "Em Atendimento", "Em Andamento", "Aguardando Cliente"])
        .order("criado_em", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, whatsapp")
        .eq("company_id", company_id)
        .not("whatsapp", "is", null),
    ]);

    const profilePhoneById = new Map<string, string>();
    (companyProfiles || []).forEach((p: any) => {
      const digits = String(p.whatsapp || "").replace(/\D/g, "");
      if (digits.length >= 8) {
        profilePhoneById.set(p.id, digits);
      }
    });

    const existingConvMap = new Map<string, { ticket_id: string; status: string }>();
    const existingPhoneSuffixMap = new Map<string, { ticket_id: string; status: string }>();

    (existingTickets || []).forEach((t: any) => {
      if (t.chatwoot_conversation_id && !existingConvMap.has(String(t.chatwoot_conversation_id))) {
        existingConvMap.set(String(t.chatwoot_conversation_id), {
          ticket_id: t.id,
          status: t.status,
        });
      }
      if (t.cliente_id && profilePhoneById.has(t.cliente_id)) {
        const phoneDigits = profilePhoneById.get(t.cliente_id)!;
        const suffix8 = phoneDigits.slice(-8);
        if (!existingPhoneSuffixMap.has(suffix8)) {
          existingPhoneSuffixMap.set(suffix8, {
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

      const rawContactPhone = sender?.phone_number || sender?.identifier || "";
      const contactDigits = String(rawContactPhone).replace(/\D/g, "");
      const contactSuffix8 = contactDigits.length >= 8 ? contactDigits.slice(-8) : "";

      const linkedTicket =
        (contactSuffix8 ? existingPhoneSuffixMap.get(contactSuffix8) : null) ||
        existingConvMap.get(String(conv.id)) ||
        null;

      // Extrai as últimas interações (até 5 mensagens reais) caso venham no payload da conversa
      const validConvMessages = messages
        .filter((m: any) => m?.message_type !== 2 && m?.message_type !== "activity" && m?.content && String(m.content).trim().length > 0)
        .sort((a: any, b: any) => {
          const tA = typeof a.created_at === "number" ? a.created_at * 1000 : new Date(a.created_at || 0).getTime();
          const tB = typeof b.created_at === "number" ? b.created_at * 1000 : new Date(b.created_at || 0).getTime();
          return tA - tB;
        })
        .slice(-5)
        .map((m: any) => {
          const isIncoming = m.message_type === 0 || m.message_type === "incoming";
          const senderLabel = m?.sender?.name || (isIncoming ? (sender?.name || "Cliente") : "Atendente");
          const createdIso = m.created_at
            ? typeof m.created_at === "number"
              ? new Date(m.created_at * 1000).toISOString()
              : new Date(m.created_at).toISOString()
            : lastActivityIso;
          return {
            id: m.id,
            sender: senderLabel,
            is_incoming: isIncoming,
            content: String(m.content).trim(),
            created_at: createdIso,
          };
        });

      return {
        conversation_id: conv.id,
        inbox_id: conv.inbox_id || targetInboxId,
        channel_name: channelName,
        contact_name: sender?.name || "Contato WhatsApp",
        contact_phone: rawContactPhone,
        contact_email: sender?.email || "",
        contact_avatar: sender?.thumbnail || sender?.avatar_url || null,
        last_message: lastMessageText,
        last_activity_at: lastActivityIso,
        unread_count: conv?.unread_count || 0,
        status: conv?.status || "open",
        already_imported: Boolean(linkedTicket),
        existing_ticket_id: linkedTicket?.ticket_id || null,
        existing_ticket_status: linkedTicket?.status || null,
        recent_messages: validConvMessages,
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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

