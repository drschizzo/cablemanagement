// Only the keys that matter now: those of the tool, and of the cord under the pointer.
import { describe, expect, it } from 'vitest';
import { keysFor, keysHtml } from '../../src/ui/keyHints';

describe('the keys that matter now', () => {
  it('offers to grab, and nothing about tracing, with the hand over nothing', () => {
    const html = keysHtml(keysFor({ tool: 'hand', hover: null }));
    expect(html).toContain('saisir un câble');
    expect(html).not.toContain('tracer</span>');
  });

  it('offers what the cord under the pointer allows', () => {
    const html = keysHtml(keysFor({ tool: 'hand', hover: [{ kind: 'traceOrCrate' }, { kind: 'pinched' }, { kind: 'stacked', count: 2 }] }));
    expect(html).toContain('<kbd>T</kbd>tracer');
    expect(html).toContain('<kbd>Suppr</kbd>au bac');
    expect(html).toContain('défaire le coude');
    expect(html).toContain('<kbd>Tab</kbd>');
  });

  it('says how to unplug over a plugged connector', () => {
    expect(keysHtml(keysFor({ tool: 'hand', hover: [{ kind: 'connectorPlugged' }] }))).toContain('débrancher');
  });

  it('gives each tool its own keys', () => {
    expect(keysHtml(keysFor({ tool: 'supports', hover: null }))).toContain('poser ou retirer un support');
    expect(keysHtml(keysFor({ tool: 'velcro', hover: null }))).toContain('serrer');
  });
});
