/**
 * TicketFlow - Sidebar de Layout Base v1.0.5
 */
import React from 'react';
import { 
  LayoutDashboard, 
  Ticket, 
  Users, 
  Settings, 
  ShieldCheck, 
  Building2,
  Database,
  X
} from 'lucide-react';

export type NavItem = 'painel' | 'meus-chamados' | 'clientes' | 'configuracoes' | 'dev-setup';

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
  empresaNome = 'Acme Corp Brasil',
}) => {
  const menuItems: { id: NavItem; label: string; icon: React.ElementType; badge?: string }[] = [
    {
      id: 'painel',
      label: 'Painel',
      icon: LayoutDashboard,
    },
    {
      id: 'meus-chamados',
      label: 'Meus Chamados',
      icon: Ticket,
      badge: '4',
    },
    {
      id: 'clientes',
      label: 'Clientes',
      icon: Users,
    },
    {
      id: 'configuracoes',
      label: 'Configurações',
      icon: Settings,
    },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Fixo */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col w-64 max-w-[82vw] bg-white border-r border-slate-200 transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 h-16 border-b border-slate-200">
          <div className="flex-1 flex items-center justify-center min-w-0">
            <img
              src={`${import.meta.env.BASE_URL}logoTicetflow.jpeg`}
              alt="TicketFlow"
              className="h-8 w-auto mx-auto object-contain"
            />
          </div>

          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Fechar menu lateral"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg lg:hidden transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Empresa Ativa */}
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

        {/* Navegação Principal */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Navegação
          </div>

          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile?.();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm border border-blue-100'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-blue-600' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                      isActive ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Dev Setup Option */}
          <div className="pt-6">
            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Banco & Conexão
            </div>
            <button
              onClick={() => {
                onNavigate('dev-setup');
                onCloseMobile?.();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'dev-setup'
                  ? 'bg-amber-50 text-amber-900 font-semibold border border-amber-200'
                  : 'text-amber-800/90 hover:bg-amber-50/70'
              }`}
            >
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-amber-600" />
                <span>Status da Conexão</span>
              </div>
              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">
                Dev
              </span>
            </button>
          </div>
        </nav>

        {/* Rodapé da Sidebar */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              TicketFlow Core
            </span>
            <span className="px-1.5 py-0.5 bg-slate-200 font-mono text-[10px] text-slate-700 rounded font-semibold">
              v1.0.5
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
