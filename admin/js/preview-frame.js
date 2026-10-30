// Parent-side helper for the preview iframe (admin/preview.html).
import { h } from './dom.js';

export function previewFrame({ height = 460, onMessage } = {}) {
  const frame = h('iframe', { class: 'preview-frame', src: 'preview.html', title: 'Live preview', style: { height: height + 'px' }, loading: 'lazy' });
  let ready = false, pending = null;
  const handler = (e) => {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    const m = e.data || {};
    if (m.type === 'ready') { ready = true; if (pending) send(pending); }
    else if (m.type === 'height') { /* keep the fixed height; the iframe scrolls */ }
    else onMessage?.(m);
  };
  window.addEventListener('message', handler);
  function send(msg) {
    pending = msg;
    if (ready && frame.contentWindow) frame.contentWindow.postMessage({ ...msg, theme: document.documentElement.dataset.theme }, location.origin);
  }
  frame.send = send;
  frame.dispose = () => window.removeEventListener('message', handler);
  return frame;
}
