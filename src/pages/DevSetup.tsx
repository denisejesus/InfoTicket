import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Play, 
  Database, 
  ExternalLink,
  ShieldCheck,
  Building,
  KeyRound,
  FileCode2
} from 'lucide-react';
import { checkDatabaseHealth, runDatabaseSetup, seedDemoData } from '../services/setupDatabase';

export const DevSetup: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    const health = await checkDatabaseHealth();
    setHealthStatus(health);
    setLoading(false);
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleRunSetup = async () => {
    setLoading(true);
    setActionMessage({ type: 'info', text: 'Executando script SQL via Supabase Management API...' });
    const res = await runDatabaseSetup();
    if (res.success) {
      setActionMessage({ type: 'success', text: res.message });
      await fetchHealth();
    } else {
      setActionMessage({ 
        type: 'error', 
        text: `${res.message} (Você também pode executar o schema.sql diretamente no SQL Editor do Supabase).` 
      });
    }
    setLoading(false);
  };

  const handleSeed = async () => {
    setLoading(true);
    setActionMessage({ type: 'info', text: 'Inserindo dados de demonstração (seed)...' });
    const res = await seedDemoData();
    if (res.success) {
      setActionMessage({ type: 'success', text: res.message });
      await fetchHealth();
    } else {
      setActionMessage({ type: 'error', text: res.message });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Database className="w-7 h-7 text-blue-600" />
            Configuração do Supabase (Dev)
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Verifique o status das tabelas multi-tenant e execute os comandos SQL DDL com RLS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar Status
          </button>
          <a
            href="https://supabase.com/dashboard/project/vrkhkifhkztttukuxbwz/sql"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <span>Abrir SQL Editor</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Alerta de Feedback */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : actionMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : actionMessage.type === 'error' ? (
            <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <RefreshCw className="w-5 h-5 text-blue-600 shrink-0 mt-0.5 animate-spin" />
          )}
          <div className="text-sm font-medium">{actionMessage.text}</div>
        </div>
      )}

      {/* Grid de Status das Tabelas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Tabela Companies */}
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tabela 1</span>
            {healthStatus?.companiesExists ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Criada
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                Ausente
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-slate-900">companies</h3>
          <p className="text-xs text-slate-500 mt-1">
            id, razao_social, cnpj, status, trial_ends_at
          </p>
        </div>

        {/* Tabela Profiles */}
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tabela 2</span>
            {healthStatus?.profilesExists ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Criada
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                Ausente
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-slate-900">profiles</h3>
          <p className="text-xs text-slate-500 mt-1">
            id, company_id, role, recebe_notificacoes
          </p>
        </div>

        {/* Tabela Tickets */}
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tabela 3</span>
            {healthStatus?.ticketsExists ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Criada
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                Ausente
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-slate-900">tickets</h3>
          <p className="text-xs text-slate-500 mt-1">
            company_id, cliente_id, operador_id, assunto, status, resumo_conclusao
          </p>
        </div>
      </div>

      {/* Card de Execução e Automação */}
      <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
          <Play className="w-4 h-4 text-blue-600" />
          Ações de Inicialização do Banco de Dados
        </h3>
        <p className="text-xs text-slate-600 mb-6">
          Execute os comandos DDL para criar as tabelas e ativar o RLS Multi-tenant diretamente pelo token de gerenciamento do Supabase configurado no arquivo <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-[11px]">.env</code>.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRunSetup}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors"
          >
            <Database className="w-3.5 h-3.5" />
            Executar Setup SQL das Tabelas
          </button>

          <button
            onClick={handleSeed}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors border border-slate-200"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Popular Dados de Teste (Seed)
          </button>
        </div>
      </div>

      {/* Detalhes de Conexão */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-slate-400" />
          Credenciais do Supabase Vinculadas
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
            <span className="text-slate-500 block text-[11px]">URL do Projeto</span>
            <span className="font-mono text-slate-800 break-all">{import.meta.env.VITE_SUPABASE_URL}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
            <span className="text-slate-500 block text-[11px]">Project Ref</span>
            <span className="font-mono text-slate-800">{import.meta.env.VITE_SUPABASE_PROJECT_REF}</span>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <FileCode2 className="w-4 h-4 text-blue-600" />
            Arquivo DDL salvo localmente em: <strong className="font-mono text-slate-700">schema.sql</strong>
          </span>
          <span className="text-[11px] bg-slate-100 px-2 py-0.5 rounded font-mono">v1.0.1</span>
        </div>
      </div>
    </div>
  );
};
