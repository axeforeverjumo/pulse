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
        bg-white rounded-md h-full
        shadow-[0_1px_3px_rgba(0,0,0,0.04)]
        hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]
        border border-gray-100/80
        transition-all duration-300 ease-out
        flex flex-col overflow-hidden
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-text-secondary">{icon}</span>
          <h3 className="text-[15px] font-medium text-text-body">{title}</h3>
        </div>
        {headerAction}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
