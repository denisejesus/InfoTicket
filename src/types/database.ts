/**
 * Modelos TypeScript do Banco de Dados InfoTicket v1.18.1
 */

export type UserRole = 'Super Admin' | 'Gestor' | 'Gerente' | 'Operador' | 'Operador/Funcionário' | 'Cliente';

export type TicketStatus = 'Aberto' | 'Em Andamento' | 'Aguardando Cliente' | 'Resolvido' | 'Fechado';

export interface ClientOrganization {
  id: string;
  company_id: string;
  nome: string;
  criado_em?: string;
  atualizado_em?: string;
}

export interface Macro {
  id: string;
  company_id: string;
  titulo: string;
  conteudo: string;
  criado_em?: string;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  company_id: string;
  user_id: string;
  content: string;
  is_internal_note: boolean;
  channel: string;
  whatsapp_template_name?: string | null;
  whatsapp_template_variables?: Record<string, any> | null;
  created_at: string;
  user?: Profile;
}

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  company_id: string;
  message_id?: string | null;
  file_name: string;
  file_url: string;
  file_size?: number | null;
  file_type?: string | null;
  criado_em?: string;
}

export interface CommunicationTemplate {
  id: string;
  company_id: string;
  tipo: 'welcome_email' | 'new_ticket' | 'status_change' | 'new_message' | 'csat';
  assunto: string;
  corpo_mensagem: string;
  criado_em?: string;
  atualizado_em?: string;
}

export interface Company {
  id: string;
  razao_social: string;
  cnpj?: string;
  status: string;
  trial_ends_at?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  chatwoot_url?: string;
  chatwoot_api_access_token?: string;
  chatwoot_account_id?: number | null;
  chatwoot_inbox_id?: number | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_password?: string | null;
  smtp_from_email?: string | null;
  smtp_from_name?: string | null;
  criado_em?: string;
  atualizado_em?: string;
}

export interface Profile {
  id: string;
  company_id: string;
  client_organization_id?: string | null;
  nome?: string;
  email?: string;
  whatsapp?: string | null;
  role: UserRole;
  recebe_notificacoes: boolean;
  status?: string;
  avatar_url?: string;
  criado_em?: string;
  atualizado_em?: string;
  company?: Company;
  client_organization?: ClientOrganization;
}

export interface AuditLog {
  id: string;
  company_id: string;
  ticket_id: string;
  user_id?: string;
  acao: string;
  criado_em: string;
  user?: Profile;
}

export interface Ticket {
  id: string;
  company_id: string;
  client_organization_id?: string | null;
  cliente_id?: string;
  operador_id?: string;
  assunto: string;
  descricao: string;
  status: TicketStatus;
  prioridade?: string;
  resumo_conclusao?: string;
  sla_vencimento?: string;
  csat_score?: number | null;
  csat_comentario?: string | null;
  chatwoot_conversation_id?: number | string | null;
  criado_em: string;
  atualizado_em: string;
  cliente?: Profile;
  operador?: Profile;
  client_organization?: ClientOrganization;
}

export interface ChatwootChannel {
  id: string;
  company_id: string;
  nome: string;
  inbox_id: string;
  criado_em?: string;
}
