import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TimePickerInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

// Generate time options in 15-minute increments
const generateTimeOptions = (): string[] => {
  const times: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const h = String(hour).padStart(2, '0');
      const m = String(minute).padStart(2, '0');
      times.push(`${h}:${m}`);
    }
  }
  return times;
};

const TIME_OPTIONS = generateTimeOptions();

// Format time for display (12-hour format with am/pm)
const formatTimeDisplay = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
};

// Parse 12-hour format input to 24-hour format
const parse12HourTo24Hour = (input: string): string | null => {
  // Match formats like "2:30 pm", "2:30pm", "14:30", "2pm", etc.
  const match = input.toLowerCase().trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3];

  if (minutes < 0 || minutes > 59) return null;

  if (period) {
    // 12-hour format
    if (hours < 1 || hours > 12) return null;
    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
  } else {
    // 24-hour format
    if (hours < 0 || hours > 23) return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export default function TimePickerInput({
  value,
  onChange,
  className = ''
}: TimePickerInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(formatTimeDisplay(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    setInputValue(formatTimeDisplay(value));
  }, [value]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    }
  }, [isOpen]);

  // Scroll to current time when dropdown opens
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const currentIndex = TIME_OPTIONS.findIndex(t => t === value);
      if (currentIndex !== -1) {
        const optionHeight = 36;
        dropdownRef.current.scrollTop = Math.max(0, currentIndex * optionHeight - 72);
      }
    }
  }, [isOpen, value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputBlur = () => {
    // On blur, try to parse and normalize the input
    const parsed = parse12HourTo24Hour(inputValue);
    if (parsed) {
      onChange(parsed);
      setInputValue(formatTimeDisplay(parsed));
    } else {
      // Reset to last valid value
      setInputValue(formatTimeDisplay(value));
    }
  };

  const handleSelectTime = (time: string) => {
    setInputValue(formatTimeDisplay(time));
    onChange(time);
    setIsOpen(false);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onBlur={handleInputBlur}
        className={className}
        placeholder="12:00 pm"
      />
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
            zIndex: 10001
          }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          {TIME_OPTIONS.map((time) => (
            <button
              key={time}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectTime(time);
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 transition-colors ${
                time === value ? 'bg-gray-100 font-medium' : ''
              }`}
            >
              {formatTimeDisplay(time)}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
