import type { ComponentDefinition, WidgetCategory } from './types';

class ComponentRegistry {
  private components = new Map<string, ComponentDefinition>();

  register(definition: ComponentDefinition): void {
    this.components.set(definition.type, definition);
  }

  get(type: string): ComponentDefinition | undefined {
    return this.components.get(type);
  }

  getAll(): ComponentDefinition[] {
    return Array.from(this.components.values());
  }

  getByCategory(category: WidgetCategory): ComponentDefinition[] {
    return this.getAll().filter((d) => d.category === category);
  }

  getCategories(): WidgetCategory[] {
    const cats = new Set<WidgetCategory>();
    for (const d of this.components.values()) cats.add(d.category);
    return Array.from(cats);
  }

  has(type: string): boolean {
    return this.components.has(type);
  }
}

export const registry = new ComponentRegistry();
