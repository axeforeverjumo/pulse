import type { ComponentNode, ComponentDefinition } from './types';

// ===== Evaluation Context =====
export interface EvaluationContext {
  queries: Record<string, {
    data: unknown[];
    isLoading: boolean;
    error: string | null;
  }>;
  variables: Record<string, unknown>;
  currentUser: { id: string; email: string; name: string };
  currentItem?: unknown;
  currentIndex?: number;
  page: { params: Record<string, string> };
}

// ===== Expression evaluation =====

const BINDING_REGEX = /\{\{(.+?)\}\}/g;

export function hasBindings(value: unknown): boolean {
  return typeof value === 'string' && BINDING_REGEX.test(value);
}

export function evaluateExpression(expression: string, context: EvaluationContext): unknown {
  // If no bindings, return as-is
  if (!expression.includes('{{')) return expression;

  // If the entire string is a single binding, return the raw value (not stringified)
  const trimmed = expression.trim();
  const singleMatch = trimmed.match(/^\{\{(.+?)\}\}$/);
  if (singleMatch) {
    return evaluateSingle(singleMatch[1].trim(), context);
  }

  // Multiple bindings / mixed text: interpolate as string
  return expression.replace(BINDING_REGEX, (_match, expr) => {
    const result = evaluateSingle(expr.trim(), context);
    return result == null ? '' : String(result);
  });
}

function evaluateSingle(expr: string, context: EvaluationContext): unknown {
  try {
    // Build safe scope
    const scope: Record<string, unknown> = {
      queries: context.queries,
      variables: context.variables,
      currentUser: context.currentUser,
      currentItem: context.currentItem,
      currentIndex: context.currentIndex,
      page: context.page,
      // Utility functions
      formatDate: (d: string, locale = 'es') => {
        try { return new Date(d).toLocaleDateString(locale); } catch { return d; }
      },
      formatCurrency: (n: number, currency = 'EUR') => {
        try { return new Intl.NumberFormat('es', { style: 'currency', currency }).format(n); } catch { return String(n); }
      },
      JSON,
      Math,
      parseInt,
      parseFloat,
      String,
      Number,
      Boolean,
      Array,
      Object,
      Date,
    };

    const keys = Object.keys(scope);
    const values = Object.values(scope);

    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `"use strict"; return (${expr});`);
    return fn(...values);
  } catch {
    return `{{${expr}}}`;
  }
}

// ===== Resolve all props for a node =====

export function resolveNodeProps(
  node: ComponentNode,
  definition: ComponentDefinition,
  context: EvaluationContext
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const prop of definition.properties) {
    const raw = node[prop.key];
    if (raw !== undefined && hasBindings(raw)) {
      resolved[prop.key] = evaluateExpression(raw as string, context);
    } else {
      resolved[prop.key] = raw ?? prop.defaultValue;
    }
  }
  return resolved;
}

// ===== Create default context =====

export function createDefaultContext(overrides?: Partial<EvaluationContext>): EvaluationContext {
  return {
    queries: {},
    variables: {},
    currentUser: { id: '', email: '', name: '' },
    page: { params: {} },
    ...overrides,
  };
}
