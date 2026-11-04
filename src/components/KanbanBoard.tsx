/**
 * TicketFlow - Quadro Kanban de Chamados v1.6.0
 * Suporte a Deslizamento Horizontal em Smartphones/Tablets e Drag & Drop Híbrido (Mouse + Toque / Touch)
 * Tag de SLA Dinâmica sem quebra de linha (whitespace-nowrap) e bloqueio de encerramento/resolução sem resumo via CloseTicketModal
 */
import React, { useState, useRef } from 'react';
import { 
  Building2, 
  User, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  UserCheck, 
  ChevronRight,
  Layers,
  GripVertical
} from 'lucide-react';
import { Ticket, TicketStatus } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { CloseTicketModal } from './CloseTicketModal';

interface KanbanBoardProps {
  tickets: Ticket[];
  onSelectTicket?: (ticketId: string) => void;
  onTicketStatusChange: (ticketId: string, newStatus: TicketStatus) => Promise<void>;
  onTicketClosed?: () => void;
}

interface ColumnConfig {
  id: string;
  title: string;
  targetStatus: TicketStatus;
  matchStatuses: TicketStatus[];
  badgeColor: string;
  borderColor: string;
  bgColor: string;
}

const COLUMNS: ColumnConfig[] = [
  {
    id: 'aberto',
    title: 'Aberto',
    targetStatus: 'Aberto',
    matchStatuses: ['Aberto'],
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    borderColor: 'border-blue-200',
    bgColor: 'bg-blue-50/40',
  },
  {
    id: 'em_atendimento',
    title: 'Em Atendimento',
    targetStatus: 'Em Andamento',
    matchStatuses: ['Em Andamento'],
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    borderColor: 'border-purple-200',
    bgColor: 'bg-purple-50/40',
  },
  {
    id: 'aguardando_cliente',
    title: 'Aguardando Cliente',
    targetStatus: 'Aguardando Cliente',
    matchStatuses: ['Aguardando Cliente'],
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    borderColor: 'border-amber-200',
    bgColor: 'bg-amber-50/40',
  },
  {
    id: 'resolvido',
    title: 'Resolvido',
    targetStatus: 'Resolvido',
    matchStatuses: ['Resolvido'],
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    borderColor: 'border-emerald-200',
    bgColor: 'bg-emerald-50/40',
  },
  {
    id: 'fechados',
    title: 'Fechados',
    targetStatus: 'Fechado',
    matchStatuses: ['Fechado'],
    badgeColor: 'bg-slate-200 text-slate-800 border-slate-300',
    borderColor: 'border-slate-300',
    bgColor: 'bg-slate-50/60',
  },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tickets,
  onSelectTicket,
  onTicketStatusChange,
  onTicketClosed,
}) => {
  const { profile } = useAuth();
  const isCliente = profile?.role === 'Cliente';
  const canDrag = !isCliente;

  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);

  // Estado para o Modal Obrigatório de "Resumo de Conclusão" ao arrastar para "Resolvido" ou "Fechados"
  const [ticketToClose, setTicketToClose] = useState<Ticket | null>(null);
  const [closeTargetStatus, setCloseTargetStatus] = useState<'Resolvido' | 'Fechado'>('Fechado');

  // Suporte a Drag & Drop por Toque (Mobile / Tablet)
  const touchTimerRef = useRef<number | null>(null);
  const touchTicketIdRef = useRef<string | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isTouchDraggingRef = useRef<boolean>(false);

  // Função central que executa a mudança de coluna (compartilhada entre Mouse Drop e Touch Drop)
  const executeColumnDrop = async (ticketId: string, targetStatus: TicketStatus) => {
    const currentTicket = tickets.find((t) => t.id === ticketId);
    if (!currentTicket) return;

    // Se o status já for o mesmo, não faz nada
    if (currentTicket.status === targetStatus) {
      return;
    }

    // REGRA DE NEGÓCIO CRÍTICA: Se a coluna de destino for "Resolvido" ou "Fechados", NÃO dispara UPDATE direto.
    // Abre obrigatoriamente o Modal de "Resumo de Conclusão".
    if (targetStatus === 'Resolvido' || targetStatus === 'Fechado') {
      setCloseTargetStatus(targetStatus);
      setTicketToClose(currentTicket);
      return;
    }

    try {
      setUpdatingTicketId(ticketId);
      await onTicketStatusChange(ticketId, targetStatus);
    } catch (err) {
      console.error('Erro ao atualizar status via Kanban:', err);
    } finally {
      setUpdatingTicketId(null);
    }
  };

  // Manipulação de Drag & Drop (HTML5 nativo - Desktop)
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, ticketId: string) => {
    if (!canDrag) return;
    setDraggedTicketId(ticketId);
    e.dataTransfer.setData('text/plain', ticketId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedTicketId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, columnId: string) => {
    if (!canDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== columnId) {
      setDragOverColumn(columnId);
    }
  };

  const handleDragLeave = (columnId: string) => {
    if (dragOverColumn === columnId) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetStatus: TicketStatus) => {
    if (!canDrag) return;
    e.preventDefault();
    setDragOverColumn(null);

    const ticketId = e.dataTransfer.getData('text/plain') || draggedTicketId;
    setDraggedTicketId(null);
    if (!ticketId) return;

    await executeColumnDrop(ticketId, targetStatus);
  };

  // Manipulação de Drag & Drop por Toque (Mobile e Tablet)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>, ticketId: string) => {
    if (!canDrag) return;
    const touch = e.touches[0];
    if (!touch) return;

    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    touchTicketIdRef.current = ticketId;
    isTouchDraggingRef.current = false;

    if (touchTimerRef.current) {
      window.clearTimeout(touchTimerRef.current);
    }

    // Ativa o modo arraste após manter pressionado brevemente (220ms) para não bloquear o scroll normal
    touchTimerRef.current = window.setTimeout(() => {
      isTouchDraggingRef.current = true;
      setDraggedTicketId(ticketId);
    }, 220);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!canDrag || !touchTicketIdRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;

    // Se ainda não entrou em modo drag e o usuário moveu rápido, cancela o timer para permitir scroll normal
    if (!isTouchDraggingRef.current && touchStartPosRef.current) {
      const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
      if (dx > 10 || dy > 10) {
        if (touchTimerRef.current) {
          window.clearTimeout(touchTimerRef.current);
          touchTimerRef.current = null;
        }
        return;
      }
    }

    if (isTouchDraggingRef.current) {
      // Identifica sobre qual coluna do Kanban o dedo está passando
      const elementUnderFinger = document.elementFromPoint(touch.clientX, touch.clientY);
      const colElement = elementUnderFinger?.closest('[data-kanban-col-id]') as HTMLElement | null;
      const colId = colElement?.getAttribute('data-kanban-col-id') || null;
      if (colId !== dragOverColumn) {
        setDragOverColumn(colId);
      }
    }
  };

  const handleTouchEnd = async (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchTimerRef.current) {
      window.clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }

    if (!canDrag || !isTouchDraggingRef.current || !touchTicketIdRef.current) {
      isTouchDraggingRef.current = false;
      touchTicketIdRef.current = null;
      setDraggedTicketId(null);
      setDragOverColumn(null);
      return;
    }

    const ticketId = touchTicketIdRef.current;
    const touch = e.changedTouches[0];
    let targetColId = dragOverColumn;

    if (touch) {
      const elementUnderFinger = document.elementFromPoint(touch.clientX, touch.clientY);
      const colElement = elementUnderFinger?.closest('[data-kanban-col-id]') as HTMLElement | null;
      if (colElement) {
        targetColId = colElement.getAttribute('data-kanban-col-id');
      }
    }

    isTouchDraggingRef.current = false;
    touchTicketIdRef.current = null;
    setDraggedTicketId(null);
    setDragOverColumn(null);

    if (targetColId) {
      const targetColumn = COLUMNS.find((c) => c.id === targetColId);
      if (targetColumn) {
        await executeColumnDrop(ticketId, targetColumn.targetStatus);
      }
    }
  };

  // Helper para renderizar tag do SLA (sempre em linha única com whitespace-nowrap)
  const renderSlaBadge = (ticket: Ticket) => {
    const isFechado = ticket.status === 'Fechado' || ticket.status === 'Resolvido';

    if (isFechado) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap shrink-0">
          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
          <span>Concluído</span>
        </span>
      );
    }

    if (!ticket.sla_vencimento) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap shrink-0">
          <span>Sem SLA</span>
        </span>
      );
    }

    const now = new Date();
    const slaDate = new Date(ticket.sla_vencimento);
    const diffHours = (slaDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (diffHours < 0) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 whitespace-nowrap shrink-0">
          <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
          <span>SLA Vencido</span>
        </span>
      );
    }

    if (diffHours <= 2) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap shrink-0">
          <Clock className="w-3 h-3 text-amber-600 shrink-0" />
          <span>Atenção (&lt; 2h)</span>
        </span>
      );
    }

    const horasRestantes = Math.max(1, Math.round(diffHours));

    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
        <span>SLA no Prazo (~{horasRestantes}h)</span>
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {/* Aviso informativo de permissão para Clientes */}
      {isCliente && (
        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span>
            <strong>Modo Somente Leitura:</strong> Como solicitante, você pode visualizar as etapas dos chamados no Kanban, mas apenas operadores e gestores podem arrastar os cards para alterar fases.
          </span>
        </div>
      )}

      {/* Dica de usabilidade mobile para arrastar ou deslizar */}
      {canDrag && (
        <div className="flex xl:hidden items-center justify-between gap-2 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-[11px] text-slate-600">
          <span>Deslize para o lado para ver todas as colunas ou pressione e segure um card para movê-lo.</span>
        </div>
      )}

      {/* Container com deslizamento horizontal no mobile/tablet e Grid 5 Colunas no Desktop (xl) */}
      <div className="flex xl:grid xl:grid-cols-5 gap-3.5 sm:gap-4 overflow-x-auto pb-3 pt-0.5 snap-x snap-mandatory xl:overflow-visible items-start -mx-1 px-1">
        {COLUMNS.map((col) => {
          const colTickets = tickets.filter((t) =>
            col.matchStatuses.includes(t.status as TicketStatus)
          );
          const isOver = dragOverColumn === col.id;

          return (
            <div
              key={col.id}
              data-kanban-col-id={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={() => handleDragLeave(col.id)}
              onDrop={(e) => handleDrop(e, col.targetStatus)}
              className={`min-w-[275px] sm:min-w-[300px] xl:min-w-0 w-[82vw] sm:w-[310px] xl:w-auto shrink-0 snap-center flex flex-col rounded-xl border transition-all duration-200 ${
                isOver
                  ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-400/30'
                  : `${col.borderColor} bg-slate-50/60`
              }`}
            >
              {/* Header da Coluna */}
              <div className="p-3 border-b border-slate-200/80 bg-white rounded-t-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-xs text-slate-800 tracking-tight">
                    {col.title}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${col.badgeColor}`}
                  >
                    {colTickets.length}
                  </span>
                </div>
              </div>

              {/* Área dos Cards */}
              <div className="p-2.5 space-y-2.5 min-h-[340px] max-h-[calc(100vh-280px)] overflow-y-auto">
                {colTickets.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-200 rounded-lg bg-white/60 text-slate-400 text-xs">
                    <span>Nenhum chamado</span>
                  </div>
                ) : (
                  colTickets.map((ticket) => {
                    const isDraggingThis = draggedTicketId === ticket.id;
                    const isUpdatingThis = updatingTicketId === ticket.id;

                    return (
                      <div
                        key={ticket.id}
                        draggable={canDrag}
                        onDragStart={(e) => handleDragStart(e, ticket.id)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={(e) => handleTouchStart(e, ticket.id)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onClick={() => {
                          if (!isTouchDraggingRef.current && onSelectTicket) {
                            onSelectTicket(ticket.id);
                          }
                        }}
                        className={`p-3 bg-white border border-slate-200 rounded-xl shadow-xs transition-all select-none ${
                          canDrag
                            ? 'cursor-grab active:cursor-grabbing hover:border-slate-300 hover:shadow-md'
                            : 'cursor-pointer hover:border-blue-300 hover:shadow-sm'
                        } ${isDraggingThis ? 'opacity-50 scale-95 border-dashed border-blue-500 ring-2 ring-blue-400/30' : ''} ${
                          isUpdatingThis ? 'animate-pulse pointer-events-none' : ''
                        }`}
                      >
                        {/* Linha Superior: ID e Tag SLA */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
                          <div className="flex items-center gap-0.5 shrink-0">
                            {canDrag && (
                              <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0 -ml-1" />
                            )}
                            <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 whitespace-nowrap">
                              #{ticket.id.substring(0, 8)}
                            </span>
                          </div>
                          {renderSlaBadge(ticket)}
                        </div>

                        {/* Assunto / Título do Chamado */}
                        <h4 className="text-xs font-bold text-slate-900 line-clamp-2 hover:text-blue-600 transition-colors mb-2">
                          {ticket.assunto}
                        </h4>

                        {/* Solicitante e Organização */}
                        <div className="space-y-1 mb-2.5 text-[11px] text-slate-600">
                          {ticket.client_organization ? (
                            <div className="flex items-center gap-1.5 font-medium text-slate-700">
                              <Building2 className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                              <span className="truncate">
                                {ticket.client_organization.nome}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-slate-500">
                              <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              <span className="truncate">
                                {ticket.cliente?.nome || 'Cliente não identificado'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Rodapé do Card: Operador Responsável e Ação */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5 text-[11px]">
                          {ticket.operador?.nome ? (
                            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium max-w-[150px] truncate">
                              <UserCheck className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{ticket.operador.nome}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 whitespace-nowrap">
                              Não Atribuído
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onSelectTicket) onSelectTicket(ticket.id);
                            }}
                            className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-slate-50 transition-colors"
                            title="Ver detalhes"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Obrigatório de Resumo de Conclusão ao arrastar para "Resolvido" ou "Fechados" */}
      <CloseTicketModal
        ticket={ticketToClose}
        isOpen={Boolean(ticketToClose)}
        targetStatus={closeTargetStatus}
        onClose={() => {
          // Cancelamento: fecha o modal e mantém o card intacto na coluna original
          setTicketToClose(null);
        }}
        onTicketClosed={() => {
          setTicketToClose(null);
          if (onTicketClosed) {
            onTicketClosed();
          }
        }}
      />
    </div>
  );
};
