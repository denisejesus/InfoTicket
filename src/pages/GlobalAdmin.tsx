/**
 * InfoTicket - Painel de Administração Global (Master Infocast) v1.7.0
 * Gestão de Tenants (Empresas), Ficha Cadastral Completa, Dados de Contato do Gestor, Status e Prazos de Trial
 * Tabela com Rolagem Horizontal e Modal Responsivo para Smartphones e Tablets
 * Acesso exclusivo para usuários com role 'Super Admin'
 */
import React, { useEffect, useState } from 'react';
import { 
  Building2, 
  RefreshCw, 
  Edit3, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  X, 
  Loader2,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  Calendar
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';
import { Company } from '../types/database';

export const GlobalAdmin: React.FC = () => {
  const { profile } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  // Modal de Ficha Cadastral Completa e Edição de Empresa
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [newStatus, setNewStatus] = useState<string>('Trial');
  const [newTrialEndsAt, setNewTrialEndsAt] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const isSuperAdmin = profile?.role === 'Super Admin';

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const data = await dataService.getAllCompanies();
      setCompanies(data);
    } catch (err: any) {
      console.error('Falha ao listar empresas globais:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      loadCompanies();
    }
  }, [isSuperAdmin]);

  const handleOpenEdit = (comp: Company) => {
    setEditingCompany(comp);
    setNewStatus(comp.status || 'Trial');
    if (comp.trial_ends_at) {
      // Formata para o input date (YYYY-MM-DD)
      const date = new Date(comp.trial_ends_at);
      setNewTrialEndsAt(date.toISOString().split('T')[0]);
    } else {
      setNewTrialEndsAt('');
    }
    setModalError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;

    setSavingEdit(true);
    setModalError(null);

    try {
      let formattedTrialEndsAt: string | undefined = undefined;
      if (newTrialEndsAt) {
        formattedTrialEndsAt = new Date(`${newTrialEndsAt}T23:59:59Z`).toISOString();
      }

      await dataService.updateCompany(editingCompany.id, {
        status: newStatus,
        trial_ends_at: formattedTrialEndsAt,
      });

      setEditingCompany(null);
      await loadCompanies();
    } catch (err: any) {
      console.error('Erro ao atualizar empresa:', err);
      setModalError(err.message || 'Falha ao salvar alterações no sistema.');
    } finally {
      setSavingEdit(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white border border-slate-200 rounded-2xl shadow-sm">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Acesso Restrito</h2>
        <p className="text-xs text-slate-600 mt-1">
          Apenas usuários com o papel <strong>Super Admin</strong> da empresa Master Infocast têm permissão de acesso a este painel global.
        </p>
      </div>
    );
  }

  const filteredCompanies = companies.filter((c) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      c.razao_social.toLowerCase().includes(term) ||
      (c.cnpj && c.cnpj.toLowerCase().includes(term)) ||
      c.id.toLowerCase().includes(term) ||
      (c.contato_nome && c.contato_nome.toLowerCase().includes(term)) ||
      (c.contato_email && c.contato_email.toLowerCase().includes(term)) ||
      (c.contato_whatsapp && c.contato_whatsapp.toLowerCase().includes(term));

    const matchesStatus =
      statusFilter === 'todos' || c.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const totalAtivas = companies.filter((c) => c.status.toLowerCase() === 'ativo').length;
  const totalTrial = companies.filter((c) => c.status.toLowerCase() === 'trial').length;

  // Formata link de WhatsApp removendo caracteres não numéricos
  const getWhatsAppHref = (rawPhone?: string | null) => {
    if (!rawPhone) return null;
    const digits = rawPhone.replace(/\D/g, '');
    if (!digits) return null;
    const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${fullNumber}`;
  };

  return (
    <div className="space-y-6 font-sans antialiased text-slate-900">
      {/* Top Banner Master */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
              Master Infocast
            </span>
            <span className="text-xs text-slate-500 font-medium">Controle de Organizações</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Administração Global de Organizações
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Gerenciamento global de empresas clientes, dados de contato dos gestores, períodos de avaliação (Trial) e status de licenciamento.
          </p>
        </div>

        <button
          onClick={loadCompanies}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Organizações</span>
        </button>
      </div>

      {/* Cards de Métricas Rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total de Empresas</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
              {loading ? '...' : companies.length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Em Avaliação (Trial)</span>
            <div className="text-2xl font-extrabold text-amber-600 mt-0.5">
              {loading ? '...' : totalTrial}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Assinaturas Ativas</span>
            <div className="text-2xl font-extrabold text-emerald-600 mt-0.5">
              {loading ? '...' : totalAtivas}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por razão social, CNPJ, contato, e-mail ou WhatsApp..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-slate-900 placeholder-slate-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          >
            <option value="todos">Todos os status</option>
            <option value="Ativo">Ativo</option>
            <option value="Trial">Trial</option>
            <option value="Expirado">Expirado</option>
          </select>
        </div>
      </div>

      {/* Tabela de Empresas */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
            <span>Consultando organizações cadastradas...</span>
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">Nenhuma empresa encontrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[780px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Razão Social / Identificação</th>
                  <th className="py-3 px-4">CNPJ</th>
                  <th className="py-3 px-4">Contato Principal (Gestor)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Vencimento Trial</th>
                  <th className="py-3 px-4">Cadastrada em</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredCompanies.map((c) => {
                  const isInfocast = c.razao_social.toLowerCase().includes('infocast');
                  const isTrial = c.status.toLowerCase() === 'trial';

                  const trialDateStr = c.trial_ends_at
                    ? new Date(c.trial_ends_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : '-';

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{c.razao_social}</span>
                          {isInfocast && (
                            <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[10px] font-bold">
                              Matriz da Plataforma
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">ID: {c.id}</span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {c.cnpj || 'Não informado'}
                      </td>

                      {/* Coluna Combinada de Contato (Nome, E-mail e WhatsApp) */}
                      <td className="py-3.5 px-4">
                        {c.contato_nome || c.contato_email || c.contato_whatsapp ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                              <User className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span>{c.contato_nome || 'Gestor da Conta'}</span>
                            </div>
                            {c.contato_email && (
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate max-w-[200px]">{c.contato_email}</span>
                              </div>
                            )}
                            {c.contato_whatsapp && (
                              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
                                <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>{c.contato_whatsapp}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Sem contato vinculado</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                            c.status.toLowerCase() === 'ativo'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isTrial
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {c.status.toLowerCase() === 'ativo' ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ) : isTrial ? (
                            <Clock className="w-3 h-3 text-amber-600" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                          )}
                          {c.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        <span className={isTrial ? 'font-semibold text-slate-800' : 'text-slate-500'}>
                          {trialDateStr}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {c.criado_em
                          ? new Date(c.criado_em).toLocaleDateString('pt-BR')
                          : '-'}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleOpenEdit(c)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors shadow-sm"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-purple-600" />
                          <span>Editar</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Ficha Cadastral Completa e Edição de Organização */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col text-slate-900">
            {/* Cabeçalho Fixo do Modal */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-purple-100 text-purple-700 font-bold border border-purple-200">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-tight">
                    Ficha Cadastral & Licenciamento da Organização
                  </h2>
                  <p className="text-xs text-slate-500 truncate max-w-md">
                    {editingCompany.razao_social}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingCompany(null)}
                disabled={savingEdit}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo do Modal com Ficha Cadastral Detalhada + Edição e Rodapé Fixo */}
            <form onSubmit={handleSaveEdit} className="flex-1 flex flex-col min-h-0">
              <div className="p-4 sm:p-6 space-y-5 flex-1 overflow-y-auto">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Seção 1: Dados Cadastrais da Empresa */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                    Dados Corporativos
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ID: {editingCompany.id}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <span className="text-[11px] text-slate-500 block">Razão Social</span>
                    <span className="font-bold text-slate-900">{editingCompany.razao_social}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">CNPJ</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {editingCompany.cnpj || 'Não informado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Data de Cadastro</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {editingCompany.criado_em
                        ? new Date(editingCompany.criado_em).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })
                        : 'Não informado'}
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-[11px] text-slate-500 block">Usuários Vinculados</span>
                    <span className="font-semibold text-slate-800">
                      {editingCompany.profiles?.length || 0} usuário(s) registrado(s) na conta
                    </span>
                  </div>
                </div>
              </div>

              {/* Seção 2: Dados de Contato do Gestor Responsável */}
              <div className="p-4 bg-blue-50/40 border border-blue-200/80 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    Contato Principal da Organização ({editingCompany.contato_role || 'Gestor'})
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-500 block">Nome do Contato</span>
                    <span className="font-bold text-slate-900">
                      {editingCompany.contato_nome || 'Não informado'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block">E-mail Corporativo</span>
                    {editingCompany.contato_email ? (
                      <a
                        href={`mailto:${editingCompany.contato_email}`}
                        className="font-semibold text-blue-700 hover:underline inline-flex items-center gap-1 break-all"
                      >
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span>{editingCompany.contato_email}</span>
                      </a>
                    ) : (
                      <span className="text-slate-400">Não informado</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block">WhatsApp / Telefone</span>
                    {editingCompany.contato_whatsapp ? (
                      <a
                        href={getWhatsAppHref(editingCompany.contato_whatsapp) || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-emerald-700 hover:underline inline-flex items-center gap-1"
                      >
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span>{editingCompany.contato_whatsapp}</span>
                      </a>
                    ) : (
                      <span className="text-slate-400">Não informado</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Seção 3: Endereço da Sede */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="border-b border-slate-200/80 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-purple-600" />
                    Endereço Cadastrado
                  </span>
                </div>

                {editingCompany.logradouro || editingCompany.cidade || editingCompany.cep ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="sm:col-span-2">
                      <span className="text-[11px] text-slate-500 block">Logradouro e Número</span>
                      <span className="font-semibold text-slate-800">
                        {editingCompany.logradouro || '-'}
                        {editingCompany.numero ? `, ${editingCompany.numero}` : ''}
                        {editingCompany.complemento ? ` (${editingCompany.complemento})` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">CEP</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {editingCompany.cep || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">Bairro</span>
                      <span className="font-semibold text-slate-800">
                        {editingCompany.bairro || '-'}
                      </span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-[11px] text-slate-500 block">Cidade / UF</span>
                      <span className="font-semibold text-slate-800">
                        {editingCompany.cidade || '-'}
                        {editingCompany.estado ? ` - ${editingCompany.estado}` : ''}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Endereço completo não informado no cadastro desta organização.
                  </p>
                )}
              </div>

              {/* Seção 4: Edição de Status e Vencimento de Trial */}
              <div className="p-4 bg-white border-2 border-purple-100 rounded-xl space-y-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 block">
                  Gestão de Licenciamento e Período de Avaliação (Trial)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Status da Empresa
                    </label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    >
                      <option value="Ativo">Ativo (Assinante Liberado)</option>
                      <option value="Trial">Trial (Em Avaliação)</option>
                      <option value="Expirado">Expirado (Bloqueado)</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Vencimento do Trial
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const baseDate = newTrialEndsAt ? new Date(newTrialEndsAt) : new Date();
                          baseDate.setDate(baseDate.getDate() + 7);
                          setNewTrialEndsAt(baseDate.toISOString().split('T')[0]);
                          if (newStatus !== 'Trial') setNewStatus('Trial');
                        }}
                        className="text-[11px] font-bold text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded transition-colors"
                      >
                        +7 dias de Trial
                      </button>
                    </div>
                    <input
                      type="date"
                      value={newTrialEndsAt}
                      onChange={(e) => setNewTrialEndsAt(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Altere o status ou a data de vencimento para liberar a assinatura definitiva ou estender o período de avaliação.
                </p>
              </div>
              </div>

              {/* Rodapé Fixo de Ações do Modal */}
              <div className="px-4 sm:px-6 py-3.5 bg-slate-50 flex items-center justify-end gap-2.5 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  disabled={savingEdit}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex items-center gap-1.5 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-purple-500/20 transition-all disabled:opacity-50"
                >
                  {savingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Salvar Alterações</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalAdmin;
