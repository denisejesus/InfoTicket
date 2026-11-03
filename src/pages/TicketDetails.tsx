/**
 * InfoTicket - Detalhes do Chamado, Omnichannel, Auditoria & CSAT v1.11.4
 * Linha do tempo em tempo real com eventos de auditoria intercalados,
 * Seletor de Canal (E-mail / WhatsApp Chat4u condicional às credenciais da empresa), Macros, SLA e Avaliação CSAT
 * Isolamento Multi-tenant rigorosamente aplicado via RLS (company_id)
 */
import React, { useEffect, useState, useRef } from 'react';
import { 
  ArrowLeft, 
  Send, 
  Clock, 
  CheckCircle2, 
  CheckCheck, 
  AlertCircle, 
  Lock, 
  MessageSquare, 
  RefreshCw, 
  Loader2,
  Mail,
  Zap,
  Phone,
  Search,
  X,
  Plus,
  BookOpen,
  Star,
  Activity,
  UserCheck,
  Building2,
  User,
  ChevronDown,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Download,
  ExternalLink,
  Trash2,
  Sparkles,
  Layers,
  Eye,
  EyeOff,
  ShieldAlert,
  Calendar
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { dataService } from '../services/dataService';
import { Ticket, TicketMessage, Company, Macro, AuditLog, Profile, TicketAttachment, TicketStatus, CommunicationTemplate, ChatwootChannel } from '../types/database';
import { CloseTicketModal } from '../components/CloseTicketModal';

interface TicketDetailsProps {
  ticketId: string;
  onBack: () => void;
  activeCompany?: Company | null;
}

export const TicketDetails: React.FC<TicketDetailsProps> = ({
  ticketId,
  onBack,
  activeCompany,
}) => {
  const { user, profile, company, activeCompanyId } = useAuth();
  const currentCompany = activeCompany || (activeCompanyId && company?.id === activeCompanyId ? company : company);

  const isCliente = profile?.role === 'Cliente';

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pesquisa de Satisfação (CSAT)
  const [csatRating, setCsatRating] = useState<number>(0);
  const [csatHover, setCsatHover] = useState<number>(0);
  const [csatComment, setCsatComment] = useState('');
  const [submittingCsat, setSubmittingCsat] = useState(false);
  const [csatSuccess, setCsatSuccess] = useState(false);
  const [csatError, setCsatError] = useState<string | null>(null);

  // Formulário de Nova Mensagem & Omnichannel
  const [content, setContent] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<'email' | 'whatsapp'>('email');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  // Macros (Respostas Rápidas)
  const [macros, setMacros] = useState<Macro[]>([]);
  const [isMacroModalOpen, setIsMacroModalOpen] = useState(false);
  const [macroSearch, setMacroSearch] = useState('');
  const [loadingMacros, setLoadingMacros] = useState(false);

  // Modelos de Resposta da Tabela communication_templates (Fase 14.1)
  const [commTemplates, setCommTemplates] = useState<CommunicationTemplate[]>([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Múltiplos Canais Chatwoot & Modelos Dinâmicos da Meta (Fase 16.3)
  const [chatwootChannels, setChatwootChannels] = useState<ChatwootChannel[]>([]);
  const [selectedChatwootChannelId, setSelectedChatwootChannelId] = useState<string>('');
  const [whatsappTemplates, setWhatsappTemplates] = useState<Array<{
    id?: string | number;
    name: string;
    category?: string;
    language?: string;
    status?: string;
    body_text?: string;
    variables: string[];
  }>>([]);
  const [loadingWhatsappTemplates, setLoadingWhatsappTemplates] = useState(false);
  const [selectedWhatsappTemplate, setSelectedWhatsappTemplate] = useState<{
    id?: string | number;
    name: string;
    category?: string;
    language?: string;
    status?: string;
    body_text?: string;
    variables: string[];
  } | null>(null);
  const [templateVariableValues, setTemplateVariableValues] = useState<Record<string, string>>({});

  // Cadastro Rápido de Nova Macro
  const [isNewMacroFormOpen, setIsNewMacroFormOpen] = useState(false);
  const [newMacroTitulo, setNewMacroTitulo] = useState('');
  const [newMacroConteudo, setNewMacroConteudo] = useState('');
  const [savingMacro, setSavingMacro] = useState(false);

  // Modal de Encerramento
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  // Controle de Visualização da Linha do Tempo: alternar logs técnicos/auditoria
  const [showTechnicalLogs, setShowTechnicalLogs] = useState(false);

  // Status de Integração com WhatsApp
  const [companyChatwoot, setCompanyChatwoot] = useState<Company | null>(null);

  // Lista de Operadores/Staff para Atribuição (Gestor, Gerente, Operador)
  const [staffUsers, setStaffUsers] = useState<Profile[]>([]);
  const [assigningOperator, setAssigningOperator] = useState(false);

  // Anexos do Chamado e Anexos da Resposta (Fase 13)
  const [ticketAttachments, setTicketAttachments] = useState<TicketAttachment[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const hasChatwootConfig = Boolean(
    (companyChatwoot?.chatwoot_url || currentCompany?.chatwoot_url)?.trim() &&
    (companyChatwoot?.chatwoot_api_access_token || currentCompany?.chatwoot_api_access_token)?.trim()
  );

  /**
   * Busca templates oficiais da Meta sincronizados na caixa de entrada do Chatwoot (Fase 16.3)
   */
  const fetchChatwootTemplates = async (inboxId: string, compId?: string) => {
    const targetCompId = compId || activeCompanyId || currentCompany?.id || ticket?.company_id;
    if (!inboxId || !targetCompId) {
      setWhatsappTemplates([]);
      setSelectedWhatsappTemplate(null);
      return;
    }

    setLoadingWhatsappTemplates(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-chatwoot-templates', {
        body: {
          channel_id: inboxId,
          company_id: targetCompId,
        },
      });

      if (error) {
        console.warn('⚠️ Erro ao consultar get-chatwoot-templates:', error);
        setWhatsappTemplates([]);
        setSelectedWhatsappTemplate(null);
      } else if (data?.templates && Array.isArray(data.templates)) {
        setWhatsappTemplates(data.templates);
        // Não pré-seleciona template automaticamente, sempre inicia vazio
        setSelectedWhatsappTemplate(null);
        setTemplateVariableValues({});
      } else {
        setWhatsappTemplates([]);
        setSelectedWhatsappTemplate(null);
        setTemplateVariableValues({});
      }
    } catch (err: any) {
      console.error('❌ Falha ao invocar get-chatwoot-templates:', err);
      setWhatsappTemplates([]);
      setSelectedWhatsappTemplate(null);
    } finally {
      setLoadingWhatsappTemplates(false);
    }
  };

  const loadTicketData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    setErrorMsg(null);

    try {
      const [ticketData, messagesData, auditData, attachmentsData] = await Promise.all([
        dataService.getTicketById(ticketId),
        dataService.getTicketMessages(ticketId),
        dataService.getTicketAuditLogs(ticketId),
        dataService.getTicketAttachments(ticketId),
      ]);

      if (!ticketData) {
        setErrorMsg('Chamado não encontrado ou você não tem permissão para visualizá-lo.');
      } else {
        setTicket(ticketData);
        setMessages(messagesData);
        setAuditLogs(auditData);
        setTicketAttachments(attachmentsData);
        if (ticketData.csat_score) {
          setCsatRating(ticketData.csat_score);
          setCsatComment(ticketData.csat_comentario || '');
        }

        // Se não for cliente, carrega a lista de operadores da empresa para o seletor de Responsável
        if (!isCliente && ticketData.company_id) {
          try {
            const allProfiles = await dataService.getProfiles(ticketData.company_id);
            const staffList = allProfiles.filter((p) => 
              ['Operador', 'Gerente', 'Gestor', 'Super Admin'].includes(p.role)
            );
            setStaffUsers(staffList);
          } catch (staffErr) {
            console.warn('Erro ao carregar lista de operadores staff:', staffErr);
          }
        }

        // Verifica configurações da empresa na tabela companies
        if (ticketData.company_id) {
          const compData = await dataService.getCompanyById(ticketData.company_id);
          if (compData) {
            setCompanyChatwoot(compData);
            // Se o WhatsApp não estiver configurado e o canal estiver como whatsapp, reverte para email
            const isConfigured = Boolean(compData.chatwoot_url?.trim() && compData.chatwoot_api_access_token?.trim());
            if (!isConfigured) {
              setSelectedChannel('email');
            }
          }

          // Carrega múltiplos canais Chatwoot cadastrados (Fase 16)
          try {
            const channels = await dataService.getChatwootChannels(ticketData.company_id);
            setChatwootChannels(channels);
            // Inicia sempre sem seleção prévia
            setSelectedChatwootChannelId('');
            setWhatsappTemplates([]);
            setSelectedWhatsappTemplate(null);
            setTemplateVariableValues({});
          } catch (chanErr) {
            console.warn('Erro ao carregar canais do Chatwoot:', chanErr);
          }
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar detalhes do chamado:', err);
      setErrorMsg(err.message || 'Falha ao buscar dados do chamado no Supabase.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /**
   * Atribui ou transfere o chamado para um operador responsável
   */
  const handleAssignOperator = async (newOperadorId: string | null) => {
    if (!ticket) return;

    setAssigningOperator(true);
    try {
      const selectedOp = staffUsers.find((s) => s.id === newOperadorId);
      const operadorNome = selectedOp ? selectedOp.nome : undefined;

      const updated = await dataService.assignTicketOperator(
        ticket.id,
        newOperadorId,
        operadorNome,
        user?.id,
        currentCompany?.id || ticket.company_id
      );

      if (updated) {
        setTicket((prev) => prev ? {
          ...prev,
          operador_id: updated.operador_id,
          operador: updated.operador,
          atualizado_em: updated.atualizado_em,
        } : null);

        // Recarrega logs de auditoria para refletir a nova atribuição
        const updatedAudit = await dataService.getTicketAuditLogs(ticket.id);
        setAuditLogs(updatedAudit);
      }
    } catch (err: any) {
      console.error('Erro ao atribuir operador:', err);
      alert('Não foi possível atribuir o operador. Verifique suas permissões.');
    } finally {
      setAssigningOperator(false);
    }
  };

  // Alteração de Status com registro de mensagem de sistema e auditoria (Fase 14)
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!ticket || ticket.status === newStatus || updatingStatus) return;

    if (newStatus === 'Fechado') {
      setIsCloseModalOpen(true);
      return;
    }

    setUpdatingStatus(true);
    try {
      await dataService.updateTicketStatus(
        ticket.id,
        newStatus,
        user?.id,
        currentCompany?.id || ticket.company_id
      );
      await loadTicketData(false);
    } catch (err: any) {
      console.error('Erro ao atualizar status:', err);
      alert('Não foi possível alterar o status do chamado.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const loadMacros = async () => {
    if (!currentCompany?.id) return;
    setLoadingMacros(true);
    try {
      const data = await dataService.getMacros(currentCompany.id);
      setMacros(data);
    } catch (err) {
      console.error('Erro ao carregar macros:', err);
    } finally {
      setLoadingMacros(false);
    }
  };

  // Carrega templates de comunicação para o company_id ativo (Fase 14.1)
  const loadCommunicationTemplates = async () => {
    const compId = currentCompany?.id || ticket?.company_id;
    if (!compId) return;
    setLoadingTemplates(true);
    try {
      const data = await dataService.getCommunicationTemplates(compId);
      setCommTemplates(data);
    } catch (err) {
      console.error('Erro ao carregar templates de comunicação:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (ticketId) {
      loadTicketData(true);
    }
  }, [ticketId]);

  // Abre modal de macros e busca dados
  const handleOpenMacros = async () => {
    setIsMacroModalOpen(true);
    setIsNewMacroFormOpen(false);
    setMacroSearch('');
    await loadMacros();
  };

  // Abre modal/dropdown de templates de comunicação da empresa
  const handleOpenTemplates = async () => {
    setIsTemplateModalOpen(true);
    setTemplateSearch('');
    await loadCommunicationTemplates();
  };

  // Aplica o conteúdo da macro no campo de resposta
  const handleSelectMacro = (macro: Macro) => {
    if (content.trim()) {
      setContent((prev) => `${prev}\n\n${macro.conteudo}`);
    } else {
      setContent(macro.conteudo);
    }
    setIsMacroModalOpen(false);
  };

  // Aplica o conteúdo do template (substituindo variáveis se aplicável) no campo de resposta
  const handleSelectTemplate = (tmpl: CommunicationTemplate) => {
    let resolvedBody = tmpl.corpo_mensagem;
    // Substitui variáveis conhecidas de contexto
    if (ticket) {
      const clientName = ticket.cliente?.nome || 'Cliente';
      resolvedBody = resolvedBody.replace(/\{\{nome_cliente\}\}/g, clientName);
      resolvedBody = resolvedBody.replace(/\{\{ticket_id\}\}/g, ticket.id.substring(0, 8));
      resolvedBody = resolvedBody.replace(/\{\{status_atual\}\}/g, ticket.status);
    }
    if (content.trim()) {
      setContent((prev) => `${prev}\n\n${resolvedBody}`);
    } else {
      setContent(resolvedBody);
    }
    setIsTemplateModalOpen(false);
  };

  // Cadastra uma nova macro rapidamente
  const handleCreateMacro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMacroTitulo.trim() || !newMacroConteudo.trim() || !currentCompany?.id) return;

    setSavingMacro(true);
    try {
      const created = await dataService.createMacro({
        company_id: currentCompany.id,
        titulo: newMacroTitulo.trim(),
        conteudo: newMacroConteudo.trim(),
      });

      if (created) {
        setMacros((prev) => [created, ...prev]);
        setNewMacroTitulo('');
        setNewMacroConteudo('');
        setIsNewMacroFormOpen(false);
      }
    } catch (err: any) {
      console.error('Erro ao criar macro:', err);
    } finally {
      setSavingMacro(false);
    }
  };

  // Helper para extrair variáveis {{variavel}} do corpo do template
  const getTemplateVariables = (bodyText: string): string[] => {
    const matches = bodyText.match(/\{\{([^}]+)\}\}/g);
    if (!matches) return [];
    const unique = Array.from(new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '').trim())));
    return unique;
  };

  // Helper para compor o texto final resolvido do template com os valores preenchidos
  const buildResolvedTemplateMessage = (templateBody: string): string => {
    let result = templateBody;
    const clientName = ticket?.cliente?.nome || 'Cliente';
    const ticketShortId = ticket?.id ? ticket.id.substring(0, 8) : '';
    const ticketStatus = ticket?.status || '';

    // Substituições padrão conhecidas
    result = result.replace(/\{\{nome_cliente\}\}/g, templateVariableValues['nome_cliente'] || templateVariableValues['1'] || clientName);
    result = result.replace(/\{\{nome\}\}/g, templateVariableValues['nome'] || templateVariableValues['1'] || clientName);
    result = result.replace(/\{\{ticket_id\}\}/g, templateVariableValues['ticket_id'] || templateVariableValues['2'] || ticketShortId);
    result = result.replace(/\{\{status_atual\}\}/g, templateVariableValues['status_atual'] || templateVariableValues['3'] || ticketStatus);

    // Substituição das variáveis numéricas ou dinâmicas {{1}}, {{2}}, etc.
    Object.keys(templateVariableValues).forEach((key) => {
      const reg = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(reg, templateVariableValues[key] || '');
    });

    return result;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    let messageToSend = content.trim();

    // Se o operador estiver respondendo via WhatsApp Oficial e não for nota interna, valida e monta o template oficial
    if (!isCliente && !isInternalNote && selectedChannel === 'whatsapp') {
      if (!selectedChatwootChannelId) {
        setSendError('Selecione obrigatoriamente o Canal de Envio WhatsApp.');
        alert('Selecione obrigatoriamente o Canal de Envio WhatsApp.');
        return;
      }
      if (!selectedWhatsappTemplate) {
        setSendError('Selecione obrigatoriamente o Modelo de Mensagem (Template Oficial da Meta).');
        alert('Selecione obrigatoriamente o Modelo de Mensagem (Template Oficial da Meta).');
        return;
      }

      // Valida se as variáveis numéricas do template foram preenchidas
      const vars = selectedWhatsappTemplate.variables && selectedWhatsappTemplate.variables.length > 0
        ? selectedWhatsappTemplate.variables
        : getTemplateVariables(selectedWhatsappTemplate.body_text || '');

      for (const v of vars) {
        const val = templateVariableValues[v]?.trim();
        if (!val) {
          const fieldMsg = `Preencha o campo obrigatório da variável {{${v}}} do template.`;
          setSendError(fieldMsg);
          alert(fieldMsg);
          return;
        }
      }

      messageToSend = buildResolvedTemplateMessage(selectedWhatsappTemplate.body_text || '');
    }

    if (!messageToSend && replyAttachments.length === 0) {
      setSendError('Por favor, informe o conteúdo da resposta antes de enviar.');
      return;
    }

    if (!currentCompany?.id) {
      setSendError('Tenant não identificado na sessão.');
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      // Clientes nunca enviam como nota interna e o canal é o do cliente
      const internalFlag = isCliente ? false : isInternalNote;
      const channelToUse = isCliente ? 'sistema' : internalFlag ? 'sistema' : selectedChannel;
      const isWhatsAppOfficial = !isCliente && !internalFlag && selectedChannel === 'whatsapp';

      const created = await dataService.createTicketMessage({
        ticket_id: ticketId,
        company_id: currentCompany.id,
        user_id: user?.id,
        content: messageToSend,
        is_internal_note: internalFlag,
        channel: channelToUse,
        whatsapp_template_name: isWhatsAppOfficial ? selectedWhatsappTemplate?.name : null,
        whatsapp_template_variables: isWhatsAppOfficial ? templateVariableValues : null,
      });

      // Se for disparo oficial de WhatsApp, executa a Edge Function dedicada
      if (isWhatsAppOfficial) {
        try {
          const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('send-whatsapp-official', {
            body: {
              ticket_id: ticketId,
              company_id: currentCompany.id,
              channel_id: selectedChatwootChannelId,
              whatsapp_template_name: selectedWhatsappTemplate?.name,
              whatsapp_template_variables: templateVariableValues,
              content: messageToSend,
              message_id: created?.id,
              cliente_nome: ticket?.cliente?.nome,
              cliente_whatsapp: ticket?.cliente?.whatsapp,
              cliente_email: ticket?.cliente?.email,
            },
          });

          if (edgeErr || (edgeData && edgeData.success === false)) {
            // Tenta extrair a mensagem detalhada enviada pela Edge Function
            let detailMsg = 'Falha ao entregar mensagem no WhatsApp.';
            if (edgeErr && (edgeErr as any).context) {
              try {
                const errJson = await (edgeErr as any).context.json();
                detailMsg = errJson.error || errJson.message || JSON.stringify(errJson);
              } catch (_) {
                detailMsg = edgeErr.message || detailMsg;
              }
            } else if (edgeData?.error) {
              detailMsg = edgeData.error;
            } else if (edgeErr?.message) {
              detailMsg = edgeErr.message;
            }

            console.error('❌ Erro na Edge Function send-whatsapp-official:', detailMsg);
            setSendError(`Erro no envio: ${detailMsg}`);
            alert(`Erro no envio: ${detailMsg}`);
          } else {
            setSendSuccess('Mensagem Oficial de WhatsApp enviada com sucesso!');
            alert('Mensagem enviada com sucesso!');
            setTimeout(() => setSendSuccess(null), 5000);
          }
        } catch (fnError: any) {
          console.error('❌ Exceção ao invocar send-whatsapp-official:', fnError);
          const errDetail = fnError?.message || 'Erro inesperado na chamada da função.';
          setSendError(`Erro na Edge Function: ${errDetail}`);
          alert(`Erro na Edge Function: ${errDetail}`);
        }
      }

      setContent('');
      setIsInternalNote(false);
      setSelectedChatwootChannelId('');
      setWhatsappTemplates([]);
      setSelectedWhatsappTemplate(null);
      setTemplateVariableValues({});

      // Upload de anexos vinculados a esta mensagem (Fase 13)
      if (created && replyAttachments.length > 0) {
        setUploadingAttachment(true);
        for (const file of replyAttachments) {
          try {
            const uploadedAtt = await dataService.uploadTicketAttachment({
              file,
              company_id: currentCompany.id,
              ticket_id: ticketId,
              message_id: created.id,
            });
            if (uploadedAtt) {
              setTicketAttachments((prev) => [...prev, uploadedAtt]);
            }
          } catch (uploadErr) {
            console.warn(`Aviso ao enviar anexo na resposta (${file.name}):`, uploadErr);
          }
        }
        setReplyAttachments([]);
        setUploadingAttachment(false);
      }

      if (created) {
        setMessages((prev) => [...prev, created]);
      } else {
        await loadTicketData(false);
      }
    } catch (err: any) {
      console.error('Erro ao enviar mensagem:', err);
      const errMsg = err.message || 'Erro ao registrar interação no Supabase.';
      setSendError(errMsg);
      alert(`Erro ao registrar resposta: ${errMsg}`);
    } finally {
      setSending(false);
      setUploadingAttachment(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mb-1" />
        <span className="font-semibold text-slate-700">Carregando detalhes do chamado #{ticketId.substring(0, 8)}...</span>
      </div>
    );
  }

  if (errorMsg || !ticket) {
    return (
      <div className="p-8 bg-white border border-slate-200 rounded-2xl shadow-sm text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Chamado não encontrado</h2>
        <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
          {errorMsg || 'O chamado solicitado não existe ou não pertence ao seu tenant.'}
        </p>
        <button
          onClick={onBack}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para Lista de Chamados</span>
        </button>
      </div>
    );
  }

  // Envio de Avaliação CSAT
  const handleCsatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csatRating || csatRating < 1 || csatRating > 5) {
      setCsatError('Por favor, selecione uma nota de 1 a 5 estrelas.');
      return;
    }

    if (!ticket) return;

    setSubmittingCsat(true);
    setCsatError(null);

    try {
      const ok = await dataService.submitTicketCsat(
        ticket.id,
        csatRating,
        csatComment.trim(),
        user?.id,
        ticket.company_id
      );

      if (ok) {
        setCsatSuccess(true);
        // Atualiza o estado local do ticket
        setTicket((prev) =>
          prev
            ? {
                ...prev,
                csat_score: csatRating,
                csat_comentario: csatComment.trim(),
              }
            : null
        );
        // Recarrega os logs de auditoria
        const freshLogs = await dataService.getTicketAuditLogs(ticket.id);
        setAuditLogs(freshLogs);
      } else {
        setCsatError('Falha ao registrar avaliação. Tente novamente.');
      }
    } catch (err: any) {
      console.error('Erro ao enviar CSAT:', err);
      setCsatError(err.message || 'Erro ao registrar avaliação no Supabase.');
    } finally {
      setSubmittingCsat(false);
    }
  };

  // Se for Cliente, oculta todas as notas internas (Whispers)
  const visibleMessages = messages.filter((m) => {
    if (isCliente && m.is_internal_note) {
      return false;
    }
    return true;
  });

  const isFechado = ticket?.status === 'Fechado' || ticket?.status === 'Resolvido';

  // Filtra macros no modal
  const filteredMacros = macros.filter((m) =>
    m.titulo.toLowerCase().includes(macroSearch.toLowerCase()) ||
    m.conteudo.toLowerCase().includes(macroSearch.toLowerCase())
  );

  // Filtra templates de comunicação no modal (Fase 14.1)
  const filteredCommTemplates = commTemplates.filter((t) =>
    (t.assunto || '').toLowerCase().includes(templateSearch.toLowerCase()) ||
    (t.tipo || '').toLowerCase().includes(templateSearch.toLowerCase()) ||
    (t.corpo_mensagem || '').toLowerCase().includes(templateSearch.toLowerCase())
  );

  // Unifica mensagens visíveis e logs de auditoria em uma linha do tempo cronológica
  type TimelineItem = 
    | { type: 'message'; data: TicketMessage; timestamp: string }
    | { type: 'audit'; data: AuditLog; timestamp: string; isTechnical: boolean }
    | { type: 'system_event'; text: string; user?: string; timestamp: string };

  const isTechnicalLog = (acao: string): boolean => {
    const text = (acao || '').toLowerCase();
    return (
      text.includes('smtp') ||
      text.includes('falha disparo e-mail') ||
      text.includes('erro fatal e-mail') ||
      text.includes('edge function') ||
      text.includes('sendgrid') ||
      text.includes('provedor') ||
      text.includes('status: error') ||
      text.includes('status: exception') ||
      text.includes('no_smtp_configured') ||
      text.includes('chat4u') ||
      text.includes('chatwoot') ||
      text.includes('mensagem oficial de whatsapp enviada')
    );
  };

  // Separa mensagens humanas reais de notificações de mudança de status geradas pelo sistema
  const realMessages: TimelineItem[] = [];
  const systemStatusEvents: TimelineItem[] = [];

  visibleMessages.forEach((m) => {
    const isAutoStatusMsg = 
      m.channel === 'sistema' && 
      (m.content?.startsWith('O status do chamado foi alterado') || m.content?.includes('Resumo da Solução:'));

    if (isAutoStatusMsg) {
      systemStatusEvents.push({
        type: 'system_event',
        text: m.content,
        user: m.user?.nome || 'Sistema',
        timestamp: m.created_at,
      });
    } else {
      realMessages.push({
        type: 'message',
        data: m,
        timestamp: m.created_at,
      });
    }
  });

  const auditEvents: TimelineItem[] = auditLogs.map((a) => ({
    type: 'audit',
    data: a,
    timestamp: a.criado_em,
    isTechnical: isTechnicalLog(a.acao),
  }));

  const allTimelineItems: TimelineItem[] = [
    ...realMessages,
    ...systemStatusEvents,
    ...auditEvents,
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Na visão principal, oculta logs técnicos brutos a menos que o operador ative o toggle de auditoria
  const timelineItems = allTimelineItems.filter((item) => {
    if (item.type === 'audit' && item.isTechnical && !showTechnicalLogs) {
      return false;
    }
    return true;
  });

  const technicalLogsCount = allTimelineItems.filter(
    (item) => item.type === 'audit' && item.isTechnical
  ).length;

  return (
    <div className="space-y-6 font-sans antialiased text-slate-900">
      {/* Botão Voltar & Ações de Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors shadow-sm self-start"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
          <span>Voltar para Chamados</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadTicketData(false)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          {/* Botão de Encerrar Chamado */}
          {!isFechado ? (
            <button
              onClick={() => setIsCloseModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-emerald-500/20 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Encerrar Chamado</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
              <CheckCheck className="w-4 h-4 text-emerald-600" />
              <span>Chamado Concluído</span>
            </span>
          )}
        </div>
      </div>

      {/* Cartão de Informações Principais do Chamado (B2B Corporativo - Estilo Zendesk / Jira) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Topo do Header: Título em Destaque e Identificador */}
        <div className="p-6 border-b border-slate-100 space-y-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded">
              #{ticket.id.substring(0, 8)}
            </span>

            {/* Status Dropdown / Badge */}
            {profile?.role !== 'Cliente' && !isFechado ? (
              <div className="relative inline-flex items-center">
                <select
                  value={ticket.status}
                  disabled={updatingStatus}
                  onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                  className={`text-xs font-bold rounded-lg pl-3 pr-8 py-1 border transition-all appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-xs ${
                    ticket.status === 'Aberto'
                      ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                      : ticket.status === 'Em Andamento'
                      ? 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                      : ticket.status === 'Aguardando Cliente'
                      ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  }`}
                  title="Alterar status do chamado"
                >
                  <option value="Aberto">Status: Aberto</option>
                  <option value="Em Andamento">Status: Em Atendimento</option>
                  <option value="Aguardando Cliente">Status: Aguardando Cliente</option>
                  <option value="Fechado">Status: Fechar Chamado...</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 pointer-events-none" />
              </div>
            ) : (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border ${
                  ticket.status === 'Aberto'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : ticket.status === 'Em Andamento'
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : ticket.status === 'Aguardando Cliente'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : ticket.status === 'Fechado'
                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {ticket.status === 'Fechado' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-slate-500" />
                ) : ticket.status === 'Resolvido' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                )}
                <span>{ticket.status}</span>
              </span>
            )}

            {/* Prioridade Badge */}
            <span className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
              Prioridade: <strong className="text-slate-800">{ticket.prioridade || 'Média'}</strong>
            </span>

            {/* SLA Badge */}
            {isFechado ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                SLA: Concluído
              </span>
            ) : ticket.sla_vencimento ? (() => {
              const now = new Date();
              const slaDate = new Date(ticket.sla_vencimento);
              const diffMs = slaDate.getTime() - now.getTime();
              const diffHours = diffMs / (1000 * 60 * 60);

              if (diffMs <= 0) {
                return (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                    SLA Vencido
                  </span>
                );
              } else if (diffHours <= 2) {
                return (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    SLA Atenção (&lt; 2h)
                  </span>
                );
              } else {
                return (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    SLA no Prazo (~{Math.round(diffHours)}h)
                  </span>
                );
              }
            })() : null}
          </div>

          <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">
            {ticket.assunto}
          </h1>
        </div>

        {/* Grid Horizontal de Metadados Corporativos (Solicitante, Responsável, Organização, Data) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5 bg-slate-50/70 border-b border-slate-200/80 text-xs">
          {/* Solicitante */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Solicitante
            </span>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                {ticket.cliente?.nome?.charAt(0).toUpperCase() || 'C'}
              </div>
              <span className="font-semibold text-slate-900 truncate">
                {ticket.cliente?.nome || 'Cliente'}
              </span>
            </div>
            {ticket.cliente?.email && (
              <span className="text-[11px] text-slate-500 block truncate">
                {ticket.cliente.email}
              </span>
            )}
          </div>

          {/* Organização / Empresa Cliente */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Organização
            </span>
            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">
                {ticket.client_organization?.nome || 'Geral'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 block">Cliente Corporativo</span>
          </div>

          {/* Responsável (Atribuição RBAC) */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Responsável
            </span>
            {!isCliente ? (
              ['Gestor', 'Gerente', 'Super Admin'].includes(profile?.role || '') ? (
                <div className="relative inline-block w-full">
                  <select
                    value={ticket.operador_id || ''}
                    disabled={assigningOperator}
                    onChange={(e) => handleAssignOperator(e.target.value ? e.target.value : null)}
                    className="w-full text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 pr-7 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer disabled:opacity-50 truncate"
                  >
                    <option value="">Não Atribuído</option>
                    {staffUsers.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.nome} ({staff.role})
                      </option>
                    ))}
                  </select>
                  {assigningOperator && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 absolute right-2 top-2 pointer-events-none" />
                  )}
                </div>
              ) : profile?.role === 'Operador' ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {ticket.operador_id !== user?.id && (
                    <button
                      type="button"
                      disabled={assigningOperator}
                      onClick={() => handleAssignOperator(user?.id || null)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
                    >
                      {assigningOperator ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <UserCheck className="w-3 h-3" />
                      )}
                      <span>Assumir</span>
                    </button>
                  )}
                  <select
                    value={ticket.operador_id || ''}
                    disabled={assigningOperator}
                    onChange={(e) => handleAssignOperator(e.target.value ? e.target.value : null)}
                    className="text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 pr-6 focus:outline-none cursor-pointer disabled:opacity-50 truncate max-w-[150px]"
                  >
                    <option value="">Transferir...</option>
                    {staffUsers.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.nome} {staff.id === user?.id ? '(Você)' : `(${staff.role})`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="font-semibold text-slate-900 block truncate">
                  {ticket.operador?.nome || 'Não atribuído'}
                </span>
              )
            ) : (
              <span className="font-semibold text-slate-900 block truncate">
                {ticket.operador?.nome || 'Equipe de Atendimento'}
              </span>
            )}
          </div>

          {/* Criado em & Prazos */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Abertura & SLA
            </span>
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                {new Date(ticket.criado_em).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            {ticket.sla_vencimento && (
              <span className="text-[11px] text-slate-500 block">
                Prazo: {new Date(ticket.sla_vencimento).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        {/* Descrição Inicial do Chamado */}
        <div className="p-6 space-y-3">
          <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 block">
            Descrição Inicial do Problema
          </span>
          <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
            {ticket.descricao}
          </div>

          {/* Anexos da Abertura do Chamado (message_id is null) */}
          {ticketAttachments.filter((att) => !att.message_id).length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                <span>Anexos da Abertura ({ticketAttachments.filter((att) => !att.message_id).length})</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {ticketAttachments
                  .filter((att) => !att.message_id)
                  .map((att) => {
                    const isImg = att.file_type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(att.file_name);
                    const sizeKb = att.file_size ? Math.round(att.file_size / 1024) : null;

                    return (
                      <div
                        key={att.id}
                        className="flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs hover:border-blue-300 transition-all group"
                      >
                        {isImg ? (
                          <a
                            href={att.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-28 bg-slate-100 flex items-center justify-center overflow-hidden border-b border-slate-100 relative group-hover:opacity-95"
                          >
                            <img
                              src={att.file_url}
                              alt={att.file_name}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/20 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                              <ExternalLink className="w-5 h-5 text-white drop-shadow-md" />
                            </div>
                          </a>
                        ) : null}

                        <div className="p-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 truncate">
                            {isImg ? (
                              <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            ) : (
                              <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            )}
                            <span className="text-xs font-semibold text-slate-800 truncate" title={att.file_name}>
                              {att.file_name}
                            </span>
                          </div>

                          <a
                            href={att.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={att.file_name}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors shrink-0"
                            title="Baixar arquivo"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        {sizeKb && (
                          <div className="px-2.5 pb-1.5 text-[10px] text-slate-400">
                            {sizeKb} KB
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Resumo de Conclusão se estiver encerrado */}
        {ticket.resumo_conclusao && (
          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-sm text-emerald-900">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Resumo de Conclusão do Chamado:</span>
            </div>
            <p className="whitespace-pre-wrap text-xs text-emerald-800 font-medium">
              {ticket.resumo_conclusao}
            </p>
          </div>
        )}

        {/* PESQUISA DE SATISFAÇÃO (CSAT) - Exibida quando encerrado/resolvido com resumo */}
        {isFechado && ticket.resumo_conclusao && (
          <div className="mt-4 p-5 bg-gradient-to-br from-amber-50/60 to-orange-50/40 border border-amber-200/80 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
              <h3 className="text-sm font-bold text-slate-900">Pesquisa de Satisfação (CSAT)</h3>
            </div>

            {ticket.csat_score ? (
              /* Modo Leitura: Já avaliado */
              <div className="space-y-2">
                <p className="text-xs text-slate-600">
                  Atendimento avaliado pelo cliente com a seguinte nota:
                </p>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-5 h-5 ${
                        star <= (ticket.csat_score || 0)
                          ? 'text-amber-500 fill-amber-400'
                          : 'text-slate-300'
                      }`}
                    />
                  ))}
                  <span className="ml-2 text-xs font-bold text-slate-800">
                    {ticket.csat_score} de 5 estrelas
                  </span>
                </div>
                {ticket.csat_comentario && (
                  <div className="mt-2 p-3 bg-white/80 border border-amber-200/60 rounded-xl text-xs text-slate-700">
                    <span className="font-semibold text-slate-900 block mb-0.5">Comentário do Cliente:</span>
                    <p className="whitespace-pre-wrap italic text-slate-600">"{ticket.csat_comentario}"</p>
                  </div>
                )}
              </div>
            ) : isCliente ? (
              /* Modo Interativo: Cliente avaliando */
              <form onSubmit={handleCsatSubmit} className="space-y-3">
                <p className="text-xs text-slate-700">
                  Como você avalia a resolução deste chamado? Sua nota nos ajuda a melhorar nosso suporte contínuo:
                </p>

                {csatError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{csatError}</span>
                  </div>
                )}

                {/* Seletor de Estrelas */}
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const isFilled = (csatHover || csatRating) >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setCsatRating(star)}
                        onMouseEnter={() => setCsatHover(star)}
                        onMouseLeave={() => setCsatHover(0)}
                        className="p-1 text-slate-300 hover:scale-110 transition-transform focus:outline-none"
                      >
                        <Star
                          className={`w-7 h-7 transition-colors ${
                            isFilled ? 'text-amber-500 fill-amber-400' : 'text-slate-300'
                          }`}
                        />
                      </button>
                    );
                  })}
                  {csatRating > 0 && (
                    <span className="ml-2 text-xs font-bold text-amber-700">
                      {csatRating === 5
                        ? 'Excelente!'
                        : csatRating === 4
                        ? 'Muito Bom'
                        : csatRating === 3
                        ? 'Regular'
                        : csatRating === 2
                        ? 'Ruim'
                        : 'Muito Insatisfeito'}
                    </span>
                  )}
                </div>

                {/* Campo de Comentário Opcional */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Comentário adicional (opcional):
                  </label>
                  <textarea
                    rows={2}
                    value={csatComment}
                    onChange={(e) => setCsatComment(e.target.value)}
                    placeholder="Conte-nos o que achou da atenção, agilidade ou solução apresentada..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-800 placeholder-slate-400 resize-none"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingCsat || csatRating === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-amber-600/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submittingCsat ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Enviando avaliação...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Enviar Avaliação</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              /* Modo Informativo para Operador / Gestor */
              <div className="text-xs text-slate-500 italic">
                Aguardando avaliação de satisfação pelo cliente.
              </div>
            )}
          </div>
        )}
      </div>

      {/* LINHA DO TEMPO (FEED VERTICAL CORPORATIVO - ESTILO ZENDESK / JIRA) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-slate-700" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Histórico de Mensagens & Atividades</h2>
          </div>
          
          <div className="flex items-center gap-2">
            {technicalLogsCount > 0 && !isCliente && (
              <button
                type="button"
                onClick={() => setShowTechnicalLogs(!showTechnicalLogs)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                  showTechnicalLogs
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700'
                }`}
                title="Alternar visualização de logs técnicos de entrega e provedor"
              >
                {showTechnicalLogs ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-amber-700" />
                    <span>Ocultar Logs ({technicalLogsCount})</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                    <span>Logs Técnicos ({technicalLogsCount})</span>
                  </>
                )}
              </button>
            )}
            <span className="text-xs text-slate-500 font-medium">
              {timelineItems.length} {timelineItems.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>
        </div>

        {timelineItems.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl shadow-xs text-xs text-slate-500">
            <MessageSquare className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">Nenhuma interação registrada ainda.</p>
            <p className="mt-0.5">Utilize o formulário abaixo para registrar a primeira resposta.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {timelineItems.map((item) => {
              // Divisor de Auditoria Técnica / Ação do Sistema
              if (item.type === 'audit') {
                const log = item.data;
                const horaFormatada = new Date(log.criado_em).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const dataFormatada = new Date(log.criado_em).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                });

                const isTech = item.isTechnical;

                return (
                  <div key={`audit-${log.id}`} className="flex items-center justify-center my-3">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs shadow-2xs border ${
                      isTech
                        ? 'bg-amber-50/90 border-amber-200 text-amber-800'
                        : 'bg-slate-100/80 border border-slate-200 text-slate-500'
                    }`}>
                      {isTech ? (
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      ) : (
                        <Activity className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span>
                        <strong className="text-slate-700 font-semibold">{log.user?.nome || 'Sistema'}</strong>: {log.acao} às {horaFormatada} ({dataFormatada})
                      </span>
                    </div>
                  </div>
                );
              }

              // Divisor de Mudança de Status / Eventos de Sistema
              if (item.type === 'system_event') {
                const horaFormatada = new Date(item.timestamp).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const dataFormatada = new Date(item.timestamp).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                });

                return (
                  <div key={`sysevt-${item.timestamp}-${item.text.slice(0, 15)}`} className="flex items-center justify-center my-3">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs shadow-2xs border bg-slate-50 border-slate-200 text-slate-500">
                      <Activity className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>
                        <strong className="text-slate-700 font-semibold">{item.user}</strong>: {item.text} às {horaFormatada} ({dataFormatada})
                      </span>
                    </div>
                  </div>
                );
              }

              // Mensagem Real (Card Corporativo 100% à Esquerda)
              const msg = item.data;
              const isWhisper = msg.is_internal_note;
              const isClientSender = msg.user?.role === 'Cliente' || msg.user_id === ticket?.cliente_id;
              const isSenderMe = msg.user_id === user?.id;

              return (
                <div
                  key={`msg-${msg.id}`}
                  className={`w-full rounded-xl border transition-all overflow-hidden shadow-xs ${
                    isWhisper
                      ? 'bg-amber-50/50 border-amber-200/90'
                      : isClientSender
                      ? 'bg-white border-slate-200'
                      : 'bg-slate-50/90 border-slate-200'
                  }`}
                >
                  {/* Cabeçalho Interno do Card da Mensagem */}
                  <div className={`p-3.5 sm:px-4 sm:py-3 border-b flex flex-wrap items-center justify-between gap-2.5 ${
                    isWhisper
                      ? 'bg-amber-100/40 border-amber-200/60'
                      : isClientSender
                      ? 'bg-slate-50/60 border-slate-100'
                      : 'bg-slate-100/60 border-slate-200/60'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          isWhisper
                            ? 'bg-amber-200 text-amber-900'
                            : isClientSender
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        {msg.user?.nome?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900">
                            {msg.user?.nome || 'Usuário'}
                          </span>
                          {msg.user?.role && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              isClientSender
                                ? 'bg-white text-slate-600 border-slate-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                              {msg.user.role}
                            </span>
                          )}
                          {isSenderMe && (
                            <span className="text-[10px] font-bold text-blue-600">(Você)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Badge de Canal Omnichannel */}
                      {!isWhisper && msg.channel && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            msg.channel === 'whatsapp'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : msg.channel === 'email'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-white text-slate-600 border-slate-200'
                          }`}
                        >
                          {msg.channel === 'whatsapp' ? (
                            <>
                              <Phone className="w-2.5 h-2.5 text-emerald-600" />
                              <span>WhatsApp</span>
                            </>
                          ) : msg.channel === 'email' ? (
                            <>
                              <Mail className="w-2.5 h-2.5 text-blue-600" />
                              <span>E-mail</span>
                            </>
                          ) : (
                            <span>Sistema</span>
                          )}
                        </span>
                      )}

                      {/* Badge de Nota Interna */}
                      {isWhisper && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-300">
                          <Lock className="w-3 h-3 text-amber-800" />
                          Nota Interna
                        </span>
                      )}

                      <span className="text-[11px] font-medium text-slate-500">
                        {new Date(msg.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Corpo da Mensagem com Tipografia Corporativa */}
                  <div className="p-4 sm:p-5 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
                    {msg.content}
                  </div>

                  {/* Anexos vinculados à mensagem (Fase 13) */}
                  {ticketAttachments.filter((att) => att.message_id === msg.id).length > 0 && (
                    <div className="px-4 pb-4 sm:px-5 sm:pb-5 pt-1 border-t border-slate-100">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-3">
                        {ticketAttachments
                          .filter((att) => att.message_id === msg.id)
                          .map((att) => {
                            const isImg = att.file_type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(att.file_name);
                            const sizeKb = att.file_size ? Math.round(att.file_size / 1024) : null;

                            return (
                              <div
                                key={att.id}
                                className="flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs hover:border-blue-300 transition-all group"
                              >
                                {isImg ? (
                                  <a
                                    href={att.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="h-28 bg-slate-100 flex items-center justify-center overflow-hidden border-b border-slate-100 relative group-hover:opacity-95"
                                  >
                                    <img
                                      src={att.file_url}
                                      alt={att.file_name}
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/20 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                                      <ExternalLink className="w-5 h-5 text-white drop-shadow-md" />
                                    </div>
                                  </a>
                                ) : null}

                                <div className="p-2 flex items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-1.5 truncate">
                                    {isImg ? (
                                      <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    ) : (
                                      <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                    )}
                                    <span className="text-[11px] font-semibold text-slate-800 truncate" title={att.file_name}>
                                      {att.file_name}
                                    </span>
                                  </div>

                                  <a
                                    href={att.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download={att.file_name}
                                    className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors shrink-0"
                                    title="Baixar anexo"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                                {sizeKb && (
                                  <div className="px-2 pb-1 text-[9px] text-slate-400">
                                    {sizeKb} KB
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FORMULÁRIO DE INTERAÇÃO / NOVA RESPOSTA (CORPORATIVO B2B) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Responder ao Chamado</h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Botão Inserir Template / Modelo de Resposta */}
            {!isCliente && (
              <button
                type="button"
                onClick={handleOpenTemplates}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs"
                title="Inserir modelo da tabela de templates de comunicação da empresa"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Usar Modelo</span>
              </button>
            )}

            {/* Botão Usar Macro */}
            {!isCliente && (
              <button
                type="button"
                onClick={handleOpenMacros}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs"
                title="Inserir resposta rápida cadastrada"
              >
                <Zap className="w-3.5 h-3.5 text-purple-600" />
                <span>Respostas Rápidas</span>
              </button>
            )}

            {/* Checkbox Nota Interna */}
            {!isCliente && (
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold select-none text-slate-700 ml-2 py-1 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={isInternalNote}
                  onChange={(e) => setIsInternalNote(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <span className={`flex items-center gap-1 ${isInternalNote ? 'text-amber-800 font-bold' : ''}`}>
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  Nota Interna
                </span>
              </label>
            )}
          </div>
        </div>

        {/* SELETOR DE CANAL ENXUTO E COMPACTO */}
        {!isCliente && !isInternalNote && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                Canal de Envio:
              </span>
              <div className="inline-flex p-0.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
                <button
                  type="button"
                  onClick={() => setSelectedChannel('email')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    selectedChannel === 'email'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>E-mail</span>
                </button>

                <button
                  type="button"
                  disabled={!hasChatwootConfig}
                  onClick={() => setSelectedChannel('whatsapp')}
                  title={!hasChatwootConfig ? 'WhatsApp não configurado' : 'Disparo via WhatsApp'}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    !hasChatwootConfig
                      ? 'text-slate-300 cursor-not-allowed'
                      : selectedChannel === 'whatsapp'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-500">
              {hasChatwootConfig ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  WhatsApp Ativo
                </span>
              ) : (
                <span className="text-slate-400">WhatsApp Inativo para esta empresa</span>
              )}
            </div>
          </div>
        )}

        {sendSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{sendSuccess}</span>
          </div>
        )}

        {sendError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{sendError}</span>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="space-y-3">
          {/* Se o canal for WhatsApp (Chat4u) e NÃO for nota interna: Oculta a caixa livre e exibe seletores de Canal, Template Oficial e Inputs de Variáveis */}
          {!isCliente && !isInternalNote && selectedChannel === 'whatsapp' ? (
            <div className="space-y-3.5 p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-emerald-600 text-white">
                    <Phone className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                    Envio de Mensagem Oficial WhatsApp (API)
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                  Exige Modelo Aprovado
                </span>
              </div>

              {/* Seletor 1: Canal de Envio (chatwoot_channels) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Canal / Caixa de Entrada de Envio <span className="text-rose-500">*</span>
                </label>
                {chatwootChannels.length === 0 ? (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Nenhum canal WhatsApp cadastrado para esta empresa. Cadastre canais nas Configurações do Sistema.</span>
                  </div>
                ) : (
                  <select
                    value={selectedChatwootChannelId}
                    onChange={(e) => {
                      const newInbox = e.target.value;
                      setSelectedChatwootChannelId(newInbox);
                      fetchChatwootTemplates(newInbox);
                    }}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="">Selecione a Caixa de Entrada / Canal...</option>
                    {chatwootChannels.map((chan) => (
                      <option key={chan.id} value={chan.inbox_id}>
                        {chan.nome} (Inbox ID: {chan.inbox_id})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Seletor 2: Modelo de Mensagem (Template Oficial da Meta - Sincronizado do Chatwoot) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-800">
                    Modelo de Mensagem (Template Oficial Meta) <span className="text-rose-500">*</span>
                  </label>
                  {loadingWhatsappTemplates && (
                    <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Sincronizando com a Meta...</span>
                    </span>
                  )}
                </div>

                {loadingWhatsappTemplates ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    <span>Consultando modelos liberados na API WhatsApp...</span>
                  </div>
                ) : whatsappTemplates.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Nenhum modelo oficial sincronizado para esta Caixa de Entrada.</p>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        Certifique-se de que a caixa de entrada possui templates aprovados no WhatsApp Business Manager e sincronizados.
                      </p>
                    </div>
                  </div>
                ) : (
                  <select
                    value={selectedWhatsappTemplate?.name || ''}
                    onChange={(e) => {
                      const found = whatsappTemplates.find((t) => t.name === e.target.value) || null;
                      setSelectedWhatsappTemplate(found);
                      if (found) {
                        const vars = found.variables && found.variables.length > 0
                          ? found.variables
                          : getTemplateVariables(found.body_text || '');
                        const initialVars: Record<string, string> = {};
                        vars.forEach((v) => {
                          if (v === '1' || v === 'nome_cliente' || v === 'nome') {
                            initialVars[v] = ticket?.cliente?.nome || '';
                          } else if (v === '2' || v === 'ticket_id') {
                            initialVars[v] = ticket?.id ? ticket.id.substring(0, 8) : '';
                          } else if (v === '3' || v === 'status_atual') {
                            initialVars[v] = ticket?.status || '';
                          } else {
                            initialVars[v] = templateVariableValues[v] || '';
                          }
                        });
                        setTemplateVariableValues(initialVars);
                      }
                    }}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="">Selecione o Modelo Meta Oficial...</option>
                    {whatsappTemplates.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name} ({t.language || 'pt_BR'}) {t.status ? `• ${t.status}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Visualização Prévia do Modelo e Inputs Dinâmicos de Variáveis ({{1}}, {{2}}...) */}
              {selectedWhatsappTemplate && (
                <div className="space-y-3 pt-2 border-t border-emerald-100">
                  {/* Inputs para as Variáveis do Modelo */}
                  {(selectedWhatsappTemplate.variables?.length > 0 || getTemplateVariables(selectedWhatsappTemplate.body_text || '').length > 0) && (
                    <div className="p-3.5 bg-white border border-emerald-200/80 rounded-xl space-y-2.5 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Preencha as Variáveis do Modelo Oficial (Meta)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {(selectedWhatsappTemplate.variables?.length > 0
                          ? selectedWhatsappTemplate.variables
                          : getTemplateVariables(selectedWhatsappTemplate.body_text || '')
                        ).map((vKey) => (
                          <div key={vKey}>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Variável {`{{${vKey}}}`} <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={templateVariableValues[vKey] || ''}
                              onChange={(e) =>
                                setTemplateVariableValues((prev) => ({
                                  ...prev,
                                  [vKey]: e.target.value,
                                }))
                              }
                              placeholder={`Valor do parâmetro {{${vKey}}}`}
                              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Card de Preview da Mensagem Resolvida */}
                  <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                      <span>Prévia da Mensagem Entregue via WhatsApp</span>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                        {selectedWhatsappTemplate.name}
                      </span>
                    </div>
                    <div className="p-3 bg-emerald-50/40 border border-emerald-100 rounded-lg text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                      {buildResolvedTemplateMessage(selectedWhatsappTemplate.body_text || '')}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                isInternalNote
                  ? 'Escreva uma nota interna restrita à equipe (clientes não conseguirão ler)...'
                  : 'Digite sua mensagem para o cliente (será enviada por e-mail)...'
              }
              className={`w-full p-3 text-xs rounded-xl border focus:outline-none focus:ring-2 transition-all resize-y ${
                isInternalNote
                  ? 'bg-amber-50/50 border-amber-300 text-amber-950 focus:ring-amber-500/30 placeholder-amber-700/60'
                  : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-blue-500/20 placeholder-slate-400'
              }`}
            />
          )}

          {/* Anexos da Resposta (Fase 13) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => replyFileInputRef.current?.click()}
                disabled={sending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                <span>Anexar Arquivo</span>
              </button>

              <input
                ref={replyFileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    const files = Array.from(e.target.files);
                    setReplyAttachments((prev) => [...prev, ...files]);
                  }
                }}
              />

              {uploadingAttachment && (
                <span className="text-[11px] font-semibold text-blue-600 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Enviando anexo...</span>
                </span>
              )}
            </div>

            {/* Lista de Arquivos Selecionados para Enviar com a Resposta */}
            {replyAttachments.length > 0 && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                {replyAttachments.map((file, idx) => {
                  const isImg = file.type.startsWith('image/');
                  const sizeKb = Math.round(file.size / 1024);
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2 truncate mr-2">
                        {isImg ? (
                          <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        )}
                        <span className="font-medium text-slate-800 truncate" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">({sizeKb} KB)</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setReplyAttachments((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Remover anexo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-[11px] text-slate-500">
              {isInternalNote ? (
                <span className="text-amber-700 font-semibold flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Privado para a equipe
                </span>
              ) : (
                <span>
                  Disparo programado via <strong>{selectedChannel === 'whatsapp' ? 'WhatsApp' : 'E-mail'}</strong>
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={
                sending ||
                (selectedChannel === 'whatsapp' && !isCliente && !isInternalNote
                  ? !selectedWhatsappTemplate || !selectedChatwootChannelId
                  : !content.trim() && replyAttachments.length === 0)
              }
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-50 ${
                isInternalNote
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20'
                  : selectedChannel === 'whatsapp'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
              }`}
            >
              {sending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>A Enviar...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isInternalNote
                      ? 'Registrar Nota Interna'
                      : selectedChannel === 'whatsapp'
                      ? 'Enviar via WhatsApp'
                      : 'Enviar via E-mail'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* MODAL DE RESPOSTAS RÁPIDAS (MACROS) */}
      {isMacroModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col text-slate-900 max-h-[85vh]">
            {/* Header Modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-100 text-purple-700 font-bold">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-tight">Respostas Rápidas (Macros)</h2>
                  <p className="text-[11px] text-slate-500">Injete textos padrão na resposta do chamado</p>
                </div>
              </div>
              <button
                onClick={() => setIsMacroModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo Modal */}
            <div className="p-6 overflow-y-auto space-y-4">
              {/* Barra de Busca & Botão Nova Macro */}
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={macroSearch}
                    onChange={(e) => setMacroSearch(e.target.value)}
                    placeholder="Buscar macro por título ou texto..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-slate-900 placeholder-slate-400"
                  />
                </div>
                <button
                  onClick={() => setIsNewMacroFormOpen(!isNewMacroFormOpen)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors shadow-sm shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isNewMacroFormOpen ? 'Fechar' : 'Nova Macro'}</span>
                </button>
              </div>

              {/* Formulário de Criação de Macro */}
              {isNewMacroFormOpen && (
                <form onSubmit={handleCreateMacro} className="p-4 bg-purple-50/50 border border-purple-200 rounded-xl space-y-3 animate-in fade-in">
                  <span className="text-xs font-bold text-purple-900 block">Cadastrar Nova Macro</span>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Título da Macro</label>
                    <input
                      type="text"
                      required
                      value={newMacroTitulo}
                      onChange={(e) => setNewMacroTitulo(e.target.value)}
                      placeholder="Ex: Saudação Padrão / Solicitação de Dados"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Conteúdo da Resposta</label>
                    <textarea
                      rows={3}
                      required
                      value={newMacroConteudo}
                      onChange={(e) => setNewMacroConteudo(e.target.value)}
                      placeholder="Digite o texto que será inserido automaticamente..."
                      className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsNewMacroFormOpen(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingMacro}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm disabled:opacity-50"
                    >
                      {savingMacro ? 'Salvando...' : 'Salvar Macro'}
                    </button>
                  </div>
                </form>
              )}

              {/* Lista de Macros */}
              {loadingMacros ? (
                <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                  <span>Carregando macros...</span>
                </div>
              ) : filteredMacros.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
                  <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">Nenhuma macro cadastrada no momento.</p>
                  <p className="text-[11px] mt-1">Clique em "Nova Macro" acima para criar sua primeira resposta rápida.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredMacros.map((macro) => (
                    <div
                      key={macro.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-purple-50/40 hover:border-purple-200 transition-all flex items-start justify-between gap-3 group"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-slate-900 group-hover:text-purple-700 block">
                          {macro.titulo}
                        </span>
                        <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">
                          {macro.conteudo}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectMacro(macro)}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all shrink-0 shadow-sm shadow-purple-500/20"
                      >
                        Inserir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsMacroModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE MODELOS DE RESPOSTA / TEMPLATES (communication_templates - Fase 14.1) */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col text-slate-900 max-h-[85vh]">
            {/* Header Modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-tight">Modelos de Resposta (Templates)</h2>
                  <p className="text-[11px] text-slate-500">
                    Selecione um modelo da tabela de comunicação para preencher a resposta
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo Modal */}
            <div className="p-6 overflow-y-auto space-y-4">
              {/* Barra de Busca */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Buscar template por tipo, assunto ou texto..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900 placeholder-slate-400"
                />
              </div>

              {/* Lista de Templates de Comunicação */}
              {loadingTemplates ? (
                <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Carregando modelos de resposta...</span>
                </div>
              ) : filteredCommTemplates.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">Nenhum template disponível no momento.</p>
                  <p className="text-[11px] mt-1">Configure modelos de comunicação no painel de Configurações.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredCommTemplates.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-blue-50/40 hover:border-blue-200 transition-all flex items-start justify-between gap-3 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-xs text-slate-900 group-hover:text-blue-700 block truncate">
                            {tmpl.assunto || tmpl.tipo}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                            {tmpl.tipo}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 whitespace-pre-line">
                          {tmpl.corpo_mensagem}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectTemplate(tmpl)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shrink-0 shadow-sm shadow-blue-500/20"
                      >
                        Inserir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Encerramento com Resumo Obrigatório */}
      <CloseTicketModal
        ticket={ticket}
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        onTicketClosed={() => {
          loadTicketData(false);
        }}
      />
    </div>
  );
};

export default TicketDetails;
