import { useCallback } from 'react';
import { useCustomFieldDefinitions, useCustomFieldValues, useUpsertCustomFieldValues } from './useCustomFields';
import CustomFieldInput from './CustomFieldInput';

interface Props {
  workspaceId: string;
  module: string;
  entityId: string;
}

export default function CustomFieldsRenderer({ workspaceId, module, entityId }: Props) {
  const { data: definitions, isLoading: defsLoading } = useCustomFieldDefinitions(workspaceId, module);
  const { data: values, isLoading: valsLoading } = useCustomFieldValues(entityId);
  const upsert = useUpsertCustomFieldValues();

  const getFieldValue = useCallback((fieldId: string) => {
    if (!values) return undefined;
    const val = values.find((v) => v.field_id === fieldId);
    return val?.value;
  }, [values]);

  const handleChange = useCallback((fieldId: string, value: unknown) => {
    upsert.mutate([{ field_id: fieldId, entity_id: entityId, value }]);
  }, [entityId, upsert]);

  if (defsLoading || valsLoading) return null;

  const visibleFields = (definitions || [])
    .filter((d) => d.is_visible)
    .sort((a, b) => a.position - b.position);

  if (visibleFields.length === 0) return null;

  // Group by section
  const sections = new Map<string, typeof visibleFields>();
  for (const field of visibleFields) {
    const sec = field.section || 'custom';
    if (!sections.has(sec)) sections.set(sec, []);
    sections.get(sec)!.push(field);
  }

  return (
    <div className="mt-4 space-y-4">
      {Array.from(sections.entries()).map(([section, fields]) => (
        <div key={section}>
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {section === 'custom' ? 'Campos personalizados' : section}
          </h4>
          <div className="space-y-3">
            {fields.map((field) => (
              <CustomFieldInput
                key={field.id}
                definition={field}
                value={getFieldValue(field.id)}
                onChange={(val) => handleChange(field.id, val)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
