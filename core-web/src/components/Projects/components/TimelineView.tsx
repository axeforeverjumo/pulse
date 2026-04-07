import { useMemo, useState } from 'react';
import { differenceInCalendarDays, addDays, format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ProjectIssue } from '../../../hooks/queries/useProjects';

interface Props {
  issues: ProjectIssue[];
  onIssueClick?: (issueId: string) => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  0: 'bg-gray-300',
  1: 'bg-rose-400',
  2: 'bg-orange-400',
  3: 'bg-amber-400',
  4: 'bg-slate-300',
};

export default function TimelineView({ issues, onIssueClick }: Props) {
  const [weeksToShow, setWeeksToShow] = useState(6);

  const { timelineStart, timelineDays, issuesWithDates, issuesNoDates } = useMemo(() => {
    const now = new Date();
    const start = startOfWeek(now, { locale: es });
    const end = addDays(start, weeksToShow * 7 - 1);
    const days = eachDayOfInterval({ start, end });

    const withDates = issues
      .filter(i => i.due_at || i.created_at)
      .map(i => {
        const created = new Date(i.created_at || now.toISOString());
        const due = i.due_at ? new Date(i.due_at) : addDays(created, 3);
        return { ...i, _start: created, _end: due };
      })
      .sort((a, b) => a._start.getTime() - b._start.getTime());

    const noDates = issues.filter(i => !i.due_at && !i.created_at);

    return { timelineStart: start, timelineDays: days, issuesWithDates: withDates, issuesNoDates: noDates };
  }, [issues, weeksToShow]);

  const totalDays = timelineDays.length;

  const getBarStyle = (start: Date, end: Date) => {
    const startOffset = differenceInCalendarDays(start, timelineStart);
    const duration = Math.max(differenceInCalendarDays(end, start), 1);
    const left = Math.max(0, (startOffset / totalDays) * 100);
    const width = Math.min((duration / totalDays) * 100, 100 - left);
    return { left: `${left}%`, width: `${Math.max(width, 1.5)}%` };
  };

  // Week headers
  const weeks = useMemo(() => {
    const result = [];
    for (let i = 0; i < weeksToShow; i++) {
      const weekStart = addDays(timelineStart, i * 7);
      const weekEnd = endOfWeek(weekStart, { locale: es });
      result.push({ start: weekStart, end: weekEnd, label: format(weekStart, 'd MMM', { locale: es }) });
    }
    return result;
  }, [timelineStart, weeksToShow]);

  return (
    <div className="p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-semibold text-gray-800">Timeline</h3>
        <div className="flex items-center gap-2">
          {[4, 6, 8, 12].map(w => (
            <button
              key={w}
              onClick={() => setWeeksToShow(w)}
              className={`px-2 py-1 text-[11px] rounded-md ${weeksToShow === w ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {w}s
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-[800px]">
        {/* Week headers */}
        <div className="flex border-b border-gray-200 mb-2">
          <div className="w-48 shrink-0" />
          <div className="flex-1 flex">
            {weeks.map((w, i) => (
              <div key={i} className="flex-1 text-[10px] text-gray-400 font-medium px-1 py-1 border-l border-gray-100 first:border-l-0">
                {w.label}
              </div>
            ))}
          </div>
        </div>

        {/* Today marker */}
        <div className="relative">
          {(() => {
            const todayOffset = differenceInCalendarDays(new Date(), timelineStart);
            if (todayOffset >= 0 && todayOffset < totalDays) {
              const left = (todayOffset / totalDays) * 100;
              return (
                <div
                  className="absolute top-0 bottom-0 w-px bg-indigo-400 z-10"
                  style={{ left: `calc(192px + (100% - 192px) * ${left / 100})` }}
                >
                  <div className="absolute -top-4 -translate-x-1/2 text-[9px] font-bold text-indigo-500">HOY</div>
                </div>
              );
            }
            return null;
          })()}

          {/* Issue rows */}
          {issuesWithDates.map((issue) => (
            <div
              key={issue.id}
              className="flex items-center h-8 hover:bg-gray-50 cursor-pointer group"
              onClick={() => onIssueClick?.(issue.id)}
            >
              <div className="w-48 shrink-0 pr-2">
                <span className="text-[11px] text-gray-600 truncate block" title={issue.title}>
                  <span className="text-gray-400 font-mono mr-1">#{issue.number}</span>
                  {issue.title}
                </span>
              </div>
              <div className="flex-1 relative h-full">
                <div
                  className={`absolute top-1.5 h-5 rounded-md ${PRIORITY_COLORS[issue.priority] || 'bg-gray-300'} opacity-80 group-hover:opacity-100 transition-opacity`}
                  style={getBarStyle(issue._start, issue._end)}
                  title={`${issue.title} — ${format(issue._start, 'd MMM', { locale: es })} → ${format(issue._end, 'd MMM', { locale: es })}`}
                >
                  {issue.completed_at && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[9px] text-white font-bold">DONE</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* No-date issues */}
          {issuesNoDates.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <span className="text-[11px] text-gray-400 font-medium">Sin fecha ({issuesNoDates.length})</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {issuesNoDates.map(i => (
                  <span
                    key={i.id}
                    onClick={() => onIssueClick?.(i.id)}
                    className="text-[11px] px-2 py-1 bg-gray-100 text-gray-600 rounded-md cursor-pointer hover:bg-gray-200"
                  >
                    #{i.number} {i.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
