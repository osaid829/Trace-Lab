import { Info, Send, Square, Save, Timer, ShieldCheck } from 'lucide-react';
import type { AuthConfig, BodyConfig, RequestDefinition } from '@tracelab/shared';
import { bodyLabel, authLabel, serializeUrlParams } from '../lib/request';
import { Button, IconButton, SectionLabel } from './ui';
import { KeyValueEditor } from './KeyValueEditor';

export type RequestTab = 'params' | 'headers' | 'auth' | 'body';

function SecretInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><label className="label">{label}</label><input className="field w-full" type="password" value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" /></div>;
}

function AuthEditor({ auth, onChange }: { auth: AuthConfig; onChange: (auth: AuthConfig) => void }) {
  return <div className="space-y-4"><div><SectionLabel>Authorization</SectionLabel><select aria-label="Authorization type" value={auth.type} onChange={(event) => { const type = event.target.value; onChange(type === 'bearer' ? { type: 'bearer', token: '' } : type === 'basic' ? { type: 'basic', username: '', password: '' } : type === 'apiKey' ? { type: 'apiKey', key: 'x-api-key', value: '', location: 'header' } : { type: 'none' }); }} className="field w-full max-w-xs"><option value="none">No authentication</option><option value="bearer">Bearer token</option><option value="basic">Basic authentication</option><option value="apiKey">API key</option></select></div>{auth.type === 'none' && <div className="flex items-start gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] p-3 text-xs leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-300/80" />No authentication will be added to the outgoing request.</div>}{auth.type === 'bearer' && <SecretInput label="Bearer token" value={auth.token} onChange={(value) => onChange({ ...auth, token: value })} />}{auth.type === 'basic' && <div className="grid max-w-xl gap-3 sm:grid-cols-2"><div><label className="label">Username</label><input className="field w-full" value={auth.username} onChange={(event) => onChange({ ...auth, username: event.target.value })} /></div><SecretInput label="Password" value={auth.password} onChange={(value) => onChange({ ...auth, password: value })} /></div>}{auth.type === 'apiKey' && <div className="max-w-xl space-y-3"><div className="grid gap-3 sm:grid-cols-2"><div><label className="label">Key name</label><input className="field w-full" value={auth.key} onChange={(event) => onChange({ ...auth, key: event.target.value })} /></div><div><label className="label">Send in</label><select className="field w-full" value={auth.location} onChange={(event) => onChange({ ...auth, location: event.target.value as 'header' | 'query' })}><option value="header">Header</option><option value="query">Query parameter</option></select></div></div><SecretInput label="API key value" value={auth.value} onChange={(value) => onChange({ ...auth, value })} />{auth.location === 'query' && <div className="flex items-start gap-2 rounded-md border border-amber-300/15 bg-amber-300/[0.05] p-3 text-[11px] leading-5 text-amber-100/80"><Info size={14} className="mt-0.5 shrink-0" />Query API keys are visible in URLs and may be recorded by target servers, proxies, or access logs.</div>}</div>}</div>;
}

function BodyEditor({ body, method, onChange }: { body: BodyConfig; method: RequestDefinition['method']; onChange: (body: BodyConfig) => void }) {
  const bodyDisabled = ['GET', 'HEAD', 'OPTIONS'].includes(method);
  return <div className="space-y-4"><div><SectionLabel>Request body</SectionLabel><select aria-label="Body type" value={body.type} disabled={bodyDisabled} onChange={(event) => { const type = event.target.value; onChange(type === 'json' ? { type: 'json', value: '{\n  \n}' } : type === 'text' ? { type: 'text', value: '' } : type === 'urlencoded' ? { type: 'urlencoded', rows: [] } : { type: 'none' }); }} className="field w-full max-w-xs"><option value="none">No body</option><option value="json">JSON</option><option value="text">Raw text</option><option value="urlencoded">URL encoded form</option></select></div>{bodyDisabled && <div className="rounded-md border border-amber-300/15 bg-amber-300/[0.05] px-3 py-3 text-xs leading-5 text-amber-100/75">TraceLab does not attach bodies to {method} requests.</div>}{body.type === 'json' || body.type === 'text' ? <textarea aria-label="Request body" className="code-editor" value={body.value} onChange={(event) => onChange({ ...body, value: event.target.value })} spellCheck={false} placeholder={body.type === 'json' ? '{\n  "key": "value"\n}' : 'Raw request text'} /> : body.type === 'urlencoded' ? <KeyValueEditor rows={body.rows} onChange={(rows) => onChange({ ...body, rows })} emptyText="No form fields." keyPlaceholder="Field" valuePlaceholder="Value" /> : <div className="rounded-md border border-dashed border-white/[0.12] px-4 py-8 text-center text-xs text-slate-500">This request has no body.</div>}</div>;
}

