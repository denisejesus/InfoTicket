/**
 * TicketFlow - Relatórios Gerenciais v1.2.0
 * Análise executiva de Volume por Cliente, Desempenho da Equipe, Distribuição por Status e Cumprimento de Prazos
 * Suporte a Filtro de Período Personalizado (Data Inicial e Data Final) e Tabelas Responsivas com Rolagem Horizontal
 * Interface estritamente em Tema Claro (Light Mode) com Tailwind CSS e consumo de dados reais
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart3,
  PieChart as PieChartIcon,
  Users,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Star,
  RefreshCw,
  Calendar,
  Lock,
  TrendingUp,
  Award,
  Ticket as TicketIcon,
  Loader2,
  Filter
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';
import { Ticket, Profile, ClientOrganization, Company } from '../types/database';

interface ReportsProps {
  activeCompany?: Company | null;
}

type PeriodFilter = '7d' | '30d' | 'month' | 'all' | 'custom';

export const ReportsPage: React.FC<ReportsProps> = ({ activeCompany }) => {
  const { profile, company, activeCompanyId, loading: authLoading } = useAuth();

  // Determina a empresa ativa respeitando o Context Switcher
  const targetCompanyId = activeCompanyId || activeCompany?.id || company?.id || profile?.company_id || null;
  const currentCompanyName = activeCompany?.razao_social || company?.razao_social || 'Empresa Ativa';

  // Controle estrito de acesso: Apenas Gestor, Gerente ou Super Admin
  const normalizedRole = (profile?.role || '').trim().toLowerCase();
  const isAuthorized =
    normalizedRole === 'gestor' ||
    normalizedRole === 'gerente' ||
    normalizedRole === 'super admin' ||
    normalizedRole === 'super_admin';

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [organizations, setOrganizations] = useState<ClientOrganization[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodFilter>('30d');

  // Estados para o Filtro de Data Personalizada (Padrão: últimos 30 dias até hoje)
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const loadReportData = async () => {
    if (!targetCompanyId) {
      setTickets([]);
      setOrganizations([]);
      setProfiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const [ticketsData, orgsData, profilesData] = await Promise.all([
        dataService.getTickets(targetCompanyId),
        dataService.getClientOrganizations(targetCompanyId),
        dataService.getProfiles(targetCompanyId),
      ]);

      // Garante isolamento da empresa ativa também no cliente
      setTickets(ticketsData.filter((t) => t.company_id === targetCompanyId));
      setOrganizations(orgsData.filter((o) => o.company_id === targetCompanyId));
      setProfiles(profilesData.filter((p) => p.company_id === targetCompanyId));
    } catch (err: any) {
      console.error('Erro ao carregar dados de relatórios:', err);
      setErrorMsg(err?.message || 'Não foi possível carregar os indicadores gerenciais.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      loadReportData();
    }
  }, [targetCompanyId, isAuthorized]);

  // 1. Filtragem global de chamados por período selecionado (incluindo intervalo personalizado)
  const filteredTickets = useMemo(() => {
    if (period === 'all') return tickets;

    if (period === 'custom') {
      const startMs = customStartDate
        ? new Date(`${customStartDate}T00:00:00`).getTime()
        : null;
      const endMs = customEndDate
        ? new Date(`${customEndDate}T23:59:59.999`).getTime()
        : null;

      return tickets.filter((t) => {
        if (!t.criado_em) return false;
        const createdMs = new Date(t.criado_em).getTime();
        if (startMs !== null && !isNaN(startMs) && createdMs < startMs) return false;
        if (endMs !== null && !isNaN(endMs) && createdMs > endMs) return false;
        return true;
      });
    }

    const now = new Date();
    let cutoffDate = new Date();

    if (period === '7d') {
      cutoffDate.setDate(now.getDate() - 7);
      cutoffDate.setHours(0, 0, 0, 0);
    } else if (period === '30d') {
      cutoffDate.setDate(now.getDate() - 30);
      cutoffDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    return tickets.filter((t) => {
      if (!t.criado_em) return false;
      return new Date(t.criado_em).getTime() >= cutoffDate.getTime();
    });
  }, [tickets, period, customStartDate, customEndDate]);

  // 2. Indicador de Taxa de Resolução no Prazo (Chamados Fechados/Resolvidos dentro e fora do prazo)
  const slaResolutionMetrics = useMemo(() => {
    const closedTickets = filteredTickets.filter(
      (t) => t.status === 'Fechado' || t.status === 'Resolvido'
    );

    let onTimeCount = 0;
    let lateCount = 0;

    closedTickets.forEach((t) => {
      if (!t.sla_vencimento) {
        onTimeCount += 1;
        return;
      }
      const closedAt = t.atualizado_em ? new Date(t.atualizado_em).getTime() : new Date(t.criado_em).getTime();
      const slaLimit = new Date(t.sla_vencimento).getTime();
      if (closedAt <= slaLimit) {
        onTimeCount += 1;
      } else {
        lateCount += 1;
      }
    });

    const totalClosed = closedTickets.length;
    const rate = totalClosed > 0 ? Math.round((onTimeCount / totalClosed) * 100) : 0;

    return {
      totalClosed,
      onTimeCount,
      lateCount,
      rate,
    };
  }, [filteredTickets]);

  // 3. Indicador Global de Satisfação (CSAT) no período
  const globalCsatMetrics = useMemo(() => {
    const rated = filteredTickets.filter((t) => typeof t.csat_score === 'number' && t.csat_score > 0);
    const count = rated.length;
    const average =
      count > 0
        ? (rated.reduce((acc, curr) => acc + (curr.csat_score || 0), 0) / count).toFixed(1)
        : null;
    return { count, average };
  }, [filteredTickets]);

  // 4. Distribuição por Status Atual (para o Gráfico de Donut)
  const statusDistribution = useMemo(() => {
    const counts = {
      Aberto: 0,
      'Em Andamento': 0,
      'Aguardando Cliente': 0,
      Resolvido: 0,
      Fechado: 0,
    };

    filteredTickets.forEach((t) => {
      if (counts[t.status] !== undefined) {
        counts[t.status] += 1;
      }
    });

    const total = filteredTickets.length;
    const items = [
      { status: 'Aberto', label: 'Aberto', count: counts['Aberto'], color: '#3b82f6', bgClass: 'bg-blue-500', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
      { status: 'Em Andamento', label: 'Em Andamento', count: counts['Em Andamento'], color: '#8b5cf6', bgClass: 'bg-purple-500', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
      { status: 'Aguardando Cliente', label: 'Aguardando Cliente', count: counts['Aguardando Cliente'], color: '#f59e0b', bgClass: 'bg-amber-500', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
      { status: 'Resolvido', label: 'Resolvido', count: counts['Resolvido'], color: '#10b981', bgClass: 'bg-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      { status: 'Fechado', label: 'Fechado', count: counts['Fechado'], color: '#64748b', bgClass: 'bg-slate-500', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
    ];

    return {
      total,
      items: items.map((item) => ({
        ...item,
        percentage: total > 0 ? Math.round((item.count / total) * 100) : 0,
        exactPercentage: total > 0 ? (item.count / total) * 100 : 0,
      })),
    };
  }, [filteredTickets]);

  // 5. Relatório: Volume por Cliente (cruzando tickets com client_organizations)
  const clientVolumeData = useMemo(() => {
    // Mapeia cliente_id -> client_organization_id a partir de profiles para tickets onde client_organization_id não foi gravado diretamente
    const profileOrgMap = new Map<string, string>();
    profiles.forEach((p) => {
      if (p.id && p.client_organization_id) {
        profileOrgMap.set(p.id, p.client_organization_id);
      }
    });

    const orgStatsMap = new Map<
      string,
      {
        id: string;
        nome: string;
        abertos: number;
        emAtendimento: number;
        fechados: number;
        total: number;
      }
    >();

    // Inicializa todas as organizações clientes cadastradas
    organizations.forEach((org) => {
      orgStatsMap.set(org.id, {
        id: org.id,
        nome: org.nome,
        abertos: 0,
        emAtendimento: 0,
        fechados: 0,
        total: 0,
      });
    });

    let unassignedTickets = {
      id: 'sem-organizacao',
      nome: 'Atendimento Direto / Sem Organização',
      abertos: 0,
      emAtendimento: 0,
      fechados: 0,
      total: 0,
    };

    filteredTickets.forEach((t) => {
      const resolvedOrgId =
        t.client_organization_id ||
        t.client_organization?.id ||
        (t.cliente_id ? profileOrgMap.get(t.cliente_id) : undefined);

      let targetBucket = resolvedOrgId ? orgStatsMap.get(resolvedOrgId) : undefined;

      // Caso o ticket tenha nome de organização no join mas não estava na lista inicial
      if (!targetBucket && resolvedOrgId && t.client_organization?.nome) {
        targetBucket = {
          id: resolvedOrgId,
          nome: t.client_organization.nome,
          abertos: 0,
          emAtendimento: 0,
          fechados: 0,
          total: 0,
        };
        orgStatsMap.set(resolvedOrgId, targetBucket);
      }

      const bucket = targetBucket || unassignedTickets;

      if (t.status === 'Aberto') {
        bucket.abertos += 1;
      } else if (t.status === 'Em Andamento' || t.status === 'Aguardando Cliente') {
        bucket.emAtendimento += 1;
      } else if (t.status === 'Resolvido' || t.status === 'Fechado') {
        bucket.fechados += 1;
      }
      bucket.total += 1;
    });

    const resultList = Array.from(orgStatsMap.values());
    if (unassignedTickets.total > 0) {
      resultList.push(unassignedTickets);
    }

    return resultList.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  }, [filteredTickets, organizations, profiles]);

  // 6. Relatório: Desempenho da Equipe (cruzando tickets com profiles onde role seja Operador, Gerente ou Gestor)
  const operatorPerformanceData = useMemo(() => {
    const teamRoles = ['operador', 'operador/funcionário', 'gerente', 'gestor'];
    const teamMembers = profiles.filter((p) =>
      teamRoles.includes((p.role || '').trim().toLowerCase())
    );

    const nowMs = Date.now();

    const rows = teamMembers.map((member) => {
      const assignedTickets = filteredTickets.filter((t) => t.operador_id === member.id);
      const totalAssigned = assignedTickets.length;

      const closedTickets = assignedTickets.filter(
        (t) => t.status === 'Fechado' || t.status === 'Resolvido'
      );
      const totalClosed = closedTickets.length;

      // Cálculo de SLAs cumpridos (%):
      // Para chamados fechados/resolvidos: verifica se atualizado_em <= sla_vencimento
      // Para chamados em aberto: verifica se ainda estão dentro do prazo (now <= sla_vencimento)
      let slaEvaluatedCount = 0;
      let slaMetCount = 0;

      assignedTickets.forEach((t) => {
        if (!t.sla_vencimento) return;
        slaEvaluatedCount += 1;
        const slaLimit = new Date(t.sla_vencimento).getTime();
        const isClosed = t.status === 'Fechado' || t.status === 'Resolvido';

        if (isClosed) {
          const closedTime = t.atualizado_em
            ? new Date(t.atualizado_em).getTime()
            : new Date(t.criado_em).getTime();
          if (closedTime <= slaLimit) {
            slaMetCount += 1;
          }
        } else {
          if (nowMs <= slaLimit) {
            slaMetCount += 1;
          }
        }
      });

      const slaPercentage =
        slaEvaluatedCount > 0 ? Math.round((slaMetCount / slaEvaluatedCount) * 100) : null;

      // Nota Média de Avaliação (CSAT)
      const ratedTickets = assignedTickets.filter(
        (t) => typeof t.csat_score === 'number' && t.csat_score > 0
      );
      const csatCount = ratedTickets.length;
      const csatAvg =
        csatCount > 0
          ? Number(
              (
                ratedTickets.reduce((acc, curr) => acc + (curr.csat_score || 0), 0) /
                csatCount
              ).toFixed(1)
            )
          : null;

      return {
        id: member.id,
        nome: member.nome || member.email || 'Membro da Equipe',
        email: member.email || '',
        role: member.role,
        avatar_url: member.avatar_url,
        totalAssigned,
        totalClosed,
        slaPercentage,
        slaMetCount,
        slaEvaluatedCount,
        csatAvg,
        csatCount,
      };
    });

    return rows.sort((a, b) => b.totalAssigned - a.totalAssigned || b.totalClosed - a.totalClosed);
  }, [filteredTickets, profiles]);

  // Estado de carregamento da autenticação
  if (authLoading || !profile) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="text-xs font-medium">Verificando credenciais de acesso...</span>
      </div>
    );
  }

  // Bloqueio para perfis 'Operador' e 'Cliente'
  if (!isAuthorized) {
    return (
      <div className="p-8 bg-white border border-slate-200 rounded-2xl shadow-sm text-center max-w-lg mx-auto my-8">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center mx-auto mb-3 border border-rose-100">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Acesso Restrito aos Relatórios Gerenciais</h2>
        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
          Esta área contém indicadores estratégicos de desempenho e é exclusiva para{' '}
          <strong>Gestores</strong>, <strong>Gerentes</strong> e <strong>Administradores</strong>.
        </p>
      </div>
    );
  }

  const maxClientTotal = Math.max(...clientVolumeData.map((c) => c.total), 1);

  // Construção dos segmentos do Gráfico Donut SVG
  const donutRadius = 60;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let accumulatedPercent = 0;

  const formatBrDate = (isoDate: string) => {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    return y && m && d ? `${d}/${m}/${y}` : isoDate;
  };

  const periodLabels: Record<PeriodFilter, string> = {
    '7d': 'Últimos 7 dias',
    '30d': 'Últimos 30 dias',
    month: 'Mês Atual',
    all: 'Todo o Período',
    custom:
      customStartDate && customEndDate
        ? `${formatBrDate(customStartDate)} até ${formatBrDate(customEndDate)}`
        : customStartDate
        ? `A partir de ${formatBrDate(customStartDate)}`
        : customEndDate
        ? `Até ${formatBrDate(customEndDate)}`
        : 'Período Personalizado',
  };

  return (
    <div className="space-y-6 font-sans antialiased text-slate-900">
      {/* Cabeçalho e Filtro Global de Período */}
      <div className="flex flex-col gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                {currentCompanyName}
              </span>
              <span className="text-xs text-slate-400 font-medium">•</span>
              <span className="text-xs font-semibold text-slate-500">
                Período ativo: <strong className="text-slate-700">{periodLabels[period]}</strong>
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
              Relatórios Gerenciais
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Análise consolidada de volume por cliente, cumprimento de prazos e desempenho da equipe.
            </p>
          </div>

          {/* Barra de Filtros de Tempo + Botão Atualizar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex flex-wrap items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <div className="flex items-center gap-1.5 px-2.5 py-1 text-slate-500 text-xs font-semibold">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">Período:</span>
              </div>
              {(
                [
                  { id: '7d', label: 'Últimos 7 dias' },
                  { id: '30d', label: 'Últimos 30 dias' },
                  { id: 'month', label: 'Mês Atual' },
                  { id: 'all', label: 'Todo o Período' },
                  { id: 'custom', label: 'Personalizado' },
                ] as { id: PeriodFilter; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPeriod(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    period === opt.id
                      ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={loadReportData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* Seletor de Data Inicial e Final quando "Personalizado" estiver ativo */}
        {period === 'custom' && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              <span>Selecione o intervalo de datas para filtrar os relatórios:</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label htmlFor="report-start-date" className="text-xs font-bold text-slate-600">
                  De:
                </label>
                <input
                  id="report-start-date"
                  type="date"
                  value={customStartDate}
                  max={customEndDate || undefined}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="report-end-date" className="text-xs font-bold text-slate-600">
                  Até:
                </label>
                <input
                  id="report-end-date"
                  type="date"
                  value={customEndDate}
                  min={customStartDate || undefined}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Alerta de erro se houver */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Cards de Indicadores Executivos (Destaque para Taxa de Resolução no Prazo) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Taxa de Resolução no Prazo (Obrigatório) */}
        <div className="p-5 bg-white border border-emerald-200 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
              Taxa de Resolução no Prazo
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading
                ? '...'
                : slaResolutionMetrics.totalClosed > 0
                ? `${slaResolutionMetrics.rate}%`
                : '0%'}
            </span>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              {slaResolutionMetrics.onTimeCount} no prazo
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Dentro do prazo: <strong className="text-emerald-700">{slaResolutionMetrics.onTimeCount}</strong></span>
            <span>Fora do prazo: <strong className="text-rose-600">{slaResolutionMetrics.lateCount}</strong></span>
          </div>
        </div>

        {/* Card 2: Volume Total no Período */}
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Volume no Período
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <TicketIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading ? '...' : filteredTickets.length}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              chamados registrados
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Em atendimento: <strong className="text-slate-800">{statusDistribution.items[0].count + statusDistribution.items[1].count + statusDistribution.items[2].count}</strong></span>
            <span>Concluídos: <strong className="text-emerald-700">{slaResolutionMetrics.totalClosed}</strong></span>
          </div>
        </div>

        {/* Card 3: Clientes Atendidos */}
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Organizações Clientes
            </span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading ? '...' : organizations.length}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              empresas cadastradas
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500">
            <span>
              Com demanda no período:{' '}
              <strong className="text-indigo-700">
                {clientVolumeData.filter((c) => c.total > 0).length}
              </strong>
            </span>
          </div>
        </div>

        {/* Card 4: Satisfação Média (CSAT) */}
        <div className="p-5 bg-white border border-amber-200 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
              Satisfação do Cliente (CSAT)
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-500">
              <Star className="w-4 h-4 fill-amber-400" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading
                ? '...'
                : globalCsatMetrics.average
                ? `${globalCsatMetrics.average} / 5.0`
                : 'Sem notas'}
            </span>
            <span className="text-[11px] font-medium text-amber-700">
              {globalCsatMetrics.count} avaliações
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500">
            <span>Média consolidada das avaliações recebidas</span>
          </div>
        </div>
      </div>

      {/* Seção Intermediária: Gráfico Donut (Distribuição por Status Atual) + Gráfico de Barras (Volume por Cliente) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Gráfico de Pizza/Donut: Distribuição por Status Atual */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <PieChartIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Distribuição por Status Atual
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Proporção dos chamados registrados no período
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 text-xs font-bold bg-slate-100 text-slate-700 rounded-lg">
                Total: {statusDistribution.total}
              </span>
            </div>

            {loading ? (
              <div className="py-16 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Calculando distribuição por status...</span>
              </div>
            ) : statusDistribution.total === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400">
                Nenhum chamado encontrado no período selecionado.
              </div>
            ) : (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-around gap-6">
                {/* Donut Chart SVG */}
                <div className="relative w-44 h-44 flex items-center justify-center shrink-0">
                  <svg className="w-44 h-44 -rotate-90" viewBox="0 0 160 160">
                    <circle
                      cx="80"
                      cy="80"
                      r={donutRadius}
                      fill="transparent"
                      stroke="#f1f5f9"
                      strokeWidth="22"
                    />
                    {statusDistribution.items.map((segment) => {
                      if (segment.count === 0) return null;
                      const strokeDasharray = `${
                        (segment.exactPercentage / 100) * donutCircumference
                      } ${donutCircumference}`;
                      const strokeDashoffset = -(
                        (accumulatedPercent / 100) *
                        donutCircumference
                      );
                      accumulatedPercent += segment.exactPercentage;

                      return (
                        <circle
                          key={segment.status}
                          cx="80"
                          cy="80"
                          r={donutRadius}
                          fill="transparent"
                          stroke={segment.color}
                          strokeWidth="22"
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          className="transition-all duration-500"
                        >
                          <title>
                            {segment.label}: {segment.count} ({segment.percentage}%)
                          </title>
                        </circle>
                      );
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-extrabold text-slate-900">
                      {statusDistribution.total}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Chamados
                    </span>
                  </div>
                </div>

                {/* Legenda Analítica */}
                <div className="flex-1 w-full space-y-2.5">
                  {statusDistribution.items.map((item) => (
                    <div
                      key={item.status}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50/80 border border-slate-100 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-semibold text-slate-700">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{item.count}</span>
                        <span className="text-[11px] font-mono text-slate-500 w-9 text-right">
                          ({item.percentage}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Resumo de Cumprimento de Prazo no rodapé do card */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Taxa de Resolução no Prazo:</span>
            <span className="font-bold text-emerald-700">
              {slaResolutionMetrics.totalClosed > 0
                ? `${slaResolutionMetrics.rate}% (${slaResolutionMetrics.onTimeCount}/${slaResolutionMetrics.totalClosed} concluídos no prazo)`
                : 'Sem chamados concluídos no período'}
            </span>
          </div>
        </div>

        {/* Gráfico de Barras: Volume por Cliente */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Total de Chamados por Empresa Cliente
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Comparativo visual de chamados abertos, em atendimento e fechados por cliente
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-semibold">
                <span className="flex items-center gap-1 text-blue-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Abertos
                </span>
                <span className="flex items-center gap-1 text-amber-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Em Atendimento
                </span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Fechados
                </span>
              </div>
            </div>

            {loading ? (
              <div className="py-16 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Carregando volume por cliente...</span>
              </div>
            ) : clientVolumeData.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400">
                Nenhuma empresa cliente cadastrada para exibir o gráfico.
              </div>
            ) : (
              <div className="mt-5 space-y-4 max-h-72 overflow-y-auto pr-1">
                {clientVolumeData.map((client) => {
                  const barWidthPercent =
                    maxClientTotal > 0 ? Math.max((client.total / maxClientTotal) * 100, 2) : 0;
                  const abertosPct = client.total > 0 ? (client.abertos / client.total) * 100 : 0;
                  const atendimentoPct =
                    client.total > 0 ? (client.emAtendimento / client.total) * 100 : 0;
                  const fechadosPct = client.total > 0 ? (client.fechados / client.total) * 100 : 0;

                  return (
                    <div key={client.id} className="space-y-1.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                        <span className="font-bold text-slate-800 truncate max-w-full sm:max-w-[260px]">
                          {client.nome}
                        </span>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] font-semibold">
                          <span className="text-blue-600">{client.abertos} abertos</span>
                          <span className="text-amber-600">{client.emAtendimento} atend.</span>
                          <span className="text-emerald-600">{client.fechados} fechados</span>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-900 rounded font-bold">
                            {client.total} total
                          </span>
                        </div>
                      </div>

                      {/* Barra de Progresso Empilhada Proporcional */}
                      <div className="w-full bg-slate-100 h-3.5 rounded-lg overflow-hidden p-0.5">
                        {client.total > 0 ? (
                          <div
                            className="h-full flex rounded-md overflow-hidden transition-all duration-500"
                            style={{ width: `${barWidthPercent}%` }}
                          >
                            {client.abertos > 0 && (
                              <div
                                style={{ width: `${abertosPct}%` }}
                                className="bg-blue-500 h-full"
                                title={`Abertos: ${client.abertos}`}
                              />
                            )}
                            {client.emAtendimento > 0 && (
                              <div
                                style={{ width: `${atendimentoPct}%` }}
                                className="bg-amber-500 h-full"
                                title={`Em Atendimento: ${client.emAtendimento}`}
                              />
                            )}
                            {client.fechados > 0 && (
                              <div
                                style={{ width: `${fechadosPct}%` }}
                                className="bg-emerald-500 h-full"
                                title={`Fechados: ${client.fechados}`}
                              />
                            )}
                          </div>
                        ) : (
                          <div className="h-full w-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Empresas monitoradas: <strong className="text-slate-800">{clientVolumeData.length}</strong></span>
            <span>Volume consolidado: <strong className="text-slate-800">{filteredTickets.length} chamados</strong></span>
          </div>
        </div>
      </div>

      {/* Tabela de Apoio: Volume por Cliente */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Volume por Cliente — Tabela Analítica
              </h2>
              <p className="text-xs text-slate-500">
                Detalhamento de chamados abertos, em atendimento e fechados para cada empresa cliente
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {clientVolumeData.length} organizações listadas
          </span>
        </div>

        <div className="overflow-x-auto w-full">
          {loading ? (
            <div className="p-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Carregando dados das organizações clientes...</span>
            </div>
          ) : clientVolumeData.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Nenhuma organização cliente registrada para esta empresa.
            </div>
          ) : (
            <table className="w-full min-w-[640px] text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5 whitespace-nowrap">Empresa Cliente</th>
                  <th className="px-5 py-3.5 text-center whitespace-nowrap">Chamados Abertos</th>
                  <th className="px-5 py-3.5 text-center whitespace-nowrap">Em Atendimento</th>
                  <th className="px-5 py-3.5 text-center whitespace-nowrap">Chamados Fechados</th>
                  <th className="px-5 py-3.5 text-right whitespace-nowrap">Total de Chamados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {clientVolumeData.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-slate-900 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>{org.nome}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {org.abertos}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        {org.emAtendimento}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {org.fechados}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-extrabold text-slate-900">
                      {org.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Relatório: Desempenho da Equipe (Por Operador) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Desempenho da Equipe
              </h2>
              <p className="text-xs text-slate-500">
                Produtividade individual, cumprimento de prazos (SLA) e nota média de satisfação por membro da equipe
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {operatorPerformanceData.length} integrantes avaliados
          </span>
        </div>

        <div className="overflow-x-auto w-full">
          {loading ? (
            <div className="p-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Calculando indicadores de produtividade da equipe...</span>
            </div>
          ) : operatorPerformanceData.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Nenhum operador, gerente ou gestor encontrado para esta empresa.
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5 whitespace-nowrap">Nome do Operador</th>
                  <th className="px-5 py-3.5 text-center whitespace-nowrap">Total de Chamados Atribuídos</th>
                  <th className="px-5 py-3.5 text-center whitespace-nowrap">Chamados Fechados</th>
                  <th className="px-5 py-3.5 text-center whitespace-nowrap">SLAs Cumpridos (%)</th>
                  <th className="px-5 py-3.5 text-right whitespace-nowrap">Nota Média de Avaliação (CSAT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {operatorPerformanceData.map((op) => (
                  <tr key={op.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Coluna 1: Nome do Operador */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {op.avatar_url ? (
                          <img
                            src={op.avatar_url}
                            alt={op.nome}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-bold text-xs flex items-center justify-center border border-blue-200 shrink-0">
                            {op.nome.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-slate-900">{op.nome}</p>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {op.role}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Coluna 2: Total de Chamados Atribuídos */}
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex items-center justify-center min-w-[2.25rem] px-2.5 py-1 rounded-lg text-xs font-extrabold bg-slate-100 text-slate-800">
                        {op.totalAssigned}
                      </span>
                    </td>

                    {/* Coluna 3: Chamados Fechados */}
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex items-center justify-center min-w-[2.25rem] px-2.5 py-1 rounded-lg text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {op.totalClosed}
                      </span>
                    </td>

                    {/* Coluna 4: SLAs Cumpridos (%) */}
                    <td className="px-5 py-3.5 text-center">
                      {op.slaPercentage !== null ? (
                        <div className="inline-flex flex-col items-center gap-1 min-w-[120px]">
                          <div className="flex items-center justify-between w-full text-[11px]">
                            <span
                              className={`font-extrabold ${
                                op.slaPercentage >= 80
                                  ? 'text-emerald-700'
                                  : op.slaPercentage >= 50
                                  ? 'text-amber-700'
                                  : 'text-rose-600'
                              }`}
                            >
                              {op.slaPercentage}%
                            </span>
                            <span className="text-[10px] text-slate-400">
                              ({op.slaMetCount}/{op.slaEvaluatedCount})
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                op.slaPercentage >= 80
                                  ? 'bg-emerald-500'
                                  : op.slaPercentage >= 50
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                              style={{ width: `${op.slaPercentage}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">Sem chamados no período</span>
                      )}
                    </td>

                    {/* Coluna 5: Nota Média de Avaliação (CSAT) */}
                    <td className="px-5 py-3.5 text-right">
                      {op.csatAvg !== null ? (
                        <div className="inline-flex items-center justify-end gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                          <span className="font-extrabold text-slate-900">
                            {op.csatAvg.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            ({op.csatCount} {op.csatCount === 1 ? 'avaliação' : 'avaliações'})
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">Sem avaliações</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;

