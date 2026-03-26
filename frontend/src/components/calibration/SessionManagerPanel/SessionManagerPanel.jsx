import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import AnimatedList from '../ui/AnimatedList';
import CustomSelect from '../ui/CustomSelect';
import { Trash, ClipboardX, Trash2, FolderPlus, RefreshCw, Edit2, GitMerge, Check, X, ArchiveX, Filter, ArrowUpDown, ArrowUp, ArrowDown, ListFilter, Hash, ArrowDownToLine, ArrowUpToLine } from 'lucide-react';

export default function SessionManagerPanel({
    activeSensor,
    currentSessionName,
    onSessionChange,
    isTestMode = false,
    inputRef, // Ref for focusing from parent
    sessions = [],
    isLoading = false,
    isTableLoading = false,
    isResetMode = true,
    rows = [],
    totalRows = 0,
    absoluteTotalRows = 0,
    hasMore = true,
    refreshTrigger = 0, // NEW PROP
    onFetchDetails,
    onDeleteSession,
    onRenameSession,
    onMergeSessions,
    onDeleteRow,
    onClearSession,
    onCreateSession
}) {
    const SENSOR_LABEL_MAP = {
        'EMG': { 0: 'Rest', 1: 'Rock', 2: 'Paper', 3: 'Scissors' },
        'EOG': { 0: 'Rest', 1: 'SingleBlink', 2: 'DoubleBlink' },
        'EEG': { 0: 'Rest', 1: 'Concentration', 2: 'Relaxation' }
    };

    const getLabelName = (sensor, val) => {
        if (typeof val === 'string' && isNaN(Number(val))) return val;

        const map = SENSOR_LABEL_MAP[sensor] || {};
        const num = Number(val);
        return map[num] !== undefined ? map[num] : val;
    };

    const [newSessionInput, setNewSessionInput] = useState("");
    const lastSessionRef = useRef(null);

    // New states for rename and multi-merge
    const [renamingSession, setRenamingSession] = useState(null);
    const [renameInput, setRenameInput] = useState("");

    const [mergeMode, setMergeMode] = useState(false);
    const [selectedMergeSessions, setSelectedMergeSessions] = useState([]);
    const [mergeTargetName, setMergeTargetName] = useState("");
    const [offset, setOffset] = useState(0);

    const handleRenameSubmit = async (sessionName, e) => {
        if (e) e.stopPropagation();
        if (!renameInput.trim()) {
            setRenamingSession(null);
            return;
        }
        onRenameSession(sessionName, renameInput.trim());
        setRenamingSession(null);
    };

    const handleMultiMergeSubmit = async () => {
        if (!mergeTargetName.trim() || selectedMergeSessions.length < 2) {
            return;
        }
        onMergeSessions(selectedMergeSessions, mergeTargetName.trim());
        setMergeMode(false);
        setSelectedMergeSessions([]);
        setMergeTargetName("");
    };

    const toggleMergeSelection = (sessionName) => {
        setSelectedMergeSessions(prev =>
            prev.includes(sessionName)
                ? prev.filter(s => s !== sessionName)
                : [...prev, sessionName]
        );
    };

    const handleCreate = () => {
        if (isTestMode) return;
        const name = newSessionInput.trim();
        if (!name) return;
        onCreateSession(name);
        setNewSessionInput("");
    };

    // Calculate active session index for AnimatedList
    const activeSessionIndex = useMemo(() => {
        if (!sessions || sessions.length === 0 || !currentSessionName) return -1;

        // 1. Exact match
        let idx = sessions.findIndex(s => s === currentSessionName);
        if (idx !== -1) return idx;

        // 2. Suffix match
        const suffix = `_session_${currentSessionName}`;
        idx = sessions.findIndex(s => s.endsWith(suffix));
        return idx;
    }, [sessions, currentSessionName]);

    // Handler for AnimatedList selection
    const handleSessionSelect = (sessionName, index) => {
        // Robust extraction: Split by '_session_' and take the last segment
        // This handles cases where user put '_session_' in the name itself (though unlikely)
        const parts = sessionName.split('_session_');
        const clean = parts.length > 1 ? parts[parts.length - 1] : sessionName;
        onSessionChange(clean);
    };

    const handleDeleteSessionProxy = (sessionName, e) => {
        e.stopPropagation();
        onDeleteSession(sessionName);
    };

    // Clear session rows but keep the session itself active (Emptying it)
    const handleClearSessionData = (e) => {
        e.stopPropagation();
        if (!fullCurrentSessionName) return;
        if (onClearSession) {
            onClearSession(fullCurrentSessionName);
        }
    };

    const LIMIT = 20;

    // Fetch list of sessions (Proxy to parent)
    const fetchSessions = () => {
        onFetchDetails({ fullName: fullCurrentSessionName, limit: LIMIT, offset: 0, isReset: true, sortBy, order, label: filterLabel === 'all' ? null : filterLabel, from: rowFrom || null, to: rowTo || null });
    };

    // Sorting & Filtering State
    const [sortBy, setSortBy] = useState('id');
    const [order, setOrder] = useState('ASC');
    const [filterLabel, setFilterLabel] = useState('all');
    const [rowFrom, setRowFrom] = useState('');
    const [rowTo, setRowTo] = useState('');

    const tableContainerRef = useRef(null);
    const scrollTimeout = useRef(null);

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => tableContainerRef.current,
        estimateSize: () => 36, // approx row height
        overscan: 10,
    });

    // Helper to get full table name from the current short name
    const fullCurrentSessionName = useMemo(() => {
        if (!sessions || sessions.length === 0 || !currentSessionName) return null;

        // 1. Try exact match (unlikely if strictly short names are passed, but possible)
        const exact = sessions.find(s => s === currentSessionName);
        if (exact) return exact;

        // 2. Strict suffix match: table name must END with `_session_{shortName}`
        const suffix = `_session_${currentSessionName}`;
        const strictMatch = sessions.find(s => s.endsWith(suffix));
        if (strictMatch) return strictMatch;

        // 3. Last result fallback (risky but better than generic includes)
        return null;
    }, [sessions, currentSessionName]);

    // Reset pagination when session changes
    useEffect(() => {
        if (fullCurrentSessionName) {
            setOffset(0);
            onFetchDetails({
                fullName: fullCurrentSessionName,
                limit: LIMIT,
                offset: 0,
                isReset: true,
                sortBy,
                order,
                label: filterLabel === 'all' ? null : filterLabel,
                from: rowFrom || null,
                to: rowTo || null
            });
        }
    }, [fullCurrentSessionName, sortBy, order, filterLabel]); // Fetch automatically on these structural changes

    // Manual Refresh/Apply function
    const handleApplyFilters = () => {
        if (!fullCurrentSessionName) return;
        setOffset(0);
        onFetchDetails({
            fullName: fullCurrentSessionName,
            limit: LIMIT,
            offset: 0,
            isReset: true,
            sortBy,
            order,
            label: filterLabel === 'all' ? null : filterLabel,
            from: rowFrom || null,
            to: rowTo || null
        });
    };

    // Refresh when new data is added
    useEffect(() => {
        if (fullCurrentSessionName && refreshTrigger) {
            onFetchDetails({
                fullName: fullCurrentSessionName,
                limit: LIMIT,
                offset: offset,
                isReset: true,
                sortBy,
                order,
                label: filterLabel === 'all' ? null : filterLabel,
                from: rowFrom || null,
                to: rowTo || null
            });
        }
    }, [refreshTrigger, fullCurrentSessionName, sortBy, order, filterLabel, rowFrom, rowTo]);

    // Pagination Handler
    const handleNextPage = () => {
        if (!hasMore || isLoading) return;
        const nextOffset = offset + LIMIT;
        setOffset(nextOffset);
        onFetchDetails({
            fullName: fullCurrentSessionName,
            limit: LIMIT,
            offset: nextOffset,
            isReset: false,
            direction: 'down',
            sortBy,
            order,
            label: filterLabel === 'all' ? null : filterLabel,
            from: rowFrom || null,
            to: rowTo || null
        });
    };

    const handlePrevPage = () => {
        if (offset === 0 || isLoading) return;
        const prevOffset = Math.max(0, offset - LIMIT);
        setOffset(prevOffset);
        onFetchDetails({
            fullName: fullCurrentSessionName,
            limit: LIMIT,
            offset: prevOffset,
            isReset: false,
            direction: 'up',
            sortBy,
            order,
            label: filterLabel === 'all' ? null : filterLabel,
            from: rowFrom || null,
            to: rowTo || null
        });
    };

    const handleScroll = (e) => {
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
        scrollTimeout.current = setTimeout(() => {
            const { scrollTop, scrollHeight, clientHeight } = e.target;
            if (scrollHeight - scrollTop <= clientHeight + 50) {
                handleNextPage();
            }
        }, 150);
    };

    return (
        <div className="flex h-full bg-surface border-2 border-border rounded-xl overflow-hidden shadow-card p-1 gap-1">

            {/* LEFT PANE: Selected Session Table View */}
            <div className="flex-grow flex flex-col min-w-0 bg-[var(--section-bg)] rounded-lg border border-[var(--section-border)] overflow-hidden relative">
                {/* Table Header / Toolbar */}
                <div className="px-3 py-2 border-b border-[var(--section-border)] bg-[var(--header-bg)] flex flex-wrap items-center gap-3">
                    {/* Session Name Label */}
                    <div className="flex items-center gap-2 px-3 bg-primary/10 rounded border border-primary shrink-0 h-9">
                        <FolderPlus size={18} className="text-primary" />
                        <span className="text-sm font-bold text-text uppercase tracking-wider truncate max-w-[150px]">
                            {currentSessionName ? currentSessionName.replace(`${activeSensor.toLowerCase()}_session_`, '') : 'Select a Session'}
                        </span>
                    </div>

                    <div className="h-8 w-[1px] bg-[var(--section-border)] opacity-20 shrink-0 mx-1"></div>

                    {/* Filter Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Class Filter */}
                        <div className="flex items-center gap-1.5 bg-[var(--bg)]/50 pl-2 pr-1 py-0.5 rounded border border-[var(--section-border)] h-9 shrink-0 flex-1 min-w-[140px] max-w-[180px]">
                            <ListFilter size={16} className="text-[var(--text-secondary)] shrink-0" />
                            <CustomSelect
                                value={filterLabel}
                                onChange={(val) => setFilterLabel(val)}
                                options={[
                                    { value: 'all', label: 'All Classes' },
                                    ...Object.entries(SENSOR_LABEL_MAP[activeSensor] || {}).map(([val, name]) => ({ value: val, label: name }))
                                ]}
                                className="h-full w-full flex items-center"
                                triggerClassName="!bg-transparent !border-none !p-0 !min-h-0 !shadow-none !text-[11px]"
                            />
                        </div>

                        {/* Sort By */}
                        <div className="flex items-center gap-1 bg-[var(--bg)]/50 pl-2 pr-1 py-0.5 rounded border border-[var(--section-border)] h-9 shrink-0 flex-1 min-w-[130px] max-w-[150px]">
                            <ArrowUpDown size={16} className="text-[var(--text-secondary)] shrink-0" />
                            <CustomSelect
                                value={sortBy}
                                onChange={(val) => setSortBy(val)}
                                options={[
                                    { value: 'id', label: 'S.No' },
                                    { value: 'label', label: 'Class' },
                                    { value: 'timestamp', label: 'Time' }
                                ]}
                                className="h-full w-full flex items-center"
                                triggerClassName="!bg-transparent !border-none !p-0 !min-h-0 !shadow-none !text-[11px]"
                            />
                            <button
                                onClick={() => setOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')}
                                className="px-1.5 hover:text-primary transition-colors text-muted flex items-center shrink-0 h-full"
                                title={order === 'ASC' ? 'Ascending' : 'Descending'}
                            >
                                {order === 'ASC' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                            </button>
                        </div>

                        {/* Row Range */}
                        <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded border border-surface h-9 shrink-0">
                            <div className="flex items-center gap-1 bg-bg/50 rounded px-1.5 py-1">
                                <ArrowDownToLine size={14} className="text-primary font-bold" title="From Row" />
                                <input
                                    type="number"
                                    placeholder="From"
                                    className="bg-transparent w-10 text-center text-xs text-text border-none focus:ring-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    value={rowFrom}
                                    onChange={(e) => setRowFrom(e.target.value)}
                                />
                            </div>
                            <span className="text-muted text-xs font-bold">-</span>
                            <div className="flex items-center gap-1 bg-bg/50 rounded px-1.5 py-1">
                                <ArrowUpToLine size={14} className="text-primary font-bold" title="To Row" />
                                <input
                                    type="number"
                                    placeholder="To"
                                    className="bg-transparent w-10 text-center text-xs text-text border-none focus:ring-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    value={rowTo}
                                    onChange={(e) => setRowTo(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={handleApplyFilters}
                                className="p-1 hover:bg-primary/20 text-primary rounded transition-colors ml-1"
                                title="Apply Range"
                            >
                                <Check size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="h-8 w-[1px] bg-[var(--section-border)] opacity-20 shrink-0 mx-1"></div>

                    {/* Status & Actions */}
                    <div className="flex items-center gap-3 ml-auto shrink-0">
                        {/* Row Count Status */}
                        <div className="flex items-center gap-1.5 px-3 bg-[var(--bg)]/50 rounded border border-[var(--section-border)] h-9">
                            <span className="text-xs text-[var(--text-secondary)] uppercase font-bold">Showing</span>
                            <span className="text-sm font-bold text-[var(--text)]">{totalRows}</span>
                            <span className="text-xs text-[var(--text-secondary)]">of</span>
                            <span className="text-sm font-bold text-[var(--text-secondary)]">{absoluteTotalRows}</span>
                        </div>

                        <div className="flex items-center gap-1 h-9">
                            {!isTestMode && (
                                <button
                                    onClick={() => onClearSession(fullCurrentSessionName)}
                                    className="px-3 hover:bg-red-500/20 text-muted hover:text-red-500 rounded border border-transparent hover:border-red-500/30 transition-all flex items-center gap-1.5 h-full"
                                    title="Clear All Rows"
                                >
                                    <Trash2 size={16} />
                                    <span className="text-xs font-bold uppercase hidden xl:block">Clear</span>
                                </button>
                            )}
                            <div className="h-6 w-[1px] bg-white/10 mx-1"></div>
                            <button
                                onClick={() => onFetchDetails({
                                    fullName: fullCurrentSessionName,
                                    limit: LIMIT, offset: 0, isReset: true,
                                    sortBy, order, label: filterLabel === 'all' ? null : filterLabel,
                                    from: rowFrom || null, to: rowTo || null
                                })}
                                className="px-2 w-9 flex items-center justify-center text-muted hover:text-primary rounded hover:bg-white/5 transition-colors h-full"
                                title="Refresh Table"
                            >
                                <RefreshCw size={16} />
                            </button>
                            <button
                                onClick={() => {
                                    setSortBy('id');
                                    setOrder('ASC');
                                    setFilterLabel('all');
                                    setRowFrom('');
                                    setRowTo('');
                                }}
                                className="px-2 w-9 flex items-center justify-center text-muted rounded hover:bg-red-500/20 hover:text-red-500 transition-colors h-full"
                                title="Reset Filters"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Table Content */}
                <div
                    className="flex-grow overflow-auto no-scrollbar relative"
                    ref={tableContainerRef}
                    onScroll={handleScroll}
                >
                    {/* Primary Loading Overlay (Only on Reset/Initial Load) */}
                    {isTableLoading && isResetMode && (
                        <div className="absolute inset-0 flex items-center justify-center text-muted text-xs animate-pulse bg-surface/50 z-20">
                            Loading data...
                        </div>
                    )}

                    {/* Empty State */}
                    {rows.length === 0 && !isTableLoading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted opacity-50 gap-2">
                            <ClipboardX size={60} strokeWidth={1.5} />
                            <span className="text-2xl"> No data available </span>
                        </div>
                    ) : (
                        <div className="relative">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-bg/75 sticky top-0 z-10 backdrop-blur-sm">
                                    <tr>
                                        <th className="px-3 py-1.5 text-xs font-bold text-[var(--text-highlight)] uppercase border-b border-[var(--section-border)] w-12">S.No</th>
                                        <th className="px-3 py-1.5 text-xs font-bold text-[var(--text-highlight)] uppercase border-b border-[var(--section-border)] w-24">
                                            {isTestMode ? "Actual" : "Class"}
                                        </th>
                                        {isTestMode && (
                                            <th className="px-3 py-1.5 text-xs font-bold text-[var(--text-highlight)] uppercase border-b border-[var(--section-border)] w-24">
                                                Predicted
                                            </th>
                                        )}
                                        {/* Dynamic Feature Headers */}
                                        {rows.length > 0 && rows[0].features && !Array.isArray(rows[0].features) ? (
                                            Object.keys(rows[0].features).map(key => (
                                                <th key={key} className="px-3 py-1.5 text-xs font-bold text-primary uppercase border-b border-[var(--section-border)]">
                                                    {key}
                                                </th>
                                            ))
                                        ) : (
                                            <th className="px-3 py-1.5 text-xs font-bold text-muted uppercase border-b border-[var(--section-border)]">Features</th>
                                        )}
                                        <th className="pr-1 py-1 text-xs text-left font-bold text-primary uppercase border-b border-[var(--section-border)] w-10">
                                            <button
                                                title="Clear Rows"
                                                onClick={handleClearSessionData}
                                                className="p-0.5 hover:bg-red-500/20 text-muted hover:text-red-500 rounded transition-colors"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="text-xs font-mono">
                                    {rowVirtualizer.getVirtualItems().length > 0 && (
                                        <tr>
                                            <td style={{ height: `${rowVirtualizer.getVirtualItems()[0].start}px` }} colSpan="100%" />
                                        </tr>
                                    )}
                                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                        const idx = virtualRow.index;
                                        const row = rows[idx];
                                        if (!row) return null;

                                        return (
                                            <tr key={`${row.id || idx}-${row.timestamp}`} className="border-b border-border hover:bg-border transition-colors group">
                                                <td className="px-3 py-1.5 text-primary">{row.id !== undefined ? row.id : idx + 1 + offset}</td>
                                                <td className="px-3 py-1.5 font-bold text-text">
                                                    {getLabelName(activeSensor, row.label !== undefined ? row.label : (row.class !== undefined ? row.class : 'Unknown'))}
                                                </td>
                                                {isTestMode && (
                                                    <td className={`px-3 py-1.5 font-bold ${row.class === row.label ? 'text-emerald-500' : 'text-red-500'}`}>
                                                        {row.predicted_label || row.class || '-'}
                                                    </td>
                                                )}

                                                {rows.length > 0 && rows[0].features && !Array.isArray(rows[0].features) ? (
                                                    Object.keys(rows[0].features).map(key => (
                                                        <td key={key} className="px-3 py-1.5 text-muted font-mono">
                                                            {(typeof row.features[key] === 'number') ? row.features[key].toFixed(2) : row.features[key]}
                                                        </td>
                                                    ))
                                                ) : (
                                                    <td className="px-3 py-1.5 text-muted truncate max-w-[200px]" title={JSON.stringify(row.features)}>
                                                        {Array.isArray(row.features)
                                                            ? row.features.map(f => f.toFixed(2)).join(', ')
                                                            : JSON.stringify(row.features)}
                                                    </td>
                                                )}

                                                <td className="pr-1 py-1 text-xs text-left font-bold text-primary uppercase border-b border-border w-10  opacity-0 group-hover:opacity-100 transition-opacity ">
                                                    <button
                                                        title="Clear Rows"
                                                        onClick={(e) => { e.stopPropagation(); onDeleteRow(row.id); }}
                                                        className="p-0.5 hover:bg-red-500/20 text-muted hover:text-red-500 rounded transition-colors"
                                                    >
                                                        <ClipboardX size={20} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {rowVirtualizer.getVirtualItems().length > 0 && (
                                        <tr>
                                            <td style={{ height: `${rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end}px` }} colSpan="100%" />
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            {/* Pagination / Append Loading Indicator */}
                            {isTableLoading && !isResetMode && (
                                <div className="p-3 bg-surface/80 border-t border-border flex items-center justify-center gap-2 text-xs text-muted sticky bottom-0 backdrop-blur-sm">
                                    <RefreshCw size={14} className="animate-spin" />
                                    Loading more entries...
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>

            {/* RIGHT PANE: Session List */}
            <div className="w-1/3 min-w-[180px] max-w-[250px] flex flex-col bg-[var(--panel-bg)] rounded-lg border border-[var(--panel-border)] overflow-hidden">
                <div className="p-3 border-b border-[var(--panel-border)] bg-[var(--surface)]">
                    <h3 className="font-bold text-base text-[var(--title)] uppercase tracking-wide flex items-center justify-between pr-2 mb-2">
                        <span>Sessions</span>
                        <div className="flex gap-1 items-center">
                            {!isTestMode && (
                                <button
                                    onClick={() => {
                                        setMergeMode(!mergeMode);
                                        if (!mergeMode) {
                                            setSelectedMergeSessions([]);
                                            setMergeTargetName("");
                                        }
                                    }}
                                    className={`p-1 rounded transition-colors ${mergeMode ? 'bg-accent text-white' : 'text-muted hover:text-accent'}`}
                                    title="Merge Multiple Sessions"
                                >
                                    <GitMerge size={16} />
                                </button>
                            )}
                            <button onClick={() => onFetchDetails({ fullName: fullCurrentSessionName, limit: LIMIT, offset: 0, isReset: true, sortBy, order, label: filterLabel === 'all' ? null : filterLabel, from: rowFrom || null, to: rowTo || null })} className="text-muted hover:text-primary p-1">
                                <RefreshCw size={16} />
                            </button>
                        </div>
                    </h3>

                    {/* Create New - Hidden in Test Mode */}
                    {!isTestMode && !mergeMode && (
                        <div className="flex gap-1">
                            <input
                                ref={inputRef}
                                className="w-full bg-bg border border-border rounded px-2 py-1 text-xs text-text focus:border-primary outline-none font-mono"
                                placeholder="New Session..."
                                value={newSessionInput}
                                onChange={e => setNewSessionInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        handleCreate();
                                        e.target.blur();
                                    } else if (e.key === 'Escape') {
                                        e.target.blur();
                                    }
                                }}
                            />
                            <button
                                onClick={handleCreate}
                                className="px-2 bg-primary text-white text-xs font-bold rounded hover:opacity-90 transition-opacity"
                            >
                                <FolderPlus size={16} />
                            </button>
                        </div>
                    )}

                    {/* Merge Controls */}
                    {!isTestMode && mergeMode && (
                        <div className="flex flex-col gap-2 mt-2 p-2 bg-surface/50 border border-accent/20 rounded-md">
                            <div className="text-xs font-bold text-accent uppercase flex justify-between">
                                Merge Mode
                                <span className="text-muted">{selectedMergeSessions.length} selected</span>
                            </div>
                            <input
                                className="w-full bg-bg border border-border rounded px-2 py-1 text-xs text-text focus:border-accent outline-none font-mono"
                                placeholder="New merged name..."
                                value={mergeTargetName}
                                onChange={e => setMergeTargetName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleMultiMergeSubmit()}
                            />
                            <div className="flex gap-1">
                                <button
                                    onClick={handleMultiMergeSubmit}
                                    disabled={selectedMergeSessions.length < 2 || !mergeTargetName.trim()}
                                    className="flex-1 py-1 bg-accent text-white text-xs font-bold rounded hover:opacity-90 disabled:opacity-50 transition-opacity flex justify-center items-center gap-1"
                                >
                                    <Check size={14} /> Merge
                                </button>
                                <button
                                    onClick={() => setMergeMode(false)}
                                    className="flex-1 py-1 bg-surface border border-border text-muted text-xs font-bold rounded hover:text-text hover:bg-white/5 transition-all text-center"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-grow overflow-hidden relative p-0 bg-surface/30">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted space-y-2 pb-10">
                            <RefreshCw size={40} className="animate-spin opacity-40" />
                            <span className="text-sm">Fetching sessions...</span>
                        </div>
                    ) : sessions.length === 0 && !isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted opacity-60 space-y-2 pb-10">
                            <ArchiveX size={50} strokeWidth={1.5} />
                            <span className="text-xl italic">No saved sessions</span>
                        </div>
                    ) : (
                        <AnimatedList
                            items={sessions}
                            selectedIndex={activeSessionIndex}
                            onItemSelect={handleSessionSelect}
                            enableArrowNavigation={false}
                            className="h-full"
                            itemClassName="text-xs font-mono py-1 px-2 mb-0.5"
                            renderItem={(sessionName, index, isSelected) => {
                                const cleanName = sessionName.replace(`${activeSensor.toLowerCase()}_session_`, '');

                                if (renamingSession === sessionName) {
                                    return (
                                        <div className="flex justify-between items-center pr-1 py-0.5 rounded-md bg-surface border border-primary">
                                            <input
                                                autoFocus
                                                value={renameInput}
                                                onChange={e => setRenameInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(sessionName, e); if (e.key === 'Escape') setRenamingSession(null); }}
                                                className="w-full bg-transparent text-text text-sm pl-1 outline-none"
                                            />
                                            <div className="flex gap-1 shrink-0">
                                                <button onClick={(e) => handleRenameSubmit(sessionName, e)} className="text-emerald-500 hover:bg-emerald-500/20 p-1 rounded">
                                                    <Check size={16} />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); setRenamingSession(null); }} className="text-red-500 hover:bg-red-500/20 p-1 rounded">
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }

                                if (mergeMode) {
                                    const isChecked = selectedMergeSessions.includes(sessionName);
                                    return (
                                        <div
                                            onClick={() => toggleMergeSelection(sessionName)}
                                            className={`flex justify-between items-center rounded-md cursor-pointer transition-all ${isChecked ? 'bg-accent/10 border border-accent/20' : 'hover:bg-white/5 border border-transparent'}`}
                                        >
                                            <div className="flex items-center gap-3 pl-2">
                                                <div className={`w-4 h-4 rounded flex items-center justify-center transition-all ${isChecked ? 'bg-accent border-accent' : 'bg-transparent border-2 border-muted/50'}`}>
                                                    {isChecked && <Check size={12} className="text-white" />}
                                                </div>
                                                <span className={`pl-1 ml-2 text-base truncate ${isChecked ? 'font-bold text-accent' : 'text-muted'}`}>
                                                    {cleanName}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div onClick={() => {
                                        handleSessionSelect(sessionName, index);
                                        if (inputRef && inputRef.current) inputRef.current.blur();
                                    }} className={`flex justify-between items-center pr-2 py-0.5 rounded-md cursor-pointer transition-all group ${isSelected
                                        ? 'bg-primary/10 border border-primary/20 text-primary'
                                        : 'hover:bg-white/5 border border-transparent text-muted hover:text-text'
                                        }`}>
                                        <span className={`text-base truncate ${isSelected ? 'font-bold' : ''}`}>
                                            {cleanName}
                                        </span>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {!isTestMode && (
                                                <>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setRenamingSession(sessionName); setRenameInput(cleanName); }}
                                                        className={`p-0.5 rounded hover:bg-primary/10 hover:text-primary transition-all text-border ${isSelected ? 'text-primary/50' : 'text-border group-hover:text-muted'}`}
                                                        title="Rename Session"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                onClick={(e) => handleDeleteSessionProxy(sessionName, e)}
                                                className={`p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 transition-all ${isSelected ? 'text-primary/50' : 'text-border group-hover:text-muted'}`}
                                                title="Delete Session"
                                            >
                                                <Trash size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
