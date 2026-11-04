/**
 * TicketFlow - Página "Meus Chamados" v1.16.0
 * Listagem com SLA Visual Dinâmico (Vencido, Atenção, SLA no Prazo (~Xh)), alternância Lista/Quadros com persistência,
 * Importação de conversas ativas do WhatsApp, bloqueio de encerramento/resolução sem resumo no Kanban e navegação.
 * 100% Responsiva para tablets e smartphones com rolagem horizontal na listagem.
 * Isolamento Multi-tenant garantido pelo Supabase RLS através da sessão do AuthContext
 */
import React, { useEffect, useState } from 'react';
import { 
  Ticket as TicketIcon, 
  Plus, 
  Search, 
  RefreshCw, 
  AlertCircle,
  CheckCircle2,
  Clock,
  CheckCheck,
  ChevronRight,
  Building2,
  User,
  UserCheck,
  Table,
  LayoutGrid,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';
import { Ticket, Company, TicketStatus } from '../types/database';
import { NewTicket } from '../components/NewTicket';
import { KanbanBoard } from '../components/KanbanBoard';
import { ImportWhatsappModal } from '../components/ImportWhatsappModal';

interface TicketsProps {
  activeCompany?: Company | null;
  onSelectTicket?: (ticketId: string) => void;
}

export const Tickets: React.FC<TicketsProps> = ({ activeCompany, onSelectTicket }) => {
  const { user, profile, company } = useAuth();
  const currentCompany = activeCompany || company;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [myTicketsOnly, setMyTicketsOnly] = useState<boolean>(false);
  const [viewMode, setViewModeState] = useState<'table' | 'kanban'>(() => {
    const saved = localStorage.getItem('ticketflow_view_preference');
    return (saved === 'table' || saved === 'kanban') ? saved : 'kanban';
  });

  const setViewMode = (mode: 'table' | 'kanban') => {
    setViewModeState(mode);
    try {
      localStorage.setItem('ticketflow_view_preference', mode);
    } catch (e) {
      console.warn('Erro ao salvar preferência no localStorage:', e);
    }
  };

  // Modal Novo Chamado e Modal de Importação do WhatsApp
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [isImportWhatsappOpen, setIsImportWhatsappOpen] = useState(false);

  const loadTickets = async () => {
    setLoading(true);
    try {
      // dataService consulta a tabela tickets; como o usuário está logado, o RLS do Supabase
      // aplica a política restritiva vinculada ao company_id
      const data = await dataService.getTickets(currentCompany?.id);
      setTickets(data);
    } catch (err) {
      console.error('Erro ao carregar tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  // Sincronizar busca global e abertura de chamado via URL (?search=termo, ?new=true)
  useEffect(() => {
    const syncSearchFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const searchParam = params.get('search');
      if (searchParam !== null) {
        setSearchTerm(searchParam);
      }
      if (params.get('new') === 'true') {
        setIsNewTicketOpen(true);
        // Limpa parâmetro da URL sem recarregar a tela
        params.delete('new');
        const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
        window.history.replaceState({}, '', newUrl);
      }
    };

    syncSearchFromUrl();
    window.addEventListener('popstate', syncSearchFromUrl);
    return () => window.removeEventListener('popstate', syncSearchFromUrl);
  }, []);

  useEffect(() => {
    loadTickets();
  }, [currentCompany?.id]);

  const handleTicketStatusChange = async (ticketId: string, newStatus: TicketStatus) => {
    // Trava de segurança: nenhum chamado pode ser encerrado ou marcado como resolvido diretamente sem o Resumo de Conclusão
    if (newStatus === 'Fechado' || newStatus === 'Resolvido') {
      return;
    }

    try {
      // Atualização otimista local
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
      );
      // Chamada que atualiza status, insere mensagem automática do sistema e audita
      await dataService.updateTicketStatus(ticketId, newStatus, user?.id, currentCompany?.id);
      // Recarrega lista consolidada
      await loadTickets();
    } catch (err) {
      console.error('Erro ao atualizar status do chamado:', err);
      // Reverte em caso de falha
      await loadTickets();
    }
  };

  const filteredTickets = tickets.filter((t) => {
    // 1. Filtro de Busca (Assunto, ID, Descrição, Solicitante, Organização, Operador)
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      t.assunto.toLowerCase().includes(term) ||
      t.descricao.toLowerCase().includes(term) ||
      t.id.toLowerCase().includes(term) ||
      (t.cliente?.nome && t.cliente.nome.toLowerCase().includes(term)) ||
      (t.client_organization?.nome && t.client_organization.nome.toLowerCase().includes(term)) ||
      (t.operador?.nome && t.operador.nome.toLowerCase().includes(term));

    // 2. Filtro de Status
    const matchesStatus =
      statusFilter === 'todos' || t.status.toLowerCase() === statusFilter.toLowerCase();

    // 3. Filtro "Meus Chamados" (operador_id = user.id)
    const matchesMyTickets = !myTicketsOnly || (user?.id && t.operador_id === user.id);

    return matchesSearch && matchesStatus && matchesMyTickets;
  });

  return (
    <div className="space-y-6 font-sans antialiased text-slate-900">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Meus Chamados</h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Portal de Atendimento ao Cliente • Acompanhamento de chamados em tempo real da{' '}
            <strong className="text-slate-800">{currentCompany?.razao_social || 'sua organização'}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle de Visualização: Tabela vs Kanban */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Visão em Lista</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'kanban'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Visão em Quadros</span>
            </button>
          </div>

          <button
            onClick={loadTickets}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          {profile?.role !== 'Cliente' && (
            <button
              type="button"
              onClick={() => setIsImportWhatsappOpen(true)}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Importar do WhatsApp</span>
            </button>
          )}

          <button
            onClick={() => setIsNewTicketOpen(true)}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-md shadow-blue-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Chamado</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros Rápidos (Tabs) e Busca Aprimorada (Fase 13) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
        {/* Linha 1: Abas de Status Rápidas & Toggle 'Meus Chamados' */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          {/* Quick Tabs de Status: Todos, Abertos, Em Atendimento, Aguardando Cliente e Fechados */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { label: 'Todos', value: 'todos' },
              { label: 'Abertos', value: 'Aberto' },
              { label: 'Em Atendimento', value: 'Em Andamento' },
              { label: 'Aguardando Cliente', value: 'Aguardando Cliente' },
              { label: 'Resolvidos', value: 'Resolvido' },
              { label: 'Fechados', value: 'Fechado' },
            ].map((tab) => {
              const active = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Toggle 'Meus Chamados' (Disponível para equipe) */}
          {profile?.role !== 'Cliente' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMyTicketsOnly((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  myTicketsOnly
                    ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <UserCheck className={`w-3.5 h-3.5 ${myTicketsOnly ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>Meus Chamados Atribuídos</span>
                {myTicketsOnly && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Linha 2: Busca por Assunto / ID do Chamado e Dropdown */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por Assunto, ID do chamado (#c0000001), Solicitante ou Operador..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900 placeholder-slate-400"
            />
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-slate-500">
            <span>
              Exibindo <strong>{filteredTickets.length}</strong> de <strong>{tickets.length}</strong> chamados
            </span>

            {(searchTerm || statusFilter !== 'todos' || myTicketsOnly) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('todos');
                  setMyTicketsOnly(false);
                }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 underline ml-2"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Visualização: Kanban vs Tabela */}
      {viewMode === 'kanban' ? (
        loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2 shadow-sm">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            <span>Carregando chamados no Kanban...</span>
          </div>
        ) : (
          <KanbanBoard
            tickets={filteredTickets}
            onSelectTicket={onSelectTicket}
            onTicketStatusChange={handleTicketStatusChange}
            onTicketClosed={loadTickets}
          />
        )
      ) : (
        /* Tabela de Chamados com Design Corporativo em Tema Claro */
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            <span>Carregando chamados do sistema...</span>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">Nenhum chamado encontrado.</p>
            <p className="mt-1 text-slate-400">
              Clique em "Novo Chamado" para registrar sua primeira solicitação.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[820px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Assunto / Descrição</th>
                  <th className="py-3 px-4">Solicitante / Organização</th>
                  <th className="py-3 px-4">Operador Atribuído</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">SLA</th>
                  <th className="py-3 px-4">Criado em</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredTickets.map((t) => {
                  const isFechado = t.status === 'Fechado' || t.status === 'Resolvido';

                  // Operador Atribuído
                  const operadorNome = t.operador?.nome;

                  // Cálculo do SLA
                  let slaBadge = null;
                  if (isFechado) {
                    slaBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        Concluído
                      </span>
                    );
                  } else if (t.sla_vencimento) {
                    const now = new Date();
                    const slaDate = new Date(t.sla_vencimento);
                    const diffMs = slaDate.getTime() - now.getTime();
                    const diffHours = diffMs / (1000 * 60 * 60);

                    if (diffMs <= 0) {
                      slaBadge = (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <AlertCircle className="w-3 h-3 text-rose-600" />
                          SLA Vencido
                        </span>
                      );
                    } else if (diffHours <= 2) {
                      slaBadge = (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          Atenção (&lt; 2h)
                        </span>
                      );
                    } else {
                      const horasRestantes = Math.max(1, Math.round(diffHours));
                      slaBadge = (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          SLA no Prazo (~{horasRestantes}h)
                        </span>
                      );
                    }
                  } else {
                    slaBadge = (
                      <span className="text-[10px] text-slate-400">N/D</span>
                    );
                  }

                  return (
                    <tr 
                      key={t.id} 
                      onClick={() => onSelectTicket?.(t.id)}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                    >
                      {/* ID / Código */}
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-600 whitespace-nowrap">
                        #{t.id.substring(0, 8)}
                      </td>

                      {/* Assunto / Descrição */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors truncate" title={t.assunto}>
                          {t.assunto}
                        </div>
                        <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5" title={t.descricao}>
                          {t.descricao}
                        </div>
                      </td>

                      {/* Solicitante / Organização */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[150px]" title={t.cliente?.nome || 'Cliente'}>
                              {t.cliente?.nome || 'Cliente'}
                            </span>
                          </div>
                          {t.client_organization?.nome ? (
                            <div className="flex items-center gap-1 text-[11px] text-blue-700 font-medium">
                              <Building2 className="w-3 h-3 text-blue-500 shrink-0" />
                              <span className="truncate max-w-[150px]" title={t.client_organization.nome}>
                                {t.client_organization.nome}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic pl-5">Sem organização</span>
                          )}
                        </div>
                      </td>

                      {/* Operador Atribuído */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {operadorNome ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                            <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate max-w-[130px]" title={operadorNome}>
                              {operadorNome}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 shadow-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            Não Atribuído
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                            t.status === 'Aberto'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : t.status === 'Em Andamento'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : t.status === 'Fechado'
                              ? 'bg-slate-100 text-slate-700 border-slate-300'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {t.status === 'Fechado' ? (
                            <CheckCheck className="w-3 h-3 text-slate-500" />
                          ) : t.status === 'Resolvido' ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Clock className="w-3 h-3 text-blue-500" />
                          )}
                          {t.status}
                        </span>
                      </td>

                      {/* SLA Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {slaBadge}
                      </td>

                      {/* Criado em */}
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(t.criado_em).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Ações (Ver Chamado) */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTicket?.(t.id);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors shadow-sm"
                        >
                          <span>Ver Chamado</span>
                          <ChevronRight className="w-3.5 h-3.5 text-blue-600" />
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
      )}

      {/* Modal de Abertura de Novo Chamado */}
      <NewTicket
        isOpen={isNewTicketOpen}
        onClose={() => setIsNewTicketOpen(false)}
        onTicketCreated={loadTickets}
      />

      {/* Modal de Importação de Conversa Ativa do WhatsApp */}
      <ImportWhatsappModal
        isOpen={isImportWhatsappOpen}
        onClose={() => setIsImportWhatsappOpen(false)}
        activeCompany={currentCompany}
        onImported={(newTicketId) => {
          setIsImportWhatsappOpen(false);
          loadTickets();
          onSelectTicket?.(newTicketId);
        }}
      />
    </div>
  );
};

export default Tickets;
