import { supabase } from '../lib/supabase';
import { Company, Profile, Ticket, CommunicationTemplate, TicketAttachment, ChatwootChannel } from '../types/database';

/**
 * Serviço de dados do InfoTicket v1.17.0
 * Consome exclusivamente o Supabase sem mocks hardcoded
 */
export const dataService = {
  /**
   * Cria um novo perfil na tabela profiles (RBAC / Gestão de Equipe e Clientes)
   * Deixa que o Supabase/PostgreSQL gere automaticamente o UUID se não for informado
   * e dispara a notificação de boas-vindas por e-mail com as credenciais.
   */
  async createProfile(profileData: {
    company_id: string;
    client_organization_id?: string | null;
    nome: string;
    email: string;
    whatsapp?: string | null;
    role: string;
    recebe_notificacoes: boolean;
  }): Promise<Profile | null> {
    const payload: Record<string, any> = {
      company_id: profileData.company_id,
      nome: profileData.nome,
      email: profileData.email,
      whatsapp: profileData.whatsapp?.trim() || null,
      role: profileData.role,
      recebe_notificacoes: profileData.recebe_notificacoes,
    };

    if (profileData.client_organization_id) {
      payload.client_organization_id = profileData.client_organization_id;
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert(payload)
      .select(`
        *,
        client_organization:client_organizations(id, nome)
      `)
      .single();

    if (error) {
      console.error('Erro ao criar perfil:', error.message);
      throw error;
    }

    // Dispara a Edge Function de boas-vindas para o novo usuário
    try {
      await supabase.functions.invoke('send-notification', {
        body: {
          event_type: 'welcome_email',
          company_id: profileData.company_id,
          user_id: data.id,
          recipient_email: profileData.email,
          recipient_name: profileData.nome,
        },
      });
    } catch (notifyErr) {
      console.warn('Aviso: Falha ao enviar notificação de boas-vindas para novo perfil:', notifyErr);
    }

    return data;
  },

  /**
   * Atualiza campos de um perfil (nome, role, recebe_notificacoes, etc.)
   */
  async updateProfile(profileId: string, updates: Partial<Profile>): Promise<Profile | null> {
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
   * Invoca a Edge Function reset-user-password para redefinir senha no Supabase Auth
   */
  async resetUserPassword(userId: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await supabase.functions.invoke('reset-user-password', {
        body: {
          user_id: userId,
          new_password: newPassword,
        },
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
          body: JSON.stringify({
            user_id: userId,
            new_password: newPassword,
          }),
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
   * Obtém todas as empresas (Permitido para Super Admin via RLS)
   */
  async getAllCompanies(): Promise<Company[]> {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('criado_em', { ascending: false });

    if (error) {
      console.error('Erro ao buscar todas as empresas:', error.message);
      throw error;
    }
    return data || [];
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
   * Cria um novo chamado com cálculo automático de SLA de vencimento
   */
  async createTicket(ticket: Partial<Ticket>): Promise<Ticket | null> {
    // Cálculo de SLA padrão (+4 horas úteis a partir de agora se não for informado)
    let slaCalculado = ticket.sla_vencimento;
    if (!slaCalculado) {
      const dataSla = new Date();
      dataSla.setHours(dataSla.getHours() + 4);
      slaCalculado = dataSla.toISOString();
    }

    const { data, error } = await supabase
      .from('tickets')
      .insert({
        ...ticket,
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
   * Encerra um chamado definindo o status para Fechado, preenchendo o resumo e registrando log de auditoria
   */
  async closeTicket(ticketId: string, resumoConclusao: string, userId?: string, companyId?: string): Promise<Ticket | null> {
    const { data, error } = await supabase
      .from('tickets')
      .update({
        status: 'Fechado',
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

    // Registra mensagem de sistema e log de auditoria do encerramento
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
            content: `O status do chamado foi alterado para: Fechado. Resumo da Solução: ${resumoConclusao.trim()}`,
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
          acao: `Encerrou o chamado com status Fechado. Resumo: "${resumoConclusao.substring(0, 60)}${resumoConclusao.length > 60 ? '...' : ''}"`,
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
        assunto: 'Bem-vindo ao InfoTicket - {{nome_empresa}}',
        corpo_mensagem: 'Olá, {{nome_cliente}}!\n\nSeja muito bem-vindo ao portal de atendimento da {{nome_empresa}}.\nSeu acesso foi configurado com sucesso e nossa equipe está à disposição para auxiliá-lo.\n\nAcesse nosso portal a qualquer momento: {{portal_url}}\n\nAtenciosamente,\nEquipe de Suporte {{nome_empresa}}',
      },
      {
        company_id: companyId,
        tipo: 'new_ticket',
        assunto: '[InfoTicket] Chamado Aberto com Sucesso: #{{ticket_id}} - {{assunto}}',
        corpo_mensagem: 'Olá, {{nome_cliente}}!\n\nConfirmamos a abertura do seu chamado #{{ticket_id}} sobre "{{assunto}}".\nNossa equipe técnica já foi notificada e o prazo estimado de atendimento (SLA) é de {{sla_prazo}}.\n\nVocê pode acompanhar e interagir diretamente pelo link: {{ticket_link}}\n\nAtenciosamente,\nEquipe {{nome_empresa}}',
      },
      {
        company_id: companyId,
        tipo: 'status_change',
        assunto: '[InfoTicket] Atualização no Chamado #{{ticket_id}}: Status alterado para {{status_atual}}',
        corpo_mensagem: 'Olá, {{nome_cliente}}!\n\nInformamos que o status do seu chamado #{{ticket_id}} foi atualizado para: {{status_atual}}.\n\nPara verificar o andamento ou enviar mais informações, acesse: {{ticket_link}}\n\nAtenciosamente,\nEquipe {{nome_empresa}}',
      },
      {
        company_id: companyId,
        tipo: 'new_message',
        assunto: '[InfoTicket] Nova Interação no Chamado #{{ticket_id}}',
        corpo_mensagem: 'Olá, {{nome_cliente}}!\n\nHá uma nova mensagem registrada no seu chamado #{{ticket_id}} por {{nome_remetente}}:\n\n"{{mensagem_resumo}}"\n\nResponda diretamente através do portal: {{ticket_link}}\n\nAtenciosamente,\nEquipe {{nome_empresa}}',
      },
      {
        company_id: companyId,
        tipo: 'csat',
        assunto: '[InfoTicket] Como foi seu atendimento no Chamado #{{ticket_id}}?',
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
};
