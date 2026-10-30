import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * InfoTicket - Test Chatwoot Connection Edge Function v1.11.1
 * Evita bloqueios de CORS ao validar credenciais do Chatwoot no lado do servidor (Deno)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TestPayload {
  chatwoot_url: string;
  chatwoot_api_access_token: string;
  chatwoot_account_id?: number | null;
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

    const body: TestPayload = await req.json();
    const { chatwoot_url, chatwoot_api_access_token, chatwoot_account_id } = body;

    if (!chatwoot_url || !chatwoot_api_access_token) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "URL Base e Access Token são obrigatórios para validar a conexão.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanUrl = chatwoot_url.replace(/\/+$/, "");

    // Endpoint prioritário: se houver account_id testa caixas de entrada ou profile
    const testEndpoint = chatwoot_account_id
      ? `${cleanUrl}/api/v1/accounts/${chatwoot_account_id}/inboxes`
      : `${cleanUrl}/api/v1/profile`;

    console.log(`📡 [Chatwoot Test Proxy] Testando endpoint: ${testEndpoint}`);

    // Cria timeout para evitar requisição pendente por tempo excessivo
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(testEndpoint, {
        method: "GET",
        headers: {
          "api_access_token": chatwoot_api_access_token,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      console.error("❌ Erro de rede ao conectar no Chatwoot:", fetchErr.message);
      return new Response(
        JSON.stringify({
          success: false,
          message: `Não foi possível conectar ao servidor Chatwoot (${cleanUrl}): ${fetchErr.message}. Verifique se a URL está acessível.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      let inboxesCount = 0;
      try {
        const data = await response.json();
        if (Array.isArray(data)) {
          inboxesCount = data.length;
        } else if (data?.payload && Array.isArray(data.payload)) {
          inboxesCount = data.payload.length;
        }
      } catch {
        // Se a resposta for vazia ou texto
      }

      console.log("✅ [Chatwoot Test Proxy] Conexão bem-sucedida!");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Conexão com o Chatwoot validada com sucesso pelo servidor!",
          inboxesCount,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const status = response.status;
      const statusText = response.statusText;
      let errorDetail = "";
      try {
        const errorBody = await response.text();
        errorDetail = errorBody.slice(0, 150);
      } catch {
        // Ignora erro de leitura
      }

      console.warn(`⚠️ [Chatwoot Test Proxy] Retornou HTTP ${status}: ${statusText}`);
      return new Response(
        JSON.stringify({
          success: false,
          message: `Servidor Chatwoot retornou status HTTP ${status} (${statusText || "Não autorizado / Não encontrado"}). ${errorDetail}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("❌ [Chatwoot Test Proxy] Exceção:", error.message);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Erro interno ao processar teste do Chatwoot.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
