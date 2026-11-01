/**
 * InfoTicket - ProtectedRoute v1.2.0
 * Guarda de Rota Privada com Verificação de Autenticação e Bloqueio de Trial Expirado
 */
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  AlertTriangle, 
  Loader2, 
  CreditCard, 
  LogOut, 
  Clock, 
  PhoneCall, 
  ShieldAlert 
} from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  onNavigateLogin: () => void;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, onNavigateLogin }) => {
  const { user, company, loading, signOut } = useAuth();

  // 1. Estado de Carregamento Inicial de Sessão
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans antialiased">
        <div className="flex flex-col items-center gap-3 p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-xs font-semibold text-slate-600">Verificando credenciais e tenant...</p>
        </div>
      </div>
    );
  }

  // 2. Não Autenticado: Redireciona para o Login
  if (!user) {
    onNavigateLogin();
    return null;
  }

  // 3. Verificação da Validade do Trial
  // Se a data atual for maior que o vencimento e o status da empresa não for ativo ('Ativo' / 'ativo')
  const isTrialExpired = (): boolean => {
    if (!company) return false;

    const statusNormalizado = (company.status || '').toLowerCase();

    // Se a empresa já estiver formalmente 'Ativa' (assinante pagante), nunca bloqueia por trial
    if (statusNormalizado === 'ativo') {
      return false;
    }

    // Se o status for configurado expressamente como expirado
    if (statusNormalizado === 'expirado') {
      return true;
    }

    // Se houver data de término de trial e a data atual for superior
    if (company.trial_ends_at) {
      const expirationDate = new Date(company.trial_ends_at);
      const now = new Date();
      return now > expirationDate;
    }

    return false;
  };

  if (isTrialExpired()) {
    const dataFormatada = company?.trial_ends_at
      ? new Date(company.trial_ends_at).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Recente';

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 font-sans antialiased text-slate-900">
        <div className="max-w-lg w-full bg-white border border-rose-200 shadow-sm rounded-2xl p-6 sm:p-8 text-center animate-in fade-in duration-300">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 mb-4 shadow-sm">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Período de Teste Expirado
          </h2>

          <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
            O período gratuito de 7 dias de avaliação do TicketFlow para a empresa{' '}
            <strong className="text-slate-900">{company?.razao_social || 'sua empresa'}</strong>{' '}
            encerrou-se em <strong className="text-rose-600">{dataFormatada}</strong>.
          </p>

          <div className="my-6 p-4 bg-slate-50 rounded-xl border border-slate-200 text-left space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Seus dados continuam preservados e seguros</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-normal pl-6">
              Todos os chamados, configurações e perfis de operadores foram mantidos de acordo com a política multi-tenant. Para restabelecer o acesso total, renove sua assinatura.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => {
                alert('Entre em contato com o comercial TicketFlow pelo e-mail contato@ticketflow.com.br ou WhatsApp.');
              }}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-md shadow-blue-500/20 transition-all"
            >
              <CreditCard className="w-4 h-4" />
              <span>Contratar Plano Definitivo</span>
            </button>

            <button
              onClick={() => signOut()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Trocar de Conta</span>
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Dúvidas? Suporte Comercial: (11) 4002-8922</span>
          </div>
        </div>
      </div>
    );
  }

  // 4. Usuário autenticado e Trial ativo: Renderiza a aplicação normalmente
  return <>{children}</>;
};
