import type { CustomFieldDefinition } from './useCustomFields';

interface Props {
  definition: CustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

export default function CustomFieldInput({ definition, value, onChange }: Props) {
  const { field_type, field_label, options, required } = definition;
  const current = value ?? definition.default_value ?? '';

  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-600 mb-1">
        {field_label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>

      {(field_type === 'text' || field_type === 'url' || field_type === 'email' || field_type === 'phone') && (
        <input
          type={field_type === 'email' ? 'email' : field_type === 'url' ? 'url' : field_type === 'phone' ? 'tel' : 'text'}
          value={String(current)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
        />
      )}

      {(field_type === 'number' || field_type === 'currency' || field_type === 'rating') && (
        <input
          type="number"
          value={current === null || current === '' ? '' : Number(current)}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          min={field_type === 'rating' ? 0 : undefined}
          max={field_type === 'rating' ? 5 : undefined}
          step={field_type === 'currency' ? '0.01' : '1'}
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
        />
      )}

      {field_type === 'boolean' && (
        <button
          type="button"
          onClick={() => onChange(!current)}
          className={`w-10 h-5 rounded-full transition-colors ${current ? 'bg-indigo-500' : 'bg-gray-300'}`}
        >
          <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${current ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      )}

      {(field_type === 'date' || field_type === 'datetime') && (
        <input
          type={field_type === 'datetime' ? 'datetime-local' : 'date'}
          value={String(current)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
        />
      )}

      {field_type === 'select' && (
        <select
          value={String(current)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
        >
          <option value="">Seleccionar...</option>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {field_type === 'multi_select' && (
        <div className="flex flex-wrap gap-1">
          {options?.map((opt) => {
            const selected = Array.isArray(current) && (current as string[]).includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  const arr = Array.isArray(current) ? [...(current as string[])] : [];
                  if (selected) {
                    onChange(arr.filter((v) => v !== opt.value));
                  } else {
                    onChange([...arr, opt.value]);
                  }
                }}
                className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                  selected
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {field_type === 'color' && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={String(current) || '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="w-7 h-7 rounded border border-gray-200 cursor-pointer"
          />
          <input
            type="text"
            value={String(current)}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md font-mono outline-none"
          />
        </div>
      )}

      {field_type === 'json' && (
        <textarea
          value={typeof current === 'string' ? current : JSON.stringify(current, null, 2)}
          onChange={(e) => { try { onChange(JSON.parse(e.target.value)); } catch { onChange(e.target.value); } }}
          rows={3}
          className="w-full px-2.5 py-1.5 text-[11px] font-mono border border-gray-200 rounded-md outline-none resize-y"
        />
      )}
    </div>
  );
}
