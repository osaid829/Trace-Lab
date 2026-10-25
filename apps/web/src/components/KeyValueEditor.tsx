import { Plus, X } from 'lucide-react';
import type { KeyValueRow } from '@tracelab/shared';
import { Button, IconButton } from './ui';
import { row } from '../lib/request';

export function KeyValueEditor({
  rows,
  onChange,
  emptyText,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value'
}: {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  emptyText: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const update = (id: string, patch: Partial<KeyValueRow>) => onChange(rows.map((item) => item.id === id ? { ...item, ...patch } : item));
  const remove = (id: string) => onChange(rows.filter((item) => item.id !== id));
  return <div className="space-y-2">
    {rows.length === 0 && <div className="rounded-md border border-dashed border-white/[0.12] px-4 py-7 text-center text-xs text-slate-500">{emptyText}</div>}
    {rows.map((item) => <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.6fr)_auto] items-center gap-2">
      <input aria-label={`Enable ${keyPlaceholder.toLowerCase()} row`} type="checkbox" checked={item.enabled} onChange={(event) => update(item.id, { enabled: event.target.checked })} className="h-3.5 w-3.5 accent-[#82b5ff]" />
      <input aria-label={`${keyPlaceholder} name`} value={item.key} onChange={(event) => update(item.id, { key: event.target.value })} placeholder={keyPlaceholder} className="field" />
      <input aria-label={`${valuePlaceholder} value`} value={item.value} onChange={(event) => update(item.id, { value: event.target.value })} placeholder={valuePlaceholder} className="field" />
      <IconButton label={`Remove ${item.key || 'row'}`} onClick={() => remove(item.id)}><X size={14} /></IconButton>
    </div>)}
    <Button variant="ghost" onClick={() => onChange([...rows, row()])}><Plus size={14} /> Add row</Button>
  </div>;
}
