import { ChevronRight } from 'lucide-react';

export function JsonTree({ value, label = 'root', depth = 0 }: { value: unknown; label?: string; depth?: number }) {
  if (value === null || typeof value !== 'object') {
    const color = typeof value === 'string' ? 'text-emerald-300' : typeof value === 'number' ? 'text-amber-200' : typeof value === 'boolean' ? 'text-violet-200' : 'text-slate-400';
    return <div className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 14 }}><span className="text-slate-500">{label}:</span><span className={color}>{JSON.stringify(value)}</span></div>;
  }
  const entries = Array.isArray(value) ? Array.from(value.entries()) : Object.entries(value);
  return <details open={depth < 1} className="group" style={{ marginLeft: depth * 14 }}>
    <summary className="flex cursor-pointer list-none items-center gap-1 py-0.5 text-slate-300 marker:hidden"><ChevronRight size={12} className="transition-transform group-open:rotate-90" /><span className="text-slate-500">{label}</span><span className="text-slate-600">{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span></summary>
    <div>{entries.map(([key, child]) => <JsonTree key={String(key)} label={String(key)} value={child} depth={depth + 1} />)}</div>
  </details>;
}
