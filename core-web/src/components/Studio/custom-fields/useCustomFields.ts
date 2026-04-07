import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';

export interface CustomFieldDefinition {
  id: string;
  workspace_id: string;
  module: string;
  field_key: string;
  field_label: string;
  field_type: string;
  options: { label: string; value: string; color?: string }[];
  default_value: unknown;
  required: boolean;
  position: number;
  is_visible: boolean;
  section: string;
}

export interface CustomFieldValue {
  id: string;
  field_id: string;
  entity_id: string;
  value: unknown;
}

const cfKeys = {
  all: ['custom-fields'] as const,
  definitions: (workspaceId: string, module: string) =>
    [...cfKeys.all, 'defs', workspaceId, module] as const,
  values: (entityId: string) =>
    [...cfKeys.all, 'values', entityId] as const,
};

export function useCustomFieldDefinitions(workspaceId: string | null, module: string) {
  return useQuery({
    queryKey: cfKeys.definitions(workspaceId!, module),
    queryFn: async () => {
      const data = await api<{ fields: CustomFieldDefinition[] }>(
        `/studio/custom-fields?workspace_id=${workspaceId}&module=${module}`
      );
      return data.fields;
    },
    enabled: !!workspaceId && !!module,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCustomFieldValues(entityId: string | null) {
  return useQuery({
    queryKey: cfKeys.values(entityId!),
    queryFn: async () => {
      const data = await api<{ values: CustomFieldValue[] }>(
        `/studio/custom-fields/values?entity_id=${entityId}`
      );
      return data.values;
    },
    enabled: !!entityId,
    staleTime: 30 * 1000,
  });
}

export function useUpsertCustomFieldValues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: { field_id: string; entity_id: string; value: unknown }[]) => {
      return api<{ values: CustomFieldValue[] }>('/studio/custom-fields/values', {
        method: 'PUT',
        body: JSON.stringify({ items }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cfKeys.all });
    },
  });
}
