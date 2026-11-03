import React, { useEffect, useState } from 'react';
import { Users as UsersIcon, RefreshCw, Mail, Shield, Building2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Profile, Company } from '../types/database';

interface CustomersProps {
  activeCompany?: Company | null;
}

export const Customers: React.FC<CustomersProps> = ({ activeCompany }) => {
  const [customers, setCustomers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await dataService.getCustomers(activeCompany?.id);
      setCustomers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [activeCompany?.id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Clientes & Organizações</h1>
          <p className="text-sm text-slate-600 mt-1">
            Contas de clientes cadastradas na tabela <code className="font-mono text-slate-700">public.profiles</code> com papel Cliente.
          </p>
        </div>
        <button
          onClick={loadCustomers}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Recarregar
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            Carregando clientes do sistema...
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <UsersIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">Nenhum cliente cadastrado no tenant.</p>
            <p className="mt-1">Execute o script <code className="font-mono text-slate-800">schema.sql</code> para carregar o seed.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
            {customers.map((c) => (
              <div
                key={c.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-sm transition-all flex items-start gap-3.5"
              >
                {c.avatar_url ? (
                  <img
                    src={c.avatar_url}
                    alt={c.nome || 'Cliente'}
                    className="w-10 h-10 rounded-full object-cover border border-slate-200"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm">
                    {c.nome?.charAt(0) || 'C'}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{c.nome}</h3>
                    <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                      {c.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate">{c.email}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 font-mono">
                    ID: {c.id.substring(0, 13)}...
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
