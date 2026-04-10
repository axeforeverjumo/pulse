import ViewTopBar from '../ui/ViewTopBar';

const stats = [
  { label: 'MRR', value: '€0', sub: 'Configura tus datos', color: 'text-green-500' },
  { label: 'Facturas pendientes', value: '0', sub: 'Sin facturas', color: 'text-amber-500' },
  { label: 'Gastos mes', value: '€0', sub: 'Sin gastos registrados', color: 'text-text-dark' },
  { label: 'Margen', value: '—', sub: 'Sin datos suficientes', color: 'text-brand-primary' },
];

export default function FinanceView() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <ViewTopBar
        title="Finanzas"
        pill={{ label: 'Dashboard', color: 'green' }}
      />
      <div className="flex-1 overflow-auto p-5">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {stats.map((s) => (
            <div key={s.label} className="p-4 rounded-xl border border-border-light bg-bg-white">
              <p className="text-[10px] text-text-tertiary mb-1.5">{s.label}</p>
              <p className={`font-display text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[9.5px] text-text-tertiary mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl border border-border-light bg-bg-white">
            <h3 className="font-display text-[12px] font-semibold text-text-dark mb-3 flex items-center gap-2">
              <span>📄</span> Presupuestos
            </h3>
            <p className="text-[11px] text-text-tertiary text-center py-6">No hay presupuestos. El agente de Finanzas puede crearlos por ti.</p>
          </div>
          <div className="p-4 rounded-xl border border-border-light bg-bg-white">
            <h3 className="font-display text-[12px] font-semibold text-text-dark mb-3 flex items-center gap-2">
              <span>🧾</span> Facturas
            </h3>
            <p className="text-[11px] text-text-tertiary text-center py-6">No hay facturas. Conecta tu sistema de facturación o crea facturas desde aquí.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
