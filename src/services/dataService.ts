import { supabase } from '../lib/supabase';
import { Company, Profile, Ticket, CommunicationTemplate, TicketAttachment, ChatwootChannel, AppNotification } from '../types/database';

/**
 * Serviço de dados do TicketFlow v1.29.0
 * Consome exclusivamente o Supabase sem mocks hardcoded
 */
export const dataService = {
  /**
   * Gera uma senha temporária aleatória e segura (mínimo 10 caracteres alfanuméricos)
   */
  generateSecureTemporaryPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pass = '';
    const array = new Uint32Array(10);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
      for (let i = 0; i < 10; i++) {
        pass += chars[array[i] % chars.length];
      }
    } else {
      for (let i = 0; i < 10; i++) {
        pass += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    return pass;
  },

  /**
   * Cria um novo perfil na tabela profiles (RBAC / Gestão de Equipe e Clientes)
   * Provisiona a credencial de acesso diretamente no Supabase Auth via Service Role (Edge Function),
   * garantindo que o ID de profiles seja estritamente o user_id do auth.users,
   * e dispara a notificação de boas-vindas com a senha real temporária gerada.
   */
  async createProfile(profileData: {
    company_id: string;
    client_organization_id?: string | null;
    nome: string;
    email: string;
    whatsapp?: string | null;
    role: string;
    recebe_notificacoes: boolean;
    temporary_password?: string;
  }): Promise<{ profile: Profile; temporaryPassword: string }> {
    // Validação crítica de segurança contra escalonamento de privilégios para 'Super Admin'
    if (profileData.role.trim() === 'Super Admin') {
      const { data: authSession } = await supabase.auth.getUser();
      const callerId = authSession?.user?.id;
      if (!callerId) {
        throw new Error('Bloqueio de segurança: Sessão inválida para conceder o papel Super Admin.');
      }
      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', callerId)
        .maybeSingle();

      if (callerProfile?.role !== 'Super Admin') {
        throw new Error('Bloqueio de segurança: Apenas um Super Admin autenticado pode criar um usuário com papel Super Admin.');
      }
    }

    const rawEmail = profileData.email.trim().toLowerCase();
    const tempPassword = profileData.temporary_password || this.generateSecureTemporaryPassword();

    // 1. Provisiona a credencial de autenticação no Supabase Auth via Edge Function reset-user-password (Service Role)
    let authUserId: string | null = null;
    try {
      console.log(`🔐 Provisionando usuário no Supabase Auth: ${rawEmail}...`);
      const authRes = await this.resetUserPassword(undefined, tempPassword, rawEmail, {
        company_id: profileData.company_id,
        client_organization_id: profileData.client_organization_id || null,
        nome: profileData.nome.trim(),
        role: profileData.role,
        recebe_notificacoes: profileData.recebe_notificacoes,
      });

      if (authRes?.user?.id) {
        authUserId = authRes.user.id;
      }
    } catch (authErr) {
      console.warn('Aviso: Falha ao sincronizar senha no Auth via Service Role:', authErr);
    }

    // 2. Garante o registro e sincronização na tabela public.profiles com o ID estrito do Auth
    const payload: Record<string, any> = {
      company_id: profileData.company_id,
      nome: profileData.nome.trim(),
      email: rawEmail,
      whatsapp: profileData.whatsapp?.trim() || null,
      role: profileData.role,
      recebe_notificacoes: profileData.recebe_notificacoes,
    };

    if (authUserId) {
      payload.id = authUserId;
    }

    if (profileData.client_organization_id) {
      payload.client_organization_id = profileData.client_organization_id;
    }

    // Upsert para garantir integridade e vincular estritamente ao user_id de auth.users
    const { data: profileRecord, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: authUserId ? 'id' : 'email' })
      .select(`
        *,
        client_organization:client_organizations(id, nome)
      `)
      .single();

    if (error) {
      console.error('Erro ao registrar perfil:', error.message);
      throw error;
    }

    const finalUserId = profileRecord.id;

    // 3. Dispara a Edge Function de boas-vindas com a senha temporária real gerada
    try {
      await supabase.functions.invoke('send-notification', {
        body: {
          event_type: 'welcome_email',
          company_id: profileData.company_id,
          user_id: finalUserId,
          recipient_email: rawEmail,
          recipient_name: profileData.nome.trim(),
          temp_password: tempPassword,
          custom_data: {
            senha: tempPassword,
            senha_temporaria: tempPassword,
          },
          app_url: typeof window !== 'undefined' ? `${window.location.origin}/ticketflow` : 'https://dev2.infocast.com.br/ticketflow',
        },
      });
    } catch (notifyErr) {
      console.warn('Aviso: Falha ao enviar notificação de boas-vindas para novo perfil:', notifyErr);
    }

    return { profile: profileRecord, temporaryPassword: tempPassword };
  },

  /**
   * Atualiza campos de um perfil (nome, role, recebe_notificacoes, etc.)
   */
  async updateProfile(profileId: string, updates: Partial<Profile>): Promise<Profile | null> {
    // Validação crítica de segurança contra escalonamento de privilégios para 'Super Admin'
    if (updates.role && updates.role.trim() === 'Super Admin') {
      const { data: authSession } = await supabase.auth.getUser();
      const callerId = authSession?.user?.id;
      if (!callerId) {
        throw new Error('Bloqueio de segurança: Sessão inválida para conceder o papel Super Admin.');
      }
      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', callerId)
        .maybeSingle();

      if (callerProfile?.role !== 'Super Admin') {
        throw new Error('Bloqueio de segurança: Apenas um Super Admin autenticado pode atribuir o papel Super Admin.');
      }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', profileId)
      .select(`
        *,
        client_organization:client_organizations(id, nome)
      `)
      .single();

    if (error) {
      console.error('Erro ao atualizar perfil:', error.message);
      throw error;
    }
    return data;
  },

  /**
   * Inativa ou ativa um usuário na tabela profiles
   */
  async toggleProfileStatus(profileId: string, newStatus: 'Ativo' | 'Inativo'): Promise<Profile | null> {
    return this.updateProfile(profileId, { status: newStatus });
  },

  /**
   * Invoca a Edge Function reset-user-password para redefinir senha no Supabase Auth ou provisionar credencial
   */
  async resetUserPassword(
    userId?: string,
    newPassword?: string,
    email?: string,
    extraData?: {
      company_id?: string;
      client_organization_id?: string | null;
      nome?: string;
      role?: string;
      recebe_notificacoes?: boolean;
    }
  ): Promise<{ success: boolean; message: string; user?: { id: string; email: string } }> {
    try {
      const bodyPayload = {
        user_id: userId,
        email: email?.trim().toLowerCase(),
        new_password: newPassword,
        ...(extraData || {}),
      };

      const response = await supabase.functions.invoke('reset-user-password', {
        body: bodyPayload,
      });

      const { data, error } = response;
      if (error) {
        console.warn('Erro ao invocar Edge Function via SDK, tentando fallback HTTP direto:', error);
        const supabaseUrl = 'https://vrkhkifhkztttukuxbwz.supabase.co';
        const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZya2hraWZoa3p0dHR1a3V4Ynd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMTg4MzQsImV4cCI6MjEwODY5NDgzNH0.tynyoocdfy6RqZh2X61w0V26avk3GRF1bmDsKnc9KOY';
        const res = await fetch(`${supabaseUrl}/functions/v1/reset-user-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify(bodyPayload),
        });
        const resJson = await res.json();
        return resJson;
      }

      return data || { success: true, message: 'Senha redefinida com sucesso!' };
    } catch (err: any) {
      console.error('Erro ao redefinir senha do usuário:', err);
      return {
        success: false,
        message: err.message || 'Falha na conexão com a Edge Function de redefinição de senha.',
      };
    }
  },

  /**
   * Recuperação de senha a partir da tela de Login:
   * Gera uma nova senha temporária segura, sincroniza no Supabase Auth e envia por e-mail via SMTP corporativo
   */
  async requestPasswordRecovery(email: string): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return {
        success: false,
        message: 'Por favor, informe um endereço de e-mail válido.',
      };
    }

    try {
      const tempPassword = this.generateSecureTemporaryPassword();

      // 1. Atualiza a senha no Supabase Auth pelo e-mail via Edge Function reset-user-password
      const resetRes = await this.resetUserPassword(undefined, tempPassword, cleanEmail);

      if (!resetRes.success || !resetRes.user?.id) {
        // Fallback: Tenta disparo nativo do Supabase Auth caso a Edge Function não localize
        const redirectUrl =
          typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}`
            : 'https://dev2.infocast.com.br/ticketflow/login';

        const { error: supError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: redirectUrl,
        });

        if (supError) {
          return {
            success: false,
            message: resetRes.message || 'Não foi possível localizar uma conta ativa com este e-mail.',
          };
        }

        return {
          success: true,
          message: 'Enviamos as instruções de recuperação de senha para o seu e-mail.',
        };
      }

      // 2. Dispara o e-mail corporativo com a nova senha temporária via Edge Function send-notification
      const appUrl =
        typeof window !== 'undefined' && window.location.pathname.startsWith('/ticketflow')
          ? `${window.location.origin}/ticketflow`
          : typeof window !== 'undefined'
          ? window.location.origin
          : 'https://dev2.infocast.com.br/ticketflow';

      await supabase.functions.invoke('send-notification', {
        body: {
          event_type: 'welcome_email',
          user_id: resetRes.user.id,
          recipient_email: cleanEmail,
          temp_password: tempPassword,
          custom_data: {
            senha: tempPassword,
            senha_temporaria: tempPassword,
          },
          app_url: appUrl,
        },
      });

      return {
        success: true,
        message: 'Uma nova senha temporária foi gerada e enviada para o seu e-mail cadastrado. Verifique sua caixa de entrada (e spam).',
      };
    } catch (err: any) {
      console.error('Erro na recuperação de senha:', err);
      return {
        success: false,
        message: err.message || 'Erro ao processar a solicitação de redefinição de senha.',
      };
    }
  },

  /**
   * Lista as organizações clientes vinculadas ao tenant (B2B2B)
   */
  async getClientOrganizations(companyId?: string): Promise<{ id: string; company_id: string; nome: string; criado_em?: string }[]> {
    let query = supabase.from('client_organizations').select('*');
    if (companyId) {
      query = query.eq('company_id', companyId);
    }
    const { data, error } = await query.order('nome', { ascending: true });
    if (error) {
      console.warn('Erro ao carregar organizações clientes:', error.message);
      return [];
    }
    return data || [];
  },

  /**
   * Cria uma organização cliente (B2B2B)
   */
  async createClientOrganization(data: { company_id: string; nome: string }): Promise<{ id: string; company_id: string; nome: string } | null> {
    const { data: created, error } = await supabase
      .from('client_organizations')
      .insert({
        company_id: data.company_id,
        nome: data.nome.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar organização cliente:', error.message);
      throw error;
    }
    return created;
  },
  /**
   * Obtém a empresa ativa do tenant
   */
  async getActiveCompany(): Promise<Company | null> {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('criado_em', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Erro ao carregar empresa:', error.message);
      return null;
    }
    return data;
  },

  /**
   * Obtém os dados de uma empresa específica por ID
   */
  async getCompanyById(companyId: string): Promise<Company | null> {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .maybeSingle();

    if (error) {
      console.warn(`Erro ao carregar empresa #${companyId}:`, error.message);
      return null;
    }
    return data;
  },

  /**
   * Obtém todas as empresas com os dados de contato do Gestor responsável (Permitido para Super Admin via RLS)
   */
  async getAllCompanies(): Promise<Company[]> {
    const { data, error } = await supabase
      .from('companies')
      .select(`
        *,
        profiles(id, company_id, nome, email, whatsapp, role, criado_em)
      `)
      .order('criado_em', { ascending: false });

    let companiesList: any[] = [];
    let allProfiles: Profile[] = [];

    if (error) {
      console.warn('Aviso ao consultar companies com join de profiles, executando busca combinada:', error.message);
      const { data: fallbackCompanies, error: compErr } = await supabase
        .from('companies')
        .select('*')
        .order('criado_em', { ascending: false });

      if (compErr) {
        console.error('Erro ao buscar todas as empresas:', compErr.message);
        throw compErr;
      }
      companiesList = fallbackCompanies || [];

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, company_id, nome, email, whatsapp, role, criado_em')
        .order('criado_em', { ascending: true });

      allProfiles = (profilesData as Profile[]) || [];
    } else {
      companiesList = data || [];
    }

    return companiesList.map((comp) => {
      const companyProfiles: Profile[] = Array.isArray(comp.profiles)
        ? comp.profiles
        : allProfiles.filter((p) => p.company_id === comp.id);

      // Prioriza o perfil com role 'Gestor', depois 'Super Admin', 'Gerente' ou o primeiro usuário vinculado
      const contactProfile =
        companyProfiles.find((p) => (p.role || '').toLowerCase() === 'gestor') ||
        companyProfiles.find((p) => (p.role || '').toLowerCase() === 'super admin') ||
        companyProfiles.find((p) => (p.role || '').toLowerCase() === 'gerente') ||
        companyProfiles[0] ||
        null;

      return {
        ...comp,
        profiles: companyProfiles,
        contato_nome: contactProfile?.nome || null,
        contato_email: contactProfile?.email || null,
        contato_whatsapp: contactProfile?.whatsapp || null,
        contato_role: contactProfile?.role || null,
      };
    });
  },

  /**
   * Obtém notificações dinâmicas e reais da empresa ativa a partir de audit_logs, tickets e profiles
   */
  async getCompanyNotifications(companyId: string, limitCount = 15): Promise<AppNotification[]> {
    if (!companyId) return [];

    const notificationsMap = new Map<string, AppNotification>();

    try {
      // 1. Consulta últimos eventos de audit_logs da empresa ativa
      const { data: auditData } = await supabase
        .from('audit_logs')
        .select(`
          id,
          company_id,
          ticket_id,
          acao,
          criado_em,
          user:profiles(id, nome),
          ticket:tickets(id, assunto)
        `)
        .eq('company_id', companyId)
        .order('criado_em', { ascending: false })
        .limit(limitCount);

      if (auditData && auditData.length > 0) {
        auditData.forEach((log: any) => {
          const shortTicketId = log.ticket_id ? `#${String(log.ticket_id).substring(0, 8)}` : '';
          const ticketSubject = log.ticket?.assunto ? ` - ${log.ticket.assunto}` : '';
          const actorName = log.user?.nome ? `${log.user.nome}: ` : '';
          const acaoLower = String(log.acao || '').toLowerCase();

          const isOpening = acaoLower.includes('abriu o chamado');
          const titulo: AppNotification['titulo'] = isOpening
            ? 'Novo chamado aberto'
            : 'Mudança no chamado';

          const mensagem = isOpening
            ? `${shortTicketId}${ticketSubject}`
            : `${shortTicketId}${ticketSubject} • ${actorName}${log.acao}`;

          notificationsMap.set(`audit_${log.id}`, {
            id: `audit_${log.id}`,
            company_id: log.company_id,
            titulo,
            mensagem,
            criado_em: log.criado_em,
            tipo: isOpening ? 'alerta' : 'info',
            ticket_id: log.ticket_id,
          });
        });
      }

      // 2. Consulta últimos chamados abertos/atualizados na tabela tickets da empresa ativa
      const { data: recentTickets } = await supabase
        .from('tickets')
        .select(`
          id,
          company_id,
          assunto,
          status,
          criado_em,
          atualizado_em,
          operador:profiles!tickets_operador_id_fkey(id, nome)
        `)
        .eq('company_id', companyId)
        .order('atualizado_em', { ascending: false })
        .limit(10);

      if (recentTickets && recentTickets.length > 0) {
        recentTickets.forEach((t: any) => {
          const shortId = `#${String(t.id).substring(0, 8)}`;
          const createdMs = t.criado_em ? new Date(t.criado_em).getTime() : 0;
          const updatedMs = t.atualizado_em ? new Date(t.atualizado_em).getTime() : createdMs;
          const wasModified = updatedMs - createdMs > 5000 && t.status !== 'Aberto';

          // Evento de abertura real do chamado (caso não exista no audit_log)
          const hasAuditOpen = Array.from(notificationsMap.values()).some(
            (n) => n.ticket_id === t.id && n.titulo === 'Novo chamado aberto'
          );
          if (!hasAuditOpen && t.criado_em) {
            notificationsMap.set(`ticket_open_${t.id}`, {
              id: `ticket_open_${t.id}`,
              company_id: t.company_id,
              titulo: 'Novo chamado aberto',
              mensagem: `${shortId} - ${t.assunto}`,
              criado_em: t.criado_em,
              tipo: 'alerta',
              ticket_id: t.id,
            });
          }

          // Evento de mudança no chamado (atualização de status ou atribuição de operador)
          if (wasModified) {
            const opInfo = t.operador?.nome ? ` • Responsável: ${t.operador.nome}` : '';
            const key = `ticket_upd_${t.id}_${t.status}`;
            if (!notificationsMap.has(key)) {
              notificationsMap.set(key, {
                id: key,
                company_id: t.company_id,
                titulo: 'Mudança no chamado',
                mensagem: `${shortId} - ${t.assunto} (Status: ${t.status}${opInfo})`,
                criado_em: t.atualizado_em || t.criado_em,
                tipo: 'info',
                ticket_id: t.id,
              });
            }
          }
        });
      }

      // 3. Consulta últimas mudanças/criações na tabela profiles da empresa ativa
      const { data: recentProfiles } = await supabase
        .from('profiles')
        .select('id, company_id, nome, email, role, status, criado_em, atualizado_em')
        .eq('company_id', companyId)
        .order('criado_em', { ascending: false })
        .limit(6);

      if (recentProfiles && recentProfiles.length > 0) {
        recentProfiles.forEach((p: any) => {
          const eventDate = p.atualizado_em || p.criado_em;
          if (!eventDate) return;

          const isUpdated =
            p.atualizado_em &&
            p.criado_em &&
            new Date(p.atualizado_em).getTime() - new Date(p.criado_em).getTime() > 5000;

          const profileIdKey = `profile_${p.id}_${eventDate}`;
          notificationsMap.set(profileIdKey, {
            id: profileIdKey,
            company_id: p.company_id,
            titulo: 'Mudança no perfil',
            mensagem: isUpdated
              ? `Perfil de ${p.nome || p.email} (${p.role}) foi atualizado${p.status ? ` • ${p.status}` : ''}.`
              : `Novo perfil cadastrado: ${p.nome || p.email} (${p.role}).`,
            criado_em: eventDate,
            tipo: 'perfil',
          });
        });
      }
    } catch (err) {
      console.warn('Erro ao consultar notificações reais da empresa:', err);
    }

    return Array.from(notificationsMap.values())
      .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
      .slice(0, limitCount);
  },

  /**
   * Atualiza uma empresa (status, trial_ends_at, etc.)
   */
  async updateCompany(companyId: string, updates: Partial<Company>): Promise<Company | null> {
    const { data, error } = await supabase
      .from('companies')
      .update({
        ...updates,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', companyId)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar empresa:', error.message);
      throw error;
    }
    return data;
  },

  /**
   * Obtém os perfis vinculados a uma empresa
   */
  async getProfiles(companyId?: string): Promise<Profile[]> {
    let query = supabase.from('profiles').select(`
      *,
      client_organization:client_organizations(id, nome)
    `);
    if (companyId) {
      query = query.eq('company_id', companyId);
    }
    const { data, error } = await query.order('nome', { ascending: true });
    if (error) {
      console.warn('Erro ao carregar perfis relacionais, tentando select simples:', error.message);
      const fallback = await supabase.from('profiles').select('*');
      return (fallback.data as Profile[]) || [];
    }
    return data || [];
  },

  /**
   * Obtém clientes (perfis com role = 'Cliente')
   */
  async getCustomers(companyId?: string): Promise<Profile[]> {
    let query = supabase.from('profiles').select(`
      *,
      client_organization:client_organizations(id, nome)
    `).eq('role', 'Cliente');
    if (companyId) {
      query = query.eq('company_id', companyId);
    }
    const { data, error } = await query.order('nome', { ascending: true });
    if (error) {
      console.warn('Erro ao carregar clientes relacionais, tentando select simples:', error.message);
      const fallback = await supabase.from('profiles').select('*').eq('role', 'Cliente');
      return (fallback.data as Profile[]) || [];
    }
    return data || [];
  },

  /**
   * Obtém todos os chamados com dados relacionais de cliente, operador e organização cliente
   */
  async getTickets(companyId?: string): Promise<Ticket[]> {
    let query = supabase
      .from('tickets')
      .select(`
        *,
        cliente:profiles!tickets_cliente_id_fkey(id, nome, email, avatar_url, role),
        operador:profiles!tickets_operador_id_fkey(id, nome, email, avatar_url, role),
        client_organization:client_organizations(id, nome)
      `);

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query.order('criado_em', { ascending: false });
    if (error) {
      console.warn('Erro ao carregar tickets relacionais, tentando select simples:', error.message);
      // Fallback sem foreign key join se a constraint ainda não estiver linkada
      const fallback = await supabase
        .from('tickets')
        .select('*')
        .order('criado_em', { ascending: false });
      return fallback.data || [];
    }
    return data || [];
  },

  /**
   * Cria um novo chamado com cálculo dinâmico de SLA de vencimento baseado no sla_padrao_horas da empresa
   */
  async createTicket(
    ticket: Partial<Ticket> & { sla_padrao_horas?: number | null }
  ): Promise<Ticket | null> {
    const { sla_padrao_horas: inputSlaHours, ...ticketPayload } = ticket;
    let slaCalculado = ticketPayload.sla_vencimento;

    if (!slaCalculado) {
      let horasSla: number | null =
        typeof inputSlaHours === 'number' && inputSlaHours > 0 ? inputSlaHours : null;

      if (!horasSla && ticketPayload.company_id) {
        const { data: compData } = await supabase
          .from('companies')
          .select('sla_padrao_horas')
          .eq('id', ticketPayload.company_id)
          .maybeSingle();

        if (compData && typeof compData.sla_padrao_horas === 'number' && compData.sla_padrao_horas > 0) {
          horasSla = compData.sla_padrao_horas;
        }
      }

      const dataSla = new Date();
      if (horasSla && horasSla > 0) {
        dataSla.setTime(dataSla.getTime() + horasSla * 60 * 60 * 1000);
        slaCalculado = dataSla.toISOString();
      }
    }

    const { data, error } = await supabase
      .from('tickets')
      .insert({
        ...ticketPayload,
        sla_vencimento: slaCalculado,
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar ticket:', error);
      throw error;
    }

    // Registra log de auditoria da criação
    if (data) {
      try {
        await this.createAuditLog({
          company_id: data.company_id,
          ticket_id: data.id,
          user_id: data.cliente_id,
          acao: 'Abriu o chamado no sistema.',
        });
      } catch (auditErr) {
        console.warn('Aviso: log de auditoria da criação não pôde ser gravado:', auditErr);
      }
    }

    return data;
  },

  /**
   * Atribui ou transfere um chamado a um operador responsável e registra no log de auditoria
   */
  async assignTicketOperator(
    ticketId: string,
    operadorId: string | null,
    operadorNome?: string,
    userId?: string,
    companyId?: string
  ): Promise<Ticket | null> {
    const { data, error } = await supabase
      .from('tickets')
      .update({
        operador_id: operadorId,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .select(`
        *,
        cliente:profiles!tickets_cliente_id_fkey(id, nome, email, avatar_url, role),
        operador:profiles!tickets_operador_id_fkey(id, nome, email, avatar_url, role),
        client_organization:client_organizations(id, nome)
      `)
      .single();

    if (error) {
      console.error('Erro ao atribuir operador ao ticket:', error);
      throw error;
    }

    // Registra log de auditoria da atribuição
    if (data && (companyId || data.company_id)) {
      try {
        const descricaoOperador = operadorNome 
          ? operadorNome 
          : operadorId 
            ? 'operador selecionado' 
            : 'Não Atribuído';
        await this.createAuditLog({
          company_id: companyId || data.company_id,
          ticket_id: ticketId,
          user_id: userId,
          acao: operadorId 
            ? `Atribuiu a responsabilidade do chamado para ${descricaoOperador}.`
            : 'Removeu a atribuição de operador do chamado (Não Atribuído).',
        });
      } catch (auditErr) {
        console.warn('Aviso ao registrar auditoria de atribuição de operador:', auditErr);
      }
    }

    return data;
  },

  /**
   * Atualiza o status do chamado, insere mensagem automática no sistema e registra no log de auditoria (Fase 14)
   */
  async updateTicketStatus(
    ticketId: string,
    novoStatus: 'Aberto' | 'Em Andamento' | 'Aguardando Cliente' | 'Resolvido' | 'Fechado',
    userId?: string,
    companyId?: string
  ): Promise<Ticket | null> {
    const { data, error } = await supabase
      .from('tickets')
      .update({
        status: novoStatus,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .select(`
        *,
        cliente:profiles!tickets_cliente_id_fkey(id, nome, email, avatar_url, role),
        operador:profiles!tickets_operador_id_fkey(id, nome, email, avatar_url, role),
        client_organization:client_organizations(id, nome)
      `)
      .single();

    if (error) {
      console.error('Erro ao atualizar status do ticket:', error);
      throw error;
    }

    const tenantId = companyId || data?.company_id;

    // 1. Insere automaticamente mensagem de sistema na linha do tempo
    if (data && tenantId) {
      try {
        await supabase
          .from('ticket_messages')
          .insert({
            ticket_id: ticketId,
            company_id: tenantId,
            user_id: userId,
            content: `O status do chamado foi alterado para: ${novoStatus}`,
            channel: 'sistema',
            is_internal_note: false,
          });
      } catch (msgErr) {
        console.warn('Aviso ao registrar mensagem de sistema na mudança de status:', msgErr);
      }

      // 2. Registra no log de auditoria
      try {
        await this.createAuditLog({
          company_id: tenantId,
          ticket_id: ticketId,
          user_id: userId,
          acao: `Alterou o status do chamado para "${novoStatus}".`,
        });
      } catch (auditErr) {
        console.warn('Aviso ao registrar auditoria de mudança de status:', auditErr);
      }
    }

    return data;
  },

  /**
   * Conclui ou encerra um chamado definindo o status ('Resolvido' ou 'Fechado'), preenchendo o resumo_conclusao e registrando na linha do tempo e auditoria
   */
  async closeTicket(
    ticketId: string,
    resumoConclusao: string,
    userId?: string,
    companyId?: string,
    targetStatus: 'Resolvido' | 'Fechado' = 'Fechado'
  ): Promise<Ticket | null> {
    const { data, error } = await supabase
      .from('tickets')
      .update({
        status: targetStatus,
        resumo_conclusao: resumoConclusao,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) {
      console.error('Erro ao encerrar ticket:', error);
      throw error;
    }

    // Registra mensagem de sistema e log de auditoria do encerramento/resolução
    if (data && (companyId || data.company_id)) {
      const tenantId = companyId || data.company_id;

      // 1. Insere automaticamente mensagem de sistema na linha do tempo
      try {
        await supabase
          .from('ticket_messages')
          .insert({
            ticket_id: ticketId,
            company_id: tenantId,
            user_id: userId,
            content: `O status do chamado foi alterado para: ${targetStatus}. Resumo da Solução: ${resumoConclusao.trim()}`,
            channel: 'sistema',
            is_internal_note: false,
          });
      } catch (msgErr) {
        console.warn('Aviso ao registrar mensagem de sistema no encerramento:', msgErr);
      }

      // 2. Registra log de auditoria
      try {
        await this.createAuditLog({
          company_id: tenantId,
          ticket_id: ticketId,
          user_id: userId,
          acao: `Concluiu o chamado com status ${targetStatus}. Resumo: "${resumoConclusao.substring(0, 60)}${resumoConclusao.length > 60 ? '...' : ''}"`,
        });
      } catch (auditErr) {
        console.warn('Aviso ao registrar auditoria de encerramento:', auditErr);
      }
    }

    return data;
  },

  /**
   * Registra a avaliação de satisfação do cliente (CSAT) no chamado
   */
  async submitTicketCsat(ticketId: string, score: number, comentario?: string, userId?: string, companyId?: string): Promise<Ticket | null> {
    const { data, error } = await supabase
      .from('tickets')
      .update({
        csat_score: score,
        csat_comentario: comentario?.trim() || null,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) {
      console.error('Erro ao registrar avaliação CSAT:', error);
      throw error;
    }

    if (data && (companyId || data.company_id)) {
      try {
        await this.createAuditLog({
          company_id: companyId || data.company_id,
          ticket_id: ticketId,
          user_id: userId,
          acao: `Cliente enviou avaliação de satisfação (CSAT): Nota ${score}/5 estrelas.`,
        });
      } catch (auditErr) {
        console.warn('Aviso ao registrar auditoria de CSAT:', auditErr);
      }
    }

    return data;
  },

  /**
   * Obtém os logs de auditoria do chamado
   */
  async getTicketAuditLogs(ticketId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('audit_logs')
      .select(`
        *,
        user:profiles(id, nome, email, avatar_url, role)
      `)
      .eq('ticket_id', ticketId)
      .order('criado_em', { ascending: true });

    if (error) {
      console.warn('Erro ao carregar audit_logs relacionais, tentando select simples:', error.message);
      const fallback = await supabase
        .from('audit_logs')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('criado_em', { ascending: true });
      return fallback.data || [];
    }
    return data || [];
  },

  /**
   * Cria um registro de auditoria na tabela audit_logs
   */
  async createAuditLog(logData: {
    company_id: string;
    ticket_id: string;
    user_id?: string;
    acao: string;
  }): Promise<any> {
    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        company_id: logData.company_id,
        ticket_id: logData.ticket_id,
        user_id: logData.user_id,
        acao: logData.acao,
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar audit_log:', error.message);
      throw error;
    }
    return data;
  },

  /**
   * Obtém um chamado específico por ID com dados do cliente e operador
   */
  async getTicketById(ticketId: string): Promise<Ticket | null> {
    const { data, error } = await supabase
      .from('tickets')
      .select(`
        *,
        cliente:profiles!tickets_cliente_id_fkey(id, nome, email, avatar_url, role),
        operador:profiles!tickets_operador_id_fkey(id, nome, email, avatar_url, role)
      `)
      .eq('id', ticketId)
      .maybeSingle();

    if (error) {
      console.warn('Erro ao carregar ticket com relações, tentando select simples:', error.message);
      const fallback = await supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .maybeSingle();
      return fallback.data;
    }
    return data;
  },

  /**
   * Obtém a lista de mensagens (linha do tempo) associadas a um chamado
   */
  async getTicketMessages(ticketId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('ticket_messages')
      .select(`
        *,
        user:profiles(id, nome, email, avatar_url, role)
      `)
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Erro ao carregar mensagens com perfil de autor, tentando select simples:', error.message);
      const fallback = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      return fallback.data || [];
    }
    return data || [];
  },

  /**
   * Insere uma nova mensagem / nota na timeline do chamado
   */
  async createTicketMessage(message: {
    ticket_id: string;
    company_id: string;
    user_id?: string;
    content: string;
    is_internal_note?: boolean;
    channel?: string;
    whatsapp_template_name?: string | null;
    whatsapp_template_variables?: Record<string, any> | null;
  }): Promise<any> {
    const { data, error } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id: message.ticket_id,
        company_id: message.company_id,
        user_id: message.user_id,
        content: message.content,
        is_internal_note: message.is_internal_note || false,
        channel: message.channel || 'sistema',
        whatsapp_template_name: message.whatsapp_template_name || null,
        whatsapp_template_variables: message.whatsapp_template_variables || null,
      })
      .select(`
        *,
        user:profiles(id, nome, email, avatar_url, role)
      `)
      .single();

    if (error) {
      console.error('Erro ao enviar mensagem:', error.message);
      throw error;
    }

    return data;
  },

  /**
   * Realiza upload de arquivo para o bucket ticket_attachments no Supabase Storage
   * e cria o registro correspondente na tabela ticket_attachments
   */
  async uploadTicketAttachment(params: {
    file: File;
    company_id: string;
    ticket_id: string;
    message_id?: string | null;
  }): Promise<TicketAttachment | null> {
    const { file, company_id, ticket_id, message_id } = params;

    // Sanitiza e gera nome de arquivo único
    const fileExt = file.name.split('.').pop() || '';
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const storagePath = `${company_id}/${ticket_id}/${timestamp}_${randomSuffix}_${cleanFileName}`;

    // 1. Upload para o Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('ticket_attachments')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Erro ao enviar arquivo para o storage:', uploadError);
      throw uploadError;
    }

    // 2. Obtém a URL pública do arquivo
    const { data: urlData } = supabase.storage
      .from('ticket_attachments')
      .getPublicUrl(uploadData?.path || storagePath);

    const publicUrl = urlData.publicUrl;

    // 3. Insere registro na tabela ticket_attachments
    const { data: attachmentRecord, error: dbError } = await supabase
      .from('ticket_attachments')
      .insert({
        company_id,
        ticket_id,
        message_id: message_id || null,
        file_name: file.name,
        file_url: publicUrl,
        file_size: file.size,
        file_type: file.type || fileExt,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Erro ao gravar registro de anexo no banco:', dbError);
      throw dbError;
    }

    return attachmentRecord;
  },

  /**
   * Obtém todos os anexos vinculados a um chamado (tanto do ticket quanto de mensagens)
   */
  async getTicketAttachments(ticketId: string): Promise<TicketAttachment[]> {
    const { data, error } = await supabase
      .from('ticket_attachments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('criado_em', { ascending: true });

    if (error) {
      console.warn('Erro ao carregar anexos do chamado:', error.message);
      return [];
    }

    return data || [];
  },

  /**
   * Remove um anexo do chamado
   */
  async deleteTicketAttachment(attachmentId: string): Promise<boolean> {
    const { error } = await supabase
      .from('ticket_attachments')
      .delete()
      .eq('id', attachmentId);

    if (error) {
      console.error('Erro ao excluir anexo:', error);
      throw error;
    }

    return true;
  },

  /**
   * Obtém as macros (respostas rápidas) cadastradas da empresa
   */
  async getMacros(companyId?: string): Promise<any[]> {
    let query = supabase.from('macros').select('*');
    if (companyId) {
      query = query.eq('company_id', companyId);
    }
    const { data, error } = await query.order('titulo', { ascending: true });
    if (error) {
      console.warn('Erro ao carregar macros:', error.message);
      return [];
    }
    return data || [];
  },

  /**
   * Cria uma nova macro para a empresa
   */
  async createMacro(macroData: {
    company_id: string;
    titulo: string;
    conteudo: string;
  }): Promise<any> {
    const { data, error } = await supabase
      .from('macros')
      .insert({
        company_id: macroData.company_id,
        titulo: macroData.titulo,
        conteudo: macroData.conteudo,
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar macro:', error.message);
      throw error;
    }
    return data;
  },

  /**
   * Atualiza as configurações de integração com o Chat4u / Chatwoot da empresa
   */
  async updateCompanyChatwootSettings(
    companyId: string,
    settings: {
      chatwoot_url?: string;
      chatwoot_api_access_token?: string;
      chatwoot_account_id?: number | null;
      chatwoot_inbox_id?: number | null;
    }
  ): Promise<Company | null> {
    const { data, error } = await supabase
      .from('companies')
      .update({
        chatwoot_url: settings.chatwoot_url?.trim() || null,
        chatwoot_api_access_token: settings.chatwoot_api_access_token?.trim() || null,
        chatwoot_account_id: settings.chatwoot_account_id || null,
        chatwoot_inbox_id: settings.chatwoot_inbox_id || null,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', companyId)
      .select()
      .single();

    if (error) {
      console.error('Erro ao salvar integrações Chat4u:', error.message);
      throw error;
    }
    return data;
  },

  /**
   * Atualiza o Prazo Padrão de SLA (em horas) da Empresa (Multi-Tenant)
   */
  async updateCompanySlaSettings(
    companyId: string,
    slaPadraoHoras: number
  ): Promise<Company | null> {
    const validHours = Math.max(1, Math.floor(Number(slaPadraoHoras)));
    const { data, error } = await supabase
      .from('companies')
      .update({
        sla_padrao_horas: validHours,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', companyId)
      .select()
      .single();

    if (error) {
      console.error('Erro ao salvar prazo padrão de SLA:', error.message);
      throw error;
    }
    return data;
  },

  /**
   * Atualiza as configurações de Servidor SMTP Corporativo da Empresa (Fase 18.1 - Multi-Tenant)
   */
  async updateCompanySmtpSettings(
    companyId: string,
    settings: {
      smtp_host?: string | null;
      smtp_port?: number | null;
      smtp_user?: string | null;
      smtp_password?: string | null;
      smtp_from_email?: string | null;
      smtp_from_name?: string | null;
    }
  ): Promise<Company | null> {
    const { data, error } = await supabase
      .from('companies')
      .update({
        smtp_host: settings.smtp_host?.trim() || null,
        smtp_port: settings.smtp_port || null,
        smtp_user: settings.smtp_user?.trim() || null,
        smtp_password: settings.smtp_password?.trim() || null,
        smtp_from_email: settings.smtp_from_email?.trim() || null,
        smtp_from_name: settings.smtp_from_name?.trim() || null,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', companyId)
      .select()
      .single();

    if (error) {
      console.error('Erro ao salvar configurações SMTP:', error.message);
      throw error;
    }
    return data;
  },

  /**
   * Testa a conectividade com o Servidor SMTP corporativo da Empresa via Edge Function
   */
  async testSmtpConnection(params: {
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_password: string;
    smtp_from_email?: string;
    smtp_from_name?: string;
    recipient_test_email?: string;
  }): Promise<{ success: boolean; message: string }> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vrkhkifhkztttukuxbwz.supabase.co';
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

    try {
      // 1. Invoca via Supabase SDK
      const result = await supabase.functions.invoke('test-smtp-connection', {
        body: {
          smtp_host: params.smtp_host.trim(),
          smtp_port: Number(params.smtp_port),
          smtp_user: params.smtp_user.trim(),
          smtp_password: params.smtp_password.trim(),
          smtp_from_email: params.smtp_from_email?.trim() || params.smtp_user.trim(),
          smtp_from_name: params.smtp_from_name?.trim() || 'TicketFlow Teste',
          recipient_test_email: params.recipient_test_email?.trim() || params.smtp_user.trim(),
        },
      });

      const { data, error } = result;

      // Se retornou dados do JSON com sucesso
      if (data) {
        if (data.success) {
          return {
            success: true,
            message: data.message || 'Servidor SMTP validado com sucesso!',
          };
        } else if (data.error || data.message) {
          return {
            success: false,
            message: data.error || data.message,
          };
        }
      }

      // Se o SDK reportou erro (ex: FunctionsHttpError contendo body da Edge Function)
      if (error) {
        console.warn('⚠️ SDK do Supabase reportou erro na Edge Function:', error);

        // Tenta inspecionar se há detalhes na resposta do erro do SDK
        let extractedMessage = '';
        if ((error as any)?.context?.json) {
          try {
            const errJson = await (error as any).context.json();
            extractedMessage = errJson.error || errJson.message;
          } catch {
            // continua
          }
        }

        if (extractedMessage) {
          return {
            success: false,
            message: extractedMessage,
          };
        }

        // 2. Fallback de chamada HTTP direta para obter a resposta completa do servidor
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/test-smtp-connection`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': anonKey,
              'Authorization': `Bearer ${anonKey}`,
            },
            body: JSON.stringify({
              smtp_host: params.smtp_host.trim(),
              smtp_port: Number(params.smtp_port),
              smtp_user: params.smtp_user.trim(),
              smtp_password: params.smtp_password.trim(),
              smtp_from_email: params.smtp_from_email?.trim() || params.smtp_user.trim(),
              smtp_from_name: params.smtp_from_name?.trim() || 'TicketFlow Teste',
              recipient_test_email: params.recipient_test_email?.trim() || params.smtp_user.trim(),
            }),
          });

          const resData = await res.json().catch(() => null);
          if (resData) {
            return {
              success: Boolean(resData.success),
              message: resData.error || resData.message || (res.ok ? 'Servidor validado.' : `HTTP ${res.status}: Erro desconhecido`),
            };
          }
        } catch (fetchErr: any) {
          console.warn('Falha no fallback fetch direto:', fetchErr);
        }

        return {
          success: false,
          message: error.message || 'Falha ao contatar a Edge Function de teste SMTP.',
        };
      }

      return {
        success: false,
        message: 'Resposta vazia ou formato inesperado da Edge Function.',
      };
    } catch (err: any) {
      console.error('Erro na chamada testSmtpConnection:', err);
      return {
        success: false,
        message: err.message || 'Erro de conexão com o serviço de validação SMTP.',
      };
    }
  },

  /**
   * Testa a conectividade com a API do Chatwoot / Chat4u via Edge Function (eliminando CORS)
   */
  async testChatwootConnection(
    url: string,
    accessToken: string,
    accountId?: number | null
  ): Promise<{ success: boolean; message: string; inboxesCount?: number }> {
    try {
      // 1. Invoca a Edge Function test-chatwoot (ou fallback test-chatwoot-connection) via SDK do Supabase
      let result = await supabase.functions.invoke('test-chatwoot', {
        body: {
          chatwoot_url: url.trim(),
          chatwoot_api_access_token: accessToken.trim(),
          chatwoot_account_id: accountId || null,
        },
      });

      if (result.error) {
        // Tenta também o alias test-chatwoot-connection
        result = await supabase.functions.invoke('test-chatwoot-connection', {
          body: {
            chatwoot_url: url.trim(),
            chatwoot_api_access_token: accessToken.trim(),
            chatwoot_account_id: accountId || null,
          },
        });
      }

      const { data, error } = result;

      if (error) {
        console.warn('⚠️ Falha ao invocar edge function via SDK, tentando fetch direto:', error);
        // Fallback de chamada HTTP direta para a Edge Function caso o SDK falhe
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vrkhkifhkztttukuxbwz.supabase.co';
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
        
        let res = await fetch(`${supabaseUrl}/functions/v1/test-chatwoot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            chatwoot_url: url.trim(),
            chatwoot_api_access_token: accessToken.trim(),
            chatwoot_account_id: accountId || null,
          }),
        });

        if (!res.ok) {
          res = await fetch(`${supabaseUrl}/functions/v1/test-chatwoot-connection`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': anonKey,
              'Authorization': `Bearer ${anonKey}`,
            },
            body: JSON.stringify({
              chatwoot_url: url.trim(),
              chatwoot_api_access_token: accessToken.trim(),
              chatwoot_account_id: accountId || null,
            }),
          });
        }

        if (res.ok) {
          const directData = await res.json();
          return directData;
        }

        return {
          success: false,
          message: error.message || 'Falha ao contatar a Edge Function de teste do Chatwoot.',
        };
      }

      return data || {
        success: false,
        message: 'Resposta vazia da Edge Function de teste.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Erro ao conectar com a Edge Function do Supabase.',
      };
    }
  },

  /**
   * Obtém os templates de comunicação cadastrados para a empresa
   */
  async getCommunicationTemplates(companyId: string): Promise<CommunicationTemplate[]> {
    const { data, error } = await supabase
      .from('communication_templates')
      .select('*')
      .eq('company_id', companyId)
      .order('tipo', { ascending: true });

    if (error) {
      console.warn('Erro ao carregar templates de comunicação:', error.message);
      return [];
    }
    return data || [];
  },

  /**
   * Atualiza assunto e corpo de um template de comunicação existente
   */
  async updateCommunicationTemplate(
    templateId: string,
    updates: {
      assunto: string;
      corpo_mensagem: string;
    }
  ): Promise<CommunicationTemplate | null> {
    const { data, error } = await supabase
      .from('communication_templates')
      .update({
        assunto: updates.assunto.trim(),
        corpo_mensagem: updates.corpo_mensagem.trim(),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', templateId)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar template de comunicação:', error.message);
      throw error;
    }
    return data;
  },

  /**
   * Cria ou inicializa os templates padrão para um tenant
   */
  async seedTenantCommunicationTemplates(companyId: string): Promise<void> {
    const defaultTemplates = [
      {
        company_id: companyId,
        tipo: 'welcome_email',
        assunto: 'Bem-vindo ao TicketFlow - {{nome_empresa}}',
        corpo_mensagem: 'Olá, {{nome_cliente}}!\n\nSeja muito bem-vindo ao portal de atendimento da {{nome_empresa}}.\nSeu acesso foi configurado com sucesso e nossa equipe está à disposição para auxiliá-lo.\n\nSeus dados de acesso:\nE-mail: {{email_cliente}}\nSenha temporária: {{senha_temporaria}}\n\nAcesse nosso portal a qualquer momento: {{portal_url}}\n\nAtenciosamente,\nEquipe de Suporte {{nome_empresa}}',
      },
      {
        company_id: companyId,
        tipo: 'new_ticket',
        assunto: '[TicketFlow] Chamado Aberto com Sucesso: #{{ticket_id}} - {{assunto}}',
        corpo_mensagem: 'Olá, {{nome_cliente}}!\n\nConfirmamos a abertura do seu chamado #{{ticket_id}} sobre "{{assunto}}".\nNossa equipe técnica já foi notificada e o prazo estimado de atendimento (SLA) é de {{sla_prazo}}.\n\nVocê pode acompanhar e interagir diretamente pelo link: {{ticket_link}}\n\nAtenciosamente,\nEquipe {{nome_empresa}}',
      },
      {
        company_id: companyId,
        tipo: 'status_change',
        assunto: '[TicketFlow] Atualização no Chamado #{{ticket_id}}: Status alterado para {{status_atual}}',
        corpo_mensagem: 'Olá, {{nome_cliente}}!\n\nInformamos que o status do seu chamado #{{ticket_id}} foi atualizado para: {{status_atual}}.\n\nPara verificar o andamento ou enviar mais informações, acesse: {{ticket_link}}\n\nAtenciosamente,\nEquipe {{nome_empresa}}',
      },
      {
        company_id: companyId,
        tipo: 'new_message',
        assunto: '[TicketFlow] Nova Interação no Chamado #{{ticket_id}}',
        corpo_mensagem: 'Olá, {{nome_cliente}}!\n\nHá uma nova mensagem registrada no seu chamado #{{ticket_id}} por {{nome_remetente}}:\n\n"{{mensagem_resumo}}"\n\nResponda diretamente através do portal: {{ticket_link}}\n\nAtenciosamente,\nEquipe {{nome_empresa}}',
      },
      {
        company_id: companyId,
        tipo: 'csat',
        assunto: '[TicketFlow] Como foi seu atendimento no Chamado #{{ticket_id}}?',
        corpo_mensagem: 'Olá, {{nome_cliente}}!\n\nSeu chamado #{{ticket_id}} ("{{assunto}}") foi concluído pela nossa equipe.\n\nResumo da Conclusão:\n{{resumo}}\n\nSua opinião é fundamental para melhorarmos continuamente. Por favor, avalie nosso atendimento acessando: {{ticket_link}}\n\nMuito obrigado!\nEquipe {{nome_empresa}}',
      },
    ];

    for (const t of defaultTemplates) {
      await supabase
        .from('communication_templates')
        .upsert(t, { onConflict: 'company_id,tipo' });
    }
  },

  /**
   * Obtém os canais / inboxes do Chatwoot cadastrados para a empresa (Fase 16)
   */
  async getChatwootChannels(companyId: string): Promise<ChatwootChannel[]> {
    const { data, error } = await supabase
      .from('chatwoot_channels')
      .select('*')
      .eq('company_id', companyId)
      .order('criado_em', { ascending: true });

    if (error) {
      console.warn('Erro ao carregar canais do Chatwoot:', error.message);
      return [];
    }
    return data || [];
  },

  /**
   * Cria um novo canal / caixa de entrada Chatwoot para a empresa (Fase 16)
   */
  async createChatwootChannel(channelData: {
    company_id: string;
    nome: string;
    inbox_id: string;
  }): Promise<ChatwootChannel | null> {
    const { data, error } = await supabase
      .from('chatwoot_channels')
      .insert({
        company_id: channelData.company_id,
        nome: channelData.nome.trim(),
        inbox_id: channelData.inbox_id.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao cadastrar canal Chatwoot:', error.message);
      throw error;
    }
    return data;
  },

  /**
   * Exclui um canal Chatwoot cadastrado (Fase 16)
   */
  async deleteChatwootChannel(channelId: string): Promise<void> {
    const { error } = await supabase
      .from('chatwoot_channels')
      .delete()
      .eq('id', channelId);

    if (error) {
      console.error('Erro ao excluir canal Chatwoot:', error.message);
      throw error;
    }
  },

  /**
   * Lista conversas ativas (status = open) de um Canal de WhatsApp (Chatwoot) da empresa ativa
   */
  async listWhatsappConversations(params: {
    company_id: string;
    channel_id: string;
  }): Promise<{
    conversations: Array<{
      conversation_id: number;
      contact_name: string;
      contact_phone: string;
      contact_email: string;
      contact_avatar: string;
      last_message: string;
      last_activity_at: string;
      unread_count: number;
      status: string;
      existing_ticket_id: string | null;
      existing_ticket_subject: string | null;
    }>;
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('list-whatsapp-conversations', {
        body: params,
      });

      if (!error && data) {
        if (data.error) {
          throw new Error(data.error);
        }
        return {
          conversations: Array.isArray(data.conversations) ? data.conversations : [],
        };
      }

      // 2. Fallback direto via fetch utilizando token da sessão ou Anon Key
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vrkhkifhkztttukuxbwz.supabase.co';
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      const { data: sessionData } = await supabase.auth.getSession();
      const bearerToken = sessionData?.session?.access_token || supabaseAnonKey;

      if (supabaseUrl && supabaseAnonKey) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/list-whatsapp-conversations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${bearerToken}`,
              apikey: supabaseAnonKey,
            },
            body: JSON.stringify(params),
          });
          const json = await res.json();
          if (!res.ok || json.error) {
            throw new Error(json.error || `Falha ao listar conversas (${res.status}).`);
          }
          return {
            conversations: Array.isArray(json.conversations) ? json.conversations : [],
          };
        } catch (_edgeFetchErr) {
          // Segue para fallback direto na API do canal caso a Edge Function ainda não tenha sido publicada
        }
      }

      // 3. Fallback Resiliente (caso a Edge Function ainda não tenha sido publicada no Supabase)
      const [compRes, chanRes, ticketsRes, profilesRes] = await Promise.all([
        supabase
          .from('companies')
          .select('id, razao_social, chatwoot_url, chatwoot_api_access_token, chatwoot_account_id, chatwoot_inbox_id')
          .eq('id', params.company_id)
          .single(),
        supabase
          .from('chatwoot_channels')
          .select('id, inbox_id, nome')
          .eq('company_id', params.company_id),
        supabase
          .from('tickets')
          .select('id, cliente_id, chatwoot_conversation_id, assunto, status, criado_em')
          .eq('company_id', params.company_id)
          .order('criado_em', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, whatsapp')
          .eq('company_id', params.company_id)
          .not('whatsapp', 'is', null),
      ]);

      const companyRow = compRes.data;
      if (
        !companyRow?.chatwoot_url ||
        !companyRow?.chatwoot_api_access_token ||
        !companyRow?.chatwoot_account_id
      ) {
        throw new Error(
          'As credenciais de integração do WhatsApp ainda não foram configuradas para esta empresa.'
        );
      }

      const foundChan = (chanRes.data || []).find(
        (c: any) => String(c.id) === String(params.channel_id) || String(c.inbox_id) === String(params.channel_id)
      );
      const targetInboxId = foundChan?.inbox_id || companyRow.chatwoot_inbox_id || params.channel_id;
      const cleanBaseUrl = companyRow.chatwoot_url.replace(/\/+$/, '');
      const cwEndpoint = `${cleanBaseUrl}/api/v1/accounts/${companyRow.chatwoot_account_id}/conversations?inbox_id=${encodeURIComponent(
        String(targetInboxId)
      )}&status=open`;

      const cwRes = await fetch(cwEndpoint, {
        method: 'GET',
        headers: {
          api_access_token: companyRow.chatwoot_api_access_token,
          'Content-Type': 'application/json',
        },
      });

      if (!cwRes.ok) {
        throw new Error(`Não foi possível consultar as conversas do canal selecionado (${cwRes.status}).`);
      }

      const cwJson = await cwRes.json();
      const rawConversations: any[] = Array.isArray(cwJson?.data?.payload)
        ? cwJson.data.payload
        : Array.isArray(cwJson?.payload)
        ? cwJson.payload
        : Array.isArray(cwJson)
        ? cwJson
        : [];

      const profilePhoneById = new Map<string, string>();
      (profilesRes.data || []).forEach((p: any) => {
        const digits = String(p.whatsapp || '').replace(/\D/g, '');
        if (digits.length >= 8) {
          profilePhoneById.set(p.id, digits);
        }
      });

      const existingMap = new Map<string, { id: string; assunto: string }>();
      const existingPhoneMap = new Map<string, { id: string; assunto: string }>();
      (ticketsRes.data || []).forEach((t: any) => {
        if (t.chatwoot_conversation_id && !existingMap.has(String(t.chatwoot_conversation_id))) {
          existingMap.set(String(t.chatwoot_conversation_id), { id: t.id, assunto: t.assunto });
        }
        if (t.cliente_id && profilePhoneById.has(t.cliente_id)) {
          const suffix8 = profilePhoneById.get(t.cliente_id)!.slice(-8);
          if (!existingPhoneMap.has(suffix8)) {
            existingPhoneMap.set(suffix8, { id: t.id, assunto: t.assunto });
          }
        }
      });

      const mappedConversations = rawConversations.map((conv: any) => {
        const sender = conv?.meta?.sender || conv?.contact || {};
        const msgs = Array.isArray(conv?.messages) ? conv.messages : [];
        const lastMsg = conv?.last_non_activity_message || msgs[msgs.length - 1] || null;
        const rawTs = lastMsg?.created_at || conv?.last_activity_at || conv?.timestamp || conv?.created_at;
        const isoDate = rawTs
          ? typeof rawTs === 'number'
            ? new Date(rawTs * 1000).toISOString()
            : new Date(rawTs).toISOString()
          : new Date().toISOString();

        const rawContactPhone = sender?.phone_number || sender?.identifier || '';
        const contactDigits = String(rawContactPhone).replace(/\D/g, '');
        const contactSuffix8 = contactDigits.length >= 8 ? contactDigits.slice(-8) : '';

        const existing =
          (contactSuffix8 ? existingPhoneMap.get(contactSuffix8) : undefined) ||
          existingMap.get(String(conv.id));

        const recentMessages = msgs
          .filter((m: any) => m?.message_type !== 2 && m?.message_type !== 'activity' && m?.content && String(m.content).trim().length > 0)
          .sort((a: any, b: any) => {
            const tA = typeof a.created_at === 'number' ? a.created_at * 1000 : new Date(a.created_at || 0).getTime();
            const tB = typeof b.created_at === 'number' ? b.created_at * 1000 : new Date(b.created_at || 0).getTime();
            return tA - tB;
          })
          .slice(-5)
          .map((m: any) => {
            const isIncoming = m.message_type === 0 || m.message_type === 'incoming';
            return {
              id: m.id,
              sender: m?.sender?.name || (isIncoming ? (sender?.name || 'Cliente') : 'Atendente'),
              is_incoming: isIncoming,
              content: String(m.content).trim(),
              created_at: m.created_at
                ? typeof m.created_at === 'number'
                  ? new Date(m.created_at * 1000).toISOString()
                  : new Date(m.created_at).toISOString()
                : isoDate,
            };
          });

        return {
          conversation_id: conv.id,
          contact_name: sender?.name || 'Contato WhatsApp',
          contact_phone: rawContactPhone,
          contact_email: sender?.email || '',
          contact_avatar: sender?.thumbnail || sender?.avatar_url || '',
          last_message: lastMsg?.content || conv?.last_message?.content || 'Conversa ativa no WhatsApp',
          last_activity_at: isoDate,
          unread_count: conv?.unread_count || 0,
          status: conv?.status || 'open',
          existing_ticket_id: existing?.id || null,
          existing_ticket_subject: existing?.assunto || null,
          recent_messages: recentMessages,
        };
      });

      return { conversations: mappedConversations };
    } catch (err: any) {
      console.error('[dataService.listWhatsappConversations] Erro:', err);
      const rawMessage = String(err?.message || '');
      if (
        rawMessage.includes('Failed to fetch') ||
        rawMessage.includes('FunctionsFetchError') ||
        rawMessage.includes('NetworkError')
      ) {
        throw new Error(
          'Não foi possível conectar ao serviço de listagem do WhatsApp. Certifique-se de que a Edge Function "list-whatsapp-conversations" foi publicada no Supabase.'
        );
      }
      throw err;
    }
  },

  /**
   * Busca as últimas interações (3 a 5 mensagens) de uma conversa ativa do WhatsApp para preview antes de gerar o chamado
   */
  async getWhatsappConversationPreview(params: {
    company_id: string;
    conversation_id: number | string;
    contact_name?: string;
    fallback_messages?: Array<{
      id?: string | number;
      sender: string;
      is_incoming: boolean;
      content: string;
      created_at?: string;
    }>;
    fallback_last_message?: string;
  }): Promise<Array<{
    id?: string | number;
    sender: string;
    is_incoming: boolean;
    content: string;
    created_at?: string;
  }>> {
    try {
      const { data, error } = await supabase.functions.invoke('import-whatsapp-conversation', {
        body: {
          action: 'preview',
          company_id: params.company_id,
          conversation_id: params.conversation_id,
          contact_name: params.contact_name,
        },
      });

      if (!error && data && Array.isArray(data.preview_messages) && data.preview_messages.length > 0) {
        return data.preview_messages.slice(-5);
      }

      // Fallback direto na API da empresa caso a Edge Function ainda não tenha o modo preview publicado
      const { data: companyRow } = await supabase
        .from('companies')
        .select('id, chatwoot_url, chatwoot_api_access_token, chatwoot_account_id')
        .eq('id', params.company_id)
        .single();

      if (companyRow?.chatwoot_url && companyRow?.chatwoot_api_access_token && companyRow?.chatwoot_account_id) {
        const cleanBaseUrl = companyRow.chatwoot_url.replace(/\/+$/, '');
        try {
          const msgRes = await fetch(
            `${cleanBaseUrl}/api/v1/accounts/${companyRow.chatwoot_account_id}/conversations/${params.conversation_id}/messages`,
            {
              method: 'GET',
              headers: {
                api_access_token: companyRow.chatwoot_api_access_token,
                'Content-Type': 'application/json',
              },
            }
          );
          if (msgRes.ok) {
            const msgJson = await msgRes.json();
            const rawMsgs = Array.isArray(msgJson?.payload)
              ? msgJson.payload
              : Array.isArray(msgJson?.data?.payload)
              ? msgJson.data.payload
              : Array.isArray(msgJson)
              ? msgJson
              : [];

            const previewList = rawMsgs
              .filter((m: any) => m?.message_type !== 2 && m?.message_type !== 'activity' && m?.content && String(m.content).trim().length > 0)
              .sort((a: any, b: any) => {
                const tA = typeof a.created_at === 'number' ? a.created_at * 1000 : new Date(a.created_at || 0).getTime();
                const tB = typeof b.created_at === 'number' ? b.created_at * 1000 : new Date(b.created_at || 0).getTime();
                return tA - tB;
              })
              .slice(-5)
              .map((m: any) => {
                const isIncoming = m.message_type === 0 || m.message_type === 'incoming';
                return {
                  id: m.id,
                  sender: m?.sender?.name || (isIncoming ? (params.contact_name || 'Cliente') : 'Atendente'),
                  is_incoming: isIncoming,
                  content: String(m.content).trim(),
                  created_at: m.created_at
                    ? typeof m.created_at === 'number'
                      ? new Date(m.created_at * 1000).toISOString()
                      : new Date(m.created_at).toISOString()
                    : undefined,
                };
              });

            if (previewList.length > 0) {
              return previewList;
            }
          }
        } catch (_err) {
          // Segue para o fallback local da conversa
        }
      }
    } catch (_err) {
      // Segue para fallback local
    }

    if (params.fallback_messages && params.fallback_messages.length > 0) {
      return params.fallback_messages.slice(-5);
    }

    if (params.fallback_last_message) {
      return [
        {
          id: 'last',
          sender: params.contact_name || 'Cliente',
          is_incoming: true,
          content: params.fallback_last_message,
        },
      ];
    }

    return [];
  },

  /**
   * Importa uma conversa ativa do WhatsApp e cria o chamado + histórico de mensagens no TicketFlow
   */
  async importWhatsappConversation(params: {
    company_id: string;
    channel_id?: string;
    conversation_id: number | string;
    client_organization_id: string;
    cliente_id: string;
    operador_id?: string | null;
    contact_name?: string;
    contact_phone?: string;
    custom_subject?: string;
    prioridade?: string;
    sla_padrao_horas?: number | null;
    sla_vencimento?: string;
  }): Promise<{
    success: boolean;
    ticket_id: string;
    already_existed?: boolean;
    imported_messages?: number;
    message?: string;
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('import-whatsapp-conversation', {
        body: params,
      });

      if (!error && data) {
        if (data.error) {
          throw new Error(data.error);
        }
        return data;
      }

      // 2. Fallback direto via fetch utilizando token da sessão ou Anon Key
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vrkhkifhkztttukuxbwz.supabase.co';
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      const { data: sessionData } = await supabase.auth.getSession();
      const bearerToken = sessionData?.session?.access_token || supabaseAnonKey;

      if (supabaseUrl && supabaseAnonKey) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/import-whatsapp-conversation`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${bearerToken}`,
              apikey: supabaseAnonKey,
            },
            body: JSON.stringify(params),
          });
          const json = await res.json();
          if (!res.ok || json.error) {
            throw new Error(json.error || `Falha ao importar conversa (${res.status}).`);
          }
          return json;
        } catch (_edgeFetchErr) {
          // Segue para fallback resiliente caso a Edge Function ainda não esteja publicada
        }
      }

      // 3. Fallback Resiliente de Importação (caso a Edge Function ainda não tenha sido publicada no Supabase)
      const { data: companyRow } = await supabase
        .from('companies')
        .select('id, chatwoot_url, chatwoot_api_access_token, chatwoot_account_id, sla_padrao_horas')
        .eq('id', params.company_id)
        .single();

      let validMessages: any[] = [];
      if (companyRow?.chatwoot_url && companyRow?.chatwoot_api_access_token && companyRow?.chatwoot_account_id) {
        const cleanBaseUrl = companyRow.chatwoot_url.replace(/\/+$/, '');
        try {
          const msgRes = await fetch(
            `${cleanBaseUrl}/api/v1/accounts/${companyRow.chatwoot_account_id}/conversations/${params.conversation_id}/messages`,
            {
              method: 'GET',
              headers: {
                api_access_token: companyRow.chatwoot_api_access_token,
                'Content-Type': 'application/json',
              },
            }
          );
          if (msgRes.ok) {
            const msgJson = await msgRes.json();
            const rawMsgs = Array.isArray(msgJson?.payload)
              ? msgJson.payload
              : Array.isArray(msgJson?.data?.payload)
              ? msgJson.data.payload
              : Array.isArray(msgJson)
              ? msgJson
              : [];
            validMessages = rawMsgs
              .filter((m: any) => m?.message_type !== 2 && m?.message_type !== 'activity' && m?.content)
              .sort((a: any, b: any) => {
                const tA = typeof a.created_at === 'number' ? a.created_at * 1000 : new Date(a.created_at || 0).getTime();
                const tB = typeof b.created_at === 'number' ? b.created_at * 1000 : new Date(b.created_at || 0).getTime();
                return tA - tB;
              });
          }
        } catch (_msgErr) {
          // Prossegue com a criação do chamado mesmo se a consulta direta de mensagens for bloqueada por CORS
        }
      }

      const displayContact = params.contact_name?.trim() || params.contact_phone?.trim() || `#${params.conversation_id}`;
      const finalSubject = params.custom_subject?.trim() || `Atendimento WhatsApp - ${displayContact}`;
      const firstIncoming =
        validMessages.find((m: any) => m.message_type === 0 || m.message_type === 'incoming')?.content ||
        validMessages[0]?.content ||
        `Atendimento importado do WhatsApp (${displayContact}).`;

      let slaVencimentoIso = params.sla_vencimento;
      if (!slaVencimentoIso) {
        const horasSla =
          typeof params.sla_padrao_horas === 'number' && params.sla_padrao_horas > 0
            ? params.sla_padrao_horas
            : typeof companyRow?.sla_padrao_horas === 'number' && companyRow.sla_padrao_horas > 0
            ? companyRow.sla_padrao_horas
            : null;

        if (horasSla && horasSla > 0) {
          const slaDate = new Date();
          slaDate.setTime(slaDate.getTime() + horasSla * 60 * 60 * 1000);
          slaVencimentoIso = slaDate.toISOString();
        }
      }

      const { data: createdTicket, error: insertErr } = await supabase
        .from('tickets')
        .insert({
          company_id: params.company_id,
          client_organization_id: params.client_organization_id,
          cliente_id: params.cliente_id,
          operador_id: params.operador_id || null,
          assunto: finalSubject,
          descricao: String(firstIncoming).trim(),
          status: params.operador_id ? 'Em Andamento' : 'Aberto',
          prioridade: params.prioridade || 'Média',
          sla_vencimento: slaVencimentoIso,
          chatwoot_conversation_id: Number(params.conversation_id) || params.conversation_id,
        })
        .select('id')
        .single();

      if (insertErr || !createdTicket) {
        throw new Error(insertErr?.message || 'Não foi possível criar o chamado no banco de dados.');
      }

      if (validMessages.length > 0) {
        const msgRows = validMessages.map((m: any) => {
          const isIncoming = m.message_type === 0 || m.message_type === 'incoming';
          const createdIso = m.created_at
            ? typeof m.created_at === 'number'
              ? new Date(m.created_at * 1000).toISOString()
              : new Date(m.created_at).toISOString()
            : new Date().toISOString();
          return {
            ticket_id: createdTicket.id,
            company_id: params.company_id,
            user_id: isIncoming ? params.cliente_id : params.operador_id || params.cliente_id,
            content: String(m.content).trim(),
            is_internal_note: Boolean(m.private),
            is_imported: true,
            channel: 'whatsapp',
            created_at: createdIso,
          };
        });
        await supabase.from('ticket_messages').insert(msgRows);
      } else {
        await supabase.from('ticket_messages').insert({
          ticket_id: createdTicket.id,
          company_id: params.company_id,
          user_id: params.cliente_id,
          content: String(firstIncoming).trim(),
          is_internal_note: false,
          is_imported: true,
          channel: 'whatsapp',
        });
      }

      return {
        success: true,
        ticket_id: createdTicket.id,
        imported_messages: validMessages.length,
      };
    } catch (err: any) {
      console.error('[dataService.importWhatsappConversation] Erro:', err);
      const rawMessage = String(err?.message || '');
      if (
        rawMessage.includes('Failed to fetch') ||
        rawMessage.includes('FunctionsFetchError') ||
        rawMessage.includes('NetworkError')
      ) {
        throw new Error(
          'Não foi possível conectar ao serviço de importação do WhatsApp. Certifique-se de que a Edge Function "import-whatsapp-conversation" foi publicada no Supabase.'
        );
      }
      throw err;
    }
  },
};
