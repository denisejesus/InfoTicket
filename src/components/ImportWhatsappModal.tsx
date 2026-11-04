/**
 * TicketFlow - Modal de Importação de Conversas do WhatsApp v1.5.0
 * Permite puxar conversas ativas do WhatsApp (Canais da empresa) e transformá-las em chamados no sistema.
 * Inclui Área de Leitura Rápida (Preview das últimas 3 a 5 interações) para validar o contexto antes de Gerar Chamado.
 * Cálculo dinâmico de SLA (sla_vencimento) baseado no sla_padrao_horas configurado pela empresa ativa.
 * Regra de Negócio: Verifica apenas chamados ATIVOS ('Aberto', 'Em Atendimento', 'Em Andamento', 'Aguardando Cliente'),
 * omitindo avisos caso os chamados anteriores do cliente já estejam encerrados/resolvidos.
 * Layout 100% Responsivo no Smartphone com Rolagem Interna e Botões Fixos Acessíveis.
 * Regras absolutas: Tema Claro (Light Mode), Isolamento Multi-Tenant (company_id) e zero jargões técnicos na interface.
 */
import React, { useState, useEffect } from 'react';
import {
  X,
  MessageSquare,
  RefreshCw,
  Loader2,
  AlertCircle,
  Building2,
  User as UserIcon,
  Phone,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Clock,
  Search,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';
import {
  Company,
  ChatwootChannel,
  ClientOrganization,
  Profile
} from '../types/database';

interface PreviewMessageItem {
  id?: string | number;
  sender: string;
  is_incoming: boolean;
  content: string;
  created_at?: string;
}

interface WhatsappConversationItem {
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
  existing_ticket_status?: string | null;
  recent_messages?: PreviewMessageItem[];
}

interface ImportWhatsappModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCompany?: Company | null;
  onImported: (ticketId: string) => void;
}

