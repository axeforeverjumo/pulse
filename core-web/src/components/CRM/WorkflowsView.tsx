import { useEffect, useState, useCallback } from 'react';
import {
  BoltIcon,
  PlusIcon,
  XMarkIcon,
  TrashIcon,
  PlayIcon,
  PauseIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useCrmStore } from '../../stores/crmStore';
import {
  createCrmWorkflow,
  updateCrmWorkflow,
  deleteCrmWorkflow,
} from '../../api/client';

const TRIGGER_TYPES = [
  { id: 'new_lead', label: 'Nuevo lead' },
  { id: 'stage_change', label: 'Cambio de etapa' },
  { id: 'lead_won', label: 'Lead ganado' },
  { id: 'lead_lost', label: 'Lead perdido' },
  { id: 'manual', label: 'Manual' },
];

const ACTION_TYPES = [
  { id: 'send_email', label: 'Enviar email' },
  { id: 'send_notification', label: 'Enviar notificacion' },
  { id: 'create_task', label: 'Crear tarea' },
  { id: 'update_stage', label: 'Cambiar etapa' },
  { id: 'assign_agent', label: 'Asignar agente IA' },
  { id: 'wait', label: 'Esperar' },
  { id: 'create_quotation', label: 'Crear presupuesto' },
  { id: 'create_meeting', label: 'Crear reunion' },
  { id: 'ai_action', label: 'Accion IA' },
];

const STAGE_OPTIONS = [
  { id: 'lead', label: 'Lead' },
  { id: 'qualified', label: 'Calificado' },
  { id: 'proposal', label: 'Propuesta' },
  { id: 'negotiation', label: 'Negociacion' },
  { id: 'won', label: 'Ganado' },
  { id: 'lost', label: 'Perdido' },
];

interface WorkflowStep {
  action_type: string;
  action_config: Record<string, any>;
  condition?: Record<string, any> | null;
}

interface WorkflowTemplate {
  name: string;
  description: string;
  trigger_type: string;
  trigger_config: Record<string, any>;
  steps: WorkflowStep[];
}

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    name: 'Nuevo lead - Email de bienvenida',
    description: 'Envia un email de bienvenida automaticamente cuando llega un nuevo lead',
    trigger_type: 'new_lead',
    trigger_config: {},
    steps: [
      { action_type: 'send_email', action_config: { template: 'welcome', subject: 'Bienvenido' } },
    ],
  },
  {
    name: 'Lead calificado - Tarea de seguimiento',
    description: 'Crea una tarea de seguimiento cuando un lead pasa a calificado',
    trigger_type: 'stage_change',
    trigger_config: { target_stage: 'qualified' },
    steps: [
      { action_type: 'create_task', action_config: { title: 'Seguimiento de lead calificado' } },
    ],
  },
  {
    name: 'Lead ganado - Notificacion + Presupuesto',
    description: 'Notifica al equipo y crea un presupuesto cuando se gana un lead',
    trigger_type: 'lead_won',
    trigger_config: {},
    steps: [
      { action_type: 'send_notification', action_config: { title: 'Lead ganado!', body: 'Se ha ganado una nueva oportunidad' } },
      { action_type: 'create_quotation', action_config: {} },
    ],
  },
];

