/**
 * TicketFlow - Configurações da Empresa v1.19.0
 * Servidor de E-mail Corporativo Multi-Tenant (SMTP), Integração Omnichannel Chat4u & Templates de Comunicação
 * Interface Estritamente em Tema Claro (Light Mode) com Tailwind CSS e Isolamento Multi-tenant via RLS
 */
import React, { useEffect, useState } from 'react';
import { 
  Settings, 
  MessageSquare, 
  Mail, 
  Phone, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Link as LinkIcon, 
  Key, 
  Hash, 
  Inbox, 
  FileText, 
  Info, 
  Copy, 
  Check, 
  HelpCircle,
  ShieldCheck,
  Lock,
  Crown,
  Trash2,
  Plus,
  Server,
  Send
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';
import { CommunicationTemplate, ChatwootChannel } from '../types/database';

export const SettingsPage: React.FC = () => {
  const { profile, company, loading: authLoading } = useAuth();

  // Controle de permissão de acesso à tela: Apenas Gestor, Gerente ou Super Admin
  const normalizedRole = (profile?.role || '').trim().toLowerCase();
  const isAuthorized = 
    normalizedRole === 'gestor' || 
    normalizedRole === 'gerente' || 
    normalizedRole === 'super admin' ||
    normalizedRole === 'super_admin' ||
    normalizedRole === 'admin';

  // Regra de Negócio Crítica: Apenas Super Admin (Master) pode editar e testar os dados do Chat4u
  const isSuperAdmin = normalizedRole === 'super admin' || normalizedRole === 'super_admin';

  const [activeTab, setActiveTab] = useState<'smtp' | 'integracoes' | 'templates'>('smtp');

  // Estado do Servidor SMTP Corporativo Multi-Tenant (Fase 18.1)
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState<string>('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [testRecipientEmail, setTestRecipientEmail] = useState('');
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpFeedback, setSmtpFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estado da Integração Chat4u / Chatwoot
  const [chatwootUrl, setChatwootUrl] = useState('');
  const [chatwootToken, setChatwootToken] = useState('');
  const [chatwootAccountId, setChatwootAccountId] = useState<string>('');
  const [chatwootInboxId, setChatwootInboxId] = useState<string>('');
  
  const [savingChatwoot, setSavingChatwoot] = useState(false);
  const [testingChatwoot, setTestingChatwoot] = useState(false);
  const [chatwootFeedback, setChatwootFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estado Múltiplos Canais / Caixas de Entrada (Fase 16)
  const [channels, setChannels] = useState<ChatwootChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [newChannelNome, setNewChannelNome] = useState('');
  const [newChannelInboxId, setNewChannelInboxId] = useState('');
  const [addingChannel, setAddingChannel] = useState(false);
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
  const [channelFeedback, setChannelFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estado dos Templates de Comunicação
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateAssunto, setTemplateAssunto] = useState('');
  const [templateCorpo, setTemplateCorpo] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateFeedback, setTemplateFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  // Inicializa dados com base na empresa ativa da sessão
  useEffect(() => {
    if (company) {
      setSmtpHost(company.smtp_host || '');
      setSmtpPort(company.smtp_port ? String(company.smtp_port) : '587');
      setSmtpUser(company.smtp_user || '');
      setSmtpPassword(company.smtp_password || '');
      setSmtpFromEmail(company.smtp_from_email || '');
      setSmtpFromName(company.smtp_from_name || company.razao_social || '');
      setTestRecipientEmail(profile?.email || '');

      setChatwootUrl(company.chatwoot_url || '');
      setChatwootToken(company.chatwoot_api_access_token || '');
      setChatwootAccountId(company.chatwoot_account_id ? String(company.chatwoot_account_id) : '');
      setChatwootInboxId(company.chatwoot_inbox_id ? String(company.chatwoot_inbox_id) : '');
      loadTemplates();
      loadChannels();
    }
  }, [company?.id, profile?.email]);

  const loadChannels = async () => {
    if (!company?.id) return;
    setLoadingChannels(true);
    try {
      const data = await dataService.getChatwootChannels(company.id);
      setChannels(data);
    } catch (err: any) {
      console.warn('Erro ao carregar canais do Chatwoot:', err);
    } finally {
      setLoadingChannels(false);
    }
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company?.id) return;
    if (!newChannelNome.trim() || !newChannelInboxId.trim()) {
      setChannelFeedback({ type: 'error', message: 'Informe o nome e o Inbox ID do canal.' });
      return;
    }

    setAddingChannel(true);
    setChannelFeedback(null);
    try {
      const created = await dataService.createChatwootChannel({
        company_id: company.id,
        nome: newChannelNome.trim(),
        inbox_id: newChannelInboxId.trim(),
      });

      if (created) {
        setChannels((prev) => [...prev, created]);
        setNewChannelNome('');
        setNewChannelInboxId('');
        setChannelFeedback({ type: 'success', message: 'Canal cadastrado com sucesso!' });
        setTimeout(() => setChannelFeedback(null), 3500);
      }
    } catch (err: any) {
      console.error('Erro ao adicionar canal:', err);
      setChannelFeedback({ type: 'error', message: err.message || 'Falha ao salvar canal.' });
    } finally {
      setAddingChannel(false);
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (!window.confirm('Deseja realmente remover este canal?')) return;
    setDeletingChannelId(channelId);
    try {
      await dataService.deleteChatwootChannel(channelId);
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
    } catch (err: any) {
      console.error('Erro ao excluir canal:', err);
      alert('Falha ao excluir canal: ' + (err.message || 'Erro no banco.'));
    } finally {
      setDeletingChannelId(null);
    }
  };

  const loadTemplates = async () => {
    if (!company?.id) return;
    setLoadingTemplates(true);
    try {
      let data = await dataService.getCommunicationTemplates(company.id);
      if (data.length === 0) {
        // Inicializa templates padrão caso a empresa ainda não possua registros
        await dataService.seedTenantCommunicationTemplates(company.id);
        data = await dataService.getCommunicationTemplates(company.id);
      }
      setTemplates(data);
      if (data.length > 0 && !selectedTemplateId) {
        selectTemplate(data[0]);
      }
    } catch (err: any) {
      console.error('Erro ao carregar templates de comunicação:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const selectTemplate = (tmpl: CommunicationTemplate) => {
    setSelectedTemplateId(tmpl.id);
    setTemplateAssunto(tmpl.assunto);
    setTemplateCorpo(tmpl.corpo_mensagem);
    setTemplateFeedback(null);
  };

  // 0. Salvar Configurações SMTP da Empresa (Fase 18.1 - Gestor / Super Admin)
  const handleSaveSmtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!company?.id) return;

    setSavingSmtp(true);
    setSmtpFeedback(null);

    try {
      await dataService.updateCompanySmtpSettings(company.id, {
        smtp_host: smtpHost,
        smtp_port: smtpPort ? parseInt(smtpPort, 10) : null,
        smtp_user: smtpUser,
        smtp_password: smtpPassword,
        smtp_from_email: smtpFromEmail,
        smtp_from_name: smtpFromName,
      });

      setSmtpFeedback({
        type: 'success',
        message: 'Configurações do Servidor SMTP salvas com sucesso para a empresa!',
      });
    } catch (err: any) {
      console.error('Erro ao salvar SMTP:', err);
      setSmtpFeedback({
        type: 'error',
        message: err.message || 'Falha ao salvar configurações SMTP no banco.',
      });
    } finally {
      setSavingSmtp(false);
    }
  };

  // 0.1 Testar Conexão SMTP via Edge Function
  const handleTestSmtp = async () => {
    if (!smtpHost.trim() || !smtpPort.trim() || !smtpUser.trim() || !smtpPassword.trim()) {
      setSmtpFeedback({
        type: 'error',
        message: 'Por favor, informe Servidor Host, Porta, Usuário e Senha para testar o servidor SMTP.',
      });
      return;
    }

    setTestingSmtp(true);
    setSmtpFeedback(null);

    try {
      const testResult = await dataService.testSmtpConnection({
        smtp_host: smtpHost,
        smtp_port: parseInt(smtpPort, 10),
        smtp_user: smtpUser,
        smtp_password: smtpPassword,
        smtp_from_email: smtpFromEmail || smtpUser,
        smtp_from_name: smtpFromName || company?.razao_social || 'TicketFlow',
        recipient_test_email: testRecipientEmail || smtpUser,
      });

      if (testResult.success) {
        setSmtpFeedback({
          type: 'success',
          message: testResult.message,
        });
      } else {
        setSmtpFeedback({
          type: 'error',
          message: testResult.message.startsWith('Falha SMTP')
            ? testResult.message
            : `Falha SMTP: ${testResult.message}`,
        });
      }
    } catch (err: any) {
      console.error('Erro ao testar SMTP:', err);
      const errorMsg = err?.message || 'Erro inesperado na comunicação com o servidor.';
      setSmtpFeedback({
        type: 'error',
        message: errorMsg.includes('Failed to fetch')
          ? 'Falha de rede (Failed to fetch): Não foi possível contatar a Edge Function. Certifique-se de que a função test-smtp-connection foi implantada no Supabase com deploy --no-verify-jwt.'
          : `Falha SMTP: ${errorMsg}`,
      });
    } finally {
      setTestingSmtp(false);
    }
  };

  // 1. Salvar configurações do Chat4u no banco
  const handleSaveChatwoot = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!company?.id) return;

    setSavingChatwoot(true);
    setChatwootFeedback(null);

    try {
      await dataService.updateCompanyChatwootSettings(company.id, {
        chatwoot_url: chatwootUrl,
        chatwoot_api_access_token: chatwootToken,
        chatwoot_account_id: chatwootAccountId ? parseInt(chatwootAccountId, 10) : null,
        chatwoot_inbox_id: chatwootInboxId ? parseInt(chatwootInboxId, 10) : null,
      });

      setChatwootFeedback({
        type: 'success',
        message: 'Configurações do Chat4u / Chatwoot salvas com sucesso no banco de dados!',
      });
    } catch (err: any) {
      console.error('Erro ao salvar Chatwoot:', err);
      setChatwootFeedback({
        type: 'error',
        message: err.message || 'Falha ao salvar configurações no Supabase.',
      });
    } finally {
      setSavingChatwoot(false);
    }
  };

  // 2. Testar conexão ao vivo e salvar
  const handleTestAndSaveChatwoot = async () => {
    if (!chatwootUrl.trim() || !chatwootToken.trim()) {
      setChatwootFeedback({
        type: 'error',
        message: 'Por favor, informe ao menos a URL Base e o Access Token para realizar o teste.',
      });
      return;
    }

    setTestingChatwoot(true);
    setChatwootFeedback(null);

    try {
      const parsedAccount = chatwootAccountId ? parseInt(chatwootAccountId, 10) : null;
      const testResult = await dataService.testChatwootConnection(chatwootUrl, chatwootToken, parsedAccount);

      if (testResult.success) {
        // Se a conexão foi bem-sucedida, salva automaticamente
        await handleSaveChatwoot();
        setChatwootFeedback({
          type: 'success',
          message: `${testResult.message} Dados sincronizados com sucesso.`,
        });
      } else {
        setChatwootFeedback({
          type: 'error',
          message: testResult.message,
        });
      }
    } catch (err: any) {
      setChatwootFeedback({
        type: 'error',
        message: err.message || 'Erro ao testar comunicação com o servidor Chat4u.',
      });
    } finally {
      setTestingChatwoot(false);
    }
  };

  // 3. Salvar Template de Comunicação
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId) return;

    setSavingTemplate(true);
    setTemplateFeedback(null);

    try {
      const updated = await dataService.updateCommunicationTemplate(selectedTemplateId, {
        assunto: templateAssunto,
        corpo_mensagem: templateCorpo,
      });

      if (updated) {
        setTemplates((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t))
        );
        setTemplateFeedback({
          type: 'success',
          message: 'Template de comunicação atualizado com sucesso!',
        });
      }
    } catch (err: any) {
      console.error('Erro ao atualizar template:', err);
      setTemplateFeedback({
        type: 'error',
        message: err.message || 'Falha ao atualizar template no Supabase.',
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  const copyVariable = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedVar(tag);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  // Mapeamento amigável dos tipos de templates
  const templateTypeLabels: Record<string, { title: string; desc: string; icon: any }> = {
    welcome_email: {
      title: 'Boas-vindas ao Cliente',
      desc: 'Disparado no cadastro de novos usuários ou clientes finais',
      icon: Mail,
    },
    new_ticket: {
      title: 'Abertura de Chamado',
      desc: 'Enviado ao cliente confirmando registro de nova solicitação e SLA',
      icon: FileText,
    },
    status_change: {
      title: 'Mudança de Status',
      desc: 'Notifica alterações de andamento (Em Atendimento, Aguardando, etc.)',
      icon: RefreshCw,
    },
    new_message: {
      title: 'Nova Mensagem / Interação',
      desc: 'Alerta sobre nova resposta ou pergunta técnica do operador',
      icon: MessageSquare,
    },
    csat: {
      title: 'Pesquisa de Satisfação (CSAT)',
      desc: 'Enviado após encerramento do chamado com link de avaliação',
      icon: CheckCircle2,
    },
  };

  const availableVariables = [
    { tag: '{{nome_cliente}}', desc: 'Nome completo do cliente solicitante' },
    { tag: '{{nome_empresa}}', desc: 'Razão social ou nome do tenant' },
    { tag: '{{ticket_id}}', desc: 'Código identificador do chamado' },
    { tag: '{{assunto}}', desc: 'Assunto do chamado' },
    { tag: '{{status_atual}}', desc: 'Status atualizado (Aberto, Em Andamento, Fechado)' },
    { tag: '{{ticket_link}}', desc: 'URL direta para acessar o chamado' },
    { tag: '{{sla_prazo}}', desc: 'Previsão de conclusão do SLA em horas/data' },
    { tag: '{{resumo}}', desc: 'Resumo da solução informado no encerramento' },
    { tag: '{{portal_url}}', desc: 'Endereço principal de acesso do portal' },
  ];

  // Se os dados de autenticação e perfil ainda estiverem carregando, exibe spinner
  if (authLoading || !profile) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="text-xs font-medium">Validando permissões de acesso...</span>
      </div>
    );
  }

  // Se o usuário não tiver privilégio de Gestor, Gerente ou Super Admin, bloqueia a tela
  if (!isAuthorized) {
    return (
      <div className="p-8 bg-white border border-slate-200 rounded-2xl shadow-sm text-center max-w-lg mx-auto">
        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mx-auto mb-3">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Acesso Restrito às Configurações</h2>
        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
          Esta área é restrita a <strong>Gestores</strong>, <strong>Gerentes</strong> e <strong>Super Administradores</strong> da empresa contratante.
        </p>
      </div>
    );
  }

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div className="space-y-6 font-sans antialiased text-slate-900">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Configurações da Empresa</h1>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
              Tenant: {company?.razao_social || 'Multi-Tenant'}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Gerencie integrações com canais externos (Chat4u/Chatwoot) e personalize templates de comunicação.
          </p>
        </div>
      </div>

      {/* Navegação por Abas em Tema Claro */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('smtp')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'smtp'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Server className="w-4 h-4 text-blue-600" />
          <span>Servidor de E-mail (SMTP)</span>
        </button>

        <button
          onClick={() => setActiveTab('integracoes')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'integracoes'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Phone className="w-4 h-4 text-emerald-600" />
          <span>Integrações (Chat4u / Chatwoot)</span>
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'templates'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Mail className="w-4 h-4 text-blue-600" />
          <span>Templates de E-mail & WhatsApp</span>
        </button>
      </div>

      {/* ABA 0: SERVIDOR DE E-MAIL (SMTP MULTI-TENANT) */}
      {activeTab === 'smtp' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Servidor de E-mail Corporativo (SMTP)</h2>
                  <p className="text-xs text-slate-500">
                    Configure as credenciais do seu provedor de e-mail (ex: Google Workspace, Microsoft 365, cPanel, Locaweb) para que os clientes recebam mensagens com o remetente oficial da sua empresa.
                  </p>
                </div>
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-blue-50 text-blue-700 rounded-md border border-blue-200">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              Remetente Próprio por Empresa
            </span>
          </div>

          {smtpFeedback && (
            <div
              className={`p-4 rounded-xl flex items-start gap-2.5 text-xs font-medium border ${
                smtpFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {smtpFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span>{smtpFeedback.message}</span>
            </div>
          )}

          <form onSubmit={handleSaveSmtp} className="space-y-4 max-w-3xl">
            {/* Linha 1: Host e Porta */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-8">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Servidor SMTP (Host) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Server className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="ex: smtp.gmail.com, mail.suaempresa.com.br, smtp.office365.com"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Endereço ou IP do servidor de envio de correio eletrônico
                </p>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Porta SMTP <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="number"
                    required
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    placeholder="587 ou 465"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  587 (TLS / STARTTLS) ou 465 (SSL seguro)
                </p>
              </div>
            </div>

            {/* Linha 2: Usuário e Senha */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Usuário / E-mail de Autenticação <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="notificacoes@suaempresa.com.br"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Conta com autorização para disparos
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Senha / Senha de Aplicativo <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder="Senha de acesso ao SMTP ou App Password"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Para Gmail ou Outlook com 2FA, utilize a Senha de App gerada
                </p>
              </div>
            </div>

            {/* Linha 3: From Email e From Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  E-mail do Remetente (From Email)
                </label>
                <div className="relative">
                  <Send className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    value={smtpFromEmail}
                    onChange={(e) => setSmtpFromEmail(e.target.value)}
                    placeholder="suporte@suaempresa.com.br"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Se omitido, o usuário de autenticação será utilizado
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nome de Exibição (From Name)
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={smtpFromName}
                    onChange={(e) => setSmtpFromName(e.target.value)}
                    placeholder="Ex: Suporte - Nome da Empresa"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Nome que aparecerá na caixa de entrada do cliente
                </p>
              </div>
            </div>

            {/* Caixa de Teste de Disparo */}
            <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-2 mt-4">
              <label className="block text-xs font-bold text-slate-700">
                E-mail para Receber Teste de Conexão:
              </label>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="email"
                  value={testRecipientEmail}
                  onChange={(e) => setTestRecipientEmail(e.target.value)}
                  placeholder="seu-email@empresa.com.br"
                  className="w-full sm:flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={handleTestSmtp}
                  disabled={testingSmtp || savingSmtp}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50 shrink-0"
                >
                  {testingSmtp ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Validando Conexão SMTP...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                      <span>Testar Conexão SMTP</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                A Edge Function validará o handshake e enviará uma mensagem de teste para o e-mail acima.
              </p>
            </div>

            {/* Botão Salvar Configurações */}
            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
              <button
                type="submit"
                disabled={savingSmtp || testingSmtp}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-blue-600/20 transition-all disabled:opacity-50"
              >
                {savingSmtp ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Configurações SMTP</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ABA 1: INTEGRAÇÃO CHAT4U / CHATWOOT */}
      {activeTab === 'integracoes' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Integração Omnichannel (Chat4u)</h2>
                  <p className="text-xs text-slate-500">
                    Conecte a instância do Chatwoot / Chat4u para envio e recebimento de mensagens via WhatsApp
                  </p>
                </div>
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-slate-100 text-slate-700 rounded-md border border-slate-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Isolamento por Tenant
            </span>
          </div>

          {chatwootFeedback && (
            <div
              className={`p-4 rounded-xl flex items-start gap-2.5 text-xs font-medium border ${
                chatwootFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {chatwootFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span>{chatwootFeedback.message}</span>
            </div>
          )}

          <form onSubmit={handleSaveChatwoot} className="space-y-4 max-w-2xl">
            {/* Aviso de Permissão para não Super Admin */}
            {!isSuperAdmin && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 font-medium">
                <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-950">Acesso Restrito ao Administrador Master</p>
                  <p className="text-amber-800 text-[11px] mt-0.5">
                    As credenciais de integração do Chat4u / Chatwoot são gerenciadas exclusivamente pela equipe Master (Super Admin). 
                    Os campos abaixo estão em modo de somente leitura.
                  </p>
                </div>
              </div>
            )}

            {/* URL Base */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                URL Base do Servidor Chat4u / Chatwoot <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="url"
                  required
                  disabled={!isSuperAdmin}
                  value={chatwootUrl}
                  onChange={(e) => setChatwootUrl(e.target.value)}
                  placeholder="https://chat.suaempresa.com.br"
                  className={`w-full pl-9 pr-3 py-2 text-xs border rounded-lg text-slate-900 focus:outline-none ${
                    isSuperAdmin 
                      ? 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500' 
                      : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                  }`}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Endereço completo da sua instalação (exemplo: https://chat.infocast-web.com.br)
              </p>
            </div>

            {/* API Access Token */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                User / Agent API Access Token <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  disabled={!isSuperAdmin}
                  value={chatwootToken}
                  onChange={(e) => setChatwootToken(e.target.value)}
                  placeholder="Insira o Access Token gerado nas configurações de perfil do Chatwoot"
                  className={`w-full pl-9 pr-3 py-2 text-xs border rounded-lg text-slate-900 focus:outline-none font-mono ${
                    isSuperAdmin 
                      ? 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500' 
                      : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                  }`}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Token pessoal do usuário operador ou bot com permissão para enviar mensagens
              </p>
            </div>

            {/* Account ID e Inbox ID em duas colunas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ID da Conta (Account ID)
                </label>
                <div className="relative">
                  <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="number"
                    disabled={!isSuperAdmin}
                    value={chatwootAccountId}
                    onChange={(e) => setChatwootAccountId(e.target.value)}
                    placeholder="Ex: 1"
                    className={`w-full pl-9 pr-3 py-2 text-xs border rounded-lg text-slate-900 focus:outline-none ${
                      isSuperAdmin 
                        ? 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500' 
                        : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                    }`}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Normalmente número '1' para instalações padrão</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ID da Caixa de Entrada (Inbox ID)
                </label>
                <div className="relative">
                  <Inbox className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="number"
                    disabled={!isSuperAdmin}
                    value={chatwootInboxId}
                    onChange={(e) => setChatwootInboxId(e.target.value)}
                    placeholder="Ex: 2"
                    className={`w-full pl-9 pr-3 py-2 text-xs border rounded-lg text-slate-900 focus:outline-none ${
                      isSuperAdmin 
                        ? 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500' 
                        : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                    }`}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Identificador da caixa WhatsApp cadastrada no Chatwoot</p>
              </div>
            </div>

            {isSuperAdmin ? (
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleTestAndSaveChatwoot}
                  disabled={testingChatwoot || savingChatwoot}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                >
                  {testingChatwoot ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Testando Conexão...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Testar Conexão e Salvar</span>
                    </>
                  )}
                </button>

                <button
                  type="submit"
                  disabled={savingChatwoot || testingChatwoot}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-50"
                >
                  {savingChatwoot ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Salvar Configurações</span>
                    </>
                  )}
                </button>
              </div>
            ) : null}
          </form>

          {/* Seção Múltiplos Canais / Caixas de Entrada (Fase 16) */}
          <div className="border-t border-slate-200 p-6 bg-slate-50/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-emerald-600" />
                  <span>Canais & Caixas de Entrada WhatsApp (Chat4u)</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Cadastre múltiplos canais (ex: "WhatsApp Suporte", "WhatsApp Vendas") para os operadores selecionarem no envio de mensagens.
                </p>
              </div>

              {isSuperAdmin && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 self-start sm:self-auto">
                  {channels.length} {channels.length === 1 ? 'canal ativo' : 'canais ativos'}
                </span>
              )}
            </div>

            {channelFeedback && (
              <div
                className={`p-3 rounded-xl mb-4 flex items-start gap-2.5 text-xs font-medium border ${
                  channelFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {channelFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span>{channelFeedback.message}</span>
              </div>
            )}

            {/* Formulário para Adicionar Novo Canal (Apenas Super Admin) */}
            {isSuperAdmin && (
              <form onSubmit={handleAddChannel} className="p-4 bg-white border border-slate-200 rounded-xl mb-4 shadow-2xs">
                <p className="text-xs font-bold text-slate-800 mb-2.5 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Cadastrar Novo Canal / Caixa</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-6">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nome do Canal *
                    </label>
                    <input
                      type="text"
                      required
                      value={newChannelNome}
                      onChange={(e) => setNewChannelNome(e.target.value)}
                      placeholder="Ex: WhatsApp Suporte Técnico"
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Inbox ID (Chatwoot) *
                    </label>
                    <input
                      type="text"
                      required
                      value={newChannelInboxId}
                      onChange={(e) => setNewChannelInboxId(e.target.value)}
                      placeholder="Ex: 2"
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={addingChannel}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-50"
                    >
                      {addingChannel ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Adicionar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Listagem de Canais Cadastrados */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              {loadingChannels ? (
                <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>Carregando canais da empresa...</span>
                </div>
              ) : channels.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  <Inbox className="w-6 h-6 mx-auto text-slate-300 mb-1.5" />
                  <p className="font-semibold text-slate-600">Nenhum canal específico cadastrado.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isSuperAdmin
                      ? 'Adicione canais acima para disponibilizar opções múltiplas de envio aos atendentes.'
                      : 'O Administrador Master ainda não configurou múltiplos canais para esta conta.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {channels.map((ch) => (
                    <div
                      key={ch.id}
                      className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
                          <Phone className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900 leading-tight">{ch.nome}</p>
                          <span className="text-[11px] font-mono text-slate-500">
                            Inbox ID: <strong>{ch.inbox_id}</strong>
                          </span>
                        </div>
                      </div>

                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteChannel(ch.id)}
                          disabled={deletingChannelId === ch.id}
                          title="Remover canal"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                        >
                          {deletingChannelId === ch.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: TEMPLATES DE COMUNICAÇÃO */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Coluna Esquerda: Listagem de Templates Disponíveis */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Modelos de Notificação
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                {templates.length} ativos
              </span>
            </div>

            {loadingTemplates ? (
              <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Carregando templates...</span>
              </div>
            ) : templates.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Nenhum template cadastrado no momento.
              </div>
            ) : (
              <div className="space-y-1.5">
                {templates.map((tmpl) => {
                  const meta = templateTypeLabels[tmpl.tipo] || {
                    title: tmpl.tipo,
                    desc: 'Notificação personalizada',
                    icon: FileText,
                  };
                  const Icon = meta.icon;
                  const isSelected = tmpl.id === selectedTemplateId;

                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => selectTemplate(tmpl)}
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                        isSelected
                          ? 'bg-blue-50/80 border-blue-200 text-blue-900 shadow-sm'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div
                        className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold block truncate">{meta.title}</span>
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{meta.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Coluna Central/Direita: Editor do Template Selecionado */}
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
              {selectedTemplate ? (
                <>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        {templateTypeLabels[selectedTemplate.tipo]?.title || selectedTemplate.tipo}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {templateTypeLabels[selectedTemplate.tipo]?.desc || 'Edição de conteúdo dinâmico'}
                      </p>
                    </div>
                    <span className="font-mono text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                      tipo: {selectedTemplate.tipo}
                    </span>
                  </div>

                  {templateFeedback && (
                    <div
                      className={`p-3 rounded-xl flex items-start gap-2.5 text-xs font-medium border ${
                        templateFeedback.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}
                    >
                      {templateFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <span>{templateFeedback.message}</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveTemplate} className="space-y-4">
                    {/* Assunto */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Assunto do E-mail / Título do Disparo <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={templateAssunto}
                        onChange={(e) => setTemplateAssunto(e.target.value)}
                        placeholder="Ex: [TicketFlow] Atualização no Chamado #{{ticket_id}}"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>

                    {/* Corpo da Mensagem */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Corpo da Mensagem (Texto com Variáveis) <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={8}
                        required
                        value={templateCorpo}
                        onChange={(e) => setTemplateCorpo(e.target.value)}
                        placeholder="Digite o texto da mensagem incluindo as variáveis..."
                        className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-sans leading-relaxed resize-y"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[11px] text-slate-400">
                        O conteúdo será enviado automaticamente nos eventos correspondentes.
                      </span>

                      <button
                        type="submit"
                        disabled={savingTemplate}
                        className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50"
                      >
                        {savingTemplate ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Salvando Template...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>Salvar Template</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">
                  Selecione um modelo à esquerda para editar seu conteúdo.
                </div>
              )}
            </div>

            {/* Aviso Visual: Variáveis Dinâmicas Disponíveis */}
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-900">
                <Info className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-bold">Variáveis Disponíveis para Personalização</h3>
              </div>
              <p className="text-[11px] text-slate-600">
                Clique nas tags abaixo para copiá-las e colá-las diretamente no assunto ou no corpo do modelo:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {availableVariables.map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => copyVariable(v.tag)}
                    className="flex items-center justify-between p-2 bg-white/90 hover:bg-white border border-amber-200/80 rounded-lg text-left transition-all group"
                  >
                    <div className="min-w-0 pr-1">
                      <code className="text-[11px] font-mono font-bold text-amber-800 block truncate">
                        {v.tag}
                      </code>
                      <span className="text-[10px] text-slate-500 block truncate">{v.desc}</span>
                    </div>
                    {copiedVar === v.tag ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <Copy className="w-3 h-3 text-slate-400 group-hover:text-amber-700 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
