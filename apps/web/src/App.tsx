import { Menu, Loader2, AlertCircle, Settings2, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import type { Collection, Environment, HistoryEntry, RequestDefinition, ResponseData, SavedRequest } from '@tracelab/shared';
import { ExportBundleSchema } from '@tracelab/shared';
import { applyImport, bootstrap, clearHistory, createCollection, deleteCollection, deleteRequest, duplicateRequest, execute, exportBundle, previewImport, renameCollection, replayHistory, saveRequest, updateRequest } from './lib/api';
import { emptyRequest, parseUrlParamsIfValid } from './lib/request';
import { EnvironmentPanel } from './components/EnvironmentPanel';
import { RequestEditor, type RequestTab } from './components/RequestEditor';
import { ResponseInspector } from './components/ResponseInspector';
import { Sidebar, type SidebarMode } from './components/Sidebar';
import { Button, IconButton } from './components/ui';

type RequestError = { code: string; message: string };

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [draft, setDraft] = useState<RequestDefinition>(emptyRequest());
  const [requestName, setRequestName] = useState('Untitled request');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [environmentId, setEnvironmentId] = useState('');
  const [activeTab, setActiveTab] = useState<RequestTab>('params');
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('collections');
  const [search, setSearch] = useState('');
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [error, setError] = useState<RequestError | null>(null);
  const [bootError, setBootError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const operationRef = useRef(0);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    const data = await bootstrap();
    setCollections(data.collections);
    setEnvironments(data.environments);
    setHistory(data.history);
    setEnvironmentId((current) => current && data.environments.some((item) => item.id === current) ? current : data.environments.find((item) => item.isLocal)?.id ?? data.environments[0]?.id ?? '');
  };

  useEffect(() => {
    let active = true;
    bootstrap().then((data) => {
      if (!active) return;
      setCollections(data.collections);
      setEnvironments(data.environments);
      setHistory(data.history);
      setEnvironmentId(data.environments.find((item) => item.isLocal)?.id ?? data.environments[0]?.id ?? '');
    }).catch((cause) => {
      if (active) setBootError(cause instanceof Error ? cause.message : 'Unable to connect to the local service.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3_500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const markDraft = (next: RequestDefinition) => {
    setDraft(next);
    setDirty(true);
  };

  const updateUrl = (url: string) => {
    setDraft((current) => {
      const params = parseUrlParamsIfValid(url);
      return { ...current, url, params: params ?? current.params };
    });
    setDirty(true);
  };

  const loadRequest = (saved: SavedRequest) => {
    operationRef.current += 1;
    abortRef.current?.abort();
    setSending(false);
    setDraft(saved.definition);
    setRequestName(saved.name);
    setRequestId(saved.id);
    setCollectionId(saved.collectionId);
    setDirty(false);
    setResponse(null);
    setError(null);
    setMobileSidebarOpen(false);
  };

  const newRequest = () => {
    operationRef.current += 1;
    abortRef.current?.abort();
    setSending(false);
    setDraft(emptyRequest());
    setRequestName('Untitled request');
    setRequestId(null);
    setCollectionId(null);
    setDirty(false);
    setResponse(null);
    setError(null);
    setMobileSidebarOpen(false);
  };

  const cancelRequest = () => {
    if (!abortRef.current) return;
    operationRef.current += 1;
    abortRef.current.abort();
    abortRef.current = null;
    setSending(false);
    setResponse(null);
    setError({ code: 'CANCELED', message: 'The request was canceled by the user.' });
  };

  const runRequest = async (operation: () => Promise<import('@tracelab/shared').ExecuteResult>) => {
    const operationId = ++operationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);
    setResponse(null);
    setError(null);
    try {
      const result = await operation();
      if (operationId !== operationRef.current) return;
      if (result.response) setResponse(result.response);
      if (result.error) setError(result.error);
      setHistory((current) => [result.history, ...current.filter((item) => item.id !== result.history.id)].slice(0, 100));
    } catch (cause) {
      if (operationId !== operationRef.current || controller.signal.aborted || isAbortError(cause)) return;
      setError({ code: 'NETWORK_ERROR', message: cause instanceof Error ? cause.message : 'Unable to reach the local service.' });
    } finally {
      if (operationId === operationRef.current) {
        abortRef.current = null;
        setSending(false);
      }
    }
  };

  const sendRequest = () => {
    if (!draft.url.trim()) {
      setError({ code: 'VALIDATION_ERROR', message: 'Enter a URL before sending.' });
      return;
    }
    void runRequest(() => {
      const controller = abortRef.current;
      return execute(draft, environmentId || null, requestId, controller?.signal);
    });
  };

  const replay = (entry: HistoryEntry) => {
    if (!entry.requestId) return;
    const saved = collections.flatMap((collection) => collection.requests).find((item) => item.id === entry.requestId);
    if (saved) loadRequest(saved);
    void runRequest(() => replayHistory(entry.id, environmentId || null, abortRef.current?.signal));
  };

  const save = async () => {
    try {
      let targetCollection = collectionId ? collections.find((collection) => collection.id === collectionId) : undefined;
      if (!targetCollection) {
        targetCollection = await createCollection('My requests');
        setCollections((current) => [...current, targetCollection!]);
      }
      const saved = requestId ? await updateRequest(requestId, { name: requestName || 'Untitled request', definition: draft }) : await saveRequest(targetCollection.id, requestName || 'Untitled request', draft);
      setCollections((current) => current.map((collection) => {
        if (collection.id !== saved.collectionId) return collection;
        const exists = collection.requests.some((item) => item.id === saved.id);
        return { ...collection, requests: exists ? collection.requests.map((item) => item.id === saved.id ? saved : item) : [...collection.requests, saved] };
      }));
      setRequestId(saved.id);
      setCollectionId(saved.collectionId);
      setRequestName(saved.name);
      setDirty(false);
      setNotice('Request saved.');
    } catch (cause) {
      setError({ code: 'SAVE_ERROR', message: cause instanceof Error ? cause.message : 'Unable to save the request.' });
    }
  };

  const addCollection = async () => {
    const name = window.prompt('Collection name');
    if (!name?.trim()) return;
    try {
      const created = await createCollection(name.trim());
      setCollections((current) => [...current, created]);
      setCollectionId(created.id);
      setNotice('Collection created.');
    } catch (cause) {
      setError({ code: 'SAVE_ERROR', message: cause instanceof Error ? cause.message : 'Unable to create collection.' });
    }
  };

  const rename = async (collection: Collection) => {
    const name = window.prompt('Rename collection', collection.name);
    if (!name?.trim() || name.trim() === collection.name) return;
    try {
      const updated = await renameCollection(collection.id, name.trim());
      setCollections((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice('Collection renamed.');
    } catch (cause) {
      setError({ code: 'SAVE_ERROR', message: cause instanceof Error ? cause.message : 'Unable to rename the collection.' });
    }
  };

  const removeCollection = async (collection: Collection) => {
    if (!window.confirm(`Delete “${collection.name}” and its saved requests?`)) return;
    try {
      await deleteCollection(collection.id);
      setCollections((current) => current.filter((item) => item.id !== collection.id));
      if (collectionId === collection.id) newRequest();
      setNotice('Collection deleted.');
    } catch (cause) {
      setError({ code: 'DELETE_ERROR', message: cause instanceof Error ? cause.message : 'Unable to delete the collection.' });
    }
  };

  const duplicate = async (saved: SavedRequest) => {
    try {
      const copy = await duplicateRequest(saved.id);
      setCollections((current) => current.map((collection) => collection.id === copy.collectionId ? { ...collection, requests: [...collection.requests, copy] } : collection));
      loadRequest(copy);
      setNotice('Request duplicated.');
    } catch (cause) {
      setError({ code: 'SAVE_ERROR', message: cause instanceof Error ? cause.message : 'Unable to duplicate the request.' });
    }
  };

  const removeSavedRequest = async (saved: SavedRequest) => {
    if (!window.confirm(`Delete “${saved.name}”?`)) return;
    try {
      await deleteRequest(saved.id);
      setCollections((current) => current.map((collection) => collection.id === saved.collectionId ? { ...collection, requests: collection.requests.filter((item) => item.id !== saved.id) } : collection));
      if (requestId === saved.id) newRequest();
      setNotice('Request deleted.');
    } catch (cause) {
      setError({ code: 'DELETE_ERROR', message: cause instanceof Error ? cause.message : 'Unable to delete the request.' });
    }
  };

  const clearAllHistory = async () => {
    if (!history.length || !window.confirm('Clear all request history?')) return;
    try {
      await clearHistory();
      setHistory([]);
      setNotice('History cleared.');
    } catch {
      setError({ code: 'HISTORY_ERROR', message: 'Unable to clear history.' });
    }
  };

  const handleEnvironmentSaved = (environment: Environment) => {
    setEnvironments((current) => current.some((item) => item.id === environment.id) ? current.map((item) => item.id === environment.id ? environment : item) : [...current, environment]);
    setEnvironmentId(environment.id);
    setEnvironmentOpen(false);
    setNotice('Environment saved.');
  };

  const handleEnvironmentDeleted = (id: string) => {
    setEnvironments((current) => current.filter((environment) => environment.id !== id));
    if (environmentId === id) setEnvironmentId(environments.find((environment) => environment.id !== id)?.id ?? '');
    setNotice('Environment deleted.');
  };

  const handleExport = async () => {
    try {
      const bundle = await exportBundle(false);
      downloadJson(bundle, `tracelab-export-${new Date().toISOString().slice(0, 10)}.json`);
      setNotice('Export downloaded without secret values.');
    } catch (cause) {
      setError({ code: 'EXPORT_ERROR', message: cause instanceof Error ? cause.message : 'Unable to export TraceLab data.' });
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Import files are limited to 5 MB.');
      const parsed = ExportBundleSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error('This is not a supported TraceLab export.');
      const preview = await previewImport(parsed.data);
      const summary = preview.summary;
      const secretNote = summary.secretValuesOmitted ? ` ${summary.secretValuesOmitted} sensitive value(s) are omitted and will import blank.` : '';
      if (!window.confirm(`Import ${summary.collectionsCreated} collection(s), ${summary.requestsCreated} request(s), and ${summary.environmentsCreated} environment(s)?${secretNote}`)) return;
      await applyImport(parsed.data);
      await refresh();
      setNotice('TraceLab data imported. Imported requests are not executed automatically.');
    } catch (cause) {
      setError({ code: 'IMPORT_ERROR', message: cause instanceof Error ? cause.message : 'Unable to import TraceLab data.' });
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        newRequest();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        sendRequest();
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (loading) return <div className="loading-screen"><Loader2 className="animate-spin text-[#82b5ff]" size={22} /><span>Starting local workbench…</span></div>;
  if (bootError) return <div className="loading-screen"><div className="max-w-md rounded-lg border border-red-300/20 bg-red-300/[0.06] p-6"><div className="mb-2 flex items-center gap-2 text-red-100"><AlertCircle size={18} /> Local service unavailable</div><p className="text-sm leading-6 text-red-100/70">{bootError}</p><p className="mt-4 text-xs text-slate-500">Start TraceLab with <code>npm run dev</code>, then reload this page.</p></div></div>;

  return <div className="app-shell">
    <div className={`sidebar-drawer ${mobileSidebarOpen ? 'sidebar-drawer-open' : ''}`}><Sidebar collections={collections} history={history} requestId={requestId} mode={sidebarMode} search={search} onModeChange={setSidebarMode} onSearchChange={setSearch} onNew={newRequest} onLoad={loadRequest} onCreateCollection={() => void addCollection()} onRenameCollection={(collection) => void rename(collection)} onDeleteCollection={(collection) => void removeCollection(collection)} onDuplicate={(saved) => void duplicate(saved)} onDeleteRequest={(saved) => void removeSavedRequest(saved)} onReplay={replay} onClearHistory={() => void clearAllHistory()} onManageEnvironments={() => setEnvironmentOpen(true)} onExport={() => void handleExport()} onImport={() => importInputRef.current?.click()} onClose={() => setMobileSidebarOpen(false)} /></div>
    {mobileSidebarOpen && <button className="mobile-scrim" aria-label="Close sidebar" onClick={() => setMobileSidebarOpen(false)} />}
    <main className="main-area">
      <header className="topbar"><div className="flex min-w-0 items-center gap-3"><IconButton label="Open sidebar" className="md:hidden" onClick={() => setMobileSidebarOpen(true)}><Menu size={17} /></IconButton><div className="crumb">WORKBENCH</div><div className="crumb-separator">/</div><input aria-label="Request name" value={requestName} onChange={(event) => { setRequestName(event.target.value); setDirty(true); }} className="request-title-input" /><span className={`dirty-indicator ${dirty ? 'visible' : ''}`}>Unsaved</span></div><div className="flex items-center gap-2"><label className="environment-select"><span>ENV</span><select aria-label="Environment" value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)}>{environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select><ChevronDown size={13} /></label><Button variant="ghost" onClick={() => setEnvironmentOpen(true)}><Settings2 size={14} /> <span className="hidden sm:inline">Environments</span></Button></div></header>
      <div className="workspace-grid"><RequestEditor request={draft} onChange={markDraft} onUrlChange={updateUrl} activeTab={activeTab} onTabChange={setActiveTab} sending={sending} dirty={dirty} onSend={sendRequest} onCancel={cancelRequest} onSave={() => void save()} /><ResponseInspector response={response} error={error} stale={Boolean(response && dirty)} onClear={() => { setResponse(null); setError(null); }} onNotify={setNotice} /></div>
    </main>
    {environmentOpen && <EnvironmentPanel environments={environments} selectedId={environmentId} onClose={() => setEnvironmentOpen(false)} onSaved={handleEnvironmentSaved} onDeleted={handleEnvironmentDeleted} />}
    {notice && <div className="toast" role="status">{notice}</div>}
    <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void handleImportFile(event)} />
  </div>;
}
