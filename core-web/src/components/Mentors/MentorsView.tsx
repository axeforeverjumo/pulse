import ViewTopBar from '../ui/ViewTopBar';

const mentors = [
  { emoji: '🧭', name: 'Asesor Estratégico', focus: 'Negocio', gradient: 'from-violet-500 to-indigo-500', desc: 'Analiza rentabilidad, estructura de precios y estrategia de crecimiento.' },
  { emoji: '📈', name: 'Growth Advisor', focus: 'Marketing', gradient: 'from-pink-500 to-rose-500', desc: 'Optimiza adquisición, retención y métricas de crecimiento.' },
  { emoji: '⚙️', name: 'CTO Advisor', focus: 'Tecnología', gradient: 'from-cyan-500 to-blue-500', desc: 'Arquitectura, stack tecnológico y decisiones de infraestructura.' },
  { emoji: '💼', name: 'Sales Coach', focus: 'Ventas', gradient: 'from-amber-500 to-orange-500', desc: 'Técnicas de cierre, pipeline management y estrategia comercial.' },
];

export default function MentorsView() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <ViewTopBar
        title="Board · Mentores"
        pill={{ label: 'Insights', color: 'accent' }}
      />
      <div className="flex-1 overflow-auto p-5">
        <p className="font-display text-[9.5px] font-bold tracking-[0.13em] uppercase text-text-tertiary mb-3">Tu squad de asesores</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {mentors.map((m) => (
            <div key={m.name} className="p-4 rounded-xl border border-border-light bg-bg-white hover:border-border-gray transition-all cursor-pointer group">
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${m.gradient} flex items-center justify-center text-xl shrink-0 relative`}>
                  {m.emoji}
                  <span className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-green-500 border-2 border-bg-white" />
                </div>
                <div>
                  <p className="font-display text-[12px] font-bold text-text-dark">{m.name}</p>
                  <span className="text-[10px] text-green-500 flex items-center gap-1">
                    <span className="w-[5px] h-[5px] rounded-full bg-green-500" />
                    Disponible
                  </span>
                </div>
              </div>
              <span className="text-[8.5px] font-display font-bold tracking-[0.08em] uppercase px-2 py-0.5 rounded-full bg-bg-gray text-text-tertiary inline-block mb-2">{m.focus}</span>
              <p className="text-[11px] text-text-secondary leading-relaxed">{m.desc}</p>
              <button className="mt-3 w-full py-2 rounded-lg text-[11px] font-medium border border-border-light text-text-secondary hover:bg-brand-primary/[.05] hover:border-brand-primary/[.2] hover:text-brand-primary transition-all">
                Consultar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
