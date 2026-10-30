import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * InfoTicket - Send WhatsApp Official Message Edge Function v1.16.4
 * Dispara mensagens oficiais de WhatsApp (Template Messages) via API do Chatwoot / Chat4u
 * POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages
 * Suporta canais múltiplos (chatwoot_channels) e templates homologados pela Meta
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SendWhatsAppOfficialPayload {
  ticket_id: string;
  company_id: string;
  channel_id?: string; // id ou inbox_id de chatwoot_channels
  whatsapp_template_name?: string | null;
  whatsapp_template_variables?: Record<string, any> | null;
  content?: string;
  message_id?: string;
  cliente_nome?: string | null;
  cliente_whatsapp?: string | null;
  cliente_email?: string | null;
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

    const payload: SendWhatsAppOfficialPayload = await req.json();
    console.log("1. Payload recebido:", JSON.stringify(payload));

    const {
      ticket_id,
      company_id,
      channel_id,
      whatsapp_template_name,
      whatsapp_template_variables,
      content,
      message_id,
      cliente_nome: payloadClienteNome,
      cliente_whatsapp: payloadClienteWhatsapp,
      cliente_email: payloadClienteEmail,
    } = payload;

    if (!ticket_id || !company_id) {
      return new Response(
        JSON.stringify({ error: "Parâmetros obrigatórios ausentes: ticket_id e company_id." }),
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

    // 1. Busca as credenciais de integração da empresa
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("id, razao_social, chatwoot_url, chatwoot_api_access_token, chatwoot_account_id, chatwoot_inbox_id")
      .eq("id", company_id)
      .single();

    if (companyErr || !company) {
      console.error("❌ Empresa não encontrada:", companyErr?.message);
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada no banco." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { chatwoot_url, chatwoot_api_access_token, chatwoot_account_id } = company;

    if (!chatwoot_url || !chatwoot_api_access_token || !chatwoot_account_id) {
      console.warn(`⚠️ Credenciais de Chat4u/Chatwoot ausentes na empresa ${company.razao_social}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Credenciais de WhatsApp (Chat4u/Chatwoot) incompletas na empresa. Configure a URL, Token e Account ID nas Configurações.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Determina o inbox_id a partir do canal informado (chatwoot_channels)
    let targetInboxId: number | string | null = company.chatwoot_inbox_id;

    if (channel_id) {
      console.log(`🔍 Buscando canal de envio selecionado: ${channel_id}`);
      // Pode vir como ID UUID ou como inbox_id numérico
      const { data: channelFound } = await supabase
        .from("chatwoot_channels")
        .select("id, inbox_id, nome")
        .or(`id.eq.${channel_id},inbox_id.eq.${channel_id}`)
        .eq("company_id", company_id)
        .maybeSingle();

      if (channelFound && channelFound.inbox_id) {
        targetInboxId = channelFound.inbox_id;
        console.log(`✅ Caixa de entrada identificada: ${channelFound.nome} (Inbox ID: ${targetInboxId})`);
      } else {
        // Se channel_id já for o valor de inbox_id numérico
        targetInboxId = channel_id;
      }
    }

    // 3. Busca dados do Chamado e Cliente
    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .select(`
        id,
        assunto,
        cliente_id,
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

    // Se a relação cliente não vier populada, busca diretamente na tabela profiles
    let clienteNome = (ticket.cliente as any)?.nome || payloadClienteNome || null;
    let clientePhone = (ticket.cliente as any)?.whatsapp || payloadClienteWhatsapp || null;
    let clienteEmail = (ticket.cliente as any)?.email || payloadClienteEmail || null;

    if ((!clientePhone || !clienteNome) && ticket.cliente_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, nome, email, whatsapp")
        .eq("id", ticket.cliente_id)
        .maybeSingle();

      if (prof) {
        clienteNome = clienteNome || prof.nome;
        clientePhone = clientePhone || prof.whatsapp;
        clienteEmail = clienteEmail || prof.email;
      }
    }

    clienteNome = clienteNome || "Cliente InfoTicket";

    // 4. Resolve template_name, variáveis e texto da mensagem
    let templateName = whatsapp_template_name;
    let templateVariables = whatsapp_template_variables;
    let messageContent = content;

    if (message_id && (!templateName || !templateVariables || !messageContent)) {
      const { data: msg } = await supabase
        .from("ticket_messages")
        .select("content, channel, is_internal_note, whatsapp_template_name, whatsapp_template_variables")
        .eq("id", message_id)
        .maybeSingle();

      if (msg) {
        templateName = templateName || msg.whatsapp_template_name;
        templateVariables = templateVariables || msg.whatsapp_template_variables;
        messageContent = messageContent || msg.content;
      }
    }

    const cleanBaseUrl = chatwoot_url.replace(/\/+$/, "");

    // 5. Determina o ID da conversa no Chatwoot (ou cria uma nova caso necessário)
    let conversationId = ticket.chatwoot_conversation_id;

    if (!conversationId && ticket.assunto) {
      const match = ticket.assunto.match(/Chat(?:4u|woot)\s*#(\d+)/i);
      if (match && match[1]) {
        conversationId = parseInt(match[1], 10);
      }
    }

    let debugContactInfo = {
      clienteNome,
      clientePhone,
      clienteEmail,
      targetInboxId,
      foundContactId: null as any,
      convCreateError: null as any,
      contactCreateError: null as any,
    };

    if (!conversationId) {
      // Higieniza o telefone para formato E.164 exigido pela Meta/Chatwoot (ex: +5511999999999)
      if (clientePhone) {
        const digits = clientePhone.replace(/\D/g, "");
        if (digits.length >= 10) {
          clientePhone = digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
        }
      }
      debugContactInfo.clientePhone = clientePhone;

      console.log(`🔍 [WhatsApp Official] Resolvendo contato e conversa no Chatwoot para ${clienteNome} (${clientePhone || clienteEmail}) na inbox ${targetInboxId}...`);

      if (targetInboxId && (clientePhone || clienteEmail)) {
        try {
          let contactId: string | number | null = null;

          // 1. Pesquisa no Chatwoot pelo telefone completo E pelos 8 dígitos finais
          const searchTerms = [
            clientePhone,
            clientePhone ? clientePhone.replace(/\D/g, "").slice(-8) : null,
            clientePhone ? clientePhone.replace(/\D/g, "") : null,
            clienteEmail,
            clienteNome,
          ].filter(Boolean);

          for (const term of searchTerms) {
            if (contactId) break;
            try {
              const searchRes = await fetch(`${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/contacts/search?q=${encodeURIComponent(term!)}`, {
                method: "GET",
                headers: {
                  "api_access_token": chatwoot_api_access_token,
                  "Content-Type": "application/json",
                },
              });
              if (searchRes.ok) {
                const searchJson = await searchRes.json();
                const foundContacts = searchJson?.payload || (Array.isArray(searchJson) ? searchJson : []);
                if (foundContacts.length > 0) {
                  contactId = foundContacts[0].id;
                  debugContactInfo.foundContactId = contactId;
                  console.log(`✅ Contato localizado no Chatwoot via termo '${term}': ID ${contactId} (${foundContacts[0].name})`);
                  break;
                }
              }
            } catch (searchErr: any) {
              console.warn(`⚠️ Aviso ao buscar contato por '${term}':`, searchErr.message);
            }
          }

          // 2. Se o contato não foi encontrado, tenta criar
          if (!contactId) {
            const contactRes = await fetch(`${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/contacts`, {
              method: "POST",
              headers: {
                "api_access_token": chatwoot_api_access_token,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                inbox_id: targetInboxId,
                name: clienteNome,
                email: clienteEmail,
                phone_number: clientePhone,
              }),
            });

            const contactData = await contactRes.json();
            contactId = contactData?.payload?.contact?.id || contactData?.id;
            if (!contactId) {
              debugContactInfo.contactCreateError = contactData;
            }

            // Se o contato falhou porque já existe (erro 422: Phone number already exists)
            if (!contactId && (contactData?.message?.includes?.("already exists") || contactData?.errors)) {
              console.log("ℹ️ Telefone já existe no Chatwoot, pesquisando novamente...");
              const reSearch = await fetch(`${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/contacts/search?q=${encodeURIComponent(clientePhone || clienteNome)}`, {
                method: "GET",
                headers: {
                  "api_access_token": chatwoot_api_access_token,
                  "Content-Type": "application/json",
                },
              });
              if (reSearch.ok) {
                const reSearchJson = await reSearch.json();
                const reFound = reSearchJson?.payload || (Array.isArray(reSearchJson) ? reSearchJson : []);
                if (reFound.length > 0) {
                  contactId = reFound[0].id;
                  debugContactInfo.foundContactId = contactId;
                  console.log(`✅ Contato recuperado após duplicidade: ID ${contactId}`);
                }
              }
            }
          }

          // 3. Se temos o contactId, busca ou cria uma conversa na inbox selecionada
          if (contactId) {
            // Tenta verificar se já existe conversa aberta para este contato nessa inbox
            try {
              const listConvRes = await fetch(`${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/contacts/${contactId}/conversations`, {
                method: "GET",
                headers: {
                  "api_access_token": chatwoot_api_access_token,
                  "Content-Type": "application/json",
                },
              });
              if (listConvRes.ok) {
                const listData = await listConvRes.json();
                const convs = listData?.payload || (Array.isArray(listData) ? listData : []);
                const matchInboxConv = convs.find((c: any) => String(c.inbox_id) === String(targetInboxId));
                if (matchInboxConv?.id) {
                  conversationId = matchInboxConv.id;
                  console.log(`✅ Conversa prévia localizada na Inbox #${targetInboxId}: Conv #${conversationId}`);
                }
              }
            } catch (errConvList: any) {
              console.warn("⚠️ Aviso ao listar conversas do contato:", errConvList.message);
            }

            // Se não encontrou conversa prévia na inbox, cria uma nova
            if (!conversationId) {
              const convRes = await fetch(`${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/conversations`, {
                method: "POST",
                headers: {
                  "api_access_token": chatwoot_api_access_token,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  inbox_id: targetInboxId,
                  contact_id: contactId,
                }),
              });

              if (convRes.ok) {
                const convData = await convRes.json();
                conversationId = convData?.id;
              } else {
                const convErrData = await convRes.json().catch(() => ({}));
                debugContactInfo.convCreateError = convErrData;
                console.warn("⚠️ Erro ao criar conversa no Chatwoot:", JSON.stringify(convErrData));
              }
            }

            if (conversationId) {
              await supabase
                .from("tickets")
                .update({ chatwoot_conversation_id: conversationId })
                .eq("id", ticket.id);
              console.log(`✅ Conversa vinculada ao chamado #${ticket.id}: Conv #${conversationId}`);
            }
          }
        } catch (setupErr: any) {
          console.warn("⚠️ Aviso ao resolver contato/conversa sob demanda no Chatwoot:", setupErr.message);
        }
      }
    }

    if (!conversationId) {
      console.warn(`⚠️ Não foi possível identificar ou abrir uma conversa no Chatwoot para o chamado #${ticket_id}:`, JSON.stringify(debugContactInfo));
      const reasonDetail = debugContactInfo.convCreateError
        ? ` (Erro conversa Chatwoot: ${JSON.stringify(debugContactInfo.convCreateError)})`
        : debugContactInfo.contactCreateError
        ? ` (Erro contato Chatwoot: ${JSON.stringify(debugContactInfo.contactCreateError)})`
        : ` (Dados resolvidos: Nome="${clienteNome}", Tel="${clientePhone}", Inbox="${targetInboxId}")`;

      return new Response(
        JSON.stringify({
          success: false,
          error: `Não foi possível localizar ou iniciar uma conversa no Chatwoot para este cliente.${reasonDetail}`,
          debug: debugContactInfo,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Constrói o payload exato para Template Messages (formato Meta / Chatwoot)
    // Extrai parâmetros para body ordenando numericamente se forem dígitos (1, 2, 3...)
    const bodyParamsDict: Record<string, string> = {};
    const bodyParamsArray: string[] = [];
    const templateParameters: any[] = [];

    if (templateVariables && typeof templateVariables === "object") {
      // Ordena chaves numéricas ou mantém
      const sortedKeys = Object.keys(templateVariables).sort((a, b) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });

      sortedKeys.forEach((key) => {
        const val = String(templateVariables[key] ?? "");
        bodyParamsDict[key] = val;
        bodyParamsArray.push(val);
        templateParameters.push({
          type: "text",
          text: val,
          parameter_name: key,
        });
      });
    }

    const requestBody: Record<string, any> = {
      content: messageContent || "Mensagem de modelo WhatsApp oficial",
      message_type: "outgoing",
      private: false,
    };

    if (templateName) {
      requestBody.template_params = {
        name: templateName,
        category: "UTILITY",
        language: "pt_BR",
        processed_params: {
          body: bodyParamsDict,
          ...templateVariables,
        },
        components: [
          {
            type: "body",
            parameters: templateParameters,
          },
        ],
      };
    }

    // 7. Requisição POST para a API do Chatwoot
    const sendEndpoint = `${cleanBaseUrl}/api/v1/accounts/${chatwoot_account_id}/conversations/${conversationId}/messages`;
    console.log(`🚀 [Chatwoot API] Disparando Template WhatsApp Oficial para: ${sendEndpoint}`);

    const chatwootResponse = await fetch(sendEndpoint, {
      method: "POST",
      headers: {
        "api_access_token": chatwoot_api_access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseData = await chatwootResponse.json().catch(() => ({}));

    if (!chatwootResponse.ok) {
      console.error("❌ Falha na API do Chatwoot:", JSON.stringify(responseData));
      const errorMsg =
        responseData?.message ||
        responseData?.error ||
        responseData?.errors?.join?.(", ") ||
        "Erro retornado pela API do Chatwoot.";
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMsg,
          details: responseData,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Mensagem enviada com sucesso no Chatwoot: ID ${responseData?.id}`);

    // 8. Adiciona registro na tabela audit_logs
    await supabase.from("audit_logs").insert({
      company_id: company_id,
      ticket_id: ticket_id,
      acao: "Mensagem Oficial de WhatsApp enviada via Chat4u",
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Mensagem Oficial de WhatsApp enviada via Chat4u com sucesso.",
        chatwoot_message_id: responseData?.id,
        conversation_id: conversationId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("❌ [Send WhatsApp Official] Erro inesperado:", err.message);
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno na Edge Function." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
