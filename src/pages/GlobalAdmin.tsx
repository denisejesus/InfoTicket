/**
 * InfoTicket - Painel de Administração Global (Master Infocast) v1.5.0
 * Gestão de Tenants (Empresas), Status, e Prazos de Trial
 * Acesso exclusivo para usuários com role 'Super Admin'
 */
import React, { useEffect, useState } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  RefreshCw, 
  Edit3, 
  Search, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  X, 
  Loader2,
  Users
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

  // Modal de Edição de Empresa
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
      setModalError(err.message || 'Falha ao salvar alterações no Supabase.');
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
    const matchesSearch =
      c.razao_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.cnpj && c.cnpj.includes(searchTerm)) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'todos' || c.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const totalAtivas = companies.filter((c) => c.status.toLowerCase() === 'ativo').length;
  const totalTrial = companies.filter((c) => c.status.toLowerCase() === 'trial').length;

  return (
    <div className="space-y-6 font-sans antialiased text-slate-900">
      {/* Top Banner Master */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
              Master Infocast
            </span>
            <span className="text-xs text-slate-500 font-medium">Controle Multi-Tenant</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Administração Global de Tenants
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Gerenciamento global de empresas clientes, períodos de avaliação (Trial) e status de licenciamento.
          </p>
        </div>

        <button
          onClick={loadCompanies}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Tenants</span>
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
            placeholder="Buscar por razão social, CNPJ ou código..."
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
            <span>Consultando banco multi-tenant...</span>
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">Nenhuma empresa encontrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Razão Social / Identificação</th>
                  <th className="py-3 px-4">CNPJ</th>
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
                  const isExpirado = c.status.toLowerCase() === 'expirado';

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
                              Dona do SaaS
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">ID: {c.id}</span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {c.cnpj || 'Não informado'}
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
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors shadow-sm"
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

      {/* Modal de Edição de Empresa (Status e Trial) */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col text-slate-900">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-100 text-purple-700 font-bold">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-tight">Editar Tenant</h2>
                  <p className="text-[11px] text-slate-500 truncate max-w-xs">{editingCompany.razao_social}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingCompany(null)}
                disabled={savingEdit}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

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
                    Data de Vencimento do Trial
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
                <div className="relative">
                  <input
                    type="date"
                    value={newTrialEndsAt}
                    onChange={(e) => setNewTrialEndsAt(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Altere a data para estender ou encurtar o período de testes do tenant.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  disabled={savingEdit}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-purple-500/20 transition-all disabled:opacity-50"
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
