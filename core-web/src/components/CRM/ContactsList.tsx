import { useEffect, useCallback } from 'react';
import { PlusIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { useCrmStore } from '../../stores/crmStore';

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0]?.[0]?.toUpperCase() || 'U';
  }
  return email?.[0]?.toUpperCase() || 'U';
}

const avatarColors = [
  'bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
];

function getColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

interface ContactsListProps {
  workspaceId: string;
  onCreateNew: () => void;
}

export default function ContactsList({ workspaceId, onCreateNew }: ContactsListProps) {
  const { contacts, isLoading, fetchContacts, searchQuery, setSelectedContact } = useCrmStore();

  const loadContacts = useCallback(() => {
    fetchContacts(workspaceId, searchQuery || undefined);
  }, [workspaceId, searchQuery, fetchContacts]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  if (isLoading && contacts.length === 0) {
    return (
      <div className="space-y-2 p-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
            <div className="w-9 h-9 rounded-full bg-slate-200 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 bg-slate-200 rounded" />
              <div className="h-3 w-48 bg-slate-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Contactos</h3>
          <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
            {contacts.length}
          </span>
        </div>
        <button
          onClick={onCreateNew}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Crear contacto
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <EnvelopeIcon className="w-10 h-10 mb-3 text-slate-300" />
            <p className="text-sm font-medium">Sin contactos</p>
            <p className="text-xs mt-1">Crea tu primer contacto para empezar</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-2.5 font-medium text-xs text-slate-500 uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-2.5 font-medium text-xs text-slate-500 uppercase tracking-wider hidden sm:table-cell">Email</th>
                <th className="px-4 py-2.5 font-medium text-xs text-slate-500 uppercase tracking-wider hidden md:table-cell">Empresa</th>
                <th className="px-4 py-2.5 font-medium text-xs text-slate-500 uppercase tracking-wider hidden lg:table-cell">Cargo</th>
                <th className="px-4 py-2.5 font-medium text-xs text-slate-500 uppercase tracking-wider hidden xl:table-cell">Emails</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact: any) => {
                const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || 'Sin nombre';
                return (
                  <tr
                    key={contact.id}
                    onClick={() => setSelectedContact(contact)}
                    className="border-b border-slate-50 hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0 ${getColor(fullName)}`}>
                          {getInitials(fullName, contact.email)}
                        </div>
                        <span className="font-medium text-slate-800 truncate">{fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden sm:table-cell truncate max-w-[200px]">
                      {contact.email || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell truncate">
                      {contact.company_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell truncate">
                      {contact.job_title || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden xl:table-cell">
                      <span className="inline-flex items-center gap-1">
                        <EnvelopeIcon className="w-3.5 h-3.5" />
                        {contact.email_count ?? 0}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
