import type { ComponentDefinition, RendererProps } from '../../engine/types';

function ImageRenderer({ node, resolvedProps }: RendererProps) {
  const src = (resolvedProps.src as string) || '';
  const alt = (resolvedProps.alt as string) || 'Imagen';
  const objectFit = (resolvedProps.objectFit as string) || 'cover';
  const borderRadius = (resolvedProps.borderRadius as string) || '8px';

  if (!src) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: '120px',
          backgroundColor: '#F3F4F6',
          borderRadius,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9CA3AF',
          fontSize: '14px',
          border: '1px dashed #D1D5DB',
          ...node._styles,
        }}
      >
        Imagen
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      style={{
        width: '100%',
        height: 'auto',
        objectFit: objectFit as 'cover' | 'contain' | 'fill' | 'none',
        borderRadius,
        display: 'block',
        ...node._styles,
      }}
    />
  );
}

const definition: ComponentDefinition = {
  type: 'Image',
  name: 'Imagen',
  icon: 'ImageIcon',
  category: 'media',
  hasChildren: false,
  properties: [
    { key: 'src', label: 'URL de imagen', type: 'expression', defaultValue: '' },
    { key: 'alt', label: 'Texto alternativo', type: 'text', defaultValue: 'Imagen' },
    {
      key: 'objectFit',
      label: 'Ajuste',
      type: 'select',
      defaultValue: 'cover',
      options: [
        { label: 'Cubrir', value: 'cover' },
        { label: 'Contener', value: 'contain' },
        { label: 'Rellenar', value: 'fill' },
        { label: 'Ninguno', value: 'none' },
      ],
    },
    { key: 'borderRadius', label: 'Border radius', type: 'text', defaultValue: '8px' },
  ],
  component: ImageRenderer,
};

export default definition;
