import React from 'react';
import { 
  LayoutDashboard, 
  Ticket, 
  Users, 
  Settings, 
  ShieldCheck, 
  Building2,
  Crown
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export type NavItem = 'painel' | 'meus-chamados' | 'usuarios' | 'clientes' | 'configuracoes' | 'administracao-global' | 'perfil';

interface SidebarProps {
  currentTab: NavItem;
  onNavigate: (tab: NavItem) => void;
  isOpen: boolean;
  onCloseMobile?: () => void;
  empresaNome?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onNavigate,
  isOpen,
  onCloseMobile,
  empresaNome = 'TicketFlow',
}) => {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'Super Admin';
  const isGestorOuGerente = profile?.role === 'Gestor' || profile?.role === 'Gerente' || isSuperAdmin;

  const menuItems: { id: NavItem; label: string; icon: React.ElementType; visible?: boolean }[] = [
    {
      id: 'painel',
      label: 'Painel',
      icon: LayoutDashboard,
    },
    {
      id: 'meus-chamados',
      label: 'Meus Chamados',
      icon: Ticket,
    },
    {
      id: 'usuarios',
      label: 'Equipe & Clientes',
      icon: Users,
      visible: isGestorOuGerente,
    },
    {
      id: 'configuracoes',
      label: 'Configurações',
      icon: Settings,
      visible: isGestorOuGerente,
    },
  ];

  return (
    <>
      {/* Backdrop Mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Menu Lateral Fixo */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col w-64 bg-white border-r border-slate-200 transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header do Logo */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-200">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 text-white font-bold text-sm shadow-sm">
            TF
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold text-slate-900 tracking-tight">TicketFlow</span>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded">
                SaaS B2B
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">Gestão de Chamados</p>
          </div>
        </div>

        {/* Tenant Ativo (Empresa Multi-tenant) */}
        <div className="p-3 mx-4 my-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-[11px] font-medium uppercase tracking-wider">Empresa Ativa</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800 truncate" title={empresaNome}>
              {empresaNome}
            </span>
            <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
              Ativo
            </span>
          </div>
        </div>

        {/* Itens do Menu */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {/* Seção Exclusiva para Super Admin (Master Infocast) */}
          {isSuperAdmin && (
            <div className="mb-3 pb-3 border-b border-slate-100">
              <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-purple-600 flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5" />
                <span>Painel Master Infocast</span>
              </div>
              <button
                onClick={() => {
                  onNavigate('administracao-global');
                  onCloseMobile?.();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  currentTab === 'administracao-global'
                    ? 'bg-purple-50 text-purple-700 font-bold shadow-sm border border-purple-200'
                    : 'text-purple-700 hover:bg-purple-50/70'
                }`}
              >
                <Crown
                  className={`w-4 h-4 transition-colors ${
                    currentTab === 'administracao-global' ? 'text-purple-600' : 'text-purple-500'
                  }`}
                />
                <span>Painel Master</span>
              </button>
            </div>
          )}

          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Menu Operacional
          </div>

          {menuItems.filter(item => item.visible !== false).map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile?.();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm border border-blue-100'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-blue-600' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Rodapé com Versão */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              TicketFlow Core
            </span>
            <span className="px-1.5 py-0.2 bg-slate-200 font-mono text-[10px] text-slate-700 rounded font-semibold">
              v1.10.1
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
