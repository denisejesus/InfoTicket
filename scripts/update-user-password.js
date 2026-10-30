import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://vrkhkifhkztttukuxbwz.supabase.co';
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('Service role key não encontrada no .env');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function updateUser() {
  const email = 'oj.denise@gmail.com';
  console.log(`Buscando usuário ${email}...`);

  // 1. Listar usuários para encontrar o ID
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    console.error('Erro ao listar usuários:', listError);
    return;
  }

  const targetUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (!targetUser) {
    console.log(`Usuário ${email} não encontrado no Auth. Lista de usuários cadastrados:`);
    users.forEach(u => console.log(`- ${u.email} (id: ${u.id}, confirmed: ${u.email_confirmed_at})`));
    return;
  }

  console.log(`Usuário encontrado: ID = ${targetUser.id}, email_confirmed_at = ${targetUser.email_confirmed_at}`);

  // 2. Atualizar senha e confirmar o e-mail (email_confirm: true)
  const { data: updatedData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    targetUser.id,
    {
      password: 'r2d2c3p0',
      email_confirm: true
    }
  );

  if (updateError) {
    console.error('Erro ao atualizar usuário:', updateError);
    return;
  }

  console.log('✅ Usuário atualizado com sucesso!');
  console.log('E-mail:', updatedData.user.email);
  console.log('Confirmado em:', updatedData.user.email_confirmed_at);
  console.log('Senha alterada para: r2d2c3p0');
}

updateUser();
