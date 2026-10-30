import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';
import { 
  User, 
  Mail, 
  Shield, 
  Bell, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Building2,
  Calendar
} from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user, profile, refreshTenantData, company } = useAuth();

  const [nome, setNome] = useState(profile?.nome || '');
  const [recebeNotificacoes, setRecebeNotificacoes] = useState(profile?.recebe_notificacoes ?? true);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      await dataService.updateProfile(user.id, {
        nome: nome.trim(),
        recebe_notificacoes: recebeNotificacoes,
      });

      await refreshTenantData();
      setSuccessMessage('Perfil atualizado com sucesso!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Erro ao atualizar perfil:', err);
      setErrorMessage(err.message || 'Falha ao atualizar dados do perfil.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Meu Perfil</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Gerencie seus dados pessoais, preferências e configurações de notificação.
        </p>
      </div>

      {/* Alertas */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs text-emerald-800 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-xs text-rose-800 font-medium">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Cartão de Resumo do Usuário */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col items-center text-center">
          <div className="relative mb-4">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.nome}
                className="w-24 h-24 rounded-full object-cover border-2 border-slate-200 shadow-sm"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-2xl border-2 border-blue-200 shadow-sm">
                {profile?.nome?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
          </div>

          <h2 className="text-base font-bold text-slate-900">{profile?.nome}</h2>
          <p className="text-xs text-slate-500 mb-3">{profile?.email}</p>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 mb-4">
            <Shield className="w-3.5 h-3.5" />
            {profile?.role}
          </span>

          <div className="w-full border-t border-slate-100 pt-4 space-y-2 text-left text-xs">
            {company && (
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Building2 className="w-3.5 h-3.5" />
                  Empresa:
                </span>
                <span className="font-semibold text-slate-800 truncate max-w-[150px]">
                  {company.razao_social}
                </span>
              </div>
            )}

            {profile?.criado_em && (
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Calendar className="w-3.5 h-3.5" />
                  Membro desde:
                </span>
                <span className="font-semibold text-slate-800">
                  {new Date(profile.criado_em).toLocaleDateString('pt-BR')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Formulário de Edição */}
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
            Informações do Usuário
          </h3>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nome Completo *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
                  placeholder="Seu nome completo"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                E-mail (somente leitura)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  disabled
                  value={profile?.email || ''}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                O e-mail de acesso é gerenciado pelo Gestor da organização.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Papel / Permissão
              </label>
              <div className="relative">
                <Shield className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  disabled
                  value={profile?.role || ''}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Preferências de Notificação */}
            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-900 mb-3">Preferências de Notificação</h4>
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Receber notificações por e-mail</p>
                    <p className="text-[11px] text-slate-500">
                      Receba alertas quando houver novas mensagens ou movimentações nos seus chamados.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setRecebeNotificacoes(!recebeNotificacoes)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    recebeNotificacoes ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      recebeNotificacoes ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Salvar Alterações</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
