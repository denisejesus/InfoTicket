/**
 * InfoTicket - Cabeçalho Global & Central de Notificações Reais v1.5.0
 * Consome eventos dinâmicos reais do Supabase (audit_logs, tickets, profiles) com suporte a Realtime e marcação de leitura
 */
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Bell, 
  Menu, 
  LogOut, 
  ChevronDown, 
  Search,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Building2,
  Check,
  User as UserIcon,
  RefreshCw,
  Ticket as TicketIcon
} from 'lucide-react';
import { Profile, Company, AppNotification } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';
import { supabase } from '../lib/supabase';

import { NavItem } from './Sidebar';

interface HeaderProps {
  onToggleSidebar: () => void;
  currentUser?: Partial<Profile>;
  onLogout?: () => void;
  onNavigateRegister?: () => void;
  onNavigateTab?: (tab: NavItem) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  currentUser,
  onLogout,
  onNavigateRegister,
  onNavigateTab,
}) => {
  const { user, profile, company, activeCompanyId, setActiveCompanyId } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);
  const [companiesList, setCompaniesList] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');

  // Estados de Notificações Reais do Banco
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);

  const targetCompanyId = activeCompanyId || company?.id || profile?.company_id || null;
  const currentUserId = user?.id || profile?.id || 'anon';
  const storageKey = `ticketflow_read_notifications_${currentUserId}_${targetCompanyId || 'default'}`;

  // Carrega IDs de notificações já lidas pelo usuário na empresa ativa
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setReadNotificationIds(parsed);
          return;
        }
      }
    } catch (e) {
      console.warn('Aviso ao ler estado de notificações lidas:', e);
    }
    setReadNotificationIds([]);
  }, [storageKey]);

  const fetchRealNotifications = useCallback(async () => {
    if (!targetCompanyId) {
      setNotifications([]);
      return;
    }
    setLoadingNotifications(true);
    try {
      const items = await dataService.getCompanyNotifications(targetCompanyId, 15);
      setNotifications(items);
    } catch (err) {
      console.warn('Erro ao carregar notificações reais:', err);
    } finally {
      setLoadingNotifications(false);
    }
  }, [targetCompanyId]);

  // Busca inicial e escuta em tempo real (Realtime) para a empresa ativa
  useEffect(() => {
    fetchRealNotifications();

    if (!targetCompanyId) return;

    const channel = supabase
      .channel(`header-notifications-${targetCompanyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets', filter: `company_id=eq.${targetCompanyId}` },
        () => fetchRealNotifications()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'audit_logs', filter: `company_id=eq.${targetCompanyId}` },
        () => fetchRealNotifications()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `company_id=eq.${targetCompanyId}` },
        () => fetchRealNotifications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetCompanyId, fetchRealNotifications]);

  // Marca todas as notificações atuais como lidas e grava a visualização
  const handleMarkAllAsRead = () => {
    const allIds = Array.from(new Set([...readNotificationIds, ...notifications.map((n) => n.id)]));
    setReadNotificationIds(allIds);
    try {
      localStorage.setItem(storageKey, JSON.stringify(allIds));
    } catch (e) {
      console.warn('Erro ao salvar notificações lidas:', e);
    }
  };

  // Marca uma notificação individual como lida (e navega caso tenha vínculo)
  const handleNotificationClick = (notif: AppNotification) => {
    if (!readNotificationIds.includes(notif.id)) {
      const updated = [...readNotificationIds, notif.id];
      setReadNotificationIds(updated);
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch (e) {
        console.warn('Erro ao gravar leitura de notificação:', e);
      }
    }

    if (notif.ticket_id) {
      const base = window.location.pathname.startsWith('/ticketflow') ? '/ticketflow' : '';
      const targetUrl = `${base}/tickets/${notif.ticket_id}`;
      window.history.pushState({}, '', targetUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
      setShowNotifications(false);
    } else if (notif.tipo === 'perfil' && onNavigateTab) {
      onNavigateTab('perfil');
      setShowNotifications(false);
    }
  };

  // Formata data/hora relativa amigável sem dados estáticos
  const formatRelativeTime = (isoDate: string): string => {
    if (!isoDate) return '';
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

    if (diffMinutes < 1) return 'Agora mesmo';
    if (diffMinutes < 60) return `Há ${diffMinutes} min`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Há ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `Há ${diffDays} dias`;
    return new Date(isoDate).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const unreadCount = notifications.filter((n) => !readNotificationIds.includes(n.id)).length;

  const handleGlobalSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const term = globalSearchTerm.trim();
      const newUrl = term ? `/?search=${encodeURIComponent(term)}` : '/';
      window.history.pushState({}, '', newUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
      if (onNavigateTab) {
        onNavigateTab('meus-chamados');
      }
    }
  };

  const isSuperAdmin = (currentUser?.role || profile?.role) === 'Super Admin';

  useEffect(() => {
    if (isSuperAdmin) {
      setLoadingCompanies(true);
      dataService.getAllCompanies()
        .then((data) => {
          setCompaniesList(data.filter((c) => c.status === 'Ativo' || c.status === 'Trial'));
        })
        .catch((err) => {
          console.warn('Erro ao carregar lista de empresas para context switcher:', err);
        })
        .finally(() => {
          setLoadingCompanies(false);
        });
    }
  }, [isSuperAdmin]);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-white border-b border-slate-200">
      {/* Esquerda: Toggle Mobile e Busca */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          aria-label="Abrir menu"
          className="p-2 text-slate-500 rounded-lg hover:text-slate-800 hover:bg-slate-100 lg:hidden focus:outline-none"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative hidden md:block w-72 lg:w-96">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={globalSearchTerm}
            onChange={(e) => setGlobalSearchTerm(e.target.value)}
            onKeyDown={handleGlobalSearchKeyDown}
            placeholder="Buscar por chamado, cliente, assunto... (pressione Enter)"
            className="w-full py-1.5 pl-9 pr-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Direita: Context Switcher (Super Admin), Ações, Notificações, Onboarding e Usuário */}
      <div className="flex items-center gap-3">
        {/* Context Switcher - Seletor de Contas para Super Admin */}
        {isSuperAdmin && (
          <div className="relative">
            <button
              onClick={() => {
                setShowCompanyMenu(!showCompanyMenu);
                setShowUserMenu(false);
                setShowNotifications(false);
              }}
              title="Alterar conta (Context Switcher Super Admin)"
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors focus:outline-none shadow-sm"
            >
              <Building2 className="w-4 h-4 text-purple-600 shrink-0" />
              <div className="text-left hidden sm:block max-w-[150px] md:max-w-[190px] truncate">
                <span className="text-[10px] text-slate-400 block font-normal leading-none uppercase tracking-wider">Conta Ativa</span>
                <span className="font-bold text-slate-900 truncate">{company?.razao_social || 'Selecionar Conta'}</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5" />
            </button>

            {showCompanyMenu && (
              <div className="absolute right-0 w-64 sm:w-72 mt-2 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50 animate-in fade-in duration-150">
                <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                    Alterar Conta (Super Admin)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {companiesList.length} empresas
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto py-1 divide-y divide-slate-50">
                  {loadingCompanies ? (
                    <div className="px-4 py-3 text-xs text-slate-500 text-center">
                      Carregando empresas ativas...
                    </div>
                  ) : companiesList.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-slate-500 text-center">
                      Nenhuma empresa encontrada.
                    </div>
                  ) : (
                    companiesList.map((comp) => {
                      const isSelected = comp.id === (activeCompanyId || company?.id);
                      return (
                        <button
                          key={comp.id}
                          onClick={() => {
                            setActiveCompanyId(comp.id);
                            setShowCompanyMenu(false);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between text-xs transition-colors ${
                            isSelected ? 'bg-purple-50/70 text-purple-900 font-bold' : 'hover:bg-slate-50 text-slate-700 font-medium'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-purple-600' : 'bg-slate-300'}`} />
                            <div className="truncate">
                              <p className="truncate text-xs leading-tight">{comp.razao_social}</p>
                              <span className="text-[10px] text-slate-400 block font-normal">
                                {comp.status} {comp.cnpj ? `• ${comp.cnpj}` : ''}
                              </span>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-purple-600 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Link / Botão para testar o Onboarding Público */}
        {onNavigateRegister && (
          <button
            onClick={onNavigateRegister}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5 text-blue-600" />
            <span>Novo Cadastro (Onboarding)</span>
          </button>
        )}

        {/* Notificações Reais e Dinâmicas */}
        <div className="relative">
          <button
            onClick={() => {
              const nextState = !showNotifications;
              setShowNotifications(nextState);
              setShowUserMenu(false);
              setShowCompanyMenu(false);
              if (nextState) {
                fetchRealNotifications();
              }
            }}
            aria-label="Notificações"
            className="relative p-2 text-slate-600 rounded-lg hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 w-80 sm:w-96 mt-2 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Notificações
                  </span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                      {unreadCount} {unreadCount === 1 ? 'nova' : 'novas'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchRealNotifications}
                    disabled={loadingNotifications}
                    title="Atualizar notificações"
                    className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingNotifications ? 'animate-spin text-blue-600' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkAllAsRead}
                    disabled={notifications.length === 0 || unreadCount === 0}
                    className={`text-[11px] font-semibold transition-colors ${
                      unreadCount > 0
                        ? 'text-blue-600 hover:text-blue-700 hover:underline cursor-pointer'
                        : 'text-slate-400 cursor-default'
                    }`}
                  >
                    Marcar lidas
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {loadingNotifications && notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Carregando eventos da empresa...</span>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    <Bell className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                    <p className="font-semibold text-slate-700">Nenhuma atividade recente</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Novos chamados e atualizações da empresa aparecerão aqui em tempo real.
                    </p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    const isRead = readNotificationIds.includes(n.id);
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left p-3 hover:bg-slate-50 flex items-start gap-3 transition-all ${
                          isRead ? 'opacity-60 bg-white' : 'bg-blue-50/25'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isRead ? (
                            <CheckCircle2 className="w-4 h-4 text-slate-400" />
                          ) : n.tipo === 'alerta' ? (
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                          ) : n.tipo === 'perfil' ? (
                            <UserIcon className="w-4 h-4 text-blue-600" />
                          ) : (
                            <TicketIcon className="w-4 h-4 text-emerald-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs ${isRead ? 'font-medium text-slate-700' : 'font-bold text-slate-900'}`}>
                              {n.titulo}
                            </p>
                            {!isRead && (
                              <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-slate-600 break-words leading-snug mt-0.5">
                            {n.mensagem}
                          </p>
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            {formatRelativeTime(n.criado_em)}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-slate-200 hidden sm:block" />

        {/* Nome do Usuário */}
        <div className="relative">
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifications(false);
              setShowCompanyMenu(false);
            }}
            className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none"
          >
            {currentUser?.avatar_url ? (
              <img
                src={currentUser.avatar_url}
                alt={currentUser.nome || 'Avatar'}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-blue-100"
              />
            ) : (
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs ring-2 ring-blue-200/60">
                {currentUser?.nome ? currentUser.nome.charAt(0).toUpperCase() : 'U'}
              </div>
            )}

            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-slate-900 leading-tight">
                {currentUser?.nome || profile?.nome || 'Usuário Autenticado'}
              </div>
              <div className="text-[11px] font-medium text-slate-500">
                {currentUser?.role || profile?.role || ''}
              </div>
            </div>

            <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block" />
          </button>

          {/* Menu Dropdown de Logout */}
          {showUserMenu && (
            <div className="absolute right-0 w-52 mt-2 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900">{currentUser?.nome || profile?.nome}</p>
                <p className="text-[11px] text-slate-500 truncate">{currentUser?.email || profile?.email}</p>
              </div>

              {onNavigateTab && (
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    onNavigateTab('perfil');
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-50 transition-colors"
                >
                  <UserIcon className="w-4 h-4 text-slate-400" />
                  Meu Perfil
                </button>
              )}

              {onNavigateRegister && (
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    onNavigateRegister();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <UserPlus className="w-4 h-4 text-blue-500" />
                  Cadastrar Nova Empresa
                </button>
              )}

              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onLogout?.();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4 text-red-500" />
                Sair
              </button>
            </div>
          )}
        </div>

        {/* Botão de Logout Visível */}
        <button
          onClick={onLogout}
          title="Encerrar sessão"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-slate-200 hover:border-red-200"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};
