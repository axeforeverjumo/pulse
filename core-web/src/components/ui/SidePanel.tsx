/**
 * SidePanel - 200px contextual side panel per module.
 * Matches the CMO's "spanel" design: header with title/subtitle,
 * section labels, and styled list items.
 */
import { type ReactNode } from 'react';

interface SidePanelProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function SidePanel({ title, subtitle, children }: SidePanelProps) {
  return (
    <div className="w-[200px] shrink-0 bg-bg-main-sidebar border-r border-border-light flex flex-col overflow-hidden">
      <div className="px-3.5 py-3 border-b border-border-light shrink-0">
        <h2 className="text-sm font-bold text-text-dark">{title}</h2>
        {subtitle && <p className="text-[10px] text-text-tertiary mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {children}
      </div>
    </div>
  );
}

/** Section label inside SidePanel */
export function SPSection({ label }: { label: string }) {
  return (
    <p className="text-[8.5px] font-bold tracking-[0.13em] uppercase text-text-tertiary px-2 py-1.5 mt-1 first:mt-0">
      {label}
    </p>
  );
}

/** Clickable item inside SidePanel */
export function SPItem({
  active,
  onClick,
  children,
  count,
  icon,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  count?: number;
  icon?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] transition-all border mb-0.5 text-left ${
        active
          ? 'bg-brand-primary/[.09] text-brand-primary border-brand-primary/[.16] font-medium'
          : 'text-text-secondary border-transparent hover:bg-bg-gray hover:text-text-dark'
      }`}
    >
      {icon && <span className="shrink-0 w-3 h-3 flex items-center justify-center opacity-60">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {count !== undefined && (
        <span className={`text-[9px] px-1.5 py-0.5 rounded-lg font-medium ${
          active
            ? 'bg-brand-primary/[.18] text-brand-primary'
            : 'bg-bg-gray text-text-tertiary'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

/** Separator */
export function SPSeparator() {
  return <div className="mx-2 my-1.5 h-px bg-border-light" />;
}
