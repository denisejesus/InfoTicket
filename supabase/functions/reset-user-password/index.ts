import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * TicketFlow - Reset User Password Edge Function v1.18.0
 * Força a alteração de senha de um usuário no Supabase Auth via Service Role
 * Resolve o usuário pelo ID ou pelo e-mail caso os IDs de `profiles` e `auth.users` divirjam
 * Permite também a criação direta de credencial para novos usuários criados no sistema,
 * garantindo estritamente a sincronização de ID, company_id e client_organization_id em public.profiles
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
  company_id?: string;
  client_organization_id?: string | null;
  nome?: string;
  role?: string;
  recebe_notificacoes?: boolean;
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
    const { 
      user_id, 
      email, 
      new_password, 
      company_id, 
      client_organization_id, 
      nome, 
      role, 
      recebe_notificacoes 
    } = body;

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

    console.log(`🔐 [Reset Password] Solicitada redefinição para user_id: ${user_id || 'novo'}, email: ${email || 'não informado'}`);

    let targetAuthUserId: string | null = null;
    let targetEmail: string | null = email?.trim().toLowerCase() || null;

    // Se o email não veio no body mas veio user_id, busca no profile
    if (!targetEmail && user_id) {
      const { data: profileData } = await supabaseAdmin
        .from("profiles")
        .select("id, email, company_id, client_organization_id, nome, role")
        .eq("id", user_id)
        .single();

      if (profileData?.email) {
        targetEmail = profileData.email.trim().toLowerCase();
      }
    }

    // 1. Tentar localizar usuário existente em auth.users
    // A) Se veio user_id, tenta atualizar diretamente
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

    // B) Se não localizou por user_id, pesquisa por e-mail
    if (!targetAuthUserId && targetEmail) {
      if (user_id) {
        console.warn(`⚠️ Tentativa direta por user_id ${user_id} retornou: ${directError?.message}. Verificando por e-mail no Auth...`);
      }

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
        }
      }

      // C) Se o usuário NÃO existe em auth.users, cria estritamente via createUser()
      if (!targetAuthUserId) {
        console.log(`➕ [Reset Password] Criando novo usuário no Supabase Auth para ${targetEmail}...`);
        const { data: newAuthData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: targetEmail,
          password: new_password,
          email_confirm: true,
          user_metadata: {
            nome: nome || '',
            role: role || 'Operador',
            company_id: company_id || '',
          },
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
        console.log(`✅ [Reset Password] Usuário criado no Auth com ID estrito: ${targetAuthUserId}`);
      }
    }

    if (!targetAuthUserId) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Falha ao identificar ou provisionar usuário no Auth: ${directError?.message || 'User not found'}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Sincronização Estrita da Tabela profiles:
    // O ID da linha em profiles DEVE ser estritamente targetAuthUserId
    try {
      // Verifica se já existe perfil com o mesmo targetAuthUserId
      const { data: existingProfileById } = await supabaseAdmin
        .from("profiles")
        .select("id, email, company_id, client_organization_id")
        .eq("id", targetAuthUserId)
        .maybeSingle();

      // Verifica se há perfil com o mesmo e-mail mas ID divergente
      let existingProfileByEmail: any = null;
      if (targetEmail) {
        const { data: pEmail } = await supabaseAdmin
          .from("profiles")
          .select("id, email, company_id, client_organization_id")
          .eq("email", targetEmail)
          .maybeSingle();
        existingProfileByEmail = pEmail;
      }

      const finalCompanyId = company_id || existingProfileById?.company_id || existingProfileByEmail?.company_id;
      const finalClientOrgId = client_organization_id !== undefined 
        ? client_organization_id 
        : (existingProfileById?.client_organization_id ?? existingProfileByEmail?.client_organization_id ?? null);

      if (existingProfileById) {
        // Atualiza o perfil existente garantindo company_id e client_organization_id
        await supabaseAdmin
          .from("profiles")
          .update({
            company_id: finalCompanyId,
            client_organization_id: finalClientOrgId,
            ...(nome ? { nome } : {}),
            ...(role ? { role } : {}),
            ...(recebe_notificacoes !== undefined ? { recebe_notificacoes } : {}),
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", targetAuthUserId);
        console.log(`✅ [Reset Password] Perfil existente (ID ${targetAuthUserId}) sincronizado com sucesso.`);
      } else if (existingProfileByEmail && existingProfileByEmail.id !== targetAuthUserId) {
        // Se existia com outro ID (gerado aleatoriamente), remove o registro antigo e recria com targetAuthUserId
        console.log(`🔄 [Reset Password] Corrigindo divergência de ID em profiles: trocando ${existingProfileByEmail.id} por ${targetAuthUserId}...`);
        await supabaseAdmin
          .from("profiles")
          .delete()
          .eq("id", existingProfileByEmail.id);

        await supabaseAdmin
          .from("profiles")
          .insert({
            id: targetAuthUserId,
            company_id: finalCompanyId,
            client_organization_id: finalClientOrgId,
            nome: nome || existingProfileByEmail.nome || targetEmail.split('@')[0],
            email: targetEmail,
            role: role || existingProfileByEmail.role || 'Operador',
            recebe_notificacoes: recebe_notificacoes ?? existingProfileByEmail.recebe_notificacoes ?? true,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
          });
        console.log(`✅ [Reset Password] Perfil recriado com ID estrito de auth.users: ${targetAuthUserId}`);
      } else {
        // Criação de perfil novo caso ainda não exista
        await supabaseAdmin
          .from("profiles")
          .insert({
            id: targetAuthUserId,
            company_id: finalCompanyId,
            client_organization_id: finalClientOrgId,
            nome: nome || targetEmail?.split('@')[0] || 'Usuário',
            email: targetEmail,
            role: role || 'Operador',
            recebe_notificacoes: recebe_notificacoes ?? true,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
          });
        console.log(`✅ [Reset Password] Novo perfil criado em profiles com ID estrito: ${targetAuthUserId}`);
      }
    } catch (e: any) {
      console.warn("⚠️ Aviso ao sincronizar profiles com targetAuthUserId:", e.message || e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Senha e credencial sincronizadas com sucesso!",
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
