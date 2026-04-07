interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export default function ScoreBadge({ score, size = 'sm', showLabel }: ScoreBadgeProps) {
  const getColor = (s: number) => {
    if (s >= 70) return { bg: 'bg-emerald-100', text: 'text-emerald-700', ring: 'ring-emerald-300' };
    if (s >= 40) return { bg: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-300' };
    return { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-300' };
  };

  const colors = getColor(score);
  const isSm = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ring-1 font-semibold ${colors.bg} ${colors.text} ${colors.ring} ${
        isSm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
      }`}
      title={`Lead Score: ${score}/100`}
    >
      {score}
      {showLabel && <span className="font-normal opacity-70">pts</span>}
    </span>
  );
}
