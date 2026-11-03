/**
 * InfoTicket - Modal de Abertura de Novo Chamado v1.14.0
 * Vincula company_id, client_organization_id e cliente_id ao usuário autenticado ou ao cliente selecionado por Gestor/Gerente/Operador
 * Suporte a Arquitetura B2B2B: Seleção de Empresa Cliente (Organização), Solicitante e Anexos de Arquivos com Validação Estrita (5MB / Formatos Autorizados)
 * Layout de Modal 100% Responsivo com Rolagem Interna e Rodapé Fixo no Mobile
 */
import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Ticket as TicketIcon, 
  Send, 
  Loader2, 
  AlertCircle,
  User as UserIcon,
  Building2,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Trash2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';
import { Profile, ClientOrganization } from '../types/database';

const ALLOWED_EXTENSIONS = ['.png', '.jpeg', '.jpg', '.pdf', '.xls', '.xlsx', '.doc', '.docx'];
const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const UPLOAD_RULE_MESSAGE = 'Apenas imagens, PDF, Excel e Word até 5MB';

const isFileValid = (file: File): boolean => {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return false;
  }
  const fileNameLower = file.name.toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => fileNameLower.endsWith(ext));
  const hasValidMime = !file.type || ALLOWED_MIME_TYPES.includes(file.type);
  return hasValidExt && hasValidMime;
};

interface NewTicketProps {
  isOpen: boolean;
  onClose: () => void;
  onTicketCreated: () => void;
}