export const ImportWhatsappModal: React.FC<ImportWhatsappModalProps> = ({
  isOpen,
  onClose,
  activeCompany,
  onImported,
}) => {
  const { user, profile, company, activeCompanyId } = useAuth();
  const currentCompany = activeCompany || company;
  const companyId = activeCompanyId || currentCompany?.id || profile?.company_id || '';

  // Passo 1: Canais de WhatsApp
  const [channels, setChannels] = useState<ChatwootChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [loadingChannels, setLoadingChannels] = useState<boolean>(false);

  // Passo 2: Conversas em aberto no WhatsApp
  const [conversations, setConversations] = useState<WhatsappConversationItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState<boolean>(false);
  const [searchConv, setSearchConv] = useState<string>('');
  const [selectedConversation, setSelectedConversation] = useState<WhatsappConversationItem | null>(null);

  // Passo 3: Vínculo da Organização e Solicitante
  const [organizations, setOrganizations] = useState<ClientOrganization[]>([]);
  const [customers, setCustomers] = useState<Profile[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [customSubject, setCustomSubject] = useState<string>('');
  const [prioridade, setPrioridade] = useState<'Baixa' | 'Média' | 'Alta' | 'Urgente'>('Média');

  // Estados de importação, preview e feedback
  const [importing, setImporting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewMessages, setPreviewMessages] = useState<PreviewMessageItem[]>([]);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);

  // Carrega canais de WhatsApp, Organizações e Solicitantes ao abrir o modal
  useEffect(() => {
    if (!isOpen || !companyId) return;

    setErrorMsg(null);
    setSelectedConversation(null);
    setConversations([]);
    setSelectedChannelId('');
    setSearchConv('');

    const fetchInitialData = async () => {
      setLoadingChannels(true);
      try {
        const [channelList, orgList, customerList] = await Promise.all([
          dataService.getChatwootChannels(companyId),
          dataService.getClientOrganizations(companyId),
          dataService.getCustomers(companyId),
        ]);

        // Caso a empresa possua um canal padrão configurado na tabela companies mas ainda não salvo em chatwoot_channels
        const finalChannels: ChatwootChannel[] = [...channelList];
        if (finalChannels.length === 0 && currentCompany?.chatwoot_inbox_id) {
          finalChannels.push({
            id: 'default',
            company_id: companyId,
            nome: 'Canal Principal de WhatsApp',
            inbox_id: String(currentCompany.chatwoot_inbox_id),
            criado_em: new Date().toISOString(),
          });
        }

        setChannels(finalChannels);
        setOrganizations(orgList as ClientOrganization[]);
        setCustomers(customerList);

        // Se houver apenas 1 canal, já seleciona automaticamente para agilizar o fluxo
        if (finalChannels.length === 1) {
          setSelectedChannelId(finalChannels[0].id);
        }
      } catch (err: any) {
        console.error('Erro ao carregar dados iniciais do modal WhatsApp:', err);
        setErrorMsg('Não foi possível carregar os canais e organizações desta empresa.');
      } finally {
        setLoadingChannels(false);
      }
    };

    fetchInitialData();
  }, [isOpen, companyId]);

  // Passo 2: Ao selecionar o Canal, busca as conversas abertas
  useEffect(() => {
    if (!isOpen || !companyId || !selectedChannelId) {
      setConversations([]);
      setSelectedConversation(null);
      return;
    }

    fetchOpenConversations(selectedChannelId);
  }, [selectedChannelId, isOpen, companyId]);

  const fetchOpenConversations = async (channelId: string) => {
    if (!companyId || !channelId) return;
    setLoadingConversations(true);
    setErrorMsg(null);
    setSelectedConversation(null);

    try {
      const result = await dataService.listWhatsappConversations({
        company_id: companyId,
        channel_id: channelId,
      });
      setConversations(result.conversations || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Não foi possível buscar as conversas ativas deste canal de WhatsApp.');
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  };

  // Quando o operador clica em uma conversa para importar (Passo 3)
  const handleSelectConversation = async (conv: WhatsappConversationItem) => {
    setErrorMsg(null);
    setSelectedConversation(conv);

    const defaultAssunto = `Atendimento WhatsApp - ${conv.contact_name || conv.contact_phone || `#${conv.conversation_id}`}`;
    setCustomSubject(defaultAssunto);
    setPrioridade('Média');

    // Inicializa com as mensagens recentes já presentes na listagem (se houver) e busca as últimas 3 a 5 interações completas
    const initialPreview: PreviewMessageItem[] =
      conv.recent_messages && conv.recent_messages.length > 0
        ? conv.recent_messages.slice(-5)
        : conv.last_message
        ? [
            {
              id: 'last',
              sender: conv.contact_name || 'Cliente',
              is_incoming: true,
              content: conv.last_message,
              created_at: conv.last_activity_at,
            },
          ]
        : [];

    setPreviewMessages(initialPreview);

    // Tenta localizar automaticamente o Solicitante e a Organização pelo número de WhatsApp
    const cleanConvPhone = (conv.contact_phone || '').replace(/\D/g, '');
    const matchedCustomer = cleanConvPhone
      ? customers.find((c) => {
          const cPhone = (c.whatsapp || '').replace(/\D/g, '');
          return (
            cPhone &&
            (cPhone === cleanConvPhone ||
              cPhone.endsWith(cleanConvPhone.slice(-8)) ||
              cleanConvPhone.endsWith(cPhone.slice(-8)))
          );
        })
      : undefined;

    if (matchedCustomer) {
      const orgId = matchedCustomer.client_organization_id || (organizations[0]?.id ?? '');
      setSelectedOrgId(orgId);
      setSelectedClienteId(matchedCustomer.id);
    } else {
      const firstOrgId = organizations[0]?.id || '';
      setSelectedOrgId(firstOrgId);
      const orgCustomers = customers.filter((c) => !firstOrgId || c.client_organization_id === firstOrgId);
      setSelectedClienteId(orgCustomers[0]?.id || '');
    }

    // Busca as últimas interações (3 a 5 mensagens) da conversa selecionada para leitura rápida
    setLoadingPreview(true);
    try {
      const fetchedPreview = await dataService.getWhatsappConversationPreview({
        company_id: companyId,
        conversation_id: conv.conversation_id,
        contact_name: conv.contact_name,
        fallback_messages: initialPreview,
        fallback_last_message: conv.last_message,
      });
      if (fetchedPreview && fetchedPreview.length > 0) {
        setPreviewMessages(fetchedPreview.slice(-5));
      }
    } catch (_previewErr) {
      // Mantém initialPreview caso a busca complementar falhe
    } finally {
      setLoadingPreview(false);
    }
  };

  // Filtra solicitantes vinculados à Organização selecionada
  const filteredCustomers = customers.filter((c) => {
    if (!selectedOrgId) return true;
    return c.client_organization_id === selectedOrgId;
  });

  // Garante que ao trocar de Organização, o Solicitante selecionado pertença a ela
  useEffect(() => {
    if (!selectedConversation) return;
    if (filteredCustomers.length > 0) {
      const exists = filteredCustomers.some((c) => c.id === selectedClienteId);
      if (!exists) {
        setSelectedClienteId(filteredCustomers[0].id);
      }
    } else {
      setSelectedClienteId('');
    }
  }, [selectedOrgId, filteredCustomers.length]);

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedChannelId) {
      setErrorMsg('Selecione um Canal de WhatsApp.');
      return;
    }
    if (!selectedConversation) {
      setErrorMsg('Selecione uma conversa ativa na lista.');
      return;
    }
    if (!selectedOrgId) {
      setErrorMsg('A seleção da Organização é obrigatória.');
      return;
    }
    if (!selectedClienteId) {
      setErrorMsg('A seleção do Solicitante é obrigatória.');
      return;
    }

    setImporting(true);
    try {
      // Lê o sla_padrao_horas atualizado da empresa logada (via fetch ou AuthContext) e calcula sla_vencimento dinamicamente
      const freshCompany = await dataService.getCompanyById(companyId);
      const slaPadraoHoras =
        freshCompany?.sla_padrao_horas && freshCompany.sla_padrao_horas > 0
          ? freshCompany.sla_padrao_horas
          : currentCompany?.sla_padrao_horas && currentCompany.sla_padrao_horas > 0
          ? currentCompany.sla_padrao_horas
          : null;

      let slaVencimentoIso: string | undefined = undefined;
      if (slaPadraoHoras && slaPadraoHoras > 0) {
        const dataSla = new Date();
        dataSla.setTime(dataSla.getTime() + slaPadraoHoras * 60 * 60 * 1000);
        slaVencimentoIso = dataSla.toISOString();
      }

      const response = await dataService.importWhatsappConversation({
        company_id: companyId,
        channel_id: selectedChannelId,
        conversation_id: selectedConversation.conversation_id,
        client_organization_id: selectedOrgId,
        cliente_id: selectedClienteId,
        operador_id: user?.id || null,
        contact_name: selectedConversation.contact_name,
        contact_phone: selectedConversation.contact_phone,
        custom_subject: customSubject.trim(),
        prioridade,
        sla_padrao_horas: slaPadraoHoras,
        sla_vencimento: slaVencimentoIso,
      });

      if (response && response.ticket_id) {
        onImported(response.ticket_id);
      } else {
        throw new Error('Não foi possível obter o código do chamado criado.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao importar a conversa do WhatsApp.');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  const filteredConversations = conversations.filter((c) => {
    const term = searchConv.trim().toLowerCase();
    if (!term) return true;
    const termDigits = term.replace(/\D/g, '');
    const phoneLower = (c.contact_phone || '').toLowerCase();
    const phoneDigits = phoneLower.replace(/\D/g, '');
    const nameMatch = Boolean(c.contact_name && c.contact_name.toLowerCase().includes(term));
    const phoneMatch =
      phoneLower.includes(term) ||
      Boolean(termDigits.length > 0 && phoneDigits.includes(termDigits));
    return nameMatch || phoneMatch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-2 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho Fixo do Modal - Tema Claro */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">Importar Conversa do WhatsApp</h2>
              <p className="text-[11px] sm:text-xs text-slate-500 line-clamp-1">
                Transforme um atendimento ativo do WhatsApp em um chamado rastreável na{' '}
                <strong className="text-slate-700">{currentCompany?.razao_social || 'sua organização'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors disabled:opacity-50 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador de Passos Responsivo */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3 bg-white border-b border-slate-100 flex items-center justify-between gap-2 overflow-x-auto text-xs shrink-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] ${
                selectedChannelId
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                  : 'bg-blue-600 text-white'
              }`}
            >
              1
            </span>
            <span className="font-semibold text-slate-800 whitespace-nowrap">Canal</span>
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] ${
                selectedConversation
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                  : selectedChannelId
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              2
            </span>
            <span className={`whitespace-nowrap ${selectedChannelId ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>
              Conversa
            </span>
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] ${
                selectedConversation ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}
            >
              3
            </span>
            <span className={`whitespace-nowrap ${selectedConversation ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>
              Organização
            </span>
          </div>
        </div>

        {/* Corpo do Modal com Rolagem Interna */}
        <div className="p-4 sm:p-6 space-y-5 flex-1 overflow-y-auto min-h-0">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          {/* PASSO 1: SELEÇÃO DO CANAL DE WHATSAPP */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700">
                1. Selecione o Canal de WhatsApp *
              </label>
              {selectedChannelId && !selectedConversation && (
                <button
                  type="button"
                  onClick={() => fetchOpenConversations(selectedChannelId)}
                  disabled={loadingConversations}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingConversations ? 'animate-spin' : ''}`} />
                  <span>Atualizar conversas</span>
                </button>
              )}
            </div>

            {loadingChannels ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-2.5 px-3 bg-slate-50 rounded-xl border border-slate-200">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Carregando canais de WhatsApp da empresa...</span>
              </div>
            ) : channels.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                Nenhum Canal de WhatsApp está cadastrado para esta empresa. Solicite ao administrador que configure os Canais na tela de Configurações.
              </div>
            ) : (
              <select
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(e.target.value)}
                disabled={importing}
                required
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900 font-medium"
              >
                <option value="">Escolha um Canal de WhatsApp...</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.nome}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* PASSO 2: LISTAGEM DE CONVERSAS ABERTAS */}
          {selectedChannelId && !selectedConversation && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="block text-xs font-bold text-slate-700">
                  2. Conversas em Aberto no Momento ({filteredConversations.length})
                </label>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchConv}
                    onChange={(e) => setSearchConv(e.target.value)}
                    placeholder="Filtrar por nome ou número..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>

              {loadingConversations ? (
                <div className="py-12 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                  <span className="font-medium text-slate-700">Buscando conversas ativas no WhatsApp...</span>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="py-10 px-4 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
                  <MessageSquare className="w-7 h-7 text-slate-300 mx-auto mb-1" />
                  <p className="text-xs font-bold text-slate-700">
                    {searchConv.trim()
                      ? 'Nenhuma conversa encontrada para o filtro informado.'
                      : 'Nenhuma conversa aberta encontrada neste canal.'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {searchConv.trim()
                      ? 'Verifique o nome ou o número de WhatsApp digitado na busca.'
                      : 'Apenas atendimentos que estão em aberto no WhatsApp aparecem nesta listagem.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-0.5">
                  {filteredConversations.map((conv) => {
                    const formattedDate = conv.last_activity_at
                      ? new Date(conv.last_activity_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '';

                    return (
                      <div
                        key={conv.conversation_id}
                        className="p-3.5 sm:p-4 bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-xs rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {conv.contact_name || 'Contato WhatsApp'}
                            </span>
                            {conv.contact_phone && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Phone className="w-2.5 h-2.5" />
                                {conv.contact_phone}
                              </span>
                            )}
                            {conv.unread_count > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                                {conv.unread_count} nova(s)
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 line-clamp-1">
                            {conv.last_message || 'Conversa sem prévia de texto.'}
                          </p>

                          <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-400">
                            {formattedDate && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Última interação: {formattedDate}
                              </span>
                            )}
                            {conv.existing_ticket_id &&
                              (!conv.existing_ticket_status ||
                                ['Aberto', 'Em Atendimento', 'Em Andamento', 'Aguardando Cliente'].includes(
                                  conv.existing_ticket_status
                                )) && (
                                <span className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Já possui chamado (#{conv.existing_ticket_id.substring(0, 8)})
                                </span>
                              )}
                          </div>
                        </div>

                        <div className="shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSelectConversation(conv)}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/15 transition-all"
                          >
                            <span>Abrir Chamado</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* PASSO 3: VÍNCULO DA ORGANIZAÇÃO E SOLICITANTE */}
          {selectedConversation && (
            <form onSubmit={handleImportSubmit} className="space-y-4 pt-2 border-t border-slate-100">
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-950">
                      Conversa selecionada: {selectedConversation.contact_name}
                    </span>
                    {selectedConversation.contact_phone && (
                      <span className="text-[11px] font-semibold text-emerald-700">
                        ({selectedConversation.contact_phone})
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-emerald-800 truncate">
                    Última mensagem: "{selectedConversation.last_message || 'Sem texto'}"
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedConversation(null)}
                  disabled={importing}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-200 transition-colors shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Trocar conversa</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Seleção Obrigatória de Organização */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" />
                      Organização (Cliente) *
                    </span>
                  </label>
                  <select
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    required
                    disabled={importing}
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900 font-medium"
                  >
                    <option value="">Selecione a Organização...</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Seleção Obrigatória de Solicitante */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                      Solicitante *
                    </span>
                  </label>
                  <select
                    value={selectedClienteId}
                    onChange={(e) => setSelectedClienteId(e.target.value)}
                    required
                    disabled={importing || !selectedOrgId}
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900 font-medium disabled:bg-slate-100"
                  >
                    <option value="">
                      {filteredCustomers.length === 0
                        ? 'Nenhum solicitante nesta organização'
                        : 'Selecione o Solicitante...'}
                    </option>
                    {filteredCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} {c.whatsapp ? `(${c.whatsapp})` : `(${c.email})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Assunto do Chamado *
                  </label>
                  <input
                    type="text"
                    required
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    disabled={importing}
                    placeholder="Ex: Atendimento via WhatsApp"
                    className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Prioridade
                  </label>
                  <select
                    value={prioridade}
                    onChange={(e) => setPrioridade(e.target.value as any)}
                    disabled={importing}
                    className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900 font-medium"
                  >
                    <option value="Baixa">Baixa</option>
                    <option value="Média">Média</option>
                    <option value="Alta">Alta</option>
                    <option value="Urgente">Urgente</option>
                  </select>
                </div>
              </div>

              {/* ÁREA DE LEITURA RÁPIDA: PREVIEW / RESUMO DAS ÚLTIMAS INTERAÇÕES (3 A 5 MENSAGENS) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-800">
                      Resumo das Últimas Interações ({previewMessages.length})
                    </span>
                  </div>
                  <span className="text-[10px] font-medium text-slate-500">
                    Confira o contexto antes de gerar o chamado
                  </span>
                </div>

                {loadingPreview && previewMessages.length <= 1 ? (
                  <div className="py-4 px-3 bg-white border border-slate-200 rounded-lg flex items-center justify-center gap-2 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    <span>Carregando últimas mensagens da conversa...</span>
                  </div>
                ) : previewMessages.length === 0 ? (
                  <div className="py-3 px-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-500 text-center">
                    Nenhuma mensagem de texto recente disponível para pré-visualização.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {previewMessages.slice(-5).map((msg, idx) => (
                      <div
                        key={msg.id || idx}
                        className={`p-2.5 rounded-lg border text-xs ${
                          msg.is_incoming
                            ? 'bg-white border-slate-200 text-slate-800'
                            : 'bg-emerald-50/60 border-emerald-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span
                            className={`font-bold text-[11px] ${
                              msg.is_incoming ? 'text-blue-700' : 'text-emerald-800'
                            }`}
                          >
                            {msg.sender || (msg.is_incoming ? selectedConversation.contact_name || 'Cliente' : 'Atendente')}
                          </span>
                          {msg.created_at && (
                            <span className="text-[10px] text-slate-400">
                              {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 bg-white pt-3 pb-1 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={importing}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={importing || !selectedOrgId || !selectedClienteId}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Importando histórico e criando chamado...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Gerar Chamado</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Rodapé Fixo nos Passos 1 e 2 */}
        {!selectedConversation && (
          <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportWhatsappModal;
