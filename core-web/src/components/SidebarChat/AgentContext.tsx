/**
 * Agent context config per module view.
 * Determines the agent name, avatar, gradient, status and suggestion chips
 * shown in the sidebar chat based on the current view.
 */

import type { ViewType } from '../../stores/viewContextStore';

export interface ProactiveAlertConfig {
  label: string;
  text: string;
  chips: string[];
}

export interface AgentConfig {
  name: string;
  status: string;
  gradient: string;
  emoji: string;
  pillColor: string;
  chips: string[];
  proactiveAlert?: ProactiveAlertConfig;
}

const agentConfigs: Record<string, AgentConfig> = {
  email: {
    name: 'Asistente de Correo',
    status: 'Leyendo bandeja',
    gradient: 'from-blue-500 to-sky-400',
    emoji: '✉️',
    pillColor: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    chips: ['Resumir emails', 'Redactar respuesta', 'Emails sin leer'],
    proactiveAlert: {
      label: 'Bandeja de entrada',
      text: 'Tienes emails sin leer que pueden requerir respuesta. Puedo <strong>resumirlos</strong> o redactar respuestas.',
      chips: ['Resumir sin leer', 'Emails urgentes'],
    },
  },
  projects: {
    name: 'Project Manager',
    status: 'Coordinando equipo',
    gradient: 'from-indigo-500 to-blue-500',
    emoji: '📋',
    pillColor: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    chips: ['Tareas pendientes', 'Crear tarea', 'Resumen del sprint'],
    proactiveAlert: {
      label: 'Sprint en curso',
      text: 'Revisa las <strong>tareas bloqueadas</strong> o atrasadas del sprint actual.',
      chips: ['Ver bloqueadas', 'Resumen del sprint'],
    },
  },
  crm: {
    name: 'Director Comercial',
    status: 'Analizando pipeline',
    gradient: 'from-amber-500 to-orange-500',
    emoji: '🎯',
    pillColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    chips: ['Ver pipeline', 'Nuevo contacto', 'Deals estancados'],
    proactiveAlert: {
      label: 'Accion requerida',
      text: 'Revisa tus <strong>deals sin actividad</strong> reciente. Puedo preparar follow-ups automaticos.',
      chips: ['Ver deals estancados', 'Preparar follow-ups'],
    },
  },
  marketing: {
    name: 'PulseMark',
    status: 'Monitorizando sitios',
    gradient: 'from-pink-500 to-rose-500',
    emoji: '📈',
    pillColor: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
    chips: ['Auditar SEO', 'Analizar tráfico', 'Competencia'],
  },
  calendar: {
    name: 'Asistente de Agenda',
    status: 'Revisando eventos',
    gradient: 'from-emerald-500 to-teal-500',
    emoji: '📅',
    pillColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    chips: ['Eventos de hoy', 'Crear evento', 'Buscar hueco libre'],
  },
  files: {
    name: 'Asistente de Archivos',
    status: 'Organizando docs',
    gradient: 'from-cyan-500 to-blue-400',
    emoji: '📁',
    pillColor: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    chips: ['Buscar documento', 'Resumir archivo', 'Archivos recientes'],
  },
  messages: {
    name: 'Asistente de Equipo',
    status: 'Escuchando canales',
    gradient: 'from-violet-500 to-purple-500',
    emoji: '👥',
    pillColor: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
    chips: ['Resumen canal', 'Mensajes sin leer', 'Buscar mensaje'],
  },
  agents: {
    name: 'Orquestador IA',
    status: 'Agentes disponibles',
    gradient: 'from-fuchsia-500 to-pink-500',
    emoji: '🤖',
    pillColor: 'bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20',
    chips: ['Listar agentes', 'Crear agente', 'Estado de tareas'],
  },
  dashboard: {
    name: 'Asistente Personal',
    status: 'Tu centro de control',
    gradient: 'from-brand-primary to-indigo-500',
    emoji: '🏠',
    pillColor: 'bg-brand-primary/10 text-brand-primary border-brand-primary/20',
    chips: ['Resumen del dia', 'Tareas urgentes', 'Emails importantes'],
  },
};

const defaultConfig: AgentConfig = {
  name: 'Pulse IA',
  status: 'Listo para ayudar',
  gradient: 'from-brand-primary to-indigo-600',
  emoji: '⚡',
  pillColor: 'bg-brand-primary/10 text-brand-primary border-brand-primary/20',
  chips: ['Ayuda', 'Buscar algo', 'Resumen general'],
};

export function getAgentConfig(view: ViewType | null): AgentConfig {
  if (!view) return defaultConfig;
  return agentConfigs[view] || defaultConfig;
}
