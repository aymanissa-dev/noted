// Wraps an async function so only the most recent call's result is delivered.
// Earlier in-flight calls are aborted (via AbortSignal) and their results discarded.
export function latestOnly(fn) {
  let seq = 0;
  let controller = null;
  const run = async (...args) => {
    const id = ++seq;
    controller?.abort();
    controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    try {
      const result = await fn(...args, controller?.signal);
      return id === seq ? { result, stale: false } : { stale: true };
    } catch (error) {
      if (id !== seq || error?.name === 'AbortError') return { stale: true };
      throw error;
    }
  };
  run.cancel = () => { seq++; controller?.abort(); };
  return run;
}
