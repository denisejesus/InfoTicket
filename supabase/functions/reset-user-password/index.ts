import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * InfoTicket - Reset User Password Edge Function v1.15.0
 * Força a alteração de senha de um usuário no Supabase Auth via Service Role
 * Chamado pelo Gestor/Super Admin na gestão de usuários
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ResetPasswordPayload {
  user_id: string;
  new_password: string;
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

    const body: ResetPasswordPayload = await req.json();
    const { user_id, new_password } = body;

    if (!user_id || !new_password) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Parâmetros user_id e new_password são obrigatórios.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new_password.length < 6) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "A nova senha deve ter no mínimo 6 caracteres.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("❌ Credenciais do Supabase ausentes.");
      return new Response(
        JSON.stringify({
          success: false,
          message: "Configuração do servidor incompleta (chaves de ambiente ausentes).",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log(`🔐 [Reset Password] Redefinindo senha para o usuário ID: ${user_id}`);

    // Executa a alteração no Auth admin
    const { data: userData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { password: new_password }
    );

    if (updateError) {
      console.error("❌ Erro ao atualizar senha no Supabase Auth:", updateError.message);
      return new Response(
        JSON.stringify({
          success: false,
          message: `Falha ao redefinir senha no Auth: ${updateError.message}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Atualiza campo atualizado_em no profile
    try {
      await supabaseAdmin
        .from("profiles")
        .update({ atualizado_em: new Date().toISOString() })
        .eq("id", user_id);
    } catch (e) {
      console.warn("Aviso ao atualizar timestamp do profile:", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Senha redefinida com sucesso pelo administrador!",
        user: {
          id: userData.user?.id,
          email: userData.user?.email,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("❌ Erro inesperado na Edge Function:", err);
    return new Response(
      JSON.stringify({
        success: false,
        message: err.message || "Erro interno ao processar a redefinição de senha.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
