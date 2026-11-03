import React from 'react';
import { Check, X, ShieldAlert, ShieldCheck } from 'lucide-react';

interface PasswordStrengthMeterProps {
  password: string;
}

export interface PasswordValidationResult {
  hasMinLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
  isValid: boolean;
  score: number; // 0 a 3
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  let score = 0;
  if (hasMinLength) score++;
  if (hasLetter) score++;
  if (hasNumber) score++;

  return {
    hasMinLength,
    hasLetter,
    hasNumber,
    isValid: hasMinLength && hasLetter && hasNumber,
    score,
  };
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ password }) => {
  if (!password) return null;

  const { hasMinLength, hasLetter, hasNumber, isValid, score } = validatePasswordStrength(password);

  const getLabel = () => {
    if (score <= 1) return { text: 'Fraca', color: 'text-rose-600', bg: 'bg-rose-500' };
    if (score === 2) return { text: 'Média', color: 'text-amber-600', bg: 'bg-amber-500' };
    return { text: 'Forte e Segura', color: 'text-emerald-600', bg: 'bg-emerald-500' };
  };

  const label = getLabel();

  return (
    <div className="mt-2 space-y-2 text-xs font-sans antialiased animate-in fade-in duration-200">
      {/* Barra de progresso */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500 font-medium">Força da Senha:</span>
          <span className={`font-bold ${label.color}`}>{label.text}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 h-1.5">
          <div className={`rounded-full transition-colors duration-300 ${score >= 1 ? label.bg : 'bg-slate-200'}`} />
          <div className={`rounded-full transition-colors duration-300 ${score >= 2 ? label.bg : 'bg-slate-200'}`} />
          <div className={`rounded-full transition-colors duration-300 ${score === 3 ? label.bg : 'bg-slate-200'}`} />
        </div>
      </div>

      {/* Checklist de requisitos mínimos */}
      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
        <div className="flex items-center gap-1.5 text-[11px]">
          {hasMinLength ? (
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <X className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <span className={hasMinLength ? 'text-emerald-800 font-semibold' : 'text-slate-600'}>
            Mínimo de 8 caracteres
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px]">
          {hasLetter ? (
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <X className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <span className={hasLetter ? 'text-emerald-800 font-semibold' : 'text-slate-600'}>
            Pelo menos 1 letra (a-z, A-Z)
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px]">
          {hasNumber ? (
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <X className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <span className={hasNumber ? 'text-emerald-800 font-semibold' : 'text-slate-600'}>
            Pelo menos 1 número (0-9)
          </span>
        </div>
      </div>
    </div>
  );
};