export function RequestEditor({
  request,
  onChange,
  onUrlChange,
  activeTab,
  onTabChange,
  sending,
  dirty,
  onSend,
  onCancel,
  onSave
}: {
  request: RequestDefinition;
  onChange: (request: RequestDefinition) => void;
  onUrlChange: (url: string) => void;
  activeTab: RequestTab;
  onTabChange: (tab: RequestTab) => void;
  sending: boolean;
  dirty: boolean;
  onSend: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const tabs: RequestTab[] = ['params', 'headers', 'auth', 'body'];
  return <section className="request-pane panel">
    <div className="request-toolbar"><div className="flex min-w-0 flex-1 items-center gap-2"><select aria-label="HTTP method" value={request.method} onChange={(event) => { const method = event.target.value as RequestDefinition['method']; onChange({ ...request, method, body: ['GET', 'HEAD', 'OPTIONS'].includes(method) ? { type: 'none' } : request.body }); }} className="method-select">{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => <option key={method}>{method}</option>)}</select><input aria-label="Request URL" value={request.url} onChange={(event) => onUrlChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSend(); }} placeholder="https://api.example.com/resource" className="url-input" /></div><div className="flex items-center gap-2">{sending ? <Button variant="danger" onClick={onCancel}><Square size={13} fill="currentColor" /> Cancel</Button> : <Button variant="primary" onClick={onSend}><Send size={14} /> Send <span className="font-mono text-[10px] opacity-60">⌘ ↵</span></Button>}<IconButton label={dirty ? 'Save unsaved request' : 'Save request'} onClick={onSave}><Save size={16} /></IconButton></div></div>
    <div className="request-tabs">{tabs.map((tab) => <button key={tab} className={`request-tab ${activeTab === tab ? 'request-tab-active' : ''}`} onClick={() => onTabChange(tab)}>{tab === 'params' ? `Params${request.params.length ? ` · ${request.params.length}` : ''}` : tab === 'headers' ? `Headers${request.headers.length ? ` · ${request.headers.length}` : ''}` : tab === 'auth' ? authLabel(request.auth) : bodyLabel(request.body)}</button>)}</div>
    <div className="request-editor">
      {activeTab === 'params' && <><div className="mb-4 flex items-start justify-between gap-4"><div><SectionLabel>Query parameters</SectionLabel><p className="text-xs leading-5 text-slate-500">Repeated keys are preserved. Disabled rows stay visible for editing but are excluded from the outgoing URL.</p></div><Button variant="ghost" onClick={() => { const params = [...request.params, { id: `param-${Date.now()}`, key: '', value: '', enabled: true }]; onChange({ ...request, params, url: serializeUrlParams(request.url, params) }); }}>Add parameter</Button></div><KeyValueEditor rows={request.params} onChange={(params) => onChange({ ...request, params, url: serializeUrlParams(request.url, params) })} emptyText="No query parameters. The current URL can still contain a query string." /></>}
      {activeTab === 'headers' && <><div className="mb-4"><SectionLabel>Request headers</SectionLabel><p className="text-xs leading-5 text-slate-500">TraceLab rejects hop-by-hop and transport-managed headers so the local executor can keep the connection safe.</p></div><KeyValueEditor rows={request.headers} onChange={(headers) => onChange({ ...request, headers })} emptyText="No custom request headers." /></>}
      {activeTab === 'auth' && <AuthEditor auth={request.auth} onChange={(auth) => onChange({ ...request, auth })} />}
      {activeTab === 'body' && <BodyEditor body={request.body} method={request.method} onChange={(body) => onChange({ ...request, body })} />}
    </div>
    <div className="request-footer"><div className="flex items-center gap-2 text-[11px] text-slate-500"><Timer size={14} /><label htmlFor="request-timeout">Timeout</label><input id="request-timeout" aria-label="Request timeout" className="field h-8 w-24 text-right font-mono text-[11px]" type="number" min={1000} max={120000} step={1000} value={request.timeoutMs} onChange={(event) => onChange({ ...request, timeoutMs: Math.min(120000, Math.max(1000, Number(event.target.value) || 1000)) })} /><span>ms</span></div><div className="text-[10px] text-slate-600">Variables use <code>{'{{name}}'}</code></div></div>
  </section>;
}
