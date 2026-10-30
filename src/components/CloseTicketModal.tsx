/**
 * InfoTicket - Modal de Encerramento de Chamado v1.3.0
 * Valida obrigatoriamente o preenchimento de Resumo de Conclusão antes de alterar o status para 'Fechado'
 */
import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  Loader2, 
  AlertCircle,
  FileCheck2 
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Ticket } from '../types/database';

interface CloseTicketModalProps {
  ticket: Ticket | null;
  isOpen: boolean;
  onClose: () => void;
  onTicketClosed: () => void;
}

export const CloseTicketModal: React.FC<CloseTicketModalProps> = ({
  ticket,
  isOpen,
  onClose,
  onTicketClosed,
}) => {
  const [resumoConclusao, setResumoConclusao] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !ticket) return null;

  // O botão de confirmar só é ativado se o resumo não estiver vazio
  const isValid = resumoConclusao.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      await dataService.closeTicket(
        ticket.id, 
        resumoConclusao.trim(), 
        ticket.operador_id || undefined, 
        ticket.company_id
      );
      setResumoConclusao('');
      onTicketClosed();
      onClose();
    } catch (err: any) {
      console.error('Erro ao encerrar chamado:', err);
      setErrorMsg(err.message || 'Falha ao atualizar chamado no Supabase.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col text-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 font-bold">
              <FileCheck2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">Encerrar Chamado</h2>
              <p className="text-[11px] font-mono text-blue-600">
                #{ticket.id.substring(0, 8)} - {ticket.assunto}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com validação de texto longo obrigatório */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Resumo de Conclusão <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              value={resumoConclusao}
              onChange={(e) => setResumoConclusao(e.target.value)}
              placeholder="Descreva a solução aplicada, ações tomadas e o motivo do encerramento do chamado..."
              required
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-900 resize-none"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Obrigatório: detalhe a conclusão para que o status mude para <strong>Fechado</strong>.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={!isValid || loading}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-emerald-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Encerrando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirmar Encerramento</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
