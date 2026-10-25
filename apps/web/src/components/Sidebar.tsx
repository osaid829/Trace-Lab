import { Copy, Database, Download, FilePlus2, FolderPlus, History as HistoryIcon, MoreHorizontal, Pencil, Play, Search, Settings2, Trash2, Upload, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Collection, HistoryEntry, SavedRequest } from '@tracelab/shared';
import { formatBytes, formatTime, outcomeLabel } from '../lib/request';
import { Button, IconButton, StatusDot } from './ui';

export type SidebarMode = 'collections' | 'history';

function historyTone(entry: HistoryEntry): 'success' | 'warning' | 'danger' | 'neutral' {
  if (entry.outcome === 'success') return 'success';
  if (entry.outcome === 'http-error' || entry.outcome === 'timeout') return 'warning';
  if (entry.outcome === 'canceled') return 'neutral';
  return 'danger';
}

export function Sidebar({
  collections,
  history,
  requestId,
  mode,
  search,
  onModeChange,
  onSearchChange,
  onNew,
  onLoad,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onDuplicate,
  onDeleteRequest,
  onReplay,
  onClearHistory,
  onManageEnvironments,
  onExport,
  onImport,
  onClose
}: {
  collections: Collection[];
  history: HistoryEntry[];
  requestId: string | null;
  mode: SidebarMode;
  search: string;
  onModeChange: (mode: SidebarMode) => void;
  onSearchChange: (value: string) => void;
  onNew: () => void;
  onLoad: (request: SavedRequest) => void;
  onCreateCollection: () => void;
  onRenameCollection: (collection: Collection) => void;
  onDeleteCollection: (collection: Collection) => void;
  onDuplicate: (request: SavedRequest) => void;
  onDeleteRequest: (request: SavedRequest) => void;
  onReplay: (entry: HistoryEntry) => void;
  onClearHistory: () => void;
  onManageEnvironments: () => void;
  onExport: () => void;
  onImport: () => void;
  onClose?: () => void;
}) {
  const [collectionMenu, setCollectionMenu] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'success' | 'http-error' | 'failure'>('all');
  const visibleCollections = useMemo(() => collections.map((collection) => ({ ...collection, requests: collection.requests.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())) })).filter((collection) => collection.name.toLowerCase().includes(search.toLowerCase()) || collection.requests.length > 0), [collections, search]);
  const visibleHistory = history.filter((entry) => historyFilter === 'all' || entry.outcome === historyFilter || (historyFilter === 'failure' && !['success', 'http-error'].includes(entry.outcome)));

  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark">T</div><div><div className="brand-name">TraceLab</div><div className="brand-tagline">Understand every request.</div></div>{onClose && <IconButton label="Close sidebar" className="ml-auto md:hidden" onClick={onClose}><X size={16} /></IconButton>}</div>
    <div className="px-3 pt-4"><Button variant="primary" className="w-full" onClick={onNew}><FilePlus2 size={15} /> New request <span className="ml-auto font-mono text-[10px] opacity-60">⌘ K</span></Button></div>
    <div className="sidebar-tabs"><button className={mode === 'collections' ? 'sidebar-tab-active' : 'sidebar-tab'} onClick={() => onModeChange('collections')}><Database size={14} /> Collections</button><button className={mode === 'history' ? 'sidebar-tab-active' : 'sidebar-tab'} onClick={() => onModeChange('history')}><HistoryIcon size={14} /> History</button></div>
    {mode === 'collections' ? <div className="min-h-0 flex-1 overflow-auto px-3"><div className="mb-3 flex items-center gap-2"><div className="relative flex-1"><Search size={13} className="absolute left-2.5 top-2.5 text-slate-600" /><input aria-label="Search collections" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search saved requests" className="field h-8 w-full pl-8 text-xs" /></div><IconButton label="Add collection" onClick={onCreateCollection}><FolderPlus size={15} /></IconButton></div>{visibleCollections.length === 0 ? <div className="empty-sidebar"><FolderPlus size={19} /><span>{search ? 'No saved requests match this search.' : 'No saved collections yet.'}</span><button onClick={onCreateCollection}>{search ? 'Create collection' : 'Create one'}</button></div> : visibleCollections.map((collection) => <div key={collection.id} className="mb-4"><div className="group flex items-center gap-1 rounded px-2 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/[0.04]"><span className="flex-1 truncate">{collection.name}</span><button aria-label={`Collection actions for ${collection.name}`} className="text-slate-500 hover:text-slate-200" onClick={() => setCollectionMenu(collectionMenu === collection.id ? null : collection.id)}><MoreHorizontal size={14} /></button></div>{collectionMenu === collection.id && <div className="ml-6 mb-1 flex gap-1"><button className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-100" onClick={() => onRenameCollection(collection)}><Pencil size={11} /> Rename</button><button className="inline-flex items-center gap-1 text-[10px] text-red-300/80 hover:text-red-200" onClick={() => onDeleteCollection(collection)}><Trash2 size={11} /> Delete</button></div>}{collection.requests.length === 0 ? <div className="py-2 pl-7 text-[11px] text-slate-600">No saved requests</div> : collection.requests.map((saved) => <div key={saved.id} className={`saved-row ${saved.id === requestId ? 'saved-row-active' : ''}`}><button className="min-w-0 flex-1 truncate text-left" onClick={() => onLoad(saved)}><span className="method-pill">{saved.definition.method}</span><span className="ml-2 truncate">{saved.name}</span></button><div className="saved-actions"><IconButton label={`Duplicate ${saved.name}`} onClick={() => onDuplicate(saved)}><Copy size={13} /></IconButton><IconButton label={`Delete ${saved.name}`} onClick={() => onDeleteRequest(saved)}><Trash2 size={13} /></IconButton></div></div>)}</div>)}</div> : <div className="min-h-0 flex-1 overflow-auto px-3"><div className="mb-3 flex items-center justify-between gap-2"><select aria-label="History filter" className="field h-8 min-w-0 flex-1 text-xs" value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value as typeof historyFilter)}><option value="all">All outcomes</option><option value="success">Success</option><option value="http-error">HTTP errors</option><option value="failure">Transport failures</option></select><Button variant="ghost" className="h-8 px-2 text-[11px]" onClick={onClearHistory} disabled={history.length === 0}>Clear</Button></div>{visibleHistory.length === 0 ? <div className="empty-sidebar"><HistoryIcon size={19} /><span>{history.length === 0 ? 'Executed requests will appear here.' : 'No history entries match this filter.'}</span></div> : visibleHistory.map((entry) => <div key={entry.id} className="history-row"><StatusDot tone={historyTone(entry)} /><button className="min-w-0 flex-1" onClick={() => onReplay(entry)} disabled={!entry.requestId}><div className="flex items-center gap-2"><strong>{entry.statusCode ?? '—'}</strong><span className="truncate text-[10px] text-slate-500">{entry.method}</span></div><div className="mt-1 truncate text-[11px]">{entry.url}</div><div className="mt-1 flex gap-2 text-[9px] text-slate-600"><span>{formatTime(entry.executedAt)}</span><span>{outcomeLabel(entry.outcome)}</span>{entry.responseBytes !== null && <span>{formatBytes(entry.responseBytes)}</span>}</div></button><IconButton label={entry.requestId ? `Replay ${entry.method} request` : 'History entry is not replayable'} onClick={() => onReplay(entry)} disabled={!entry.requestId}><Play size={13} /></IconButton></div>)}</div>}
    <div className="sidebar-footer"><div className="flex items-center gap-2"><StatusDot tone="success" /><span>Local service connected</span></div><div className="mt-3 grid grid-cols-2 gap-1"><button className="data-action" onClick={onExport}><Download size={13} /> Export</button><button className="data-action" onClick={onImport}><Upload size={13} /> Import</button></div><button className="mt-3 flex items-center gap-2 text-[11px] text-slate-500 hover:text-slate-200" onClick={onManageEnvironments}><Settings2 size={13} /> Manage environments</button></div>
  </aside>;
}
