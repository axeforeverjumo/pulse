import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { PlusIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { Send, Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import { toast } from 'sonner';
import ViewTopBar from '../ui/ViewTopBar';

interface Employee {
  id: string;
  name: string;
  role: string;
  tier: string;
  avatar_url?: string;
  model: string;
}

interface Department {
  id: string;
  name: string;
  emoji: string;
  color: string;
  employees: Employee[];
  count: number;
}

interface OrgChart {
  total_employees: number;
  total_departments: number;
  departments: Department[];
  empty_departments: Department[];
}

interface Activity {
  id: string;
  agent_name: string;
  agent_avatar?: string;
  task: string;
  result_preview: string;
  created_at: string;
  message_count: number;
}

interface Candidate {
  name: string;
  role: string;
  department: string;
  description: string;
  personality: string;
  skills: string[];
  soul_md: string;
  interview_note: string;
}

export default function OfficeView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [orgChart, setOrgChart] = useState<OrgChart | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'org' | 'activity' | 'hire'>('org');

  // Head Hunter state
  const [hireInput, setHireInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [hiring, setHiring] = useState(false);

  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [org, acts] = await Promise.all([
        api<OrgChart>(`/office/workspaces/${workspaceId}/org-chart`),
        api<Activity[]>(`/office/workspaces/${workspaceId}/activity?limit=15`),
      ]);
      setOrgChart(org);
      setActivities(acts);
    } catch (e) {
      console.error('Failed to load office data:', e);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSearch = async () => {
    if (!hireInput.trim() || !workspaceId || searching) return;
    setSearching(true);
    setCandidate(null);
    try {
      const result = await api<{ found: boolean; candidate?: Candidate; error?: string }>(
        `/office/workspaces/${workspaceId}/headhunter`,
        { method: 'POST', body: JSON.stringify({ description: hireInput }) }
      );
      if (result.found && result.candidate) {
        setCandidate(result.candidate);
      } else {
        toast.error(result.error || 'No se encontro candidato');
      }
    } catch (e: any) {
      toast.error(e.message || 'Error buscando candidato');
    } finally {
      setSearching(false);
    }
  };

  const handleHire = async () => {
    if (!candidate || !workspaceId || hiring) return;
    setHiring(true);
    try {
      const result = await api<{ hired: boolean; message: string }>(
        `/office/workspaces/${workspaceId}/hire`,
        { method: 'POST', body: JSON.stringify({ candidate }) }
      );
      if (result.hired) {
        toast.success(result.message);
        setCandidate(null);
        setHireInput('');
        setTab('org');
        loadData();
      }
    } catch (e: any) {
      toast.error(e.message || 'Error contratando');
    } finally {
      setHiring(false);
    }
  };

  const tabs = [
    { id: 'org' as const, label: 'Organigrama', count: orgChart?.total_employees },
    { id: 'activity' as const, label: 'Actividad' },
    { id: 'hire' as const, label: 'Head Hunter', icon: <UserPlusIcon className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <ViewTopBar
        title="Oficina Virtual"
        pill={{ label: `${orgChart?.total_employees || 0} empleados`, color: 'green' }}
      />

      {/* Tabs */}
      <div className="flex gap-1 px-5 pt-3 pb-2 border-b border-border-light">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
              tab === t.id ? 'bg-text-dark text-white' : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-gray'
            }`}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className={`text-[10px] px-1.5 rounded-md ${tab === t.id ? 'bg-white/20' : 'bg-bg-gray'}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
          </div>
        ) : tab === 'org' ? (
          /* ── Org Chart ── */
          <div className="space-y-6">
            {orgChart?.departments.map((dept) => (
              <div key={dept.id}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{dept.emoji}</span>
                  <h3 className="text-[14px] font-bold text-text-dark">{dept.name}</h3>
                  <span className="text-[11px] text-text-tertiary">{dept.count} empleados</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                  {dept.employees.map((emp) => (
                    <div key={emp.id} className="flex items-start gap-3 p-3 rounded-xl border border-border-light bg-bg-white hover:border-border-gray transition-all">
                      {emp.avatar_url ? (
                        <img src={emp.avatar_url} alt={emp.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: dept.color }}>
                          {emp.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[12px] font-semibold text-text-dark truncate">{emp.name}</p>
                          <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                            emp.tier === 'openclaw' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
                          }`}>{emp.tier}</span>
                        </div>
                        <p className="text-[10px] text-text-tertiary truncate mt-0.5">{emp.role}</p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <span className="w-[5px] h-[5px] rounded-full bg-green-500" />
                          <span className="text-[9px] text-green-600 font-medium">Activo</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {orgChart?.departments.length === 0 && (
              <div className="text-center py-12 text-text-tertiary">
                <UserPlusIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No hay empleados virtuales</p>
                <p className="text-xs mt-1">Usa el Head Hunter para contratar tu primer empleado IA</p>
                <button onClick={() => setTab('hire')} className="mt-3 px-4 py-2 text-xs font-bold bg-text-dark text-white rounded-lg hover:bg-brand-primary transition-colors">
                  Contratar
                </button>
              </div>
            )}
          </div>
        ) : tab === 'activity' ? (
          /* ── Activity Feed ── */
          <div className="space-y-2">
            {activities.length === 0 ? (
              <p className="text-center text-sm text-text-tertiary py-12">Sin actividad reciente</p>
            ) : activities.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl border border-border-light bg-bg-white">
                {a.agent_avatar ? (
                  <img src={a.agent_avatar} alt={a.agent_name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-violet-700 text-sm font-bold shrink-0">
                    {a.agent_name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-text-dark">{a.agent_name}</span>
                    <span className="text-[10px] text-text-tertiary">{new Date(a.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-[11px] text-text-secondary mt-0.5">{a.task}</p>
                  {a.result_preview && (
                    <p className="text-[10px] text-text-tertiary mt-1 bg-bg-gray rounded-lg px-2 py-1.5">{a.result_preview}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── Head Hunter ── */
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-3xl mx-auto mb-3 shadow-lg">
                🕵️
              </div>
              <h2 className="text-lg font-extrabold text-text-dark tracking-tight">Head Hunter IA</h2>
              <p className="text-sm text-text-tertiary mt-1">Describe que necesitas y encontrare al candidato perfecto</p>
            </div>

            {/* Search input */}
            <div className="relative mb-6">
              <textarea
                value={hireInput}
                onChange={(e) => setHireInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSearch(); } }}
                placeholder="Ej: Necesito un comercial que gestione pipeline, haga follow-ups automaticos y redacte propuestas..."
                rows={3}
                className="w-full px-4 py-3 text-sm rounded-xl border border-border-gray bg-bg-white text-text-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/40 transition-all placeholder:text-text-tertiary resize-none"
              />
              <button
                onClick={handleSearch}
                disabled={!hireInput.trim() || searching}
                className="absolute bottom-3 right-3 w-8 h-8 rounded-lg bg-text-dark text-white flex items-center justify-center hover:bg-brand-primary transition-colors disabled:opacity-40"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>

            {/* Searching state */}
            {searching && (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-amber-500 mx-auto mb-2" />
                <p className="text-sm text-text-tertiary">Buscando al candidato ideal...</p>
              </div>
            )}

            {/* Candidate card */}
            {candidate && !searching && (
              <div className="rounded-xl border-2 border-green-200 bg-green-50/50 p-5 animate-in fade-in slide-in-from-bottom-3 duration-300">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-200 px-2 py-0.5 rounded-md">Candidato encontrado</span>
                </div>
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-lg font-bold shrink-0">
                    {candidate.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-text-dark">{candidate.name}</h3>
                    <p className="text-[12px] text-text-secondary">{candidate.role}</p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">{candidate.department}</p>
                  </div>
                </div>
                <p className="text-[12px] text-text-secondary mb-3">{candidate.description}</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {candidate.skills.map((s) => (
                    <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-bg-white border border-border-gray text-text-secondary">{s}</span>
                  ))}
                </div>
                <div className="bg-bg-white rounded-lg p-3 border border-border-light mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">Nota del Head Hunter</p>
                  <p className="text-[12px] text-text-secondary italic">{candidate.interview_note}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleHire}
                    disabled={hiring}
                    className="flex-1 py-2.5 rounded-lg text-[13px] font-bold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {hiring ? 'Contratando...' : 'Contratar'}
                  </button>
                  <button
                    onClick={() => { setCandidate(null); handleSearch(); }}
                    className="px-4 py-2.5 rounded-lg text-[13px] font-medium border border-border-gray text-text-secondary hover:bg-bg-gray transition-colors"
                  >
                    Buscar otro
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
