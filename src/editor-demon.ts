import type { Temperature } from './types';

export function editorDemon(temperature: Temperature = 0, awake = true): SVGSVGElement {
  const eyes = temperature === 1 ? '<path d="M12.5 13.5l3 3m0-3l-3 3m5-3l3 3m0-3l-3 3"/>'
    : awake ? '<path d="M14 12.5v5m4-5v5"/>' : '<path d="M12 15h4m1 0h4"/>';
  const template = document.createElement('template');
  template.innerHTML = `<svg class="editor-demon" data-temperature="${temperature}" viewBox="0 0 32 32" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11L3 9l-1 4v6l5-2m17-6l5-2 1 4v6l-5-2M10 8L9 2l5 4m4 0l5-4-1 6M11 25l-4 3-2-2-3 2"/><circle class="editor-demon-body" cx="16" cy="16" r="10"/>${eyes}</g></svg>`;
  return template.content.firstElementChild as SVGSVGElement;
}
