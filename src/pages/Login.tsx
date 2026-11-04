/**
 * TicketFlow - Tela de Login v1.5.0
 * Autenticação via Supabase Auth com Tema Claro Estrito e Recuperação/Redefinição de Senha
 * Identidade visual oficial TicketFlow integrada
 */
import React, { useState } from 'react';
import {
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck,
  KeyRound
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';

interface LoginProps {
  onSuccess?: () => void;
  onNavigateRegister?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSuccess, onNavigateRegister }) => {
  const { authError, setAuthError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estados para Redefinição / Recuperação de Senha
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);
  const [resetErrorMsg, setResetErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setAuthError(null);

    if (!email.trim() || !password) {
      setErrorMessage('Por favor, informe seu e-mail e senha.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials') || error.message.includes('invalid_credentials')) {
          throw new Error('E-mail ou senha incorretos. Verifique suas credenciais.');
        } else if (error.message.includes('Email not confirmed')) {
          throw new Error('E-mail ainda não confirmado. Por favor, cheque sua caixa de entrada.');
        } else {
          throw new Error(error.message);
        }
      }

      if (data.session) {
        // Validação de segurança imediata de perfil
        const { data: profileCheck, error: pError } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('id', data.session.user.id)
          .maybeSingle();

        if (pError || !profileCheck) {
          const failMsg = pError
            ? `Falha de permissão ao consultar perfil: ${pError.message}`
            : 'Falha de permissão: Perfil não localizado na base corporativa.';
          setAuthError(failMsg);
          await supabase.auth.signOut();
          throw new Error(failMsg);
        }

        if (onSuccess) {
          onSuccess();
        } else {
          window.location.href = '/';
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao realizar login.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetErrorMsg(null);
    setResetSuccessMsg(null);

    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      setResetErrorMsg('Por favor, informe seu e-mail corporativo cadastrado.');
      return;
    }

    setResetLoading(true);
    try {
      const result = await dataService.requestPasswordRecovery(resetEmail);
      if (result.success) {
        setResetSuccessMsg(result.message);
        setEmail(resetEmail.trim());
      } else {
        setResetErrorMsg(result.message);
      }
    } catch (err: any) {
      setResetErrorMsg(err.message || 'Não foi possível enviar a redefinição de senha.');
    } finally {
      setResetLoading(false);
    }
  };

  const activeDisplayError = errorMessage || authError;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans antialiased text-slate-900">
      {/* Top Header Branding */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
        <img
          src={`${import.meta.env.BASE_URL}logoTicetflow.jpeg`}
          alt="TicketFlow"
          className="h-14 sm:h-16 w-auto mx-auto mb-3 object-contain"
        />
        <p className="mt-1.5 text-xs sm:text-sm text-slate-600">
          {isResetMode ? (
            'Recuperação de acesso à plataforma corporativa'
          ) : (
            <>
              Mais organização, agilidade e controle para seus atendimentos.
              <br />
              Tudo em uma única plataforma.
            </>
          )}
        </p>
      </div>

      {/* Card Principal */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-sm border border-slate-200 rounded-2xl">
          {isResetMode ? (
            /* Modo Redefinição de Senha */
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Redefinir Senha</h2>
                  <p className="text-[11px] text-slate-500">
                    Informe seu e-mail para receber uma nova senha de acesso
                  </p>
                </div>
              </div>

              {resetErrorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{resetErrorMsg}</span>
                </div>
              )}

              {resetSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-emerald-800 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Solicitação Enviada!</span>
                    <span className="text-emerald-700 mt-0.5 block">{resetSuccessMsg}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handlePasswordRecovery} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    E-mail Cadastrado
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="seu.email@empresa.com.br"
                      required
                      autoFocus
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
                >
                  {resetLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Enviando nova senha...</span>
                    </>
                  ) : (
                    <>
                      <span>Enviar Nova Senha por E-mail</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(false);
                    setResetErrorMsg(null);
                    setResetSuccessMsg(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar para o Login</span>
                </button>
              </div>
            </div>
          ) : (
            /* Modo Login Padrão */
            <>
              {activeDisplayError && (
                <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-xs font-medium animate-in fade-in duration-200">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold block">Falha de Autenticação / Permissão</span>
                    <span className="text-rose-700">{activeDisplayError}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    E-mail de Acesso
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu.email@empresa.com.br"
                      required
                      autoFocus
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setResetEmail(email);
                        setResetErrorMsg(null);
                        setResetSuccessMsg(null);
                        setIsResetMode(true);
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline focus:outline-none"
                    >
                      Esqueceu sua senha?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full pl-9 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Autenticando...</span>
                    </>
                  ) : (
                    <>
                      <span>Entrar no Painel</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Acesso seguro com isolamento por empresa</span>
          </div>
        </div>

        {/* Link para Cadastro */}
        <div className="text-center mt-6">
          <p className="text-xs text-slate-600">
            Sua empresa ainda não possui conta?{' '}
            <button
              type="button"
              onClick={onNavigateRegister}
              className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Iniciar Trial de 7 Dias Grátis
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
