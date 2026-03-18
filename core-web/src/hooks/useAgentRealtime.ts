/**
 * Supabase Realtime subscriptions for Agent observability.
 *
 * Three hooks:
 *  - useAgentStepsRealtime:  streams steps for a single task
 *  - useAgentTasksRealtime:  streams task status changes for an agent
 *  - useAgentStatusRealtime: streams agent instance status changes for a workspace
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AgentTaskStep, AgentTask, AgentInstance, AgentConversation } from '../api/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// useAgentStepsRealtime — live step stream for a specific task
// ---------------------------------------------------------------------------

export function useAgentStepsRealtime(
  taskId: string | null,
  initialSteps: AgentTaskStep[],
) {
  const [steps, setSteps] = useState<AgentTaskStep[]>(initialSteps);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Sync initial steps when they change (first load / task switch)
  useEffect(() => {
    setSteps(initialSteps);
  }, [initialSteps]);

  useEffect(() => {
    if (!taskId) return;

    const channel = supabase
      .channel(`agent_steps:${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_task_steps',
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const newStep = payload.new as AgentTaskStep;
          setSteps((prev) => {
            // Deduplicate by ID
            if (prev.some((s) => s.id === newStep.id)) return prev;
            return [...prev, newStep];
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [taskId]);

  return steps;
}

// ---------------------------------------------------------------------------
// useAgentTasksRealtime — live task updates for a specific agent
// ---------------------------------------------------------------------------

export function useAgentTasksRealtime(
  agentId: string | null,
  onTaskInsert?: (task: AgentTask) => void,
  onTaskUpdate?: (task: AgentTask) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onInsertRef = useRef(onTaskInsert);
  const onUpdateRef = useRef(onTaskUpdate);
  onInsertRef.current = onTaskInsert;
  onUpdateRef.current = onTaskUpdate;

  useEffect(() => {
    if (!agentId) return;

    const channel = supabase
      .channel(`agent_tasks:${agentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_tasks',
          filter: `agent_id=eq.${agentId}`,
        },
        (payload) => {
          onInsertRef.current?.(payload.new as AgentTask);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agent_tasks',
          filter: `agent_id=eq.${agentId}`,
        },
        (payload) => {
          onUpdateRef.current?.(payload.new as AgentTask);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [agentId]);
}

// ---------------------------------------------------------------------------
// useAgentStatusRealtime — live agent instance updates for a workspace
// ---------------------------------------------------------------------------

export function useAgentStatusRealtime(
  workspaceId: string | null,
  onUpdate?: (agent: AgentInstance) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel(`agent_instances:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agent_instances',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          onUpdateRef.current?.(payload.new as AgentInstance);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_instances',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          onUpdateRef.current?.(payload.new as AgentInstance);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [workspaceId]);
}

// ---------------------------------------------------------------------------
// useAgentConversationsRealtime — live conversation list updates for an agent
// ---------------------------------------------------------------------------

export function useAgentConversationsRealtime(
  agentId: string | null,
  onInsert?: (conversation: AgentConversation) => void,
  onUpdate?: (conversation: AgentConversation) => void,
  onDelete?: (conversationId: string) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);
  onInsertRef.current = onInsert;
  onUpdateRef.current = onUpdate;
  onDeleteRef.current = onDelete;

  useEffect(() => {
    if (!agentId) return;

    const channel = supabase
      .channel(`agent_conversations:${agentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_conversations',
          filter: `agent_id=eq.${agentId}`,
        },
        (payload) => {
          onInsertRef.current?.(payload.new as AgentConversation);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agent_conversations',
          filter: `agent_id=eq.${agentId}`,
        },
        (payload) => {
          onUpdateRef.current?.(payload.new as AgentConversation);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'agent_conversations',
          filter: `agent_id=eq.${agentId}`,
        },
        (payload) => {
          const id = (payload.old as { id?: string })?.id;
          if (id) onDeleteRef.current?.(id);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [agentId]);
}

// ---------------------------------------------------------------------------
// useConversationTasksRealtime — live task updates scoped to a conversation
// ---------------------------------------------------------------------------

export function useConversationTasksRealtime(
  conversationId: string | null,
  onTaskInsert?: (task: AgentTask) => void,
  onTaskUpdate?: (task: AgentTask) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onInsertRef = useRef(onTaskInsert);
  const onUpdateRef = useRef(onTaskUpdate);
  onInsertRef.current = onTaskInsert;
  onUpdateRef.current = onTaskUpdate;

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`conversation_tasks:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_tasks',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          onInsertRef.current?.(payload.new as AgentTask);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agent_tasks',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          onUpdateRef.current?.(payload.new as AgentTask);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [conversationId]);
}