export const NewTicket: React.FC<NewTicketProps> = ({ isOpen, onClose, onTicketCreated }) => {
  const { user, profile, company } = useAuth();
  
  // Identifica se o usuário atual é da equipe de atendimento ou cliente
  const isCliente = profile?.role === 'Cliente';
  const isStaff = profile?.role === 'Gestor' || profile?.role === 'Gerente' || profile?.role === 'Operador' || profile?.role === 'Operador/Funcionário' || profile?.role === 'Super Admin';

  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<'Baixa' | 'Média' | 'Alta' | 'Urgente'>('Média');
  
  // B2B2B: Organizações Clientes e Solicitantes
  const [organizations, setOrganizations] = useState<ClientOrganization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [clientesList, setClientesList] = useState<Profile[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Anexos de Arquivos (Fase 13) + Toast/Alerta de Validação
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadAlert, setUploadAlert] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Busca lista de organizações clientes e clientes do tenant caso o usuário seja da equipe
  useEffect(() => {
    if (isOpen && isStaff && company?.id) {
      setLoadingData(true);
      Promise.all([
        dataService.getClientOrganizations(company.id),
        dataService.getCustomers(company.id),
      ])
        .then(([orgs, customers]) => {
          setOrganizations(orgs as ClientOrganization[]);
          setClientesList(customers);

          // Pré-seleciona a primeira organização se houver
          if (orgs.length > 0 && !selectedOrgId) {
            setSelectedOrgId(orgs[0].id);
          }
        })
        .catch((err) => {
          console.error('Erro ao buscar dados B2B2B para novo chamado:', err);
        })
        .finally(() => {
          setLoadingData(false);
        });
    }
  }, [isOpen, isStaff, company?.id]);

  // Filtra clientes da organização selecionada (ou clientes gerais se nenhuma organização for selecionada)
  const filteredClientes = clientesList.filter((c) => {
    if (!selectedOrgId) return true;
    return c.client_organization_id === selectedOrgId;
  });

  // Atualiza cliente selecionado quando o filtro de organização mudar
  useEffect(() => {
    if (isStaff && filteredClientes.length > 0) {
      const exists = filteredClientes.some((c) => c.id === selectedClienteId);
      if (!exists) {
        setSelectedClienteId(filteredClientes[0].id);
      }
    } else if (isStaff && filteredClientes.length === 0) {
      setSelectedClienteId('');
    }
  }, [selectedOrgId, filteredClientes.length]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const validFiles: File[] = [];
      let hasInvalid = false;

      for (const file of selectedFiles) {
        if (!isFileValid(file)) {
          hasInvalid = true;
        } else {
          validFiles.push(file);
        }
      }

      if (hasInvalid) {
        setUploadAlert(UPLOAD_RULE_MESSAGE);
        setErrorMsg(UPLOAD_RULE_MESSAGE);
      } else {
        setUploadAlert(null);
      }

      if (validFiles.length > 0) {
        setAttachments((prev) => [...prev, ...validFiles]);
      }

      // Limpa o valor do input para permitir selecionar novamente
      e.target.value = '';
    }
  };

  const removeAttachment = (indexToRemove: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setUploadProgress(null);

    // Bloqueio imediato de envio no frontend caso algum anexo na fila viole a regra de 5MB ou formato
    const invalidAttachment = attachments.find((f) => !isFileValid(f));
    if (invalidAttachment) {
      setUploadAlert(UPLOAD_RULE_MESSAGE);
      setErrorMsg(UPLOAD_RULE_MESSAGE);
      return;
    }

    if (!assunto.trim() || !descricao.trim()) {
      setErrorMsg('Por favor, preencha o assunto e a descrição do chamado.');
      return;
    }

    if (!company?.id || !user?.id) {
      setErrorMsg('Erro de sessão multi-tenant. Dados da empresa ou do usuário não identificados.');
      return;
    }

    // Se for da equipe, é obrigatório selecionar o solicitante
    let targetClienteId = user.id;
    let targetOrgId = profile?.client_organization_id || null;

    if (isStaff) {
      if (!selectedClienteId) {
        setErrorMsg('Por favor, selecione o Solicitante / Colaborador da organização cliente.');
        return;
      }
      targetClienteId = selectedClienteId;
      targetOrgId = selectedOrgId || null;
    }

    setLoading(true);

    try {
      // 1. Cria o chamado no Supabase
      const createdTicket = await dataService.createTicket({
        company_id: company.id,
        client_organization_id: targetOrgId,
        cliente_id: targetClienteId,
        assunto: assunto.trim(),
        descricao: descricao.trim(),
        prioridade: prioridade,
        status: 'Aberto',
      });

      // 2. Realiza o upload de anexos caso existam
      if (createdTicket && attachments.length > 0) {
        for (let i = 0; i < attachments.length; i++) {
          const file = attachments[i];
          setUploadProgress(`Enviando anexo ${i + 1} de ${attachments.length} (${file.name})...`);
          try {
            await dataService.uploadTicketAttachment({
              file,
              company_id: company.id,
              ticket_id: createdTicket.id,
            });
          } catch (uploadErr) {
            console.warn(`Aviso ao enviar arquivo ${file.name}:`, uploadErr);
          }
        }
      }

      // Limpa os campos e fecha
      setAssunto('');
      setDescricao('');
      setPrioridade('Média');
      setSelectedClienteId('');
      setSelectedOrgId('');
      setAttachments([]);
      onTicketCreated();
      onClose();
    } catch (err: any) {
      console.error('Falha ao abrir chamado:', err);
      setErrorMsg(err.message || 'Erro ao registrar chamado no Supabase.');
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Toast Flutuante de Alerta de Upload */}
      {uploadAlert && (
        <div
          role="alert"
          className="fixed top-4 right-4 left-4 sm:left-auto sm:max-w-md z-[60] bg-rose-600 text-white px-4 py-3 rounded-xl shadow-lg border border-rose-500 flex items-center justify-between gap-3 animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <AlertCircle className="w-4 h-4 shrink-0 text-white" />
            <span>{uploadAlert}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadAlert(null)}
            className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-rose-700 transition-colors"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col text-slate-900">
        {/* Header Fixo do Modal */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-bold shrink-0">
              <TicketIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 leading-tight truncate">Novo Chamado</h2>
              <p className="text-[11px] text-slate-500 truncate">
                Empresa: <strong className="text-slate-700">{company?.razao_social || 'Multi-tenant'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com Rolagem Interna e Botões Fixos no Rodapé */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 font-medium">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

          {/* B2B2B: Seletor em cascata: Primeiro Organização Cliente, depois Solicitante */}
          {isStaff && (
            <div className="space-y-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              {/* 1. Seleção da Empresa Cliente (Organização) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Empresa Cliente (Organização)</span>
                  </span>
                  {loadingData && (
                    <span className="text-[10px] text-blue-600 animate-pulse font-normal">
                      Carregando...
                    </span>
                  )}
                </label>

                {organizations.length === 0 ? (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    Nenhuma organização cliente cadastrada. Você pode cadastrar em <strong>Equipe & Clientes</strong>.
                  </div>
                ) : (
                  <select
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  >
                    <option value="">Todas as Organizações / Sem Filtro</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.nome}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 2. Seleção do Solicitante daquela Organização */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>Solicitante (Colaborador) <strong className="text-rose-500">*</strong></span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {filteredClientes.length} disponível(is)
                  </span>
                </label>

                {loadingData ? (
                  <div className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-400 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    <span>Buscando solicitantes cadastrados...</span>
                  </div>
                ) : filteredClientes.length === 0 ? (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    {selectedOrgId 
                      ? 'Nenhum cliente cadastrado nesta organização. Cadastre um usuário em "Equipe & Clientes".'
                      : 'Nenhum cliente cadastrado no tenant.'}
                  </div>
                ) : (
                  <select
                    value={selectedClienteId}
                    onChange={(e) => setSelectedClienteId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  >
                    <option value="" disabled>Selecione o solicitante...</option>
                    {filteredClientes.map((cli) => (
                      <option key={cli.id} value={cli.id}>
                        {cli.nome || cli.email} ({cli.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Assunto / Título do Problema <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              placeholder="Ex: Erro ao emitir relatório de notas fiscais"
              required
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Prioridade
            </label>
            <select
              value={prioridade}
              onChange={(e: any) => setPrioridade(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="Baixa">Baixa</option>
              <option value="Média">Média</option>
              <option value="Alta">Alta</option>
              <option value="Urgente">Urgente</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Descrição Detalhada <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva com detalhes o problema encontrado, passos para reproduzir ou a solicitação..."
              required
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900 resize-none"
            />
          </div>

          {/* Anexos de Arquivo (Storage - Fase 13) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                <span>Anexar Arquivos ou Capturas de Tela</span>
              </label>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <Paperclip className="w-3 h-3" />
                <span>Escolher Arquivo</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".png, .jpeg, .jpg, .pdf, .xls, .xlsx, .doc, .docx"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Formatos aceitos: Imagens (.png, .jpg, .jpeg), PDF, Excel e Word (máx. 5MB por arquivo).
            </p>

            {/* Lista de Arquivos Selecionados */}
            {attachments.length > 0 && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 max-h-36 overflow-y-auto">
                {attachments.map((file, idx) => {
                  const isImg = file.type.startsWith('image/');
                  const sizeKb = Math.round(file.size / 1024);
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2 truncate mr-2">
                        {isImg ? (
                          <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        )}
                        <span className="font-medium text-slate-800 truncate" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">({sizeKb} KB)</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        disabled={loading}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Remover anexo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {uploadProgress && (
              <p className="text-[11px] font-semibold text-blue-600 flex items-center gap-1.5 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{uploadProgress}</span>
              </p>
            )}
          </div>
          </div>

          {/* Rodapé Fixo com Botões Acessíveis no Mobile */}
          <div className="px-4 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Enviando chamado...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Registrar Chamado</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
