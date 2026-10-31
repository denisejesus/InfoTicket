import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.10.0";

/**
 * InfoTicket - Test SMTP Connection Edge Function v1.18.2
 * Valida credenciais e handshake do servidor SMTP corporativo no backend (Deno)
 * Suporte robusto a CORS e retorno transparente de mensagens de erro
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TestSmtpPayload {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_from_email?: string;
  smtp_from_name?: string;
  recipient_test_email?: string;
}

serve(async (req: Request) => {
  // Tratamento de pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Método não permitido. Utilize POST." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: TestSmtpPayload = await req.json();
    const {
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_password,
      smtp_from_email,
      smtp_from_name,
      recipient_test_email,
    } = body;

    if (!smtp_host || !smtp_port || !smtp_user || !smtp_password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Parâmetros obrigatórios ausentes: Servidor Host, Porta, Usuário e Senha são indispensáveis.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const portNum = Number(smtp_port);
    const isSecurePort = portNum === 465;

    console.log(`📡 [Test SMTP v1.18.2] Conectando a ${smtp_host}:${portNum} (usuário: ${smtp_user})...`);

    // Cria o transporte SMTP com Nodemailer
    const transporter = nodemailer.createTransport({
      host: smtp_host.trim(),
      port: portNum,
      secure: isSecurePort, // true para 465 (SSL), false para 587 (STARTTLS)
      auth: {
        user: smtp_user.trim(),
        pass: smtp_password.trim(),
      },
      tls: {
        rejectUnauthorized: false, // Evita rejeição de certificados auto-assinados de VPS/provedores
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    // 1. Testa verificação de credenciais e handshake SMTP (transporter.verify)
    try {
      await transporter.verify();
      console.log("✅ [Test SMTP v1.18.2] Handshake e credenciais SMTP validados com sucesso!");
    } catch (verifyErr: any) {
      console.error("❌ [Test SMTP v1.18.2] Falha no handshake SMTP:", verifyErr.message);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Falha na autenticação SMTP: ${verifyErr.message}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Se informado e-mail de teste, realiza envio de mensagem teste
    const fromAddr = smtp_from_email?.trim() || smtp_user.trim();
    const fromName = smtp_from_name?.trim() || "InfoTicket Teste";
    const targetRecipient = recipient_test_email?.trim() || smtp_user.trim();

    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromAddr}>`,
        to: targetRecipient,
        subject: "[InfoTicket] Teste de Conexão SMTP Bem-Sucedido",
        text: `Olá!\n\nEste é um e-mail de teste disparado pelo InfoTicket para validar as credenciais do seu servidor SMTP.\n\nServidor: ${smtp_host}\nPorta: ${portNum}\nUsuário: ${smtp_user}\nData/Hora: ${new Date().toLocaleString("pt-BR")}\n\nSeu servidor de e-mail está configurado e pronto para uso em produção!`,
      });
      console.log(`✉️ [Test SMTP v1.18.2] E-mail de confirmação enviado para: ${targetRecipient}`);
    } catch (sendErr: any) {
      console.warn("⚠️ [Test SMTP v1.18.2] Conexão válida, mas envio do e-mail teste falhou:", sendErr.message);
      return new Response(
        JSON.stringify({
          success: true,
          message: `Conexão e autenticação SMTP validadas com sucesso! (Aviso no envio de teste: ${sendErr.message})`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Servidor SMTP validado com sucesso! Um e-mail de teste foi enviado para ${targetRecipient}.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ [Test SMTP Fatal]:", error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Erro interno ao processar teste do servidor SMTP.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

