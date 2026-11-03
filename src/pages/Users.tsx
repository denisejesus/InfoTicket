/**
 * TicketFlow - Gestão de Equipe e Clientes (Permissões de Acesso) v1.14.0
 * Controle de Permissões com Isolamento Estrito por Empresa
 * Suporte a Organizações Clientes e Medidor de Força de Senha
 * Acesso exclusivo para Gestor e Super Admin (com visualização permitida para Gerente)
 */
import React, { useEffect, useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Shield, 
  Mail, 
  CheckCircle2, 
  Bell, 
  BellOff, 
  RefreshCw, 
  Search, 
  X, 
  Loader2, 
  AlertCircle, 
  Building2,
  Lock,
  UserCheck,
  Plus,
  Edit2,
  KeyRound,
  UserX,
  Check,
  Phone
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';
import { Profile, Company, UserRole, ClientOrganization } from '../types/database';
import { PasswordStrengthMeter, validatePasswordStrength } from '../components/PasswordStrengthMeter';

interface UsersPageProps {
  activeCompany?: Company | null;
}

export const UsersPage: React.FC<UsersPageProps> = ({ activeCompany }) => {
  const { user, profile, company } = useAuth();
  const currentCompany = activeCompany || company;

  const userRole = profile?.role;
  const isGestor = userRole === 'Gestor';
  const isSuperAdmin = userRole === 'Super Admin';
  const isGerente = userRole === 'Gerente';

  // Gerente tem apenas visualização para apoiar o atendimento a clientes; não pode gerenciar permissões de Gestor
  const canManage = isGestor || isSuperAdmin;
  const canView = isGestor || isSuperAdmin || isGerente;

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [organizations, setOrganizations] = useState<ClientOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'equipe' | 'clientes'>('equipe');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal Novo Usuário
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [role, setRole] = useState<'Gerente' | 'Operador' | 'Cliente'>('Operador');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [newOrgName, setNewOrgName] = useState('');
  const [isCreatingNewOrg, setIsCreatingNewOrg] = useState(false);
  const [recebeNotificacoes, setRecebeNotificacoes] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal de Edição de Usuário (Fase 15 / 16)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('Operador');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal de Redefinição de Senha (Fase 15)
  const [resetPasswordProfile, setResetPasswordProfile] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  // Estado de Inativação / Reativação
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      // Consome profiles e client_organizations; o RLS garante o isolamento pelo company_id
      const [profilesData, orgsData] = await Promise.all([
        dataService.getProfiles(currentCompany?.id),
        dataService.getClientOrganizations(currentCompany?.id),
      ]);
      setProfiles(profilesData);
      setOrganizations(orgsData as ClientOrganization[]);
    } catch (err: any) {
      console.error('Erro ao listar profiles e organizações:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) {
      loadData();
    }
  }, [currentCompany?.id, canView]);

  // Se o role mudar no select do modal, atualiza padrão de notificações
  const handleRoleChange = (newRole: 'Gerente' | 'Operador' | 'Cliente') => {
    setRole(newRole);
    if (newRole === 'Gerente') {
      setRecebeNotificacoes(true);
    }
  };

  const handleOpenModal = (defaultRole?: 'Gerente' | 'Operador' | 'Cliente') => {
    setNome('');
    setEmail('');
    setWhatsapp('');
    const initialRole = defaultRole || (activeTab === 'clientes' ? 'Cliente' : 'Operador');
    setRole(initialRole);
    setSelectedOrgId(organizations.length > 0 ? organizations[0].id : '');
    setIsCreatingNewOrg(false);
    setNewOrgName('');
    setRecebeNotificacoes(initialRole === 'Gerente');
    setFormError(null);
    setSuccessMsg(null);
    setIsModalOpen(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    if (!nome.trim() || !email.trim()) {
      setFormError('Por favor, informe o nome completo e o e-mail do usuário.');
      return;
    }

    if (role === 'Cliente' && !whatsapp.trim()) {
      setFormError('O número de WhatsApp é obrigatório para clientes para integração e notificações via WhatsApp.');
      return;
    }

    if (!currentCompany?.id) {
      setFormError('Empresa não identificada. Não foi possível associar a organização ao usuário.');
      return;
    }

    setSaving(true);
    try {
      let finalOrgId: string | null = null;

      // Se for cliente, processa a vinculação da Organização Cliente (B2B2B)
      if (role === 'Cliente') {
        if (isCreatingNewOrg) {
          if (!newOrgName.trim()) {
            setFormError('Por favor, digite o nome da nova organização cliente.');
            setSaving(false);
            return;
          }
          const createdOrg = await dataService.createClientOrganization({
            company_id: currentCompany.id,
            nome: newOrgName.trim(),
          });
          if (createdOrg) {
            finalOrgId = createdOrg.id;
          }
        } else if (selectedOrgId) {
          finalOrgId = selectedOrgId;
        }
      }

      const result = await dataService.createProfile({
        company_id: currentCompany.id,
        client_organization_id: finalOrgId,
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        whatsapp: whatsapp.trim() || null,
        role: role,
        recebe_notificacoes: recebeNotificacoes,
      });

      setSuccessMsg(`Usuário adicionado com sucesso! Senha temporária gerada: ${result.temporaryPassword} (enviada por e-mail).`);
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccessMsg(null);
      }, 2500);

      await loadData();
    } catch (err: any) {
      console.error('Falha ao adicionar usuário:', err);
      setFormError(err.message || 'Erro ao registrar usuário no banco de dados.');
    } finally {
      setSaving(false);
    }
  };

  // 1. Abrir Modal de Edição (Fase 15 / 16)
  const handleOpenEdit = (p: Profile) => {
    setEditingProfile(p);
    setEditNome(p.nome || '');
    setEditWhatsapp(p.whatsapp || '');
    setEditRole(p.role);
    setEditError(null);
  };

  // Salvar Edição
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    if (!editNome.trim()) {
      setEditError('O nome não pode ficar em branco.');
      return;
    }

    if (editRole === 'Cliente' && !editWhatsapp.trim()) {
      setEditError('O número de WhatsApp é obrigatório para clientes para integração e notificações via WhatsApp.');
      return;
    }

    setSavingEdit(true);
    setEditError(null);

    try {
      await dataService.updateProfile(editingProfile.id, {
        nome: editNome.trim(),
        whatsapp: editWhatsapp.trim() || null,
        role: editRole,
      });

      setProfiles((prev) =>
        prev.map((item) =>
          item.id === editingProfile.id
            ? { ...item, nome: editNome.trim(), whatsapp: editWhatsapp.trim() || undefined, role: editRole }
            : item
        )
      );

      setEditingProfile(null);
    } catch (err: any) {
      console.error('Erro ao editar usuário:', err);
      setEditError(err.message || 'Erro ao atualizar dados do usuário.');
    } finally {
      setSavingEdit(false);
    }
  };

  // 2. Inativar / Ativar Usuário (Fase 15)
  const handleToggleStatus = async (p: Profile) => {
    const isCurrentlyActive = p.status !== 'Inativo';
    const newStatus = isCurrentlyActive ? 'Inativo' : 'Ativo';
    const actionLabel = isCurrentlyActive ? 'inativar' : 'reativar';

    if (!window.confirm(`Deseja realmente ${actionLabel} o acesso do usuário ${p.nome || p.email}?`)) {
      return;
    }

    setStatusLoadingId(p.id);
    try {
      await dataService.toggleProfileStatus(p.id, newStatus);
      setProfiles((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, status: newStatus } : item))
      );
    } catch (err: any) {
      console.error(`Erro ao ${actionLabel} usuário:`, err);
      alert(`Falha ao alterar status do usuário: ${err.message || 'Erro no banco.'}`);
    } finally {
      setStatusLoadingId(null);
    }
  };

  // 3. Abrir Modal de Redefinir Senha (Fase 15)
  const handleOpenResetPassword = (p: Profile) => {
    setResetPasswordProfile(p);
    setNewPassword('');
    setConfirmPassword('');
    setResetError(null);
    setResetSuccess(null);
  };

  // Salvar Nova Senha via Edge Function (Fase 15)
  const handleSaveResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordProfile) return;

    if (!newPassword) {
      setResetError('Por favor, informe a nova senha.');
      return;
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.isValid) {
      setResetError('A nova senha deve ter no mínimo 8 caracteres, mesclando letras e números.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError('As senhas informadas não coincidem.');
      return;
    }

    setResettingPassword(true);
    setResetError(null);
    setResetSuccess(null);

    try {
      const result = await dataService.resetUserPassword(
        resetPasswordProfile.id, 
        newPassword,
        resetPasswordProfile.email
      );

      if (result.success) {
        setResetSuccess(`Senha alterada com sucesso para ${resetPasswordProfile.nome || resetPasswordProfile.email}!`);
        setTimeout(() => {
          setResetPasswordProfile(null);
        }, 1500);
      } else {
        setResetError(result.message || 'Não foi possível redefinir a senha.');
      }
    } catch (err: any) {
      console.error('Erro ao redefinir senha:', err);
      setResetError(err.message || 'Erro ao conectar à Edge Function.');
    } finally {
      setResettingPassword(false);
    }
  };

  if (!canView) {
    return (
      <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl shadow-sm">
        <Lock className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Acesso Restrito</h2>
        <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
          Esta área é restrita para <strong>Gestores</strong>, <strong>Gerentes</strong> ou <strong>Super Administradores</strong>.
        </p>
      </div>
    );
  }

  // Separação em abas: Equipe Interna vs Clientes
  const teamProfiles = profiles.filter(
    (p) => p.role === 'Gestor' || p.role === 'Gerente' || p.role === 'Operador' || p.role === 'Operador/Funcionário' || p.role === 'Super Admin'
  );
  const customerProfiles = profiles.filter((p) => p.role === 'Cliente');

  // Filtro de Equipe
  const filteredTeamList = teamProfiles.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      (p.nome && p.nome.toLowerCase().includes(term)) ||
      (p.email && p.email.toLowerCase().includes(term)) ||
      (p.role && p.role.toLowerCase().includes(term))
    );
  });

  // Filtro de Clientes
  const filteredCustomerList = customerProfiles.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      (p.nome && p.nome.toLowerCase().includes(term)) ||
      (p.email && p.email.toLowerCase().includes(term)) ||
      (p.client_organization?.nome && p.client_organization.nome.toLowerCase().includes(term))
    );
  });

  // Agrupamento de clientes por organização (B2B2B - Fase 15)
  const groupedCustomers = filteredCustomerList.reduce((acc, client) => {
    const orgName = client.client_organization?.nome || 'Sem Organização Vinculada';
    if (!acc[orgName]) {
      acc[orgName] = [];
    }
    acc[orgName].push(client);
    return acc;
  }, {} as Record<string, Profile[]>);

  return (
    <div className="space-y-6 font-sans antialiased text-slate-900">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
              Níveis de Acesso
            </span>
            <span className="text-xs text-slate-500 font-medium">Empresas e Organizações</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Gestão de Equipe & Clientes
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Gerencie os membros da equipe técnica e as contas de clientes da organização{' '}
            <strong className="text-slate-800">{currentCompany?.razao_social}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          {canManage && (
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-blue-500/20 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Adicionar Usuário</span>
            </button>
          )}
        </div>
      </div>

      {/* Abas e Contadores */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('equipe')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'equipe'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Equipe Interna</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] ${
                activeTab === 'equipe' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {teamProfiles.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('clientes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'clientes'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Clientes & Usuários Finais</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] ${
                activeTab === 'clientes' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {customerProfiles.length}
            </span>
          </button>
        </div>

        {/* Campo de Busca */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Tabela de Usuários */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            <span>Carregando usuários do tenant...</span>
          </div>
        ) : (activeTab === 'equipe' ? filteredTeamList.length === 0 : filteredCustomerList.length === 0) ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">
              Nenhum usuário encontrado em {activeTab === 'equipe' ? 'Equipe Interna' : 'Clientes'}.
            </p>
            {canManage && (
              <button
                onClick={() => handleOpenModal()}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Adicionar Primeiro Usuário</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Nome & Identificação</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4">Papel (Role)</th>
                  <th className="py-3 px-4">Status</th>
                  {activeTab === 'clientes' && (
                    <th className="py-3 px-4">Empresa Cliente (Organização)</th>
                  )}
                  <th className="py-3 px-4">Notificações</th>
                  <th className="py-3 px-4">Data Cadastro</th>
                  {canManage && <th className="py-3 px-4 text-right">Ações</th>}
                </tr>
              </thead>
              {activeTab === 'equipe' ? (
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredTeamList.map((p) => {
                    const isCurrent = p.id === user?.id;
                    const isInactive = (p.status || 'Ativo') === 'Inativo';

                    return (
                      <tr key={p.id} className={`hover:bg-slate-50/60 transition-colors ${isInactive ? 'opacity-60 bg-slate-50/30' : ''}`}>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            {p.avatar_url ? (
                              <img
                                src={p.avatar_url}
                                alt={p.nome || 'Avatar'}
                                className="w-9 h-9 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                                {p.nome?.charAt(0).toUpperCase() || 'U'}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900">{p.nome}</span>
                                {isCurrent && (
                                  <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 text-[9px] font-bold rounded">
                                    Você
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-mono text-slate-400">ID: {p.id.substring(0, 13)}...</span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span>{p.email}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                              p.role === 'Super Admin'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : p.role === 'Gestor'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : p.role === 'Gerente'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : p.role === 'Cliente'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            <Shield className="w-3 h-3" />
                            {p.role}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isInactive
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isInactive ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                            {p.status || 'Ativo'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {p.recebe_notificacoes ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              <Bell className="w-3 h-3 text-emerald-500" />
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                              <BellOff className="w-3 h-3 text-slate-400" />
                              Desativado
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                          {p.criado_em ? new Date(p.criado_em).toLocaleDateString('pt-BR') : '-'}
                        </td>

                        {canManage && (
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(p)}
                                title="Editar Nome e Papel"
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 rounded-lg transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenResetPassword(p)}
                                title="Redefinir Senha do Usuário"
                                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 border border-slate-200 rounded-lg transition-colors"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>
                              {!isCurrent && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(p)}
                                  disabled={statusLoadingId === p.id}
                                  title={isInactive ? 'Reativar Usuário' : 'Inativar Usuário'}
                                  className={`p-1.5 border rounded-lg transition-colors ${
                                    isInactive
                                      ? 'text-emerald-600 hover:bg-emerald-50 border-emerald-200'
                                      : 'text-rose-500 hover:text-rose-700 hover:bg-rose-50 border-slate-200'
                                  }`}
                                >
                                  {statusLoadingId === p.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : isInactive ? (
                                    <Check className="w-3.5 h-3.5" />
                                  ) : (
                                    <UserX className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              ) : (
                /* Aba de Clientes Agrupados por Organização */
                <tbody className="divide-y divide-slate-100 text-xs">
                  {Object.entries(groupedCustomers).map(([orgTitle, clientList]) => (
                    <React.Fragment key={orgTitle}>
                      {/* Divisor / Cabeçalho da Organização */}
                      <tr className="bg-slate-100/80 border-y border-slate-200">
                        <td colSpan={canManage ? 7 : 6} className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-blue-600" />
                            <span className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                              {orgTitle}
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                              {clientList.length} {clientList.length === 1 ? 'cliente' : 'clientes'}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {clientList.map((p) => {
                        const isCurrent = p.id === user?.id;
                        const isInactive = (p.status || 'Ativo') === 'Inativo';

                        return (
                          <tr key={p.id} className={`hover:bg-slate-50/60 transition-colors ${isInactive ? 'opacity-60 bg-slate-50/30' : ''}`}>
                            <td className="py-3.5 px-4 pl-8">
                              <div className="flex items-center gap-3">
                                {p.avatar_url ? (
                                  <img
                                    src={p.avatar_url}
                                    alt={p.nome || 'Avatar'}
                                    className="w-9 h-9 rounded-full object-cover border border-slate-200"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">
                                    {p.nome?.charAt(0).toUpperCase() || 'C'}
                                  </div>
                                )}
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-900">{p.nome}</span>
                                    {isCurrent && (
                                      <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 text-[9px] font-bold rounded">
                                        Você
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400">ID: {p.id.substring(0, 13)}...</span>
                                </div>
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                <span>{p.email}</span>
                              </div>
                              {p.whatsapp && (
                                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-emerald-700 font-medium">
                                  <Phone className="w-3 h-3 text-emerald-600" />
                                  <span>{p.whatsapp}</span>
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">
                                <Shield className="w-3 h-3" />
                                {p.role}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  isInactive
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isInactive ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                                {p.status || 'Ativo'}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {p.client_organization?.nome ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-800 rounded-md font-medium text-xs border border-slate-200">
                                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                                  {p.client_organization.nome}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs italic">Não vinculada</span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {p.recebe_notificacoes ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                  <Bell className="w-3 h-3 text-emerald-500" />
                                  Ativo
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                                  <BellOff className="w-3 h-3 text-slate-400" />
                                  Desativado
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                              {p.criado_em ? new Date(p.criado_em).toLocaleDateString('pt-BR') : '-'}
                            </td>

                            {canManage && (
                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEdit(p)}
                                    title="Editar Nome e Papel"
                                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 rounded-lg transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenResetPassword(p)}
                                    title="Redefinir Senha do Usuário"
                                    className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 border border-slate-200 rounded-lg transition-colors"
                                  >
                                    <KeyRound className="w-3.5 h-3.5" />
                                  </button>
                                  {!isCurrent && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleStatus(p)}
                                      disabled={statusLoadingId === p.id}
                                      title={isInactive ? 'Reativar Usuário' : 'Inativar Usuário'}
                                      className={`p-1.5 border rounded-lg transition-colors ${
                                        isInactive
                                          ? 'text-emerald-600 hover:bg-emerald-50 border-emerald-200'
                                          : 'text-rose-500 hover:text-rose-700 hover:bg-rose-50 border-slate-200'
                                      }`}
                                    >
                                      {statusLoadingId === p.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : isInactive ? (
                                        <Check className="w-3.5 h-3.5" />
                                      ) : (
                                        <UserX className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Modal Adicionar Novo Usuário */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col text-slate-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-bold">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-tight">Adicionar Novo Usuário</h2>
                  <p className="text-[11px] text-slate-500 truncate max-w-xs">{currentCompany?.razao_social}</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Nome */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Ana Clara Souza"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder-slate-400"
                />
              </div>

              {/* E-mail */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  E-mail Corporativo *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com.br"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder-slate-400"
                />
              </div>

              {/* Número de WhatsApp (Fase 16) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Número de WhatsApp {role === 'Cliente' ? <strong className="text-rose-500">*</strong> : '(Opcional)'}</span>
                  </span>
                  {role === 'Cliente' && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-bold">
                      Obrigatório para WhatsApp
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  required={role === 'Cliente'}
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="Ex: +5511999998888 ou 11999998888"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder-slate-400"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Utilizado para envio e recebimento de mensagens e abertura de chamados via WhatsApp.
                </p>
              </div>

              {/* Role Select */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Papel de Acesso (Role) *
                </label>
                <select
                  value={role}
                  onChange={(e) => handleRoleChange(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="Operador">Operador (Atendimento e resolução de chamados)</option>
                  <option value="Gerente">Gerente (Supervisão operacional e relatórios)</option>
                  <option value="Cliente">Cliente (Abertura e acompanhamento de tickets)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  O Gestor possui permissão para definir os papéis de Gerente, Operador e Cliente.
                </p>
              </div>

              {/* B2B2B: Seleção de Organização Cliente quando a role for Cliente */}
              {role === 'Cliente' && (
                <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" />
                      <span>Empresa Cliente / Organização (B2B2B) *</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCreatingNewOrg(!isCreatingNewOrg)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      {isCreatingNewOrg ? 'Selecionar existente' : '+ Nova Organização'}
                    </button>
                  </div>

                  {isCreatingNewOrg ? (
                    <div>
                      <input
                        type="text"
                        value={newOrgName}
                        onChange={(e) => setNewOrgName(e.target.value)}
                        placeholder="Ex: Casa Eloy, Padaria Central..."
                        className="w-full px-3 py-2 text-xs bg-white border border-blue-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Cadastre e vincule a organização cliente automaticamente para este tenant.
                      </p>
                    </div>
                  ) : (
                    <div>
                      {organizations.length === 0 ? (
                        <div className="text-xs text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                          Nenhuma organização cadastrada. Clique em "+ Nova Organização" acima.
                        </div>
                      ) : (
                        <select
                          value={selectedOrgId}
                          onChange={(e) => setSelectedOrgId(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="">Selecione a empresa cliente...</option>
                          {organizations.map((org) => (
                            <option key={org.id} value={org.id}>
                              {org.nome}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Toggle de Notificações */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">
                    Notificações por E-mail
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Receber alertas de abertura e atualizações de chamados
                  </span>
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

              {/* Ações do Modal */}
              <div className="pt-3 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Cadastrar Usuário</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Editar Usuário (Nome e Role) */}
      {editingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col text-slate-900">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-bold">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-tight">Editar Usuário</h2>
                  <p className="text-[11px] text-slate-500">{editingProfile.email}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingProfile(null)}
                disabled={savingEdit}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Número de WhatsApp {editRole === 'Cliente' ? <strong className="text-rose-500">*</strong> : '(Opcional)'}</span>
                  </span>
                  {editRole === 'Cliente' && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-bold">
                      Obrigatório para WhatsApp
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  required={editRole === 'Cliente'}
                  value={editWhatsapp}
                  onChange={(e) => setEditWhatsapp(e.target.value)}
                  placeholder="Ex: +5511999998888 ou 11999998888"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Papel (Role) *</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
                >
                  <option value="Operador">Operador (Atendente / Suporte)</option>
                  <option value="Gerente">Gerente (Supervisão)</option>
                  <option value="Gestor">Gestor (Administrador da Empresa)</option>
                  <option value="Cliente">Cliente (Usuário Final / Solicitante)</option>
                  {isSuperAdmin && <option value="Super Admin">Super Admin (Global)</option>}
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  disabled={savingEdit}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50"
                >
                  {savingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Salvar Alterações</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Redefinir Senha */}
      {resetPasswordProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col text-slate-900">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-700 font-bold">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-tight">Redefinir Senha</h2>
                  <p className="text-[11px] text-slate-500">{resetPasswordProfile.nome} ({resetPasswordProfile.email})</p>
                </div>
              </div>
              <button
                onClick={() => setResetPasswordProfile(null)}
                disabled={resettingPassword}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveResetPassword} className="p-6 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <p className="font-semibold mb-1">Atenção:</p>
                <p>
                  Como não há recuperação por e-mail na tela de login, você pode definir diretamente a nova senha de acesso deste usuário.
                </p>
              </div>

              {resetError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{resetError}</span>
                </div>
              )}

              {resetSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{resetSuccess}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Nova Senha * (mínimo 8 caracteres, letras e números)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Digite a nova senha segura..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-900"
                />
                <PasswordStrengthMeter password={newPassword} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Confirmar Nova Senha *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme a nova senha..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-900"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setResetPasswordProfile(null)}
                  disabled={resettingPassword}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resettingPassword || !validatePasswordStrength(newPassword).isValid || newPassword !== confirmPassword}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resettingPassword ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Atualizando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Definir Nova Senha</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
