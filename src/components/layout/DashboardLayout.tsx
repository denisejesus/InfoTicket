import React, { useState } from 'react';
import { Sidebar, NavItem } from './Sidebar';
import { Header } from './Header';
import { Profile } from '../../types/database';

interface DashboardLayoutProps {
  children: React.ReactNode;
  currentTab: NavItem;
  onNavigate: (tab: NavItem) => void;
  currentUser?: Partial<Profile>;
  onLogout?: () => void;
  empresaNome?: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  currentTab,
  onNavigate,
  currentUser,
  onLogout,
  empresaNome,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Sidebar Fixo na esquerda */}
      <Sidebar
        currentTab={currentTab}
        onNavigate={onNavigate}
        isOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        empresaNome={empresaNome}
      />

      {/* Área da Direita (Header + Main) */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        <Header
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          currentUser={currentUser}
          onLogout={onLogout}
        />

        {/* Conteúdo Central Principal */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
