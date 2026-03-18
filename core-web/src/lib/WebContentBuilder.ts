/**
 * WebContentBuilder - Mirrors the backend's ContentBuilder for accumulating
 * stream events into ContentPart arrays during streaming.
 *
 * The key pattern: when a non-text event arrives (display, action, sources),
 * any accumulated text is first flushed to a text part before the new part is added.
 */
import type { ContentPart, StreamEvent, Source } from '../api/client';

let partCounter = 0;
function nextPartId(): string {
  return `part-${++partCounter}-${Date.now()}`;
}

export class WebContentBuilder {
  private parts: ContentPart[] = [];
  private textBuffer = '';

  /** Append a text delta (from 'content' stream events). */
  appendText(delta: string): void {
    this.textBuffer += delta;
  }

  /** Flush any buffered text into a text ContentPart. */
  flushText(): void {
    if (this.textBuffer) {
      this.parts.push({
        id: nextPartId(),
        type: 'text',
        data: { content: this.textBuffer },
      });
      this.textBuffer = '';
    }
  }

  /** Add a display part from a 'display' stream event. */
  addDisplay(event: StreamEvent): void {
    this.flushText();
    this.parts.push({
      id: event.id || nextPartId(),
      type: 'display',
      data: {
        display_type: event.display_type,
        items: event.items || [],
        total_count: event.total_count ?? (event.items?.length || 0),
      },
    });
  }

  /** Add an action part from an 'action' stream event. */
  addAction(event: StreamEvent): void {
    this.flushText();
    this.parts.push({
      id: event.id || nextPartId(),
      type: 'action',
      data: {
        action: event.action,
        status: event.status || 'staged',
        data: event.data || {},
        description: event.description || '',
      },
    });
  }

  /** Add a sources part from a 'sources' stream event. */
  addSources(sources: Source[]): void {
    this.flushText();
    this.parts.push({
      id: nextPartId(),
      type: 'sources',
      data: { sources },
    });
  }

  /** Add a tool_call part from a 'tool_call' stream event. */
  addToolCallStart(name: string, args?: Record<string, unknown>): void {
    this.flushText();
    this.parts.push({
      id: `tool-${name}-${Date.now()}`,
      type: 'tool_call',
      data: { name, args: args || {}, phase: 'running' },
    });
  }

  /** Update an existing tool_call part to mark it as done. */
  updateToolCallEnd(name: string, durationMs?: number, status?: string): void {
    // Find the last running tool_call with this name and update it
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const part = this.parts[i];
      if (part.type === 'tool_call' && part.data.name === name && part.data.phase === 'running') {
        part.data.phase = 'done';
        part.data.duration_ms = durationMs;
        part.data.status = status || 'success';
        break;
      }
    }
  }


  /**
   * Get a snapshot of current parts + any buffered text (for live rendering).
   * Does NOT consume the buffer — safe to call repeatedly during streaming.
   */
  getSnapshot(): ContentPart[] {
    if (!this.textBuffer) {
      return [...this.parts];
    }
    return [
      ...this.parts,
      {
        id: 'streaming-text',
        type: 'text',
        data: { content: this.textBuffer },
      },
    ];
  }

  /** Flush remaining text and return the final parts array. */
  finalize(): ContentPart[] {
    this.flushText();
    return [...this.parts];
  }

  /** Get the full accumulated plain text (for the content field fallback). */
  getFullText(): string {
    let text = '';
    for (const part of this.parts) {
      if (part.type === 'text') {
        text += (part.data.content as string) || '';
      }
    }
    text += this.textBuffer;
    return text;
  }
}
