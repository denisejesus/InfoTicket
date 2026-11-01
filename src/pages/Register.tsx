import React, { useState, useRef } from 'react';
import { 
  Building2, 
  MapPin, 
  User, 
  Lock, 
  Mail, 
  Phone, 
  FileText, 
  ArrowRight, 
  ArrowLeft,
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Headphones, 
  ShieldCheck,
  Eye,
  EyeOff
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface RegisterProps {
  onSuccess?: () => void;
  onNavigateLogin?: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onSuccess, onNavigateLogin }) => {
  // Controle de etapas (1: Empresa, 2: Endereço, 3: Gestor)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Estados dos campos do formulário
  const [formData, setFormData] = useState({
    // Dados da Empresa
    razaoSocial: '',
    cnpj: '',
    // Dados de Endereço
    cep: '',
    logradouro: '',
    bairro: '',
    cidade: '',
    estado: '',
    numero: '',
    complemento: '',
    // Dados do Gestor
    nome: '',
    email: '',
    whatsapp: '',
    senha: '',
    confirmarSenha: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Referência para focar no campo Número após a busca automática do ViaCEP
  const numeroInputRef = useRef<HTMLInputElement>(null);

  // Atualiza os valores do formulário
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Máscara e consulta da API ViaCEP
  const handleCepLookup = async () => {
    const rawCep = formData.cep.replace(/\D/g, '');
    if (rawCep.length !== 8) return;

    setLoadingCep(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
      const data = await response.json();

      if (data.erro) {
        setErrorMessage('CEP não encontrado. Por favor, preencha o endereço manualmente.');
        return;
      }

      setFormData((prev) => ({
        ...prev,
        logradouro: data.logradouro || prev.logradouro,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        estado: data.uf || prev.estado,
      }));

      // Foca automaticamente no campo "Número" conforme especificado
      setTimeout(() => {
        numeroInputRef.current?.focus();
      }, 100);
    } catch (err) {
      setErrorMessage('Erro ao consultar o serviço ViaCEP. Verifique sua conexão.');
    } finally {
      setLoadingCep(false);
    }
  };

  // Validação de etapas
  const validateStep = (step: number): boolean => {
    setErrorMessage(null);

    if (step === 1) {
      if (!formData.razaoSocial.trim()) {
        setErrorMessage('Por favor, informe a Razão Social da empresa.');
        return false;
      }
      if (!formData.cnpj.trim()) {
        setErrorMessage('Por favor, informe o CNPJ da empresa.');
        return false;
      }
      return true;
    }

    if (step === 2) {
      if (!formData.cep.trim()) {
        setErrorMessage('Por favor, informe o CEP.');
        return false;
      }
      if (!formData.logradouro.trim() || !formData.cidade.trim() || !formData.estado.trim()) {
        setErrorMessage('Por favor, preencha os dados do endereço.');
        return false;
      }
      if (!formData.numero.trim()) {
        setErrorMessage('Por favor, informe o número do imóvel.');
        numeroInputRef.current?.focus();
        return false;
      }
      return true;
    }

    if (step === 3) {
      if (!formData.nome.trim()) {
        setErrorMessage('Por favor, informe o nome do gestor.');
        return false;
      }
      if (!formData.email.trim() || !formData.email.includes('@')) {
        setErrorMessage('Por favor, informe um e-mail corporativo válido.');
        return false;
      }
      if (!formData.whatsapp.trim()) {
        setErrorMessage('Por favor, informe o número de WhatsApp para contato.');
        return false;
      }
      if (formData.senha.length < 6) {
        setErrorMessage('A senha deve conter no mínimo 6 caracteres.');
        return false;
      }
      if (formData.senha !== formData.confirmarSenha) {
        setErrorMessage('A confirmação de senha não confere.');
        return false;
      }
      return true;
    }

    return true;
  };

  // Submissão Sequencial no Supabase
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(3)) return;

    setLoadingSubmit(true);
    setErrorMessage(null);

    try {
      // -------------------------------------------------------------
      // Passo A: Cadastro no Supabase Auth
      // -------------------------------------------------------------
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.senha,
        options: {
          data: {
            nome: formData.nome.trim(),
            whatsapp: formData.whatsapp.trim(),
          },
        },
      });

      if (authError) {
        throw new Error(`Falha no cadastro de autenticação: ${authError.message}`);
      }

      const userId = authData.user?.id;
      if (!userId) {
        throw new Error('Não foi possível obter o ID do usuário criado no Auth.');
      }

      // -------------------------------------------------------------
      // Passo B: Inserir a Empresa na tabela companies
      // -------------------------------------------------------------
      // Calcular trial_ends_at somando 7 dias à data atual
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);

      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .insert({
          razao_social: formData.razaoSocial.trim(),
          cnpj: formData.cnpj.trim(),
          status: 'Trial',
          trial_ends_at: trialEndsAt.toISOString(),
          cep: formData.cep.trim(),
          logradouro: formData.logradouro.trim(),
          numero: formData.numero.trim(),
          complemento: formData.complemento.trim() || null,
          bairro: formData.bairro.trim(),
          cidade: formData.cidade.trim(),
          estado: formData.estado.trim(),
        })
        .select()
        .single();

      if (companyError) {
        throw new Error(`Erro ao cadastrar empresa: ${companyError.message}`);
      }

      const companyId = companyData.id;

      // -------------------------------------------------------------
      // Passo C: Inserir o Perfil na tabela profiles
      // -------------------------------------------------------------
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          company_id: companyId,
          nome: formData.nome.trim(),
          email: formData.email.trim(),
          whatsapp: formData.whatsapp.trim(),
          role: 'Gestor',
          recebe_notificacoes: true,
        });

      if (profileError) {
        throw new Error(`Erro ao criar perfil de gestor: ${profileError.message}`);
      }

      // Sucesso Total
      setSuccessMessage('Conta corporativa e período Trial de 7 dias criados com sucesso!');
      
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          window.location.reload();
        }
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro inesperado ao realizar cadastro.');
    } finally {
      setLoadingSubmit(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans antialiased">
      {/* Top Header Branding */}
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20 mb-3">
          <Headphones className="w-6 h-6" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Crie sua conta no TicketFlow
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Inicie seu período de testes gratuito de 7 dias da plataforma SaaS B2B de chamados.
        </p>

        {/* Indicador visual de Steps */}
        <div className="mt-8 flex items-center justify-center max-w-md mx-auto">
          <div className="flex items-center w-full">
            {/* Step 1 */}
            <div className="relative flex flex-col items-center flex-1">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep >= 1
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                1
              </div>
              <span className="text-[11px] font-semibold mt-1.5 text-slate-700">Empresa</span>
            </div>

            <div
              className={`h-0.5 w-full transition-colors ${
                currentStep >= 2 ? 'bg-blue-600' : 'bg-slate-200'
              }`}
            />

            {/* Step 2 */}
            <div className="relative flex flex-col items-center flex-1">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep >= 2
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                2
              </div>
              <span className="text-[11px] font-semibold mt-1.5 text-slate-700">Endereço</span>
            </div>

            <div
              className={`h-0.5 w-full transition-colors ${
                currentStep >= 3 ? 'bg-blue-600' : 'bg-slate-200'
              }`}
            />

            {/* Step 3 */}
            <div className="relative flex flex-col items-center flex-1">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep === 3
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                3
              </div>
              <span className="text-[11px] font-semibold mt-1.5 text-slate-700">Gestor</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card Principal do Formulário (Tema Claro Estrito) */}
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-sm border border-slate-200 rounded-2xl">
          {/* Alertas de Erro ou Sucesso */}
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-xs font-medium animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-emerald-800 text-xs font-medium animate-in fade-in duration-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">{successMessage}</p>
                <p className="mt-0.5 text-emerald-700">Redirecionando para o sistema...</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ETAPA 1: Dados da Empresa */}
            {currentStep === 1 && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    Informações da Empresa
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Informe os dados corporativos para vincular a conta multi-tenant.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Razão Social ou Nome Fantasia <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      name="razaoSocial"
                      value={formData.razaoSocial}
                      onChange={handleChange}
                      placeholder="Ex: TechLog Logística Ltda"
                      required
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    CNPJ <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <FileText className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      name="cnpj"
                      value={formData.cnpj}
                      onChange={handleChange}
                      placeholder="00.000.000/0000-00"
                      required
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (validateStep(1)) setCurrentStep(2);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                  >
                    <span>Avançar para Endereço</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ETAPA 2: Dados de Endereço com ViaCEP */}
            {currentStep === 2 && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    Endereço da Sede
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Digite o CEP para preenchimento automático das informações de localização.
                  </p>
                </div>

                {/* Linha do CEP */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      CEP <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        name="cep"
                        value={formData.cep}
                        onChange={handleChange}
                        onBlur={handleCepLookup}
                        placeholder="00000-000"
                        maxLength={9}
                        required
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                      />
                      {loadingCep && (
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={handleCepLookup}
                      disabled={loadingCep}
                      className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {loadingCep ? 'Buscando...' : 'Buscar CEP'}
                    </button>
                  </div>
                </div>

                {/* Logradouro e Número */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Logradouro / Rua <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="logradouro"
                      value={formData.logradouro}
                      onChange={handleChange}
                      placeholder="Avenida Paulista, Rua das Flores..."
                      required
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Número <span className="text-rose-500">*</span>
                    </label>
                    <input
                      ref={numeroInputRef}
                      type="text"
                      name="numero"
                      value={formData.numero}
                      onChange={handleChange}
                      placeholder="123"
                      required
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900 ring-2 ring-transparent focus:ring-blue-400"
                    />
                  </div>
                </div>

                {/* Complemento e Bairro */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Complemento (Opcional)
                    </label>
                    <input
                      type="text"
                      name="complemento"
                      value={formData.complemento}
                      onChange={handleChange}
                      placeholder="Sala 402, Bloco B..."
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Bairro <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="bairro"
                      value={formData.bairro}
                      onChange={handleChange}
                      placeholder="Centro, Jardins..."
                      required
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                    />
                  </div>
                </div>

                {/* Cidade e Estado */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Cidade <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="cidade"
                      value={formData.cidade}
                      onChange={handleChange}
                      placeholder="São Paulo, Curitiba..."
                      required
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Estado (UF) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="estado"
                      value={formData.estado}
                      onChange={handleChange}
                      placeholder="SP"
                      maxLength={2}
                      required
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900 uppercase"
                    />
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="pt-4 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-slate-600 hover:text-slate-900 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Voltar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (validateStep(2)) setCurrentStep(3);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                  >
                    <span>Avançar para Gestor</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ETAPA 3: Dados do Gestor (Admin da Empresa) */}
            {currentStep === 3 && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-600" />
                    Dados do Gestor da Conta
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    O usuário cadastrado será registrado com perfil administrativo de <strong>Gestor</strong>.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nome Completo <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      name="nome"
                      value={formData.nome}
                      onChange={handleChange}
                      placeholder="Carlos Eduardo da Silva"
                      required
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      E-mail de Login <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="gestor@empresa.com.br"
                        required
                        className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      WhatsApp / Celular <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        name="whatsapp"
                        value={formData.whatsapp}
                        onChange={handleChange}
                        placeholder="(11) 98765-4321"
                        required
                        className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Senha de Acesso <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="senha"
                        value={formData.senha}
                        onChange={handleChange}
                        placeholder="Mínimo 6 caracteres"
                        required
                        className="w-full pl-9 pr-10 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
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

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Confirmar Senha <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="confirmarSenha"
                        value={formData.confirmarSenha}
                        onChange={handleChange}
                        placeholder="Repita sua senha"
                        required
                        className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    Ao registrar-se, sua empresa terá acesso total imediato com período Trial de 7 dias com isolamento multi-tenant garantido por Row Level Security (RLS).
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="pt-4 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    disabled={loadingSubmit}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-slate-600 hover:text-slate-900 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Voltar</span>
                  </button>

                  <button
                    type="submit"
                    disabled={loadingSubmit}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
                  >
                    {loadingSubmit ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Criando conta e Tenant...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Finalizar Cadastro e Iniciar Trial</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Link para Login */}
        <div className="text-center mt-6">
          <p className="text-xs text-slate-500">
            Já possui uma conta ativa?{' '}
            <button
              onClick={onNavigateLogin}
              className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Acessar Painel
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
