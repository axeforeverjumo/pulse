import { XMarkIcon } from '@heroicons/react/24/outline';
import type { Permission } from '../../api/client';
import PermissionSelect from './PermissionSelect';

interface ShareUserRowProps {
  permission: Permission;
  onChangePermission: (permissionId: string, permission: 'read' | 'write' | 'admin') => void;
  onRevoke: (permissionId: string) => void;
}

export default function ShareUserRow({ permission, onChangePermission, onRevoke }: ShareUserRowProps) {
  const grantee = permission.grantee;
  const name = grantee?.name || grantee?.email || 'User';
  const email = grantee?.email || '';
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-3 min-w-0">
        {grantee?.avatar_url ? (
          <img
            src={grantee.avatar_url}
            alt={name}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-bg-gray flex items-center justify-center text-xs font-semibold text-text-body">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-body truncate">{name}</p>
          {email && <p className="text-xs text-text-secondary truncate">{email}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <PermissionSelect
          value={permission.permission}
          onChange={(value) => onChangePermission(permission.id, value)}
          size="sm"
        />
        <button
          onClick={() => onRevoke(permission.id)}
          className="p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded-md transition-colors"
          title="Remove access"
          aria-label="Remove access"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
