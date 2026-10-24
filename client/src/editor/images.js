// Images in the editor: ![alt](noted-image:<id>) shows the image below its line (the Markdown stays
// visible, faint, so alt text is just text), uploads show a placeholder with progress that turns
// into the image (or an inline error with Retry), and paste / drop / "/image" add images.
// Network, compression and dialogs come from the host through the imageHost facet.
import { Facet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { altFromName, checkFile, prepareImage } from '../lib/imageProcess.js';
import { NOTED_IMAGE_RE, cleanAlt, imageMarkdown } from '../lib/markdown.js';

/**
 * host() returns (or null when images aren't available, e.g. read-only):
 *   load(id) -> Promise<blob: URL>
 *   upload(prepared, { onProgress, signal }) -> Promise<{ _id, … }>   (saves a new note first)
 *   prime(id, blob)                     keep the uploaded bytes so they don't download again
 *   notify(message)                     a short message (toast)
 *   editAlt(alt) -> Promise<string|null>
 *   view({ src, alt })                  open the lightbox
 *   canUpload() -> string|null          a reason uploads aren't possible right now (offline, …)
 */
export const imageHost = Facet.define({ combine: (v) => v[0] || (() => null) });

// ---- Pending uploads ----
const addUpload = StateEffect.define();
const setUpload = StateEffect.define();
const dropUpload = StateEffect.define();
const jobs = new Map(); // id -> { file, prepared, controller }
let seq = 0;

const uploadsField = StateField.define({
  create: () => [],
  update(list, tr) {
    let next = tr.docChanged ? list.map((u) => ({ ...u, pos: tr.changes.mapPos(u.pos, 1) })) : list;
    for (const e of tr.effects) {
      if (e.is(addUpload)) next = [...next, e.value];
      else if (e.is(setUpload)) next = next.map((u) => (u.id === e.value.id ? { ...u, ...e.value } : u));
      else if (e.is(dropUpload)) next = next.filter((u) => u.id !== e.value);
    }
    return next;
  },
});

const host = (view) => view.state.facet(imageHost)();

export function addImages(view, files, pos = view.state.selection.main.head) {
  const h = host(view);
  if (!h || view.state.readOnly) return false;
  const list = [...files];
  if (!list.length) return false;
  const blocked = h.canUpload?.();
  if (blocked) { h.notify(blocked); return true; }
  for (const file of list) {
    const problem = checkFile(file);
    if (problem) { h.notify(problem); continue; }
    const id = `up${++seq}`;
    jobs.set(id, { file });
    view.dispatch({ effects: addUpload.of({ id, pos, name: file.name || 'Image', progress: 0, error: '' }) });
    run(view, id);
  }
  return true;
}

async function run(view, id) {
  const job = jobs.get(id); const h = host(view);
  if (!job || !h) return;
  const alive = () => view.dom.isConnected && view.state.field(uploadsField).some((u) => u.id === id);
  const set = (patch) => { if (alive()) view.dispatch({ effects: setUpload.of({ id, ...patch }) }); };
  set({ progress: 0, error: '', stage: 'compress' });
  try {
    const blocked = h.canUpload?.();
    if (blocked) throw Object.assign(new Error(blocked), { retryable: true });
    job.prepared ??= await prepareImage(job.file);
    set({ stage: 'upload' });
    job.controller = new AbortController();
    const image = await h.upload(job.prepared, { onProgress: (p) => set({ progress: p }), signal: job.controller.signal });
    h.prime?.(image._id, job.prepared.blob);
    if (!alive()) { jobs.delete(id); return; } // editor closed meanwhile: the unreferenced upload is cleaned up later
    const u = view.state.field(uploadsField).find((x) => x.id === id);
    const line = view.state.doc.lineAt(u.pos);
    const before = view.state.sliceDoc(line.from, u.pos); const after = view.state.sliceDoc(u.pos, line.to);
    const md = imageMarkdown(image._id, altFromName(job.file.name));
    // Own line: dropped/pasted mid-line, the image goes after that line instead of splitting its text.
    const from = after.trim() ? line.to : u.pos;
    const insert = `${(after.trim() ? line.text : before).trim() ? '\n' : ''}${md}`;
    view.dispatch({
      changes: { from, insert },
      effects: dropUpload.of(id),
      ...(view.hasFocus && { selection: { anchor: from + insert.length } }),
      userEvent: 'input.image',
    });
    jobs.delete(id);
  } catch (e) {
    if (e?.name === 'AbortError') return;
    set({ error: e?.message || 'Upload failed', stage: 'error', fatal: !e?.retryable && (Boolean(e?.userFacing) || [409, 413, 415].includes(e?.status)) });
  }
}

function cancel(view, id) {
  jobs.get(id)?.controller?.abort();
  jobs.delete(id);
  view.dispatch({ effects: dropUpload.of(id) });
}

// ---- Widgets ----
const dims = new Map(); // id -> aspect ratio, so a re-render doesn't jump

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  n.append(...children);
  return n;
}

