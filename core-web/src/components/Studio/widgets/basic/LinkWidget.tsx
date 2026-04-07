import type { ComponentDefinition, RendererProps } from '../../engine/types';

function LinkRenderer({ node, resolvedProps, isEditing }: RendererProps) {
  const text = (resolvedProps.text as string) || 'Enlace';
  const href = (resolvedProps.href as string) || '#';
  const target = (resolvedProps.target as string) || '_blank';
  const color = (resolvedProps.color as string) || '#3B82F6';

  return (
    <a
      href={href}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      onClick={isEditing ? (e) => e.preventDefault() : undefined}
      style={{
        color,
        textDecoration: 'underline',
        cursor: isEditing ? 'default' : 'pointer',
        ...node._styles,
      }}
    >
      {text}
    </a>
  );
}

const definition: ComponentDefinition = {
  type: 'Link',
  name: 'Enlace',
  icon: 'ExternalLink',
  category: 'basic',
  hasChildren: false,
  properties: [
    { key: 'text', label: 'Texto', type: 'expression', defaultValue: 'Enlace' },
    { key: 'href', label: 'URL', type: 'expression', defaultValue: '#' },
    {
      key: 'target',
      label: 'Abrir en',
      type: 'select',
      defaultValue: '_blank',
      options: [
        { label: 'Nueva pestana', value: '_blank' },
        { label: 'Misma pestana', value: '_self' },
      ],
    },
    { key: 'color', label: 'Color', type: 'color', defaultValue: '#3B82F6' },
  ],
  component: LinkRenderer,
};

export default definition;
