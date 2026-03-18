export type BlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'numberedList'
  | 'code'
  | 'quote'
  | 'divider';

export interface Block {
  id: string;
  type: BlockType;
  content: string;
}

export interface BlockTypeOption {
  type: BlockType;
  label: string;
  description: string;
  icon: string;
}

export const BLOCK_TYPE_OPTIONS: BlockTypeOption[] = [
  { type: 'paragraph', label: 'Text', description: 'Plain text', icon: 'Aa' },
  { type: 'heading1', label: 'Heading 1', description: 'Large heading', icon: 'H1' },
  { type: 'heading2', label: 'Heading 2', description: 'Medium heading', icon: 'H2' },
  { type: 'heading3', label: 'Heading 3', description: 'Small heading', icon: 'H3' },
  { type: 'bulletList', label: 'Bullet List', description: 'Unordered list', icon: '•' },
  { type: 'numberedList', label: 'Numbered List', description: 'Ordered list', icon: '1.' },
  { type: 'code', label: 'Code', description: 'Code block', icon: '</>' },
  { type: 'quote', label: 'Quote', description: 'Blockquote', icon: '"' },
  { type: 'divider', label: 'Divider', description: 'Horizontal rule', icon: '—' },
];

let blockCounter = 0;

export function generateBlockId(): string {
  return `block-${Date.now()}-${++blockCounter}`;
}

export function createBlock(type: BlockType = 'paragraph', content = ''): Block {
  return { id: generateBlockId(), type, content };
}

export function parseBlocksFromContent(content: string): Block[] {
  if (!content || content.trim() === '') {
    return [createBlock()];
  }

  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Legacy HTML content — wrap in a single paragraph block
  }

  return [createBlock('paragraph', content)];
}

export function serializeBlocks(blocks: Block[]): string {
  return JSON.stringify(blocks);
}
