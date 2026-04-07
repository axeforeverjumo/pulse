const uuid = () => crypto.randomUUID();
import type { ComponentNode, ComponentDefinition } from './types';
import { registry } from './registry';

export function createNode(componentType: string): ComponentNode {
  const def = registry.get(componentType);
  if (!def) {
    return { _id: uuid(), _component: componentType };
  }
  return createNodeFromDefinition(def);
}

export function createNodeFromDefinition(def: ComponentDefinition): ComponentNode {
  const node: ComponentNode = {
    _id: uuid(),
    _component: def.type,
    _styles: def.defaultStyles ? { ...def.defaultStyles } : undefined,
  };

  if (def.hasChildren) {
    node._children = [];
  }

  // Apply default property values
  for (const prop of def.properties) {
    if (prop.defaultValue !== undefined) {
      node[prop.key] = prop.defaultValue;
    }
  }

  return node;
}

// ===== Tree manipulation helpers =====

export function findNode(tree: ComponentNode, id: string): ComponentNode | null {
  if (tree._id === id) return tree;
  if (tree._children) {
    for (const child of tree._children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function findParent(
  tree: ComponentNode,
  childId: string
): { parent: ComponentNode; index: number } | null {
  if (tree._children) {
    for (let i = 0; i < tree._children.length; i++) {
      if (tree._children[i]._id === childId) {
        return { parent: tree, index: i };
      }
      const found = findParent(tree._children[i], childId);
      if (found) return found;
    }
  }
  return null;
}

export function cloneTree(node: ComponentNode): ComponentNode {
  const clone: ComponentNode = { ...node, _id: uuid() };
  if (node._children) {
    clone._children = node._children.map(cloneTree);
  }
  return clone;
}

export function insertNode(
  tree: ComponentNode,
  node: ComponentNode,
  parentId: string,
  index: number
): ComponentNode {
  if (tree._id === parentId && tree._children) {
    const children = [...tree._children];
    children.splice(index, 0, node);
    return { ...tree, _children: children };
  }
  if (!tree._children) return tree;
  return {
    ...tree,
    _children: tree._children.map((child) => insertNode(child, node, parentId, index)),
  };
}

export function removeNode(tree: ComponentNode, nodeId: string): ComponentNode {
  if (!tree._children) return tree;
  const filtered = tree._children.filter((c) => c._id !== nodeId);
  const mapped = filtered.map((c) => removeNode(c, nodeId));
  if (filtered.length === tree._children.length && mapped.every((c, i) => c === filtered[i])) {
    return tree;
  }
  return { ...tree, _children: mapped };
}

export function moveNode(
  tree: ComponentNode,
  nodeId: string,
  newParentId: string,
  newIndex: number
): ComponentNode {
  const node = findNode(tree, nodeId);
  if (!node) return tree;
  const withoutNode = removeNode(tree, nodeId);
  return insertNode(withoutNode, node, newParentId, newIndex);
}

export function updateNodeProps(
  tree: ComponentNode,
  nodeId: string,
  updates: Record<string, unknown>
): ComponentNode {
  if (tree._id === nodeId) {
    return { ...tree, ...updates };
  }
  if (!tree._children) return tree;
  return {
    ...tree,
    _children: tree._children.map((child) => updateNodeProps(child, nodeId, updates)),
  };
}
