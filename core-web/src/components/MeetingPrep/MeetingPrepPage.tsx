import { useParams } from 'react-router-dom';
import {
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import MeetingPrepView from '../Knowledge/MeetingPrepView';

export default function MeetingPrepPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  if (!workspaceId) return null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <CalendarDaysIcon className="w-5 h-5 text-indigo-500" />
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Meeting Prep</h1>
        <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
          Briefings con contexto IA
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <MeetingPrepView workspaceId={workspaceId} />
      </div>
    </div>
  );
}
