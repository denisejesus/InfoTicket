import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * TicketFlow - Reset User Password Edge Function v1.17.0
 * Força a alteração de senha de um usuário no Supabase Auth via Service Role
 * Resolve o usuário pelo ID ou pelo e-mail caso os IDs de `profiles` e `auth.users` divirjam
 * Permite também a criação direta de credencial para novos usuários criados no sistema
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ResetPasswordPayload {
  user_id?: string;
  email?: string;
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
    const { user_id, email, new_password } = body;

    if ((!user_id && !email) || !new_password) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Parâmetros (user_id ou email) e new_password são obrigatórios.",
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

    console.log(`🔐 [Reset Password] Solicitada redefinição para user_id: ${user_id}, email: ${email || 'não informado'}`);

    // 1. Tentar localizar o usuário diretamente em auth.users
    let targetAuthUserId: string | null = null;
    let targetEmail: string | null = email?.trim().toLowerCase() || null;

    // Se o email não veio no body, busca no profile correspondente ao user_id
    if (!targetEmail) {
      const { data: profileData } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .eq("id", user_id)
        .single();

      if (profileData?.email) {
        targetEmail = profileData.email.trim().toLowerCase();
      }
    }

    // Se passou user_id, tenta atualizar diretamente pelo user_id
    let directError: any = null;
    if (user_id) {
      const { data: directData, error: dErr } = await supabaseAdmin.auth.admin.updateUserById(
        user_id,
        { password: new_password }
      );
      directError = dErr;

      if (!directError && directData?.user) {
        targetAuthUserId = directData.user.id;
        console.log(`✅ [Reset Password] Senha atualizada com sucesso diretamente pelo ID: ${targetAuthUserId}`);
      }
    }

    if (!targetAuthUserId) {
      if (user_id) {
        console.warn(`⚠️ Tentativa direta por user_id ${user_id} retornou: ${directError?.message}. Tentando busca por e-mail...`);
      }

      // Se falhou por "User not found" ou divergência de ID, busca em auth.users pelo e-mail
      if (targetEmail) {
        // Lista usuários do Auth para encontrar o ID correspondente ao e-mail
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });

        if (!listError && listData?.users) {
          const authUser = listData.users.find(
            (u) => u.email?.trim().toLowerCase() === targetEmail
          );

          if (authUser) {
            targetAuthUserId = authUser.id;
            console.log(`🔍 [Reset Password] Usuário localizado no Auth pelo e-mail ${targetEmail}: ID ${targetAuthUserId}`);
            
            const { error: fallbackUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
              targetAuthUserId,
              { password: new_password }
            );

            if (fallbackUpdateError) {
              console.error("❌ Erro ao atualizar senha via Auth ID:", fallbackUpdateError.message);
              return new Response(
                JSON.stringify({
                  success: false,
                  message: `Falha ao redefinir senha no Auth: ${fallbackUpdateError.message}`,
                }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          } else {
            // Usuário existe na tabela profiles mas ainda não foi criado em auth.users: cria diretamente com a nova senha
            console.log(`➕ [Reset Password] Usuário ${targetEmail} não encontrado no Auth. Criando usuário no Supabase Auth...`);
            const { data: newAuthData, error: createError } = await supabaseAdmin.auth.admin.createUser({
              email: targetEmail,
              password: new_password,
              email_confirm: true,
            });

            if (createError) {
              console.error("❌ Erro ao criar usuário no Auth:", createError.message);
              return new Response(
                JSON.stringify({
                  success: false,
                  message: `Falha ao criar credencial de autenticação: ${createError.message}`,
                }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }

            targetAuthUserId = newAuthData.user?.id || null;
            console.log(`✅ [Reset Password] Usuário criado no Auth com a nova senha: ID ${targetAuthUserId}`);
          }
        }
      }

      if (!targetAuthUserId) {
        return new Response(
          JSON.stringify({
            success: false,
            message: `Falha ao redefinir senha no Auth: ${directError?.message || 'User not found'}`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 2. Atualiza timestamp e, se necessário, sincroniza na tabela profiles
    try {
      if (user_id) {
        await supabaseAdmin
          .from("profiles")
          .update({ atualizado_em: new Date().toISOString() })
          .eq("id", user_id);
      } else if (targetEmail) {
        await supabaseAdmin
          .from("profiles")
          .update({ atualizado_em: new Date().toISOString() })
          .eq("email", targetEmail);
      }
    } catch (e) {
      console.warn("Aviso ao atualizar timestamp do profile:", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Senha redefinida com sucesso pelo administrador!",
        user: {
          id: targetAuthUserId,
          email: targetEmail,
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
