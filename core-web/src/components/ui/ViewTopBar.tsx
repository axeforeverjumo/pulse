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
  accent: 'bg-gradient-to-r from-blue-500/10 to-indigo-500/10 text-blue-600 border-blue-400/20',
  green: 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-600 border-emerald-400/20',
  amber: 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-600 border-amber-400/20',
  red: 'bg-gradient-to-r from-red-500/10 to-rose-500/10 text-red-600 border-red-400/20',
  cyan: 'bg-gradient-to-r from-cyan-500/10 to-sky-500/10 text-cyan-600 border-cyan-400/20',
  pink: 'bg-gradient-to-r from-pink-500/10 to-rose-500/10 text-pink-600 border-pink-400/20',
  violet: 'bg-gradient-to-r from-violet-500/10 to-purple-500/10 text-violet-600 border-violet-400/20',
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
    <div className="h-[52px] flex items-center justify-between gap-3 border-b border-border-light px-5 shrink-0">
      {/* Left: title + pill */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="font-display text-[15px] font-extrabold text-text-dark tracking-[-0.01em] truncate">
          {title}
        </h1>
        {pill && ps && (
          <span className={`text-[9px] font-display font-bold tracking-[0.06em] uppercase px-2.5 py-1 rounded-full border ${ps}`}>
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
            className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-[9px] text-[11px] font-semibold bg-gradient-to-b from-brand-primary to-indigo-700 text-white shadow-[0_2px_8px_-2px_rgba(91,127,255,0.4)] hover:shadow-[0_4px_12px_-2px_rgba(91,127,255,0.5)] hover:translate-y-[-0.5px] transition-all active:translate-y-0"
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
