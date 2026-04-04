import { useState } from 'react';
import { UserPlusIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { createContactFromEmail } from '../../api/client';

interface CreateContactFromEmailButtonProps {
  emailAddress: string;
  workspaceId: string;
  onCreated?: (contact: any) => void;
  className?: string;
}

export default function CreateContactFromEmailButton({
  emailAddress,
  workspaceId,
  onCreated,
  className = '',
}: CreateContactFromEmailButtonProps) {
  const [creating, setCreating] = useState(false);

  const handleClick = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const contact = await createContactFromEmail({
        email_address: emailAddress,
        workspace_id: workspaceId,
      });
      toast.success(`Contacto creado para ${emailAddress}`);
      onCreated?.(contact);
    } catch (err: any) {
      toast.error(err.message || 'Error al crear contacto');
    } finally {
      setCreating(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={creating}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
      title={`Crear contacto CRM desde ${emailAddress}`}
    >
      <UserPlusIcon className="w-3.5 h-3.5" />
      {creating ? 'Creando...' : 'Agregar al CRM'}
    </button>
  );
}
