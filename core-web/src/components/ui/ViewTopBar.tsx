import { type ReactNode } from 'react';
import { HeaderButtons } from '../MiniAppHeader';

interface PillConfig {
  label: string;
  color?: 'accent' | 'green' | 'amber' | 'red' | 'cyan';
}

interface ViewTopBarProps {
  title: string;
  pill?: PillConfig;
  /** Primary CTA button */
  cta?: {
    label: string;
    icon?: ReactNode;
    onClick: () => void;
  };
  /** Extra content between title and right actions */
  children?: ReactNode;
  /** Pass through to HeaderButtons */
  settingsButtonRef?: React.RefObject<HTMLButtonElement | null>;
  onSettingsClick?: () => void;
}

const pillColors: Record<string, { bg: string; text: string; border: string }> = {
  accent: { bg: 'bg-brand-primary/[.1]', text: 'text-brand-primary', border: 'border-brand-primary/[.18]' },
  green: { bg: 'bg-green-500/[.1]', text: 'text-green-600', border: 'border-green-500/[.18]' },
  amber: { bg: 'bg-amber-500/[.1]', text: 'text-amber-600', border: 'border-amber-500/[.18]' },
  red: { bg: 'bg-red-500/[.1]', text: 'text-red-600', border: 'border-red-500/[.18]' },
  cyan: { bg: 'bg-cyan-500/[.1]', text: 'text-cyan-600', border: 'border-cyan-500/[.18]' },
};

export default function ViewTopBar({
  title,
  pill,
  cta,
  children,
  settingsButtonRef,
  onSettingsClick,
}: ViewTopBarProps) {
  const pc = pill ? pillColors[pill.color || 'accent'] : null;

  return (
    <div className="h-[50px] flex items-center justify-between gap-3 border-b border-border-light px-4 shrink-0">
      {/* Left: title + pill */}
      <div className="flex items-center gap-2.5 min-w-0">
        <h1 className="font-display text-sm font-bold text-text-dark truncate">
          {title}
        </h1>
        {pill && pc && (
          <span className={`text-[9px] font-display font-bold tracking-[0.1em] uppercase px-2 py-0.5 rounded-full border ${pc.bg} ${pc.text} ${pc.border}`}>
            {pill.label}
          </span>
        )}
      </div>

      {/* Center: optional content */}
      {children && <div className="flex-1 flex items-center justify-center min-w-0">{children}</div>}

      {/* Right: CTA + header buttons */}
      <div className="flex items-center gap-2 shrink-0">
        {cta && (
          <button
            onClick={cta.onClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-brand-primary text-white hover:opacity-90 transition-opacity"
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
