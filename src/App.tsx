/**
 * TicketFlow - Aplicação Principal v1.8.0
 * Gerenciamento de Rotas Públicas (/login, /register) e Rotas Protegidas com Painel Master Infocast (/admin), Relatórios (/relatorios), RBAC (/usuarios) e Detalhes (/tickets/:id)
 */
import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Sidebar, NavItem } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { Tickets } from './pages/Tickets';
import { TicketDetails } from './pages/TicketDetails';
import { UsersPage } from './pages/Users';
import { Customers } from './pages/Customers';
import { SettingsPage } from './pages/Settings';
import { Register } from './pages/Register';
import { Login } from './pages/Login';
import { GlobalAdmin } from './pages/GlobalAdmin';
import { ProfilePage } from './pages/Profile';
import { ReportsPage } from './pages/Reports';

type AppRoute = 'app' | 'login' | 'register' | 'admin';

function AppContent() {
  const { user, profile, company, signOut } = useAuth();
  const isSuperAdmin = profile?.role === 'Super Admin';
  const isGestorOuGerente = profile?.role === 'Gestor' || profile?.role === 'Gerente' || isSuperAdmin;

  // Helper para normalizar o caminho removendo a base /ticketflow se presente
  const getRelativePath = (fullPath: string) => {
    let p = fullPath;
    if (p.startsWith('/ticketflow')) {
      p = p.substring('/ticketflow'.length);
    }
    return p.startsWith('/') ? p : '/' + p;
  };

  // Extrai ID do ticket caso a URL seja /tickets/:id ou /ticketflow/tickets/:id
  const getTicketIdFromPath = (path: string) => {
    const rel = getRelativePath(path);
    const match = rel.match(/^\/tickets\/([a-zA-Z0-9-]+)$/);
    return match ? match[1] : null;
  };

  const getBasePath = () => {
    return window.location.pathname.startsWith('/ticketflow') ? '/ticketflow' : '';
  };

  // Controle de rota pública vs privada com base na URL
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => {
    const rel = getRelativePath(window.location.pathname);
    if (rel === '/register') return 'register';
    if (rel === '/login') return 'login';
    if (rel === '/admin') return 'admin';
    return 'app';
  });

  const [currentTab, setCurrentTab] = useState<NavItem>(() => {
    const rel = getRelativePath(window.location.pathname);
    if (rel === '/admin') return 'administracao-global';
    if (rel === '/relatorios' || rel === '/reports') return 'relatorios';
    if (rel === '/usuarios') return 'usuarios';
    if (rel === '/settings' || rel === '/configuracoes') return 'configuracoes';
    return 'painel';
  });

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(() => {
    return getTicketIdFromPath(window.location.pathname);
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sincroniza histórico do navegador com navegação de rotas e rotas dinâmicas
  useEffect(() => {
    const handlePopState = () => {
      const fullPath = window.location.pathname;
      const rel = getRelativePath(fullPath);
      const ticketId = getTicketIdFromPath(fullPath);

      if (ticketId) {
        setCurrentRoute('app');
        setCurrentTab('meus-chamados');
        setSelectedTicketId(ticketId);
        return;
      }

      setSelectedTicketId(null);

      if (rel === '/register') {
        setCurrentRoute('register');
      } else if (rel === '/login') {
        setCurrentRoute('login');
      } else if (rel === '/admin') {
        setCurrentRoute('admin');
        setCurrentTab('administracao-global');
      } else if (rel === '/usuarios') {
        setCurrentRoute('app');
        setCurrentTab('usuarios');
      } else if (rel === '/relatorios' || rel === '/reports') {
        setCurrentRoute('app');
        setCurrentTab('relatorios');
      } else if (rel === '/settings' || rel === '/configuracoes') {
        setCurrentRoute('app');
        setCurrentTab('configuracoes');
      } else {
        setCurrentRoute('app');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (route: AppRoute) => {
    setCurrentRoute(route);
    setSelectedTicketId(null);
    const base = getBasePath();
    let newPath = base ? `${base}/` : '/';
    if (route === 'register') newPath = `${base}/register`;
    if (route === 'login') newPath = `${base}/login`;
    if (route === 'admin') newPath = `${base}/admin`;

    if (window.location.pathname !== newPath) {
      window.history.pushState({}, '', newPath);
    }
  };

  const handleNavigateTab = (tab: NavItem) => {
    setCurrentTab(tab);
    setSelectedTicketId(null);
    const base = getBasePath();
    if (tab === 'administracao-global') {
      navigateTo('admin');
    } else {
      navigateTo('app');
      const rel = getRelativePath(window.location.pathname);
      if (tab === 'usuarios' && rel !== '/usuarios') {
        window.history.pushState({}, '', `${base}/usuarios`);
      } else if (tab === 'relatorios' && rel !== '/relatorios') {
        window.history.pushState({}, '', `${base}/relatorios`);
      } else if (tab === 'configuracoes' && rel !== '/settings') {
        window.history.pushState({}, '', `${base}/settings`);
      } else if (tab !== 'usuarios' && tab !== 'relatorios' && tab !== 'configuracoes' && rel !== '/' && rel !== '') {
        window.history.pushState({}, '', base ? `${base}/` : '/');
      }
    }
  };

  const handleOpenTicket = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setCurrentTab('meus-chamados');
    setCurrentRoute('app');
    const base = getBasePath();
    const newPath = `${base}/tickets/${ticketId}`;
    if (window.location.pathname !== newPath) {
      window.history.pushState({}, '', newPath);
    }
  };

  const handleBackToTickets = () => {
    setSelectedTicketId(null);
    setCurrentTab('meus-chamados');
    const base = getBasePath();
    const target = base ? `${base}/` : '/';
    if (window.location.pathname !== target) {
      window.history.pushState({}, '', target);
    }
  };

  // 1. Rota Pública: Cadastro (/register)
  if (currentRoute === 'register') {
    return (
      <Register
        onSuccess={() => {
          navigateTo('login');
        }}
        onNavigateLogin={() => navigateTo('login')}
      />
    );
  }

  // 2. Rota Pública: Login (/login)
  if (currentRoute === 'login') {
    return (
      <Login
        onSuccess={() => {
          navigateTo('app');
        }}
        onNavigateRegister={() => navigateTo('register')}
      />
    );
  }

  // 3. Rota Protegida (Dashboard Shell, Abas Internas e Painel Master)
  const renderContent = () => {
    // Se houver um ticketId selecionado ou na URL, renderiza TicketDetails
    if (selectedTicketId) {
      return (
        <TicketDetails
          ticketId={selectedTicketId}
          onBack={handleBackToTickets}
          activeCompany={company}
        />
      );
    }

    switch (currentTab) {
      case 'administracao-global':
        return isSuperAdmin ? <GlobalAdmin /> : <Dashboard activeCompany={company} onNavigateTab={handleNavigateTab} />;
      case 'painel':
        return <Dashboard activeCompany={company} onNavigateTab={handleNavigateTab} />;
      case 'meus-chamados':
        // Para a Denise / Infocast, lista apenas os tickets da Infocast (isolamento por company_id)
        return (
          <Tickets
            activeCompany={company}
            onSelectTicket={handleOpenTicket}
          />
        );
      case 'usuarios':
        return <UsersPage activeCompany={company} />;
      case 'clientes':
        return <UsersPage activeCompany={company} />;
      case 'relatorios':
        return isGestorOuGerente ? (
          <ReportsPage activeCompany={company} />
        ) : (
          <Dashboard activeCompany={company} onNavigateTab={handleNavigateTab} />
        );
      case 'configuracoes':
        return <SettingsPage />;
      case 'perfil':
        return <ProfilePage />;
      default:
        return <Dashboard activeCompany={company} onNavigateTab={handleNavigateTab} />;
    }
  };

  return (
    <ProtectedRoute onNavigateLogin={() => navigateTo('login')}>
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased text-slate-900">
        {/* Sidebar Fixo na esquerda com suporte ao Painel Master para Super Admin */}
        <Sidebar
          currentTab={currentTab}
          onNavigate={handleNavigateTab}
          isOpen={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
          empresaNome={company?.razao_social || 'TicketFlow Corporativo'}
        />

        {/* Área Direita (Header + Conteúdo Central Main) */}
        <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
          <Header
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            currentUser={profile || undefined}
            onLogout={async () => {
              await signOut();
              navigateTo('login');
            }}
            onNavigateRegister={() => navigateTo('register')}
            onNavigateTab={handleNavigateTab}
          />

          {/* Main: Fundo claro bg-slate-50, tipografia limpa e foco em produtividade */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {renderContent()}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
