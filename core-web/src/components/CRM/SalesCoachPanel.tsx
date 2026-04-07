import { useState } from 'react';
import {
  AcademicCapIcon,
  SparklesIcon,
  ShieldExclamationIcon,
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';
import { getCrmCoachAdvice, analyzeCrmSentiment, suggestCrmAction, qualifyCrmLead, draftCrmFollowup } from '../../api/client';
import { toast } from 'sonner';

interface SalesCoachPanelProps {
  opportunityId: string;
  workspaceId: string;
  onClose: () => void;
}

type CoachTab = 'coach' | 'qualify' | 'actions' | 'followup';

export default function SalesCoachPanel({ opportunityId, workspaceId, onClose }: SalesCoachPanelProps) {
  const [activeTab, setActiveTab] = useState<CoachTab>('coach');
  const [loading, setLoading] = useState(false);
  const [coaching, setCoaching] = useState<any>(null);
  const [qualification, setQualification] = useState<any>(null);
  const [actions, setActions] = useState<any>(null);
  const [followup, setFollowup] = useState<any>(null);

  const handleCoach = async () => {
    setLoading(true);
    try {
      const result = await getCrmCoachAdvice(opportunityId, workspaceId);
      setCoaching(result.coaching);
    } catch { toast.error('Error al obtener coaching'); }
    setLoading(false);
  };

  const handleQualify = async () => {
    setLoading(true);
    try {
      const result = await qualifyCrmLead(opportunityId, workspaceId);
      setQualification(result.qualification);
    } catch { toast.error('Error al calificar'); }
    setLoading(false);
  };

  const handleActions = async () => {
    setLoading(true);
    try {
      const result = await suggestCrmAction(opportunityId, workspaceId);
      setActions(result.suggestions);
    } catch { toast.error('Error al sugerir acciones'); }
    setLoading(false);
  };

  const handleFollowup = async () => {
    setLoading(true);
    try {
      const result = await draftCrmFollowup(opportunityId, workspaceId);
      setFollowup(result.draft);
    } catch { toast.error('Error al generar borrador'); }
    setLoading(false);
  };

  const tabs = [
    { id: 'coach' as const, label: 'Coach', icon: AcademicCapIcon, action: handleCoach },
    { id: 'qualify' as const, label: 'BANT', icon: ShieldExclamationIcon, action: handleQualify },
    { id: 'actions' as const, label: 'Acciones', icon: LightBulbIcon, action: handleActions },
    { id: 'followup' as const, label: 'Follow-up', icon: ChatBubbleLeftRightIcon, action: handleFollowup },
  ];

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-slate-800">AI Sales Assistant</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
          <XMarkIcon className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 p-1.5 border-b border-slate-100">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); tab.action(); }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                activeTab === tab.id ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Analizando...</p>
          </div>
        )}

        {!loading && activeTab === 'coach' && coaching && (
          <div className="space-y-4">
            {coaching.pitch_suggestions?.length > 0 && (
              <Section title="Sugerencias de pitch">
                {coaching.pitch_suggestions.map((s: string, i: number) => (
                  <p key={i} className="text-xs text-slate-600 leading-relaxed">• {s}</p>
                ))}
              </Section>
            )}
            {coaching.objection_handling?.length > 0 && (
              <Section title="Manejo de objeciones">
                {coaching.objection_handling.map((o: any, i: number) => (
                  <div key={i} className="text-xs space-y-0.5">
                    <p className="font-medium text-red-600">Objecion: {o.objection}</p>
                    <p className="text-emerald-700">Respuesta: {o.response}</p>
                  </div>
                ))}
              </Section>
            )}
            {coaching.talking_points?.length > 0 && (
              <Section title="Puntos clave">
                {coaching.talking_points.map((t: string, i: number) => (
                  <p key={i} className="text-xs text-slate-600">• {t}</p>
                ))}
              </Section>
            )}
            {coaching.closing_strategy && (
              <Section title="Estrategia de cierre">
                <p className="text-xs text-slate-700">{coaching.closing_strategy}</p>
              </Section>
            )}
          </div>
        )}

        {!loading && activeTab === 'qualify' && qualification && (
          <div className="space-y-3">
            <div className="text-center py-2">
              <span className="text-2xl font-bold text-slate-900">{qualification.overall_score || '?'}</span>
              <span className="text-xs text-slate-400">/100</span>
              <p className={`text-xs font-semibold mt-1 ${
                qualification.recommendation === 'qualified' ? 'text-emerald-600' :
                qualification.recommendation === 'nurture' ? 'text-amber-600' : 'text-red-600'
              }`}>{qualification.recommendation?.toUpperCase()}</p>
            </div>
            {qualification.bant && Object.entries(qualification.bant).map(([key, val]: [string, any]) => (
              <div key={key} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                <span className="text-xs font-bold text-slate-500 uppercase w-20 shrink-0">{key}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-1 mb-0.5">
                    {[1,2,3,4,5].map(n => (
                      <div key={n} className={`w-3 h-3 rounded-full ${n <= (val?.score || 0) ? 'bg-blue-500' : 'bg-slate-200'}`} />
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500">{val?.note}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && activeTab === 'actions' && actions && (
          <div className="space-y-2">
            {(actions.suggestions || []).map((s: any, i: number) => (
              <div key={i} className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    s.priority === 'high' ? 'bg-red-100 text-red-700' :
                    s.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>{s.priority}</span>
                  <p className="text-xs font-medium text-slate-800">{s.action}</p>
                </div>
                <p className="text-[10px] text-slate-500">{s.reason}</p>
              </div>
            ))}
          </div>
        )}

        {!loading && activeTab === 'followup' && followup && (
          <div className="space-y-3">
            <div className="p-3 bg-blue-50 rounded-xl">
              <p className="text-xs font-semibold text-blue-800 mb-1">Asunto: {followup.subject}</p>
              <pre className="text-xs text-blue-900 whitespace-pre-wrap leading-relaxed">{followup.body}</pre>
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(`Asunto: ${followup.subject}\n\n${followup.body}`); toast.success('Copiado al portapapeles'); }}
              className="w-full py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              Copiar email
            </button>
          </div>
        )}

        {!loading && !coaching && !qualification && !actions && !followup && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <SparklesIcon className="w-8 h-8 text-slate-300" />
            <p className="text-xs text-slate-400 text-center">Selecciona una pestaña para obtener asistencia de IA</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{title}</h4>
      {children}
    </div>
  );
}
