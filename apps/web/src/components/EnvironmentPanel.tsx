import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Environment } from '@tracelab/shared';
import { createEnvironment, deleteEnvironment, updateEnvironment } from '../lib/api';
import { Button, IconButton, SectionLabel } from './ui';

type EditableVariable = { id?: string; name: string; value: string; sensitive: boolean };

export function EnvironmentPanel({
  environments,
  onClose,
  onSaved,
  onDeleted,
  selectedId
}: {
  environments: Environment[];
  onClose: () => void;
  onSaved: (environment: Environment) => void;
  onDeleted: (id: string) => void;
  selectedId: string;
}) {
  const [activeId, setActiveId] = useState(selectedId);
  const selected = environments.find((environment) => environment.id === activeId);
  const [name, setName] = useState(selected?.name ?? 'New environment');
  const [variables, setVariables] = useState<EditableVariable[]>(selected?.variables.map((item) => ({ ...item })) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setVariables(selected.variables.map((item) => ({ ...item })));
    } else {
      setName('New environment');
      setVariables([]);
    }
  }, [activeId, selected]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const next = selected ? await updateEnvironment(selected.id, name, variables) : await createEnvironment(name, variables);
      onSaved(next);
      setActiveId(next.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save environment.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected || selected.isLocal || !window.confirm(`Delete “${selected.name}”?`)) return;
    try {
      await deleteEnvironment(selected.id);
      onDeleted(selected.id);
      setActiveId(environments.find((environment) => environment.id !== selected.id)?.id ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete environment.');
    }
  };

  const addVariable = () => setVariables((current) => [...current, { name: '', value: '', sensitive: false }]);
  const removeVariable = (index: number) => setVariables((current) => current.filter((_item, itemIndex) => itemIndex !== index));
  const updateVariable = (index: number, patch: Partial<EditableVariable>) => setVariables((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  return <div className="fixed inset-0 z-30 flex justify-end bg-black/45" role="dialog" aria-modal="true" aria-label="Environment manager">
    <div className="flex h-full w-full max-w-[440px] flex-col border-l border-white/[0.1] bg-[#11151b] shadow-2xl">
      <div className="flex h-16 items-center justify-between border-b border-white/[0.08] px-5"><div><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Environment</div><div className="mt-1 text-sm font-semibold text-slate-100">{selected?.name ?? 'New environment'}</div></div><IconButton label="Close environment editor" onClick={onClose}><X size={17} /></IconButton></div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        <div><label className="label" htmlFor="environment-edit-select">Edit environment</label><select id="environment-edit-select" className="field w-full" value={activeId || '__new__'} onChange={(event) => setActiveId(event.target.value === '__new__' ? '' : event.target.value)}><option value="__new__">+ New environment</option>{environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}{environment.isLocal ? ' · local' : ''}</option>)}</select></div>
        <div><label className="label" htmlFor="environment-name">Name</label><input id="environment-name" className="field w-full" value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div><div className="mb-2 flex items-center justify-between"><SectionLabel>Variables</SectionLabel><Button variant="ghost" onClick={addVariable}><Plus size={14} /> Add</Button></div><div className="space-y-3">{variables.map((variable, index) => <div key={variable.id ?? `new-${index}`} className="rounded-md border border-white/[0.08] bg-black/10 p-3"><div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2"><input aria-label={`Variable ${index + 1} name`} className="field" placeholder="VARIABLE_NAME" value={variable.name} onChange={(event) => updateVariable(index, { name: event.target.value })} /><label className="flex items-center gap-2 text-[11px] text-slate-400"><input type="checkbox" checked={variable.sensitive} onChange={(event) => updateVariable(index, { sensitive: event.target.checked })} className="accent-[#82b5ff]" /> Secret</label></div><div className="flex gap-2"><input aria-label={`Variable ${index + 1} value`} className="field min-w-0 flex-1" type={variable.sensitive ? 'password' : 'text'} value={variable.value} onChange={(event) => updateVariable(index, { value: event.target.value })} autoComplete="off" /><IconButton label={`Remove variable ${variable.name || index + 1}`} onClick={() => removeVariable(index)}><Trash2 size={14} /></IconButton></div>{variable.sensitive && <div className="mt-2 text-[11px] leading-5 text-amber-200/70">Sensitive values are masked, not encrypted. Leave the mask unchanged to keep the stored value.</div>}</div>)}</div>{variables.length === 0 && <div className="rounded-md border border-dashed border-white/[0.12] px-4 py-6 text-xs text-slate-500">No variables yet. Add one to use <code>{'{{variableName}}'}</code> in a request.</div>}</div>
        {error && <div className="rounded-md border border-red-400/20 bg-red-400/[0.07] px-3 py-3 text-xs leading-5 text-red-100">{error}</div>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.08] p-4"><Button variant="danger" onClick={() => void remove()} disabled={!selected || selected.isLocal}><Trash2 size={14} /> Delete</Button><div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save environment'}</Button></div></div>
    </div>
  </div>;
}
