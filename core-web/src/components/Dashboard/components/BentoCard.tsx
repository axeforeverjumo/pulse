import type { ReactNode } from 'react';

interface BentoCardProps {
  title: string;
  icon: ReactNode;
  headerAction?: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function BentoCard({
  title,
  icon,
  headerAction,
  className = '',
  children,
}: BentoCardProps) {
  return (
    <div
      className={`
        group relative h-full overflow-hidden rounded-2xl
        border border-[#d9e7f5] bg-white/92 backdrop-blur-[2px]
        shadow-[0_14px_34px_-26px_rgba(15,23,42,0.42),0_2px_8px_rgba(15,23,42,0.06)]
        transition-all duration-300 ease-out hover:-translate-y-0.5
        hover:shadow-[0_22px_44px_-28px_rgba(15,23,42,0.48),0_6px_16px_rgba(15,23,42,0.1)]
        flex flex-col
        ${className}
      `}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-sky-100/55 via-white/20 to-emerald-100/45 opacity-80" />

      {/* Header */}
      <div className="relative flex items-center justify-between gap-3 border-b border-[#e4edf8] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="text-slate-600">{icon}</span>
          <h3 className="text-[14px] sm:text-[15px] font-semibold text-slate-900">{title}</h3>
        </div>
        {headerAction}
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
