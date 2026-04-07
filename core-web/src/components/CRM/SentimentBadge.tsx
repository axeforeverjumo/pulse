interface SentimentBadgeProps {
  healthScore: number;
  sentiment?: string;
  size?: 'sm' | 'md';
}

const SENTIMENT_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  positive: { emoji: '😊', label: 'Positivo', color: 'bg-emerald-100 text-emerald-700 ring-emerald-300' },
  neutral: { emoji: '😐', label: 'Neutral', color: 'bg-slate-100 text-slate-600 ring-slate-300' },
  negative: { emoji: '😟', label: 'Negativo', color: 'bg-red-100 text-red-700 ring-red-300' },
  at_risk: { emoji: '⚠️', label: 'En riesgo', color: 'bg-amber-100 text-amber-700 ring-amber-300' },
};

export default function SentimentBadge({ healthScore, sentiment, size = 'sm' }: SentimentBadgeProps) {
  const config = SENTIMENT_CONFIG[sentiment || 'neutral'] || SENTIMENT_CONFIG.neutral;
  const isSm = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ring-1 font-medium ${config.color} ${
        isSm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
      }`}
      title={`Health: ${healthScore}/100 - ${config.label}`}
    >
      <span>{config.emoji}</span>
      {!isSm && <span>{healthScore}</span>}
    </span>
  );
}
