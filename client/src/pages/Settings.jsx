import { useRef, useState } from 'react';
import { api } from '../lib/api.js';

export function Card({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DataSection() {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ error: true, text: e.message }); } finally { setBusy(false); }
  };

  const onImport = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    run(async () => {
      let data;
      try { data = JSON.parse(await file.text()); } catch { throw new Error('That file is not valid JSON.'); }
      const { imported } = await api.importNotes(data);
      setMsg({ text: `Imported ${imported} note${imported === 1 ? '' : 's'}.` });
    });
  };

  return (
    <Card title="Your data" description="Download a copy of your notes, or import notes from a noted. JSON export. Trashed notes are not exported.">
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost border border-stone-300 dark:border-stone-700" disabled={busy} onClick={() => run(api.exportJson)}>Export JSON</button>
        <button className="btn-ghost border border-stone-300 dark:border-stone-700" disabled={busy} onClick={() => run(api.exportMarkdown)}>Export Markdown (.zip)</button>
        <button className="btn-ghost border border-stone-300 dark:border-stone-700" disabled={busy} onClick={() => fileRef.current?.click()}>Import JSON…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
      </div>
      {msg && <p className={`mt-3 text-sm ${msg.error ? 'text-red-600' : 'text-emerald-600'}`}>{msg.text}</p>}
    </Card>
  );
}

export default function Settings() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <DataSection />
    </div>
  );
}
