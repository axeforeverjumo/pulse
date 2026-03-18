/**
 * Get viewport-relative coordinates of the caret in a textarea.
 * Uses the "mirror div" technique: creates a hidden div replicating
 * the textarea's styling and content up to selectionStart, then
 * measures the position of a marker span.
 */
export function getTextareaCursorCoords(
  textarea: HTMLTextAreaElement,
): { top: number; bottom: number; left: number } {
  const div = document.createElement('div');
  const style = window.getComputedStyle(textarea);

  const properties = [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'lineHeight',
    'textTransform',
    'wordSpacing',
    'textIndent',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'boxSizing',
    'width',
  ] as const;

  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';

  for (const prop of properties) {
    (div.style as unknown as Record<string, string>)[prop] = style.getPropertyValue(
      prop.replace(/([A-Z])/g, '-$1').toLowerCase(),
    );
  }

  document.body.appendChild(div);

  const text = textarea.value;
  const pos = textarea.selectionStart ?? 0;

  // Text before cursor
  div.textContent = text.substring(0, pos);

  // Marker span at cursor position
  const span = document.createElement('span');
  span.textContent = text.substring(pos) || '.';
  div.appendChild(span);

  const textareaRect = textarea.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  const divRect = div.getBoundingClientRect();

  const top = textareaRect.top + (spanRect.top - divRect.top) - textarea.scrollTop;
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  const bottom = top + lineHeight;
  const left = textareaRect.left + (spanRect.left - divRect.left) - textarea.scrollLeft;

  document.body.removeChild(div);

  return { top, bottom, left };
}
