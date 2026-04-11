import { useParams } from 'react-router-dom';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import EmailsCard from './components/EmailsCard';
import QuickChatCard from './components/QuickChatCard';
import ProjectsCard from './components/ProjectsCard';
import CalendarCard from './components/CalendarCard';
import AgentsCard from './components/AgentsCard';

export default function DashboardView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const workspace = workspaces.find((w) => w.id === workspaceId);

  if (!workspace) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background-primary">
        <p className="text-text-tertiary">Espacio de trabajo no encontrado</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full min-w-0 overflow-hidden">
      <div className="flex-1 min-w-0 overflow-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 sm:gap-4">
          <section className="app-soft-card relative overflow-hidden rounded-2xl sm:rounded-3xl border border-[#d7e4f2] p-4 sm:p-5">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-sky-200/30 via-transparent to-emerald-200/20" />
            <div className="relative flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] sm:text-xs font-semibold tracking-[0.18em] uppercase text-slate-500">
                  Pulse Control Center
                </p>
                <h1 className="text-xl sm:text-2xl font-extrabold text-text-dark tracking-tight">
                  {workspace.name}
                </h1>
              </div>
              <div className="inline-flex items-center gap-2 text-xs text-slate-600">
                <span className="rounded-full border border-[#d5e2f1] bg-white/80 px-2.5 py-1">
                  {workspace.apps.length} apps activas
                </span>
              </div>
            </div>
          </section>

          {/* Responsive Bento Grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6 auto-rows-[minmax(220px,1fr)]">
            <div className="sm:col-span-2 xl:col-span-3 min-h-[280px]">
              <EmailsCard />
            </div>
            <div className="sm:col-span-2 xl:col-span-3 min-h-[280px]">
              <QuickChatCard />
            </div>
            <div className="sm:col-span-1 xl:col-span-2 min-h-[240px]">
              <ProjectsCard />
            </div>
            <div className="sm:col-span-1 xl:col-span-2 min-h-[240px]">
              <CalendarCard />
            </div>
            <div className="sm:col-span-2 xl:col-span-2 min-h-[240px]">
              <AgentsCard />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
