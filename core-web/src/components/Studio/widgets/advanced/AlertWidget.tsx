import type { ComponentDefinition, RendererProps } from '../../engine/types';

const alertStyles: Record<string, { bg: string; color: string; icon: string }> = {
  info:    { bg: '#EFF6FF', color: '#1D4ED8', icon: 'ℹ' },
  success: { bg: '#F0FDF4', color: '#15803D', icon: '✓' },
  warning: { bg: '#FFFBEB', color: '#B45309', icon: '⚠' },
  error:   { bg: '#FEF2F2', color: '#DC2626', icon: '✕' },
};

function AlertRenderer({ node, resolvedProps }: RendererProps) {
  const message = (resolvedProps.message as string) || 'Mensaje de alerta';
  const alertType = (resolvedProps.alertType as string) || 'info';
  const title = (resolvedProps.title as string) || '';
  const dismissible = resolvedProps.dismissible === true;

  const styles = alertStyles[alertType] || alertStyles.info;

  return (
    <div
      style={{
        display: 'flex',
        gap: '10px',
        padding: '12px 16px',
        borderRadius: '10px',
        background: styles.bg,
        color: styles.color,
        fontSize: '13px',
        lineHeight: 1.5,
        position: 'relative',
        ...node._styles,
      }}
    >
      <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>
        {styles.icon}
      </span>
      <div style={{ flex: 1 }}>
        {title && (
          <div style={{ fontWeight: 600, marginBottom: '2px' }}>{title}</div>
        )}
        <div>{message}</div>
      </div>
      {dismissible && (
        <span style={{ cursor: 'pointer', fontSize: '16px', opacity: 0.6, flexShrink: 0 }}>
          &times;
        </span>
      )}
    </div>
  );
}

const definition: ComponentDefinition = {
  type: 'Alert',
  name: 'Alerta',
  icon: 'AlertCircle',
  category: 'advanced',
  hasChildren: false,
  properties: [
    { key: 'message', label: 'Mensaje', type: 'expression', defaultValue: 'Mensaje de alerta' },
    {
      key: 'alertType',
      label: 'Tipo',
      type: 'select',
      defaultValue: 'info',
      options: [
        { label: 'Info', value: 'info' },
        { label: 'Exito', value: 'success' },
        { label: 'Advertencia', value: 'warning' },
        { label: 'Error', value: 'error' },
      ],
    },
    { key: 'title', label: 'Titulo', type: 'text', defaultValue: '' },
    { key: 'dismissible', label: 'Descartable', type: 'boolean', defaultValue: false },
  ],
  component: AlertRenderer,
};

export default definition;
