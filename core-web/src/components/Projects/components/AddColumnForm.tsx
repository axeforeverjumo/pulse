import { useState, useRef, useEffect } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface AddColumnFormProps {
  onAdd: (name: string, color?: string) => void;
}

const COLUMN_COLORS = [
  { value: '#94A3B8', name: 'Slate' },
  { value: '#64748B', name: 'Gray' },
  { value: '#3B82F6', name: 'Blue' },
  { value: '#06B6D4', name: 'Cyan' },
  { value: '#10B981', name: 'Green' },
  { value: '#FBBF24', name: 'Yellow' },
  { value: '#F59E0B', name: 'Amber' },
  { value: '#F97316', name: 'Orange' },
  { value: '#EF4444', name: 'Red' },
];

export default function AddColumnForm({ onAdd }: AddColumnFormProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLUMN_COLORS[5].value); // Yellow
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onAdd(name.trim(), selectedColor);
      setName('');
      setSelectedColor(COLUMN_COLORS[5].value); // Yellow
      setIsAdding(false);
    }
  };

  const handleCancel = () => {
    setName('');
    setSelectedColor(COLUMN_COLORS[5].value); // Yellow
    setIsAdding(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!isAdding) {
    return (
      <button
        onClick={() => setIsAdding(true)}
        className="w-80 h-10 flex items-center justify-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 rounded-xl transition-all duration-200 hover:bg-gray-50"
      >
        <PlusIcon className="w-4 h-4 stroke-2" />
        <span>Añadir columna</span>
      </button>
    );
  }

  return (
    <div className="w-80">
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-2 h-2 rounded-full transition-colors"
            style={{ backgroundColor: selectedColor }}
          />
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de columna"
            className="flex-1 text-[13px] font-medium text-gray-900 bg-transparent border-0 p-0 focus:outline-none focus:ring-0 placeholder:text-gray-300"
          />
          <button
            type="button"
            onClick={handleCancel}
            className="p-1 text-gray-300 hover:text-gray-500 rounded transition-colors"
          >
            <XMarkIcon className="w-3.5 h-3.5 stroke-2" />
          </button>
        </div>

        {/* Color selector */}
        <div className="flex gap-1.5 mb-4">
          {COLUMN_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => setSelectedColor(color.value)}
              className={`w-5 h-5 rounded-full transition-all duration-200 ${
                selectedColor === color.value
                  ? 'scale-110 ring-2 ring-offset-2 ring-gray-300'
                  : 'hover:scale-105'
              }`}
              style={{ backgroundColor: color.value }}
              title={color.name}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!name.trim()}
            className="px-3 py-1.5 text-[12px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Añadir columna
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 py-1.5 text-[12px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