class ImageWidget extends WidgetType {
  constructor(id, alt, editable) { super(); this.id = id; this.alt = alt; this.canEdit = editable; }
  eq(o) { return o.id === this.id && o.alt === this.alt && o.canEdit === this.canEdit; }
  get estimatedHeight() { return 240; }
  ignoreEvent() { return true; }
  toDOM(view) {
    const fig = el('figure', { class: 'cm-image', 'data-image-id': this.id, contenteditable: 'false' });
    const img = el('img', { alt: this.alt, loading: 'lazy', decoding: 'async', draggable: 'false' });
    const ratio = dims.get(this.id);
    const frame = el('button', { type: 'button', class: 'cm-image-frame is-loading', 'aria-label': this.alt ? `View image: ${this.alt}` : 'View image', ...(ratio && { style: `aspect-ratio:${ratio}` }) }, img);
    const status = el('div', { class: 'cm-image-status', role: 'status' });
    fig.append(frame, status);
    if (this.canEdit) {
      const altBtn = el('button', { type: 'button', class: 'cm-image-alt', 'aria-label': 'Edit alt text', title: 'Edit alt text' }, this.alt ? 'Alt' : 'Add alt text');
      altBtn.addEventListener('click', (e) => { e.preventDefault(); editAlt(view, fig, this.id, this.alt); });
      fig.append(altBtn);
    }
    const load = () => {
      const h = host(view); if (!h) return;
      status.textContent = ''; frame.classList.add('is-loading'); frame.classList.remove('is-error');
      h.load(this.id).then((url) => {
        img.onload = () => { if (img.naturalWidth) { dims.set(this.id, `${img.naturalWidth}/${img.naturalHeight}`); frame.style.aspectRatio = dims.get(this.id); } frame.classList.remove('is-loading'); view.requestMeasure(); };
        img.src = url;
      }).catch((e) => {
        frame.classList.remove('is-loading'); frame.classList.add('is-error');
        status.replaceChildren(el('span', {}, e?.status === 423 ? 'Unlock the note to see this image.' : e?.status === 404 ? 'This image was deleted.' : `Image didn’t load. ${e?.message || ''}`.trim()));
        if (e?.status !== 404 && e?.status !== 423) {
          const retry = el('button', { type: 'button', class: 'cm-image-retry' }, 'Retry');
          retry.addEventListener('click', (ev) => { ev.preventDefault(); load(); });
          status.append(' ', retry);
        }
      });
    };
    frame.addEventListener('click', (e) => { e.preventDefault(); if (img.src) host(view)?.view({ src: img.src, alt: this.alt }); });
    // Lazy: only fetch when the image is close to the screen.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '600px 0px' });
      io.observe(fig); fig._io = io;
    } else load();
    return fig;
  }
  destroy(dom) { dom._io?.disconnect(); }
}

async function editAlt(view, fig, id, alt) {
  const next = await host(view)?.editAlt(alt);
  if (next === null || next === undefined || !view.dom.isConnected) return;
  // Find this image's Markdown on the widget's line (positions may have moved meanwhile).
  let pos; try { pos = view.posAtDOM(fig); } catch { return; }
  const line = view.state.doc.lineAt(Math.min(pos, view.state.doc.length));
  for (const m of line.text.matchAll(NOTED_IMAGE_RE)) {
    if (m[2] !== id) continue;
    const from = line.from + m.index;
    view.dispatch({ changes: { from, to: from + m[0].length, insert: imageMarkdown(id, cleanAlt(next)) }, userEvent: 'input.image' });
    return;
  }
}

