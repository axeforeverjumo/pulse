import { type ReactNode } from 'react';
import { HeaderButtons } from '../MiniAppHeader';

interface PillConfig {
  label: string;
  color?: 'accent' | 'green' | 'amber' | 'red' | 'cyan' | 'pink' | 'violet';
}

interface ViewTopBarProps {
  title: string;
  pill?: PillConfig;
  cta?: {
    label: string;
    icon?: ReactNode;
    onClick: () => void;
  };
  children?: ReactNode;
  settingsButtonRef?: React.RefObject<HTMLButtonElement | null>;
  onSettingsClick?: () => void;
}

const pillStyles: Record<string, string> = {
  accent: 'bg-[#eef3ff] text-[#3b6cf5] border-[#c5d5f9]',
  green: 'bg-[#ecfdf3] text-[#12875d] border-[#a6ebc9]',
  amber: 'bg-[#fff8eb] text-[#b45309] border-[#fcd99e]',
  red: 'bg-[#fef2f2] text-[#dc2626] border-[#fca5a5]',
  cyan: 'bg-[#ecfeff] text-[#0e7490] border-[#a5e9f0]',
  pink: 'bg-[#fdf2f8] text-[#c026a3] border-[#f0abdb]',
  violet: 'bg-[#f5f3ff] text-[#7c3aed] border-[#c4b5fd]',
};

export default function ViewTopBar({
  title,
  pill,
  cta,
  children,
  settingsButtonRef,
  onSettingsClick,
}: ViewTopBarProps) {
  const ps = pill ? pillStyles[pill.color || 'accent'] : null;

  return (
    <div className="h-[54px] flex items-center justify-between gap-4 border-b border-border-light px-5 shrink-0">
      {/* Left: title + pill */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-[16px] font-extrabold text-text-dark tracking-tight truncate" style={{ fontFamily: "'Syne', var(--font-display)" }}>
          {title}
        </h1>
        {pill && ps && (
          <span className={`text-[10px] font-bold tracking-wide uppercase px-2.5 py-[3px] rounded-md border ${ps}`} style={{ fontFamily: "'Syne', var(--font-display)" }}>
            {pill.label}
          </span>
        )}
      </div>

      {/* Center */}
      {children && <div className="flex-1 flex items-center justify-center min-w-0">{children}</div>}

      {/* Right */}
      <div className="flex items-center gap-2.5 shrink-0">
        {cta && (
          <button
            onClick={cta.onClick}
            className="flex items-center gap-1.5 px-4 py-[7px] rounded-lg text-[12px] font-bold bg-text-dark text-white hover:bg-brand-primary transition-colors shadow-sm"
          >
            {cta.icon}
            {cta.label}
          </button>
        )}
        <HeaderButtons
          settingsButtonRef={settingsButtonRef}
          onSettingsClick={onSettingsClick}
        />
      </div>
    </div>
  );
}
