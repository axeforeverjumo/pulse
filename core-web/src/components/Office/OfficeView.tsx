import ViewTopBar from '../ui/ViewTopBar';

const roles = [
  { emoji: '📋', name: 'Project Manager', dept: 'Marketing', status: 'Coordinando', color: 'from-blue-500 to-sky-400', progress: 78 },
  { emoji: '💻', name: 'Tech Lead', dept: 'Desarrollo', status: 'Revisando PRs', color: 'from-cyan-500 to-teal-400', progress: 64 },
  { emoji: '🎯', name: 'Director Comercial', dept: 'Comercial', status: 'Pipeline activo', color: 'from-amber-500 to-orange-400', progress: 82 },
  { emoji: '💰', name: 'CFO Virtual', dept: 'Finanzas', status: 'Monitorizando', color: 'from-green-500 to-emerald-400', progress: 91 },
  { emoji: '✍️', name: 'Content Writer', dept: 'Marketing', status: 'Redactando', color: 'from-pink-500 to-rose-400', progress: 45 },
  { emoji: '📊', name: 'Data Analyst', dept: 'General', status: 'Analizando', color: 'from-violet-500 to-purple-400', progress: 56 },
];

export default function OfficeView() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <ViewTopBar
        title="Oficina Virtual"
        pill={{ label: 'Activo', color: 'green' }}
      />
      <div className="flex-1 overflow-auto p-5">
        <div className="mb-6">
          <p className="text-[9.5px] font-bold tracking-[0.13em] uppercase text-text-tertiary mb-3">Empleados IA</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {roles.map((role) => (
              <div key={role.name} className="relative p-4 rounded-xl border border-border-light bg-bg-white hover:border-border-gray transition-all cursor-pointer group">
                <span className="absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded-[10px] bg-brand-primary/10 text-brand-primary border border-brand-primary/20 tracking-[0.04em]">IA</span>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${role.color} flex items-center justify-center text-xl mb-3`}>
                  {role.emoji}
                </div>
                <span className="text-[8.5px] font-bold tracking-[0.08em] uppercase px-2 py-0.5 rounded-full bg-bg-gray text-text-tertiary inline-block mb-2">{role.dept}</span>
                <p className="text-[12px] font-semibold text-text-dark mb-0.5">{role.name}</p>
                <div className="flex items-center gap-1 text-[10px] text-green-500 font-medium mb-3">
                  <span className="w-[5px] h-[5px] rounded-full bg-green-500" />
                  {role.status}
                </div>
                <div className="h-[3px] bg-bg-gray rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-primary to-indigo-500 transition-all" style={{ width: `${role.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
