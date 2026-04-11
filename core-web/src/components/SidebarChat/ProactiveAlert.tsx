/**
 * ProactiveAlert - AI-generated proactive insight shown at the top of the chat.
 * The agent can push alerts based on module context (stale deals, pending tasks, etc.)
 */

interface ProactiveAlertProps {
  label: string;
  text: string;
  chips?: string[];
  onChipClick?: (chip: string) => void;
  onDismiss?: () => void;
}

export default function ProactiveAlert({ label, text, chips, onChipClick, onDismiss }: ProactiveAlertProps) {
  return (
    <div className="mx-3 mb-2 rounded-[10px] bg-brand-primary/[.07] border border-brand-primary/[.18] p-3 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[8.5px] font-bold tracking-[0.1em] uppercase text-brand-primary flex items-center gap-1">
          <span>⚡</span> {label}
        </span>
        {onDismiss && (
          <button onClick={onDismiss} className="text-brand-primary/40 hover:text-brand-primary text-xs leading-none">
            ✕
          </button>
        )}
      </div>
      <p className="text-[12px] text-text-dark leading-relaxed" dangerouslySetInnerHTML={{ __html: text }} />
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {chips.map((chip) => (
            <button
              key={chip}
              onClick={() => onChipClick?.(chip)}
              className="px-2.5 py-1 rounded-full bg-bg-white border border-border-gray text-[11px] text-text-secondary hover:bg-brand-primary/[.08] hover:border-brand-primary/[.2] hover:text-brand-primary transition-all cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
