/**
 * InfoTicket - Painel Analítico & Dashboard v1.12.0
 * Visão Especializada para Clientes (Boas-vindas, Atalhos Diretos e Zero Jargão Técnico)
 * Métricas em tempo real com dados reais do Supabase (Zero Mocks) para equipe de Gestão/Operação
 * Estritamente em Tema Claro (Light Mode) com Tailwind CSS e Isolamento Multi-tenant via RLS
 */
import React, { useEffect, useState } from 'react';
import { 
  Ticket as TicketIcon, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  ArrowUpRight, 
  RefreshCw, 
  Star, 
  AlertTriangle, 
  BarChart3, 
  PieChart, 
  Activity, 
  ShieldCheck, 
  User, 
  ChevronRight,
  TrendingUp,
  Search,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';
import { Ticket, Company } from '../types/database';

interface DashboardProps {
  activeCompany?: Company | null;
  onNavigateTab?: (tab: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ activeCompany, onNavigateTab }) => {
  const { profile, company } = useAuth();
  const currentCompany = activeCompany || company;

  // Controle de Role (Cliente vê painel simplificado sem métricas globais da equipe)
  const isCliente = profile?.role === 'Cliente';
  const isStaff = profile?.role === 'Gestor' || profile?.role === 'Gerente' || profile?.role === 'Operador' || profile?.role === 'Super Admin';

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await dataService.getTickets(currentCompany?.id);
      setTickets(result);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao buscar dados no sistema.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentCompany?.id]);

  // Cálculos dinâmicos e precisos baseados exclusivamente nos dados retornados do Supabase
  const now = new Date();

  // 1. Total de Chamados em Aberto (status 'Aberto' ou 'Em Andamento')
  const totalAbertos = tickets.filter(
    (t) => t.status === 'Aberto' || t.status === 'Em Andamento'
  ).length;

  // 2. Quantidade de SLAs Vencidos (chamados não concluídos onde now > sla_vencimento)
  const totalSlaVencidos = tickets.filter((t) => {
    const isConcluido = t.status === 'Fechado' || t.status === 'Resolvido';
    if (isConcluido || !t.sla_vencimento) return false;
    return new Date(t.sla_vencimento).getTime() < now.getTime();
  }).length;

  // 3. Nota Média de CSAT (Pesquisa de Satisfação)
  const ticketsComCsat = tickets.filter(
    (t) => typeof t.csat_score === 'number' && t.csat_score > 0
  );
  const csatCount = ticketsComCsat.length;
  const csatMedia = csatCount > 0
    ? (ticketsComCsat.reduce((acc, curr) => acc + (curr.csat_score || 0), 0) / csatCount).toFixed(1)
    : '0.0';

  // 4. Totais por Status para a Distribuição Analítica
  const statusCounts = {
    Aberto: tickets.filter((t) => t.status === 'Aberto').length,
    'Em Andamento': tickets.filter((t) => t.status === 'Em Andamento').length,
    'Aguardando Cliente': tickets.filter((t) => t.status === 'Aguardando Cliente').length,
    Resolvido: tickets.filter((t) => t.status === 'Resolvido').length,
    Fechado: tickets.filter((t) => t.status === 'Fechado').length,
  };

  const totalTickets = tickets.length;

  // Cards de Métricas para Equipe Interna (Gestores, Gerentes e Operadores)
  const metricCards = [
    {
      titulo: 'Chamados em Aberto',
      valor: loading ? '...' : totalAbertos.toString(),
      detalhe: `${statusCounts['Aberto']} aguardando primeiro atendimento`,
      icone: TicketIcon,
      corIcone: 'text-blue-600',
      bgIcone: 'bg-blue-50',
      borda: 'border-blue-100',
    },
    {
      titulo: 'SLAs Vencidos',
      valor: loading ? '...' : totalSlaVencidos.toString(),
      detalhe: totalSlaVencidos > 0 ? 'Requer intervenção imediata' : 'Nenhum SLA estourado',
      icone: AlertTriangle,
      corIcone: totalSlaVencidos > 0 ? 'text-rose-600' : 'text-slate-400',
      bgIcone: totalSlaVencidos > 0 ? 'bg-rose-50' : 'bg-slate-50',
      borda: totalSlaVencidos > 0 ? 'border-rose-200' : 'border-slate-200',
      destaque: totalSlaVencidos > 0,
    },
    {
      titulo: 'Nota Média CSAT',
      valor: loading ? '...' : csatCount > 0 ? `${csatMedia} / 5.0` : 'S/ Avaliação',
      detalhe: csatCount > 0 ? `${csatCount} cliente(s) avaliaram` : 'Aguardando avaliações',
      icone: Star,
      corIcone: 'text-amber-500',
      bgIcone: 'bg-amber-50',
      borda: 'border-amber-200',
    },
    {
      titulo: 'Total da Organização',
      valor: loading ? '...' : totalTickets.toString(),
      detalhe: currentCompany?.razao_social || 'Organização',
      icone: ShieldCheck,
      corIcone: 'text-indigo-600',
      bgIcone: 'bg-indigo-50',
      borda: 'border-indigo-100',
    },
  ];

  // Cores corporativas em tema claro para a distribuição por status
  const statusConfig: Record<string, { label: string; color: string; bg: string; text: string }> = {
    Aberto: { label: 'Aberto', color: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
    'Em Andamento': { label: 'Em Andamento', color: 'bg-purple-500', bg: 'bg-purple-50', text: 'text-purple-700' },
    'Aguardando Cliente': { label: 'Aguardando Cliente', color: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
    Resolvido: { label: 'Resolvido', color: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    Fechado: { label: 'Fechado', color: 'bg-slate-400', bg: 'bg-slate-100', text: 'text-slate-700' },
  };

  // Visão Exclusiva e Simplificada para o Perfil "Cliente"
  if (isCliente) {
    return (
      <div className="space-y-6 font-sans antialiased text-slate-900">
        {/* Cabeçalho Amigável do Cliente */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Portal de Atendimento ao Cliente
              </h1>
              <span className="px-2.5 py-0.5 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                {currentCompany?.razao_social || 'TicketFlow'}
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Acompanhamento de chamados em tempo real
            </p>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

        {/* Mensagem de Boas-vindas e Ações Rápidas em Destaque */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 shadow-sm">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full border border-blue-100">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Canal Oficial de Atendimento</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Olá, {profile?.nome?.split(' ')[0] || 'Cliente'}! Como podemos ajudar você hoje?
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Bem-vindo ao portal de suporte da <strong className="text-slate-800">{currentCompany?.razao_social || 'sua empresa'}</strong>. 
              Aqui você pode registrar novas solicitações ou acompanhar em tempo real todas as respostas e atualizações dos seus chamados.
            </p>
          </div>

          {/* Botões Grandes de Atalho */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <button
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set('new', 'true');
                window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
                onNavigateTab?.('meus-chamados');
              }}
              className="flex items-center gap-4 p-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-md shadow-blue-500/20 transition-all hover:scale-[1.01] group text-left"
            >
              <div className="p-3.5 bg-white/10 rounded-xl group-hover:bg-white/20 transition-colors">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="block text-base font-bold">Abrir Novo Chamado</span>
                <span className="block text-xs text-blue-100 mt-0.5">Criar uma nova solicitação para o suporte</span>
              </div>
            </button>

            <button
              onClick={() => onNavigateTab?.('meus-chamados')}
              className="flex items-center gap-4 p-5 bg-white hover:bg-slate-50 text-slate-900 border-2 border-slate-200 hover:border-slate-300 rounded-2xl shadow-sm transition-all hover:scale-[1.01] group text-left"
            >
              <div className="p-3.5 bg-blue-50 rounded-xl group-hover:bg-blue-100 transition-colors">
                <TicketIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <span className="block text-base font-bold">Consultar Meus Chamados</span>
                <span className="block text-xs text-slate-500 mt-0.5">Visualizar histórico e andamento dos tickets</span>
              </div>
            </button>
          </div>
        </div>

        {/* Tabela Resumida: Chamados do Cliente */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Meus Chamados Recentes
              </h2>
              <p className="text-xs text-slate-500">
                Acompanhe o andamento dos seus últimos chamados registrados
              </p>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('meus-chamados')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
              >
                <span>Ver todos os chamados</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Carregando seus chamados...</span>
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                <TicketIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">Você ainda não possui chamados abertos.</p>
                <p className="mt-1 text-slate-400">
                  Clique em "Abrir Novo Chamado" para registrar sua primeira solicitação.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50/80 text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Código</th>
                    <th className="px-5 py-3">Assunto</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Data</th>
                    <th className="px-5 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {tickets.slice(0, 5).map((t) => {
                    const cfg = statusConfig[t.status] || { bg: 'bg-slate-100', text: 'text-slate-700' };

                    return (
                      <tr 
                        key={t.id} 
                        onClick={() => onNavigateTab?.('meus-chamados')}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                      >
                        <td className="px-5 py-3.5 font-mono text-blue-600 font-bold whitespace-nowrap">
                          #{t.id.substring(0, 8)}
                        </td>
                        <td className="px-5 py-3.5 text-slate-900 font-bold group-hover:text-blue-700 max-w-xs truncate">
                          {t.assunto}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.bg} ${cfg.text}`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">
                          {new Date(t.criado_em).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateTab?.('meus-chamados');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
                          >
                            <span>Acompanhar</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Visão Analítica para Gestor, Gerente, Operador e Super Admin
  return (
    <div className="space-y-6 font-sans antialiased text-slate-900">
      {/* Topo do Painel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Painel Analítico de Atendimento
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
              {currentCompany?.razao_social || 'TicketFlow'}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Indicadores operacionais, controle de SLA e pesquisa de satisfação CSAT consolidados no sistema.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Atualizar</span>
          </button>

          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('meus-chamados')}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-blue-500/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Chamado</span>
            </button>
          )}
        </div>
      </div>

      {/* Alerta se houver erro ao carregar */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* SEÇÃO ANALÍTICA: Exibida estritamente para Gestor, Gerente e Operador */}
      {isStaff && (
        <>
          {/* Grid de Cards de Métricas Reais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {metricCards.map((m, idx) => {
              const Icon = m.icone;
              return (
                <div
                  key={idx}
                  className={`p-5 bg-white border rounded-2xl shadow-sm transition-all ${
                    m.destaque ? 'ring-1 ring-rose-300 shadow-rose-100' : 'hover:border-slate-300'
                  } ${m.borda}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      {m.titulo}
                    </span>
                    <div className={`p-2 rounded-xl ${m.bgIcone}`}>
                      <Icon className={`w-4 h-4 ${m.corIcone}`} />
                    </div>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between gap-2">
                    <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                      {m.valor}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500 truncate max-w-[150px] text-right">
                      {m.detalhe}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gráfico de Distribuição por Status & Painel de SLA/CSAT */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Gráfico Visual de Distribuição por Status */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Distribuição de Chamados por Status</h2>
                    <p className="text-[11px] text-slate-500">Visão proporcional em tempo real da carga de trabalho</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  {totalTickets} total
                </span>
              </div>

              {loading ? (
                <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Calculando distribuição...</span>
                </div>
              ) : totalTickets === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Nenhum chamado registrado para gerar gráficos analíticos.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Barra Segmentada Superior (Overview) */}
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                    {Object.entries(statusCounts).map(([status, count]) => {
                      if (count === 0) return null;
                      const percent = ((count / totalTickets) * 100).toFixed(1);
                      const cfg = statusConfig[status] || { color: 'bg-slate-300' };
                      return (
                        <div
                          key={status}
                          style={{ width: `${percent}%` }}
                          title={`${status}: ${count} (${percent}%)`}
                          className={`${cfg.color} transition-all duration-500 hover:opacity-90`}
                        />
                      );
                    })}
                  </div>

                  {/* Barras Detalhadas por Status com Métricas e Percentual */}
                  <div className="space-y-3 pt-2">
                    {Object.entries(statusCounts).map(([status, count]) => {
                      const percent = totalTickets > 0 ? ((count / totalTickets) * 100).toFixed(0) : '0';
                      const cfg = statusConfig[status] || { color: 'bg-slate-400', bg: 'bg-slate-50', text: 'text-slate-700' };

                      return (
                        <div key={status} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="flex items-center gap-2 text-slate-700">
                              <span className={`w-2.5 h-2.5 rounded-full ${cfg.color}`} />
                              <span>{status}</span>
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-900 font-bold">{count}</span>
                              <span className="text-[11px] font-mono text-slate-400 w-10 text-right">
                                {percent}%
                              </span>
                            </div>
                          </div>

                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${cfg.color} rounded-full transition-all duration-500`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Painel Lateral: Resumo de SLA e Desempenho CSAT */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Qualidade & Satisfação</h2>
                    <p className="text-[11px] text-slate-500">Métricas consolidadas de atendimento</p>
                  </div>
                </div>

                {/* Score CSAT Destacado */}
                <div className="mt-4 p-4 bg-gradient-to-br from-amber-50/70 to-orange-50/40 border border-amber-200/80 rounded-xl text-center">
                  <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block mb-1">
                    Avaliação Média dos Clientes
                  </span>
                  <div className="flex items-center justify-center gap-1 my-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-5 h-5 ${
                          star <= Math.round(Number(csatMedia))
                            ? 'text-amber-500 fill-amber-400'
                            : 'text-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-2xl font-extrabold text-slate-900 block mt-1">
                    {csatMedia} <span className="text-sm font-semibold text-slate-500">/ 5.0</span>
                  </span>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Baseado em <strong>{csatCount}</strong> avaliações registradas
                  </p>
                </div>

                {/* Status do SLA da Equipe */}
                <div className="mt-4 space-y-2.5">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <span className="text-slate-600 font-medium">SLAs no Prazo:</span>
                    <span className="font-bold text-emerald-700">
                      {Math.max(0, totalAbertos - totalSlaVencidos)} chamados
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <span className="text-slate-600 font-medium">SLAs Expirados:</span>
                    <span className={`font-bold ${totalSlaVencidos > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                      {totalSlaVencidos} chamados
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 text-center">
                Automação ativa via triggers e processamento em nuvem.
              </div>
            </div>
          </div>
        </>
      )}

      {/* Tabela de Chamados Recentes com Design Corporativo em Tema Claro */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Chamados Recentes da Empresa
            </h2>
            <p className="text-xs text-slate-500">
              Visualização operacional rápida das últimas solicitações registradas
            </p>
          </div>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('meus-chamados')}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
            >
              <span>Ver todos os chamados</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Carregando chamados do sistema...</span>
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              <TicketIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-700">Nenhum chamado encontrado.</p>
              <p className="mt-1 text-slate-400">
                Clique em "Novo Chamado" para registrar sua primeira solicitação.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/80 text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Código</th>
                  <th className="px-5 py-3">Assunto</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">SLA</th>
                  <th className="px-5 py-3">Criado em</th>
                  <th className="px-5 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {tickets.slice(0, 5).map((t) => {
                  const isFechado = t.status === 'Fechado' || t.status === 'Resolvido';

                  // Badge de SLA
                  let slaTag = null;
                  if (isFechado) {
                    slaTag = (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        Concluído
                      </span>
                    );
                  } else if (t.sla_vencimento) {
                    const diffMs = new Date(t.sla_vencimento).getTime() - now.getTime();
                    if (diffMs <= 0) {
                      slaTag = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          SLA Vencido
                        </span>
                      );
                    } else if (diffMs / (1000 * 60 * 60) <= 2) {
                      slaTag = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Atenção (&lt; 2h)
                        </span>
                      );
                    } else {
                      slaTag = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          No Prazo
                        </span>
                      );
                    }
                  } else {
                    slaTag = <span className="text-[10px] text-slate-400">N/D</span>;
                  }

                  const cfg = statusConfig[t.status] || { bg: 'bg-slate-100', text: 'text-slate-700' };

                  return (
                    <tr 
                      key={t.id} 
                      onClick={() => onNavigateTab?.('meus-chamados')}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-3.5 font-mono text-blue-600 font-bold whitespace-nowrap">
                        #{t.id.substring(0, 8)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-900 font-bold group-hover:text-blue-700 max-w-xs truncate">
                        {t.assunto}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.bg} ${cfg.text}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {slaTag}
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">
                        {new Date(t.criado_em).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateTab?.('meus-chamados');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
                        >
                          <span>Acessar</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
