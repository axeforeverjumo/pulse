import { useState } from "react";
import { XMarkIcon, CalendarDaysIcon, CheckIcon } from "@heroicons/react/24/outline";
import { createCalendarEvent } from "../../api/client";

interface Props {
  contactName: string;
  onClose: () => void;
}

export default function ChatCalendarModal({ contactName, onClose }: Props) {
  const [title, setTitle] = useState(`Llamada con ${contactName}`);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [duration, setDuration] = useState("30");
  const [addMeet, setAddMeet] = useState(false);
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const start = new Date(date);
      const end = new Date(start.getTime() + parseInt(duration) * 60000);
      await createCalendarEvent({
        title: title.trim(),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        add_google_meet: addMeet,
      });
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 flex flex-col items-center gap-3 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <CheckIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Evento creado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden border border-gray-200/50 dark:border-slate-700/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <CalendarDaysIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Crear evento</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <XMarkIcon className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Titulo</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-800/60 rounded-lg border border-gray-200 dark:border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:focus:ring-emerald-700 text-gray-900 dark:text-slate-100"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Fecha y hora</label>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-800/60 rounded-lg border border-gray-200 dark:border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:focus:ring-emerald-700 text-gray-900 dark:text-slate-100"
              />
            </div>
            <div className="w-24">
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Min</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-800/60 rounded-lg border border-gray-200 dark:border-slate-700/50 focus:outline-none text-gray-900 dark:text-slate-100"
              >
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="45">45</option>
                <option value="60">60</option>
                <option value="90">90</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={addMeet}
              onChange={(e) => setAddMeet(e.target.checked)}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-xs text-gray-600 dark:text-slate-300">Agregar Google Meet</span>
          </label>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || creating}
            className="w-full py-2.5 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? "Creando..." : "Crear evento"}
          </button>
        </div>
      </div>
    </div>
  );
}