class UploadWidget extends WidgetType {
  constructor(u) { super(); this.u = u; }
  eq(o) { return o.u.id === this.u.id && o.u.progress === this.u.progress && o.u.error === this.u.error && o.u.stage === this.u.stage; }
  get estimatedHeight() { return 72; }
  ignoreEvent() { return true; }
  toDOM(view) {
    const { u } = this;
    const box = el('div', { class: `cm-image-upload${u.error ? ' is-error' : ''}`, 'data-upload-id': u.id, contenteditable: 'false', role: u.error ? 'alert' : 'status' });
    if (u.error) {
      box.append(el('span', { class: 'cm-image-upload-text' }, `Couldn’t add “${u.name}”. ${u.error}`));
      const actions = el('span', { class: 'cm-image-upload-actions' });
      if (!u.fatal) { const retry = el('button', { type: 'button', class: 'cm-image-retry' }, 'Retry'); retry.addEventListener('click', () => run(view, u.id)); actions.append(retry); }
      const remove = el('button', { type: 'button', class: 'cm-image-retry' }, 'Dismiss'); remove.addEventListener('click', () => cancel(view, u.id));
      actions.append(remove); box.append(actions);
    } else {
      const pct = Math.round((u.progress || 0) * 100);
      box.append(
        el('span', { class: 'cm-image-upload-text' }, u.stage === 'upload' ? `Uploading image… ${pct}%` : 'Preparing image…'),
        el('span', { class: 'cm-image-progress', role: 'progressbar', 'aria-label': 'Upload progress', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, el('span', { style: `width:${Math.max(4, pct)}%` })),
      );
      const stop = el('button', { type: 'button', class: 'cm-image-retry', 'aria-label': 'Cancel upload' }, 'Cancel'); stop.addEventListener('click', () => cancel(view, u.id));
      box.append(stop);
    }
    return box;
  }
}

function buildDecorations(state) {
  const editable = !state.readOnly && Boolean(state.facet(imageHost)());
  const ranges = [];
  const text = state.doc.toString();
  for (const m of text.matchAll(NOTED_IMAGE_RE)) {
    const from = m.index; const to = from + m[0].length;
    ranges.push(Decoration.mark({ class: 'cm-image-src' }).range(from, to));
    ranges.push(Decoration.widget({ widget: new ImageWidget(m[2], m[1], editable), block: true, side: 1 }).range(state.doc.lineAt(to).to));
  }
  for (const u of state.field(uploadsField)) {
    ranges.push(Decoration.widget({ widget: new UploadWidget(u), block: true, side: 2 }).range(state.doc.lineAt(u.pos).to));
  }
  return Decoration.set(ranges, true);
}

const decorationsField = StateField.define({
  create: (state) => buildDecorations(state),
  update(deco, tr) {
    if (tr.docChanged || tr.effects.some((e) => e.is(addUpload) || e.is(setUpload) || e.is(dropUpload)) || tr.startState.readOnly !== tr.state.readOnly) return buildDecorations(tr.state);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const imageFiles = (dt) => [...(dt?.files || [])];
const hasFiles = (dt) => [...(dt?.types || [])].includes('Files');

const events = EditorView.domEventHandlers({
  paste(e, view) {
    const files = imageFiles(e.clipboardData);
    if (!files.length) return false;
    e.preventDefault();
    return addImages(view, files);
  },
  dragover(e, view) {
    if (!hasFiles(e.dataTransfer) || view.state.readOnly) return false;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    view.dom.classList.add('cm-drop-target');
    return true;
  },
  dragleave(e, view) { if (!view.dom.contains(e.relatedTarget)) view.dom.classList.remove('cm-drop-target'); return false; },
  drop(e, view) {
    view.dom.classList.remove('cm-drop-target');
    const files = imageFiles(e.dataTransfer);
    if (!files.length) return false;
    e.preventDefault();
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head;
    return addImages(view, files, pos);
  },
});

// "/image" and the toolbar button: open a file picker. On phones the same picker offers the camera
// and the photo library.
export function pickImages(view, pos = view.state.selection.main.head) {
  const h = host(view);
  if (!h || view.state.readOnly) return;
  const blocked = h.canUpload?.();
  if (blocked) { h.notify(blocked); return; }
  const input = el('input', { type: 'file', accept: 'image/*', multiple: '', class: 'sr-only', 'aria-hidden': 'true', 'data-testid': 'image-file-input' });
  input.addEventListener('change', () => { addImages(view, input.files, Math.min(pos, view.state.doc.length)); input.remove(); }, { once: true });
  input.addEventListener('cancel', () => input.remove(), { once: true });
  document.body.append(input);
  input.click();
}

const pickListener = ViewPlugin.define((view) => {
  const onPick = (e) => pickImages(view, e.detail?.pos);
  view.contentDOM.addEventListener('noted-pick-image', onPick);
  return { destroy: () => view.contentDOM.removeEventListener('noted-pick-image', onPick) };
});

export const imagesExtension = (getHost) => [imageHost.of(getHost), uploadsField, decorationsField, events, pickListener];
