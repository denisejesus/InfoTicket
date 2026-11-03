import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * InfoTicket - Chatwoot Webhook Edge Function v1.8.0
 * Endpoint para recebimento assíncrono de mensagens e conversas originadas do Chat4u / Chatwoot
 * Cria ou atualiza chamados e interações no InfoTicket
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const payload = await req.json();
    console.log("📥 [Chatwoot Webhook] Payload recebido:", JSON.stringify(payload));

    const event = payload.event;
    console.log(`🔔 Evento detectado: ${event}`);

    // Inicialização do cliente Supabase com chave de serviço (Service Role)
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("❌ Credenciais do Supabase não configuradas no ambiente da Edge Function.");
      return new Response(
        JSON.stringify({ error: "Configuração do servidor incompleta (service role)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // Estrutura de integração Chatwoot -> Tabela tickets / ticket_messages
    if (event === "conversation_created" || event === "message_created") {
      const conversation = payload.conversation || payload;
      const conversationId = conversation.id;
      const messageContent =
        payload.content || conversation.messages?.[0]?.content || "Atendimento iniciado via WhatsApp";
      const sender = payload.sender || conversation.meta?.sender;
      const senderName = sender?.name || "Cliente WhatsApp";
      const senderEmail = sender?.email || null;
      // Extração flexível de telefone do remetente
      const rawPhone: string =
        sender?.phone_number ||
        sender?.phone ||
        conversation.meta?.sender?.phone_number ||
        conversation.meta?.sender?.phone ||
        "";

      console.log(`💬 Processando evento ${event} para conversa #${conversationId} de ${senderName} (Tel: ${rawPhone})`);

      // Normaliza apenas os dígitos do telefone para busca flexível
      const digitsOnly = rawPhone.replace(/\D/g, "");
      // Extrai os últimos 8 ou 9 dígitos para tolerar DDD e código de país (+55)
      const lastDigits = digitsOnly.length >= 8 ? digitsOnly.slice(-8) : digitsOnly;

      let matchedProfile: any = null;

      if (digitsOnly) {
        console.log(`🔍 Buscando cliente na tabela profiles com telefone contendo dígitos finais: ${lastDigits}`);
        
        // Busca profiles onde a role seja 'Cliente' ou qualquer perfil cujo whatsapp contenha os dígitos
        const { data: profilesFound, error: profileErr } = await supabase
          .from("profiles")
          .select("id, company_id, client_organization_id, nome, role, whatsapp")
          .not("whatsapp", "is", null);

        if (!profileErr && profilesFound && profilesFound.length > 0) {
          matchedProfile = profilesFound.find((p: any) => {
            if (!p.whatsapp) return false;
            const cleanProfPhone = p.whatsapp.replace(/\D/g, "");
            return cleanProfPhone.includes(lastDigits) || digitsOnly.includes(cleanProfPhone.slice(-8));
          });
        }
      }

      if (matchedProfile) {
        console.log(`🎯 Cliente identificado no InfoTicket: ${matchedProfile.nome} (ID: ${matchedProfile.id}, Tenant: ${matchedProfile.company_id})`);
      } else {
        console.log("ℹ️ Nenhum cliente cadastrado encontrado com este WhatsApp. Utilizando fallback.");
      }

      const companyId =
        matchedProfile?.company_id ||
        payload.custom_attributes?.company_id ||
        "00000000-0000-0000-0000-000000000001";

      const clienteId = matchedProfile?.id || null;
      const clientOrgId = matchedProfile?.client_organization_id || null;

      // 1. Verifica se já existe um chamado associado a esta conversa do WhatsApp
      const assuntoChamado = `Atendimento WhatsApp #${conversationId} - ${senderName}`;
      
      const { data: existingTicket } = await supabase
        .from("tickets")
        .select("id, company_id")
        .eq("assunto", assuntoChamado)
        .maybeSingle();

      let targetTicketId = existingTicket?.id;

      // 2. Se não existir, oficializa e cria o novo chamado na tabela tickets
      if (!targetTicketId) {
        console.log(`📋 Criando novo chamado na tabela tickets para a conversa #${conversationId}...`);
        const { data: newTicket, error: ticketError } = await supabase
          .from("tickets")
          .insert({
            company_id: companyId,
            cliente_id: clienteId,
            client_organization_id: clientOrgId,
            assunto: assuntoChamado,
            descricao: messageContent,
            status: "Aberto",
            prioridade: "Média",
          })
          .select("id")
          .single();

        if (ticketError) {
          console.error("❌ Falha ao criar chamado a partir do Chatwoot:", ticketError.message);
          throw ticketError;
        }

        targetTicketId = newTicket.id;
        console.log(`✅ Chamado criado com sucesso: ID ${targetTicketId} (Cliente: ${clienteId || "Não identificado"})`);
      }

      // 3. Insere a mensagem correspondente na linha do tempo (ticket_messages)
      if (targetTicketId && payload.content) {
        const { error: msgError } = await supabase
          .from("ticket_messages")
          .insert({
            ticket_id: targetTicketId,
            company_id: companyId,
            user_id: clienteId,
            content: payload.content,
            is_internal_note: payload.private || false,
            channel: "whatsapp",
          });

        if (msgError) {
          console.warn("⚠️ Aviso ao registrar mensagem da timeline:", msgError.message);
        } else {
          console.log(`✅ Mensagem vinculada ao chamado ${targetTicketId} via canal WhatsApp.`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Webhook do Chatwoot recebido e processado com sucesso.",
        event: event || "desconhecido",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("❌ [Chatwoot Webhook] Erro ao processar payload:", error.message);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno ao processar webhook." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
