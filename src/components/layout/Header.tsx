/**
 * TicketFlow - Header de Layout Base v1.2.0
 */
import React, { useState } from 'react';
import { 
  Bell, 
  Search, 
  Menu, 
  LogOut, 
  ChevronDown,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Profile } from '../../types/database';

interface HeaderProps {
  onToggleSidebar: () => void;
  currentUser?: Partial<Profile>;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  currentUser = {
    nome: 'Carlos Eduardo',
    email: 'carlos.gestor@acme.com',
    role: 'Gestor',
  },
  onLogout,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const notifications = [
    {
      id: 1,
      titulo: 'Novo chamado aberto',
      mensagem: '#TCK-2094 - Instabilidade na emissão de NF-e',
      tempo: 'Há 5 min',
      tipo: 'alerta',
    },
    {
      id: 2,
      titulo: 'Chamado em andamento',
      mensagem: 'Mariana Silva assumiu o ticket #TCK-2089',
      tempo: 'Há 22 min',
      tipo: 'info',
    },
    {
      id: 3,
      titulo: 'Chamado finalizado',
      mensagem: '#TCK-2077 foi concluído com sucesso',
      tempo: 'Há 1h',
      tipo: 'sucesso',
    },
  ];

  const handleLogout = () => {
    setShowUserMenu(false);
    if (onLogout) {
      onLogout();
    } else {
      alert('Sessão finalizada com sucesso.');
    }
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-white border-b border-slate-200">
      {/* Botão de Toggle Mobile, Logomarca e Busca */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          aria-label="Abrir menu lateral"
          className="p-2 text-slate-500 rounded-lg hover:text-slate-800 hover:bg-slate-100 lg:hidden focus:outline-none"
        >
          <Menu className="w-5 h-5" />
        </button>

        <img
          src={`${import.meta.env.BASE_URL}logoTicetflow.jpeg`}
          alt="TicketFlow"
          className="h-8 sm:h-10 w-auto object-contain shrink-0"
        />

        {/* Campo de Busca Rápida */}
        <div className="relative hidden md:block w-72 lg:w-96">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Buscar chamados, assuntos, clientes..."
            className="w-full py-1.5 pl-9 pr-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Ações: Notificações e Usuário */}
      <div className="flex items-center gap-3">
        {/* Notificações */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserMenu(false);
            }}
            aria-label="Notificações"
            className="relative p-2 text-slate-600 rounded-lg hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 w-80 sm:w-96 mt-2 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Notificações
                </span>
                <span className="text-[11px] font-medium text-blue-600 hover:underline cursor-pointer">
                  Marcar como lidas
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {notifications.map((n) => (
                  <div key={n.id} className="p-3 hover:bg-slate-50 flex items-start gap-3">
                    <div className="mt-0.5">
                      {n.tipo === 'alerta' ? (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-900">{n.titulo}</p>
                      <p className="text-xs text-slate-600">{n.mensagem}</p>
                      <span className="text-[10px] text-slate-400 mt-1 block">{n.tempo}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-slate-200 hidden sm:block" />

        {/* Usuário e Logout */}
        <div className="relative">
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifications(false);
            }}
            className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs ring-2 ring-blue-200/60">
              {currentUser?.nome ? currentUser.nome.charAt(0).toUpperCase() : 'U'}
            </div>

            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-slate-900 leading-tight">
                {currentUser?.nome || 'Usuário'}
              </div>
              <div className="text-[11px] font-medium text-slate-500">
                {currentUser?.role || 'Gestor'}
              </div>
            </div>

            <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block" />
          </button>

          {/* Dropdown Menu */}
          {showUserMenu && (
            <div className="absolute right-0 w-52 mt-2 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900">{currentUser?.nome}</p>
                <p className="text-[11px] text-slate-500 truncate">{currentUser?.email}</p>
              </div>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4 text-red-500" />
                Sair do Sistema
              </button>
            </div>
          )}
        </div>

        {/* Botão de Logout Direto no Header para acesso imediato */}
        <button
          onClick={handleLogout}
          title="Sair do sistema"
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sair</span>
        </button>
      </div>
    </header>
  );
};
