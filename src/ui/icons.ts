// The icons of the toolbar: line drawings in the interface's stroke, as SVG markup.

function svg(body: string): string {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
export function iconRoute(): string { return svg('<circle cx="5" cy="5" r="2"/><path d="M5 7v4a3 3 0 0 0 3 3h8a3 3 0 0 1 3 3v2"/><path d="M16 17l3 3 3-3"/>'); }
export function iconHand(): string { return svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V12m0-4.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.9-2.6L4.3 14a1.6 1.6 0 0 1 2.6-1.8L8 13.5"/>'); }
export function iconFingerManager(): string { return svg('<rect x="2" y="9" width="20" height="6" rx="1"/><path d="M5 9V6h3v3M10.5 9V6h3v3M16 9V6h3v3"/>'); }
export function iconVelcro(): string { return svg('<path d="M4 8c3-3 13-3 16 0M4 16c3 3 13 3 16 0"/><path d="M4 8v8M20 8v8"/><path d="M9 10.5v3M12 10v4M15 10.5v3"/>'); }
export function iconStock(): string { return svg('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'); }
