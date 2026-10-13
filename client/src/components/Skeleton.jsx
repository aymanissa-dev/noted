// Placeholder shapes shown while content loads (instead of "Loading…"). Pulse is disabled under reduced motion.
export const Bar = ({ className = "", style }) => <span aria-hidden="true" style={style} className={`block rounded-md bg-stone-200/80 dark:bg-stone-800 motion-safe:animate-pulse ${className}`} />;

export function ListSkeleton({ count = 6 }) {
  return (
    <div role="status" aria-label="Loading notes" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="surface p-4">
          <Bar className="h-4 w-2/3" />
          <Bar className="mt-3 h-3 w-full" /><Bar className="mt-2 h-3 w-5/6" /><Bar className="mt-2 h-3 w-1/2" />
          <Bar className="mt-4 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div role="status" aria-label="Loading note" className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-between"><Bar className="h-8 w-20" /><Bar className="h-8 w-48" /></div>
      <div className="surface p-6">
        <Bar className="h-7 w-1/2" /><Bar className="mt-4 h-4 w-24" />
        {[100, 95, 90, 98, 60].map((w, i) => <Bar key={i} className="mt-4 h-3.5" style={{ width: `${w}%` }} />)}
      </div>
    </div>
  );
}

export function AppSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="min-h-screen">
      <div className="border-b border-stone-200 dark:border-stone-800 px-4 py-3"><Bar className="h-6 w-24" /></div>
      <div className="mx-auto max-w-5xl px-4 py-6"><Bar className="h-10 w-full" /><ListSkeleton count={3} /></div>
    </div>
  );
}
