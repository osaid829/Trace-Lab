import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({ children, className = '', variant = 'secondary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-[#82b5ff] text-[#08111f] hover:bg-[#a3c9ff] shadow-[0_8px_24px_rgba(94,150,255,0.15)]',
    secondary: 'border border-white/[0.12] bg-white/[0.035] text-slate-200 hover:bg-white/[0.075]',
    ghost: 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100',
    danger: 'border border-red-400/20 bg-red-400/10 text-red-200 hover:bg-red-400/15'
  };
  return <button className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[12px] font-semibold tracking-[0.01em] transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`} {...props}>{children}</button>;
}

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#82b5ff]/70 disabled:cursor-not-allowed disabled:opacity-40 ${className}`} {...props}>{children}</button>;
}

export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 ${className}`}>{children}</div>;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex min-h-[170px] flex-col items-center justify-center px-6 py-10 text-center">
    {icon && <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.03] text-slate-500">{icon}</div>}
    <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
    {description && <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>;
}

export function StatusDot({ tone = 'neutral' }: { tone?: 'success' | 'warning' | 'danger' | 'neutral' }) {
  const color = {
    success: 'bg-emerald-300 shadow-[0_0_0_3px_rgba(110,231,183,0.08)]',
    warning: 'bg-amber-300 shadow-[0_0_0_3px_rgba(252,211,77,0.08)]',
    danger: 'bg-red-300 shadow-[0_0_0_3px_rgba(252,165,165,0.08)]',
    neutral: 'bg-slate-500'
  }[tone];
  return <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />;
}