function StepConfigFields({ step, onChange }: { step: WorkflowStep; onChange: (config: Record<string, any>) => void }) {
  const config = step.action_config;

  switch (step.action_type) {
    case 'send_email':
      return (
        <div className="space-y-2">
          <input
            value={config.subject || ''}
            onChange={(e) => onChange({ ...config, subject: e.target.value })}
            placeholder="Asunto del email"
            className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <input
            value={config.template || ''}
            onChange={(e) => onChange({ ...config, template: e.target.value })}
            placeholder="Plantilla (opcional)"
            className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      );
    case 'wait':
      return (
        <input
          type="number"
          value={config.duration_minutes || 60}
          onChange={(e) => onChange({ ...config, duration_minutes: Number(e.target.value) })}
          placeholder="Minutos de espera"
          className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      );
    case 'create_task':
      return (
        <input
          value={config.title || ''}
          onChange={(e) => onChange({ ...config, title: e.target.value })}
          placeholder="Titulo de la tarea"
          className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      );
    case 'update_stage':
      return (
        <select
          value={config.stage || ''}
          onChange={(e) => onChange({ ...config, stage: e.target.value })}
          className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">Seleccionar etapa</option>
          {STAGE_OPTIONS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      );
    case 'send_notification':
      return (
        <div className="space-y-2">
          <input
            value={config.title || ''}
            onChange={(e) => onChange({ ...config, title: e.target.value })}
            placeholder="Titulo de la notificacion"
            className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <input
            value={config.body || ''}
            onChange={(e) => onChange({ ...config, body: e.target.value })}
            placeholder="Mensaje"
            className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      );
    case 'ai_action':
      return (
        <textarea
          value={config.instruction || ''}
          onChange={(e) => onChange({ ...config, instruction: e.target.value })}
          placeholder="Instruccion para la IA..."
          rows={2}
          className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
        />
      );
    default:
      return null;
  }
}

function WorkflowModal({
  workflow,
  workspaceId,
  onClose,
  onSaved,
}: {
  workflow?: any;
  workspaceId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [triggerType, setTriggerType] = useState(workflow?.trigger_type || 'manual');
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>(workflow?.trigger_config || {});
  const [isActive, setIsActive] = useState(workflow?.is_active ?? true);
  const [steps, setSteps] = useState<WorkflowStep[]>(
    workflow?.crm_workflow_steps?.map((s: any) => ({
      action_type: s.action_type,
      action_config: s.action_config || {},
      condition: s.condition,
    })) || []
  );
  const [saving, setSaving] = useState(false);

  const addStep = () => {
    setSteps([...steps, { action_type: 'send_notification', action_config: {} }]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const newSteps = [...steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSteps.length) return;
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    setSteps(newSteps);
  };

  const updateStep = (index: number, field: string, value: any) => {
    const newSteps = [...steps];
    (newSteps[index] as any)[field] = value;
    setSteps(newSteps);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    setSaving(true);
    try {
      const data = {
        workspace_id: workspaceId,
        name: name.trim(),
        description: description.trim() || null,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        is_active: isActive,
        steps,
      };

      if (workflow?.id) {
        await updateCrmWorkflow(workflow.id, data);
        toast.success('Automatizacion actualizada');
      } else {
        await createCrmWorkflow(data);
        toast.success('Automatizacion creada');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (template: WorkflowTemplate) => {
    setName(template.name);
    setDescription(template.description);
    setTriggerType(template.trigger_type);
    setTriggerConfig(template.trigger_config);
    setSteps(template.steps);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            {workflow ? 'Editar automatizacion' : 'Nueva automatizacion'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
            <XMarkIcon className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Templates - only for new workflows */}
          {!workflow && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Plantillas
              </label>
              <div className="flex flex-wrap gap-2">
                {WORKFLOW_TEMPLATES.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => applyTemplate(t)}
                    className="px-3 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Nombre
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la automatizacion"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Descripcion
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripcion (opcional)"
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Disparador
            </label>
            <select
              value={triggerType}
              onChange={(e) => {
                setTriggerType(e.target.value);
                setTriggerConfig({});
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {TRIGGER_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>

            {/* Stage change config */}
            {triggerType === 'stage_change' && (
              <div className="mt-2">
                <select
                  value={triggerConfig.target_stage || ''}
                  onChange={(e) => setTriggerConfig({ ...triggerConfig, target_stage: e.target.value || undefined })}
                  className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">Cualquier etapa</option>
                  {STAGE_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                isActive ? 'bg-blue-500' : 'bg-slate-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition duration-200 ease-in-out ${
                  isActive ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-slate-600">{isActive ? 'Activa' : 'Inactiva'}</span>
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Pasos ({steps.length})
              </label>
              <button
                onClick={addStep}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Agregar paso
              </button>
            </div>

            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-slate-400 w-5">{i + 1}</span>
                    <select
                      value={step.action_type}
                      onChange={(e) => {
                        updateStep(i, 'action_type', e.target.value);
                        updateStep(i, 'action_config', {});
                      }}
                      className="flex-1 px-2 py-1 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-200"
                    >
                      {ACTION_TYPES.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => moveStep(i, 'up')}
                        disabled={i === 0}
                        className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30 transition-colors"
                      >
                        <ChevronUpIcon className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      <button
                        onClick={() => moveStep(i, 'down')}
                        disabled={i === steps.length - 1}
                        className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30 transition-colors"
                      >
                        <ChevronDownIcon className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      <button
                        onClick={() => removeStep(i)}
                        className="p-0.5 rounded hover:bg-red-50 transition-colors ml-1"
                      >
                        <TrashIcon className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                  <StepConfigFields
                    step={step}
                    onChange={(config) => updateStep(i, 'action_config', config)}
                  />
                </div>
              ))}
              {steps.length === 0 && (
                <p className="text-center text-[12px] text-slate-400 py-4">
                  No hay pasos. Agrega al menos un paso.
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : workflow ? 'Guardar cambios' : 'Crear automatizacion'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface WorkflowsViewProps {
  workspaceId: string;
}

export default function WorkflowsView({ workspaceId }: WorkflowsViewProps) {
  const { workflows, fetchWorkflows } = useCrmStore();
  const [showModal, setShowModal] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<any>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchWorkflows(workspaceId);
  }, [workspaceId, fetchWorkflows]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar esta automatizacion?')) return;
    setDeleting(id);
    try {
      await deleteCrmWorkflow(id);
      toast.success('Automatizacion eliminada');
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar');
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleActive = async (wf: any) => {
    try {
      await updateCrmWorkflow(wf.id, { is_active: !wf.is_active });
      toast.success(wf.is_active ? 'Automatizacion desactivada' : 'Automatizacion activada');
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error');
    }
  };

  const getTriggerLabel = (type: string) =>
    TRIGGER_TYPES.find((t) => t.id === type)?.label || type;

  return (
    <div className="flex-1 overflow-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Automatizaciones</h2>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Acciones automaticas cuando cambian tus oportunidades
          </p>
        </div>
        <button
          onClick={() => {
            setEditingWorkflow(null);
            setShowModal(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Nueva automatizacion
        </button>
      </div>

      {/* Workflow list */}
      {workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BoltIcon className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500">Sin automatizaciones</p>
          <p className="text-[12px] text-slate-400 mt-1">
            Crea tu primera automatizacion para agilizar tu pipeline
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {workflows.map((wf: any) => {
            const stepCount = wf.crm_workflow_steps?.length || 0;
            const lastRun = wf.last_run;

            return (
              <div
                key={wf.id}
                className="bg-white rounded-xl border border-slate-100 p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-[13px] font-medium text-slate-900 truncate">
                        {wf.name}
                      </h3>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          wf.is_active
                            ? 'bg-green-50 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {wf.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    {wf.description && (
                      <p className="text-[12px] text-slate-500 line-clamp-1 mb-1.5">{wf.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <BoltIcon className="w-3 h-3" />
                        {getTriggerLabel(wf.trigger_type)}
                      </span>
                      <span>{stepCount} {stepCount === 1 ? 'paso' : 'pasos'}</span>
                      {lastRun && (
                        <span>
                          Ultimo: {new Date(lastRun.started_at).toLocaleDateString('es-ES', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleActive(wf)}
                      title={wf.is_active ? 'Desactivar' : 'Activar'}
                      className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      {wf.is_active ? (
                        <PauseIcon className="w-4 h-4 text-slate-400" />
                      ) : (
                        <PlayIcon className="w-4 h-4 text-green-500" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setEditingWorkflow(wf);
                        setShowModal(true);
                      }}
                      className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(wf.id)}
                      disabled={deleting === wf.id}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <TrashIcon className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <WorkflowModal
          workflow={editingWorkflow}
          workspaceId={workspaceId}
          onClose={() => {
            setShowModal(false);
            setEditingWorkflow(null);
          }}
          onSaved={load}
        />
      )}
    </div>
  );
}
