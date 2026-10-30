import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * InfoTicket - Get Chatwoot Templates Edge Function v1.16.4
 * Busca modelos oficiais de WhatsApp (Meta Templates) aprovados na caixa de entrada do Chatwoot / Chat4u
 * POST /functions/v1/get-chatwoot-templates
 * Espelha estritamente os modelos aprovados pela Meta para a inbox selecionada
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface GetTemplatesPayload {
  channel_id: string; // ID ou inbox_id do canal
  company_id: string;
}

export interface ChatwootTemplateItem {
  id?: string | number;
  name: string;
  category?: string;
  language?: string;
  status?: string;
  body_text?: string;
  variables: string[]; // ['1', '2'] etc
  components?: any[];
}

serve(async (req: Request) => {
  // 1. Tratamento de pre-flight CORS obrigatório
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

    let payload: GetTemplatesPayload;
    if (req.method === "POST") {
      payload = await req.json();
    } else {
      const url = new URL(req.url);
      payload = {
        channel_id: url.searchParams.get("channel_id") || "",
        company_id: url.searchParams.get("company_id") || "",
      };
    }

    console.log("📥 [Get Chatwoot Templates] Requisição recebida:", JSON.stringify(payload));
    const { channel_id, company_id } = payload;

    if (!channel_id || !company_id) {
      return new Response(
        JSON.stringify({ error: "Parâmetros obrigatórios ausentes: channel_id e company_id." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("❌ Credenciais do Supabase ausentes no servidor.");
      return new Response(
        JSON.stringify({ error: "Configuração do servidor incompleta (service role)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // 2. Busca credenciais de integração da empresa
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("id, razao_social, chatwoot_url, chatwoot_api_access_token, chatwoot_account_id, chatwoot_inbox_id")
      .eq("id", company_id)
      .single();

    if (companyErr || !company) {
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada no banco." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { chatwoot_url, chatwoot_api_access_token, chatwoot_account_id } = company;
    if (!chatwoot_url || !chatwoot_api_access_token || !chatwoot_account_id) {
      return new Response(
        JSON.stringify({
          error: "Credenciais do Chatwoot (URL, Token ou Account ID) não configuradas para esta empresa.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Identifica a Caixa de Entrada (inbox_id)
    let targetInboxId: string | number = channel_id;
    const { data: channelFound } = await supabase
      .from("chatwoot_channels")
      .select("id, inbox_id, nome")
      .or(`id.eq.${channel_id},inbox_id.eq.${channel_id}`)
      .eq("company_id", company_id)
      .maybeSingle();

    if (channelFound?.inbox_id) {
      targetInboxId = channelFound.inbox_id;
    }

    const cleanBaseUrl = chatwoot_url.replace(/\/+$/, "");
    console.log(`🔍 [Get Chatwoot Templates] Consultando API Chatwoot da Inbox #${targetInboxId}...`);

    let rawTemplates: any[] = [];
    const headers = {
      "api_access_token": chatwoot_api_access_token,
      "Content-Type": "application/json",
    };

    // Tentativa 1: Endpoint direto de templates da inbox (ou campanhas)
    const endpointsToTry = [
      `${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/inboxes/${targetInboxId}/message_templates`,
      `${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/inboxes/${targetInboxId}/whatsapp_templates`,
      `${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/inboxes/${targetInboxId}/campaigns/templates`,
      `${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/inboxes/${targetInboxId}`,
    ];

    for (const ep of endpointsToTry) {
      try {
        console.log(`🌐 Tentando endpoint: ${ep}`);
        const res = await fetch(ep, { method: "GET", headers });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json) && json.length > 0) {
            rawTemplates = json;
            console.log(`✅ ${json.length} templates retornados via ${ep}`);
            break;
          } else if (Array.isArray(json?.payload) && json.payload.length > 0) {
            rawTemplates = json.payload;
            console.log(`✅ ${json.payload.length} templates retornados no payload via ${ep}`);
            break;
          } else if (Array.isArray(json?.message_templates) && json.message_templates.length > 0) {
            rawTemplates = json.message_templates;
            console.log(`✅ ${json.message_templates.length} message_templates retornados via ${ep}`);
            break;
          } else if (json?.message_templates && Array.isArray(json.message_templates)) {
            rawTemplates = json.message_templates;
            console.log(`✅ message_templates encontrados no objeto da inbox via ${ep}`);
            break;
          }
        } else {
          console.log(`ℹ️ Endpoint ${ep} respondeu status ${res.status}`);
        }
      } catch (err: any) {
        console.warn(`⚠️ Erro ao consultar ${ep}:`, err.message);
      }
    }

    // Normaliza os templates extraindo o corpo de texto e as variáveis {{1}}, {{2}}
    const processedTemplates: ChatwootTemplateItem[] = [];

    for (const tmpl of rawTemplates) {
      const name = tmpl.name || tmpl.template_name || "";
      const status = tmpl.status || "APPROVED";
      const language = tmpl.language || "pt_BR";
      const category = tmpl.category || "UTILITY";

      // Extrai o texto do corpo a partir dos components (formato Meta)
      let bodyText = "";
      if (Array.isArray(tmpl.components)) {
        const bodyComp = tmpl.components.find((c: any) => c.type === "BODY" || c.type === "body");
        if (bodyComp?.text) {
          bodyText = bodyComp.text;
        }
      }
      if (!bodyText && tmpl.body) {
        bodyText = typeof tmpl.body === "string" ? tmpl.body : tmpl.body.text || "";
      }
      if (!bodyText && tmpl.content) {
        bodyText = tmpl.content;
      }

      // Encontra variáveis numéricas ou nomeadas: {{1}}, {{2}} ou {{nome}}
      const varMatches = bodyText.match(/\{\{([^}]+)\}\}/g) || [];
      const variables = Array.from(new Set(varMatches.map((m: string) => m.replace(/\{\{|\}\}/g, "").trim())))
        .sort((a, b) => {
          const numA = parseInt(a, 10);
          const numB = parseInt(b, 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.localeCompare(b);
        });

      processedTemplates.push({
        id: tmpl.id || name,
        name,
        category,
        language,
        status,
        body_text: bodyText || `Modelo oficial ${name}`,
        variables,
        components: tmpl.components || [],
      });
    }

    console.log(`🚀 Retornando ${processedTemplates.length} modelos processados para o frontend.`);

    return new Response(
      JSON.stringify({
        success: true,
        count: processedTemplates.length,
        templates: processedTemplates,
        inbox_id: targetInboxId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("❌ [Get Chatwoot Templates] Erro fatal:", err.message);
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno ao buscar templates do Chatwoot." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
