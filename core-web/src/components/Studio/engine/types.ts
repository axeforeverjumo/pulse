import type { CSSProperties, ComponentType } from 'react';

// ===== Component Tree Node (DSL) =====
export interface ComponentNode {
  _id: string;
  _component: string;
  _children?: ComponentNode[];
  _styles?: CSSProperties;
  _className?: string;
  [key: string]: unknown;
}

// ===== Property Definition =====
export type PropertyType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'color'
  | 'select'
  | 'icon'
  | 'image'
  | 'json'
  | 'expression'
  | 'event'
  | 'size';

export interface PropertyDefinition {
  key: string;
  label: string;
  type: PropertyType;
  defaultValue?: unknown;
  placeholder?: string;
  options?: { label: string; value: string }[];
  section?: string;
  description?: string;
  required?: boolean;
  hidden?: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

// ===== Widget Category =====
export type WidgetCategory = 'layout' | 'basic' | 'form' | 'data' | 'media' | 'navigation' | 'advanced';

// ===== Component Definition (Registry Entry) =====
export interface ComponentDefinition {
  type: string;
  name: string;
  icon: string;
  category: WidgetCategory;
  description?: string;
  hasChildren: boolean;
  properties: PropertyDefinition[];
  defaultStyles?: CSSProperties;
  defaultSize?: { width: string; height: string };
  component: ComponentType<RendererProps>;
}

// ===== Props passed to each widget at render time =====
export interface RendererProps {
  node: ComponentNode;
  isEditing: boolean;
  isSelected: boolean;
  isHovered: boolean;
  children?: React.ReactNode;
  onSelect?: () => void;
  resolvedProps: Record<string, unknown>;
}
