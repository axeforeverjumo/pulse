/**
 * ActionCard - Dynamic cards rendered in chat when the agent performs actions.
 * Parses special markers in assistant messages to render rich UI cards.
 *
 * Markers format: [ACTION:type|title|subtitle|status|meta]
 * Examples:
 *   [ACTION:task_created|Revisar propuesta|Proyecto Marketing|done|Asignado a Alex]
 *   [ACTION:deal_moved|Gamma Digital|Pipeline CRM|in_progress|Negociación → Propuesta]
 *   [ACTION:email_sent|Re: Presupuesto Q2|Email|done|Enviado a cliente@empresa.com]
 *   [ACTION:event_created|Reunión de equipo|Calendario|done|Mañana 10:00 - 11:00]
 */

const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
  done: { bg: 'bg-green-500/10', text: 'text-green-600', dot: 'bg-green-500' },
  in_progress: { bg: 'bg-amber-500/10', text: 'text-amber-600', dot: 'bg-amber-500' },
  error: { bg: 'bg-red-500/10', text: 'text-red-600', dot: 'bg-red-500' },
  pending: { bg: 'bg-blue-500/10', text: 'text-blue-600', dot: 'bg-blue-500' },
};

const typeIcons: Record<string, string> = {
  task_created: '📋',
  task_updated: '✏️',
  deal_moved: '🎯',
  deal_created: '💼',
  email_sent: '✉️',
  email_draft: '📝',
  event_created: '📅',
  contact_created: '👤',
  note_created: '📝',
  file_uploaded: '📁',
  automation_triggered: '⚡',
};

const typeLabels: Record<string, string> = {
  task_created: 'Tarea creada',
  task_updated: 'Tarea actualizada',
  deal_moved: 'Deal movido',
  deal_created: 'Deal creado',
  email_sent: 'Email enviado',
  email_draft: 'Borrador creado',
  event_created: 'Evento creado',
  contact_created: 'Contacto creado',
  note_created: 'Nota creada',
  file_uploaded: 'Archivo subido',
  automation_triggered: 'Automatización',
};

interface ParsedAction {
  type: string;
  title: string;
  subtitle: string;
  status: string;
  meta: string;
}

export function parseActions(content: string): { text: string; actions: ParsedAction[] } {
  const actionRegex = /\[ACTION:([^|]+)\|([^|]+)\|([^|]*)\|([^|]*)\|([^\]]*)\]/g;
  const actions: ParsedAction[] = [];
  const text = content.replace(actionRegex, (_, type, title, subtitle, status, meta) => {
    actions.push({ type, title, subtitle, status, meta });
    return '';
  }).trim();
  return { text, actions };
}

export function ActionCard({ action }: { action: ParsedAction }) {
  const sc = statusColors[action.status] || statusColors.pending;
  const icon = typeIcons[action.type] || '📌';
  const label = typeLabels[action.type] || action.type;

  return (
    <div className="my-2 mx-1 rounded-[10px] border border-border-gray bg-bg-gray/50 overflow-hidden transition-all hover:border-border-gray-dark">
      {/* Card header */}
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.08em] uppercase text-text-tertiary">
              {label}
            </span>
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${sc.bg} ${sc.text}`}>
              <span className={`w-[5px] h-[5px] rounded-full ${sc.dot}`} />
              {action.status === 'done' ? 'Hecho' : action.status === 'in_progress' ? 'En curso' : action.status === 'error' ? 'Error' : 'Pendiente'}
            </div>
          </div>
        </div>
      </div>
      {/* Card body */}
      <div className="px-3 pb-2.5">
        <p className="text-[12px] font-medium text-text-dark leading-snug">{action.title}</p>
        {action.subtitle && (
          <p className="text-[10px] text-text-tertiary mt-0.5">{action.subtitle}</p>
        )}
        {action.meta && (
          <p className="text-[10px] text-text-secondary mt-1 flex items-center gap-1">
            <span className="opacity-50">→</span> {action.meta}
          </p>
        )}
      </div>
    </div>
  );
}
