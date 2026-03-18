import type { ViewMode } from '../types/calendar.types';

interface ViewModeSelectorProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const modes: { value: ViewMode; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' }
];

export default function ViewModeSelector({ value, onChange }: ViewModeSelectorProps) {
  return (
    <div className="flex items-center gap-4">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => onChange(mode.value)}
          className={`
            text-sm transition-colors
            ${value === mode.value
              ? 'text-gray-900 font-medium'
              : 'text-gray-400 hover:text-gray-600'
            }
          `}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
