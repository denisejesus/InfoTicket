/**
 * InfoTicket - AuthContext v1.14.0
 * Contexto de Autenticação e Gestão de Sessão Multi-tenant Supabase
 * Suporte a Context Switcher para Super Admin (activeCompanyId)
 * Feedback visual de alerta para inconsistências de perfil e proteção contra sessão fantasma
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { AlertCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Profile, Company } from '../types/database';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  company: Company | null;
  activeCompanyId: string | null;
  setActiveCompanyId: (companyId: string) => void;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  setAuthError: (msg: string | null) => void;
  signOut: () => Promise<void>;
  refreshTenantData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Busca dados de Perfil e Empresa para o usuário autenticado
  const fetchUserData = async (currentUserId: string): Promise<boolean> => {
    try {
      // 1. Busca perfil do usuário
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(`
          *,
          client_organization:client_organizations(id, nome)
        `)
        .eq('id', currentUserId)
        .maybeSingle();

      if (profileError) {
        console.warn('Erro ao carregar perfil do usuário:', profileError.message);
        setAuthError(`Falha de permissão ao carregar perfil: ${profileError.message}`);
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setProfile(null);
        setCompany(null);
        setActiveCompanyIdState(null);
        return false;
      }

      // Se a consulta não retornar perfil (usuário deletado ou inexistente em profiles)
      // Exibe feedback visual antes de deslogar
      if (!profileData) {
        console.warn('⚠️ Sessão fantasma detectada: Usuário autenticado no Auth mas sem registro na tabela profiles. Forçando logout...');
        setAuthError('Falha de permissão: Perfil de usuário não localizado no sistema corporativo.');
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setProfile(null);
        setCompany(null);
        setActiveCompanyIdState(null);
        return false;
      }

      setAuthError(null);
      setProfile(profileData);

      // Define a empresa ativa inicial se ainda não selecionada
      const targetCompanyId = activeCompanyId || profileData.company_id;
      setActiveCompanyIdState(targetCompanyId);

      // 2. Busca empresa ativa vinculada
      if (targetCompanyId) {
        const { data: companyData, error: companyError } = await supabase
          .from('companies')
          .select('*')
          .eq('id', targetCompanyId)
          .maybeSingle();

        if (companyError) {
          console.warn('Erro ao carregar empresa ativa:', companyError.message);
          setCompany(null);
        } else {
          setCompany(companyData);
        }
      }
      return true;
    } catch (err) {
      console.error('Falha inesperada ao sincronizar sessão multi-tenant:', err);
      setAuthError('Falha de comunicação com o servidor ao consultar perfil.');
      return false;
    }
  };

  // Permite ao Super Admin alternar a empresa ativa em tempo real
  const setActiveCompanyId = async (newCompanyId: string) => {
    setActiveCompanyIdState(newCompanyId);
    try {
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', newCompanyId)
        .maybeSingle();

      if (!companyError && companyData) {
        setCompany(companyData);
      }
    } catch (err) {
      console.error('Erro ao alternar contexto da empresa ativa:', err);
    }
  };

  const refreshTenantData = async () => {
    if (user?.id) {
      await fetchUserData(user.id);
    }
  };

  useEffect(() => {
    // 1. Obtém sessão inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    // 2. Escuta mudanças na autenticação (login, logout, refresh de token)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        await fetchUserData(newSession.user.id);
      } else {
        setProfile(null);
        setCompany(null);
        setActiveCompanyIdState(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setCompany(null);
    setActiveCompanyIdState(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        company,
        activeCompanyId,
        setActiveCompanyId,
        session,
        loading,
        authError,
        setAuthError,
        signOut,
        refreshTenantData,
      }}
    >
      {/* Toast / Alerta de Erro de Permissão do Auth no topo da aplicação */}
      {authError && (
        <div className="fixed top-4 right-4 z-50 max-w-md w-full animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-white border-l-4 border-rose-500 rounded-xl shadow-lg border border-slate-200 p-4 flex items-start gap-3">
            <div className="p-1 rounded-full bg-rose-50 text-rose-600 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-slate-900 tracking-tight">Acesso Interrompido</h4>
              <p className="text-xs text-rose-700 mt-0.5 leading-relaxed font-medium">{authError}</p>
            </div>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
