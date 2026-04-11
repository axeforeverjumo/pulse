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
  accent: 'bg-blue-50 text-blue-600 border-blue-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-600 border-red-200',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  pink: 'bg-pink-50 text-pink-600 border-pink-200',
  violet: 'bg-violet-50 text-violet-600 border-violet-200',
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
    <div className="h-[52px] flex items-center justify-between gap-4 border-b border-border-light px-5 shrink-0">
      {/* Left: title + pill */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-[15px] font-extrabold text-text-dark tracking-tight truncate">
          {title}
        </h1>
        {pill && ps && (
          <span className={`text-[10px] font-bold tracking-wide uppercase px-2.5 py-[3px] rounded-md border ${ps}`}>
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
