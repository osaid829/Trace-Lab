import { Clipboard, Copy, Database, Download, Search, Send, ShieldAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ResponseData } from '@tracelab/shared';
import { formatBytes } from '../lib/request';
import { EmptyState, IconButton, SectionLabel } from './ui';
import { JsonTree } from './JsonTree';

type RequestError = { code: string; message: string };

function binaryBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function ResponseInspector({
  response,
  error,
  stale,
  onClear,
  onNotify
}: {
  response: ResponseData | null;
  error: RequestError | null;
  stale: boolean;
  onClear: () => void;
  onNotify?: (message: string) => void;
}) {
  const [view, setView] = useState<'pretty' | 'raw'>('pretty');
  const [search, setSearch] = useState('');
  const parsed = useMemo(() => {
    if (!response?.body || response.isBinary) return null;
    try {
      return JSON.parse(response.body) as unknown;
    } catch {
      return null;
    }
  }, [response]);
  const matchCount = response?.body && search ? response.body.toLowerCase().split(search.toLowerCase()).length - 1 : 0;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      onNotify?.(`${label} copied.`);
    } catch {
      onNotify?.(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const download = () => {
    if (!response) return;
    const bytes = response.isBinary && response.bodyBase64 ? binaryBytes(response.bodyBase64) : undefined;
    const blob = bytes
      ? new Blob([bytes.buffer as ArrayBuffer], { type: response.contentType ?? 'application/octet-stream' })
      : new Blob([response.body ?? ''], { type: response.contentType ?? 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = response.isBinary ? 'tracelab-response.bin' : 'tracelab-response.txt';
    anchor.click();
    URL.revokeObjectURL(url);
    onNotify?.('Response download started.');
  };

  return <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="flex min-h-[58px] items-center justify-between border-b border-white/[0.08] px-5">
      <div><div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-500">Response</div><div className="mt-1 text-sm text-slate-200">{response ? 'Captured from the local execution service' : error ? 'The execution service returned an error' : 'Nothing executed yet'}</div></div>
      <IconButton label="Clear response" onClick={onClear} disabled={!response && !error}><X size={15} /></IconButton>
    </div>
    {error && <div className="m-5 flex gap-3 rounded-md border border-red-400/20 bg-red-400/[0.07] p-4 text-sm text-red-100"><ShieldAlert size={17} className="mt-0.5 shrink-0 text-red-300" /><div><div className="font-semibold">{error.code.replaceAll('_', ' ')}</div><div className="mt-1 text-red-100/75">{error.message}</div></div></div>}
    {!response && !error && <EmptyState icon={<Send size={18} />} title="Run a request to inspect the result" description="Timing, headers, status, and body come from the target server. TraceLab never fills this panel with sample data." />}
    {response && <div className="min-h-0 flex-1 overflow-auto">
      <div className="grid grid-cols-2 gap-px border-b border-white/[0.08] bg-white/[0.08] sm:grid-cols-4">
        <div className="stat-cell"><span>Status</span><strong className={response.statusCode >= 400 ? 'text-red-300' : response.statusCode >= 300 ? 'text-amber-200' : 'text-emerald-300'}>{response.statusCode} <small>{response.statusText || '—'}</small></strong></div>
        <div className="stat-cell"><span>Duration</span><strong>{response.durationMs.toFixed(0)} ms</strong></div>
        <div className="stat-cell"><span>Size</span><strong>{formatBytes(response.responseBytes)}</strong></div>
        <div className="stat-cell"><span>Redirects</span><strong>{response.redirectCount}</strong></div>
      </div>
      {stale && <div className="border-b border-amber-300/20 bg-amber-300/[0.06] px-5 py-2 text-[11px] text-amber-100">Request draft changed after this response. Run again to refresh it.</div>}
      {response.truncated && <div className="border-b border-amber-300/20 bg-amber-300/[0.06] px-5 py-2 text-[11px] text-amber-100">The response body was truncated by the configured safety limit.</div>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] px-5 py-3"><div className="flex items-center gap-1"><button className={`tab ${view === 'pretty' ? 'tab-active' : ''}`} onClick={() => setView('pretty')}>Pretty</button><button className={`tab ${view === 'raw' ? 'tab-active' : ''}`} onClick={() => setView('raw')}>Raw</button></div><div className="flex items-center gap-1"><div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" /><input aria-label="Search response" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search body" className="field h-8 w-36 pl-8 text-xs" /></div><IconButton label="Copy response body" onClick={() => void copy(response.body ?? response.bodyBase64 ?? '', 'Response body')}><Copy size={14} /></IconButton><IconButton label="Download response" onClick={download}><Download size={14} /></IconButton></div></div>
      <div className="border-b border-white/[0.08] px-5 py-4"><div className="mb-2 flex items-center justify-between"><SectionLabel>Body · {response.contentType ?? 'content type unavailable'}</SectionLabel>{search && <span className="text-[11px] text-slate-500">{matchCount} match(es)</span>}</div>{response.body === '' ? <div className="text-xs text-slate-500">The server returned an empty response body.</div> : response.isBinary ? <div className="flex items-center gap-2 text-xs text-slate-400"><Database size={15} /> Binary response. Use download to inspect the raw bytes safely.</div> : view === 'pretty' && parsed !== null ? <pre className="overflow-auto text-[12px] leading-5 text-slate-300"><code><JsonTree value={parsed} /></code></pre> : <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-slate-300">{response.body}</pre>}</div>
      <div className="px-5 py-4"><div className="flex items-center justify-between"><SectionLabel>Headers</SectionLabel><IconButton label="Copy response headers" onClick={() => void copy(response.headers.map((header) => `${header.name}: ${header.value}`).join('\n'), 'Response headers')}><Clipboard size={14} /></IconButton></div><div className="overflow-hidden rounded-md border border-white/[0.08]">{response.headers.length === 0 ? <div className="px-3 py-3 text-xs text-slate-500">No response headers were returned.</div> : response.headers.map((header, index) => <div key={`${header.name}-${index}`} className="grid grid-cols-[minmax(120px,0.7fr)_1.5fr] gap-3 border-b border-white/[0.06] px-3 py-2 text-[11px] last:border-0"><span className="font-mono text-slate-500">{header.name}</span><span className="break-all text-slate-300">{header.value}</span></div>)}</div></div>
    </div>}
  </section>;
}
