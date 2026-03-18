interface PermissionSelectProps {
  value: 'read' | 'write' | 'admin';
  onChange: (value: 'read' | 'write' | 'admin') => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

const sizeClasses = {
  sm: 'text-xs px-2 py-1.5',
  md: 'text-sm px-2.5 py-2',
};

export default function PermissionSelect({ value, onChange, disabled, size = 'md' }: PermissionSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PermissionSelectProps['value'])}
      disabled={disabled}
      className={`bg-white border border-border-gray rounded-md outline-none focus:border-text-tertiary ${sizeClasses[size]} ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      }`}
    >
      <option value="read">Can view</option>
      <option value="write">Can edit</option>
      <option value="admin">Admin</option>
    </select>
  );
}
