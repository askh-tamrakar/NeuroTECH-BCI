import React, { useState, useEffect, useMemo, useRef } from 'react';
import AnimatedList from '../ui/AnimatedList';
import { Trash, ClipboardX, Trash2, FolderPlus, RefreshCw, ChevronLeft, ChevronRight, Edit2, GitMerge, Check, X } from 'lucide-react';

export default function SessionManagerPanel({
    activeSensor,
    currentSessionName,
    onSessionChange,
    refreshTrigger = 0,
    isTestMode = false // New Prop
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

    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedSessionRows, setSelectedSessionRows] = useState([]);
    const [rowsLoading, setRowsLoading] = useState(false);
    const [newSessionInput, setNewSessionInput] = useState("");
    const lastSessionRef = useRef(null);

    // New states for rename and multi-merge
    const [renamingSession, setRenamingSession] = useState(null);
    const [renameInput, setRenameInput] = useState("");

    const [mergeMode, setMergeMode] = useState(false);
    const [selectedMergeSessions, setSelectedMergeSessions] = useState([]);
    const [mergeTargetName, setMergeTargetName] = useState("");

    const handleRenameSubmit = async (sessionName, e) => {
        if (e) e.stopPropagation();
        if (!renameInput.trim()) {
            setRenamingSession(null);
            return;
        }

        const cleanOld = sessionName.replace(`${activeSensor.toLowerCase()}_session_`, '');
        const cleanNew = renameInput.trim().replace(/[^a-zA-Z0-9]/g, '_');

        if (cleanOld === cleanNew) {
            setRenamingSession(null);
            return;
        }

        try {
            const res = await fetch(`/api/sessions/${activeSensor}/${encodeURIComponent(sessionName)}/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_name: cleanNew })
            });

            if (res.ok) {
                await fetchSessions();
                if (sessionName === fullCurrentSessionName) {
                    onSessionChange(cleanNew);
                }
            } else {
                console.error("Failed to rename session");
            }
        } catch (err) {
            console.error("Error renaming session", err);
        } finally {
            setRenamingSession(null);
        }
    };

    const handleMultiMergeSubmit = async () => {
        if (!mergeTargetName.trim() || selectedMergeSessions.length < 2) {
            return;
        }

        const targetClean = mergeTargetName.trim().replace(/[^a-zA-Z0-9]/g, '_');

        try {
            const res = await fetch(`/api/sessions/${activeSensor}/merge_multiple`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_sessions: selectedMergeSessions,
                    target_session: targetClean
                })
            });

            if (res.ok) {
                await fetchSessions();
                setMergeMode(false);
                setSelectedMergeSessions([]);
                setMergeTargetName("");
                onSessionChange(targetClean);
            } else {
                console.error("Failed to merge sessions");
            }
        } catch (err) {
            console.error("Error merging sessions", err);
        }
    };

    const toggleMergeSelection = (sessionName) => {
        setSelectedMergeSessions(prev =>
            prev.includes(sessionName)
                ? prev.filter(s => s !== sessionName)
                : [...prev, sessionName]
        );
    };

    const handleCreate = () => {
        if (isTestMode) return; // Disable create in test mode
        const name = newSessionInput.trim();
        if (!name) return;

        // Optimistically add to list (sanitize to match backend roughly)
        // Backend uses: re.sub(r'[^a-zA-Z0-9]', '_', name)
        const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
        const fullName = `${activeSensor.toLowerCase()}_session_${safeName}`;

        if (!sessions.includes(fullName)) {
            setSessions(prev => [fullName, ...prev]);
        }

        onSessionChange(safeName);
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

    const handleDeleteSession = async (sessionName, e) => {
        e.stopPropagation();

        try {
            const url = isTestMode
                ? `/api/prediction/sessions/${sessionName}`
                : `/api/sessions/${activeSensor}/${sessionName}`;

            const res = await fetch(url, {
                method: 'DELETE'
            });

            if (res.ok) {
                // Remove from list immediately
                setSessions(prev => prev.filter(s => s !== sessionName));

                // If current, clear
                if (sessionName === currentSessionName || sessionName.includes(currentSessionName)) {
                    onSessionChange("Default");
                }
            } else {
                console.error("Failed to delete session");
            }
        } catch (err) {
            console.error("Error deleting session:", err);
        }
    };

    // Clear session rows but keep the session itself active (Emptying it)
    const handleClearSessionData = async (e) => {
        e.stopPropagation();
        if (!fullCurrentSessionName) return;

        try {
            await setLoading(true); // Reuse loading or new state
            // 1. Delete the session
            const url = isTestMode
                ? `/api/prediction/sessions/${fullCurrentSessionName}`
                : `/api/sessions/${activeSensor}/${fullCurrentSessionName}`;

            const res = await fetch(url, {
                method: 'DELETE'
            });

            if (res.ok) {
                setSelectedSessionRows([]);

                if (!sessions.find(s => s === fullCurrentSessionName)) {
                    setSessions(prev => [fullCurrentSessionName, ...prev]);
                }
            }
        } catch (err) {
            console.error("Error clearing session:", err);
        } finally {
            setLoading(false);
        }
    };

    // Fetch list of sessions
    const fetchSessions = async () => {
        setLoading(true);
        try {
            const url = isTestMode
                ? `/api/prediction/sessions`
                : `/api/sessions/${activeSensor}`;

            const res = await fetch(url);
            const data = await res.json();
            if (data.tables) {
                setSessions(data.tables.reverse());
            }
        } catch (err) {
            console.error("Failed to fetch sessions:", err);
        } finally {
            setLoading(false);
        }
    };

    // Initial fetch of sessions list
    useEffect(() => {
        fetchSessions();
    }, [activeSensor]);

    // Pagination State
    const [offset, setOffset] = useState(0);
    const [totalRows, setTotalRows] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const LIMIT = 20;

    // Track scroll direction for appending vs prepending
    const [fetchDirection, setFetchDirection] = useState('down'); // 'down' or 'up'

    const memoizedRows = useMemo(() => {
        return selectedSessionRows.map((row, idx) => {
            return (
                <tr key={`${row.id || idx}-${row.timestamp}`} className="border-b border-border hover:bg-border transition-colors group">
                    <td className="px-3 py-1.5 text-primary">{row.absoluteIndex !== undefined ? row.absoluteIndex + 1 : idx + 1 + offset}</td>
                    {/* Assuming row has 'label' or 'class' and 'features' */}
                    <td className="px-3 py-1.5 font-bold text-text">
                        {getLabelName(activeSensor, row.label !== undefined ? row.label : (row.class !== undefined ? row.class : 'Unknown'))}
                    </td>
                    {isTestMode && (
                        <td className={`px-3 py-1.5 font-bold ${row.class === row.label ? 'text-emerald-500' : 'text-red-500'}`}>
                            {row.predicted_label || row.class || '-'}
                        </td>
                    )}

                    {/* Dynamic Feature Cells */}
                    {row.features && !Array.isArray(row.features) ? (
                        Object.keys(selectedSessionRows[0].features).map(key => (
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
                            onClick={(e) => handleDeleteRow(row.id, e)}
                            className="p-0.5 hover:bg-red-500/20 text-muted hover:text-red-500 rounded transition-colors"
                        >
                            <ClipboardX size={20} />
                        </button>
                    </td>
                </tr>
            );
        });
    }, [selectedSessionRows, activeSensor, isTestMode]);

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
            setHasMore(true);
            setSelectedSessionRows([]);
            setTotalRows(0);

            // Trigger initial fetch
            fetchSessionDetails(0, true);
        } else {
            setSelectedSessionRows([]);
        }
    }, [fullCurrentSessionName, refreshTrigger]);

    // Fetch session details
    const fetchSessionDetails = async (currentOffset = 0, isReset = false, direction = 'down') => {
        if (!fullCurrentSessionName) return;

        // Prevent duplicate calls if already loading (except reset)
        if (rowsLoading && !isReset) return;

        setRowsLoading(true);

        try {
            const url = isTestMode
                ? `/api/prediction/sessions/${fullCurrentSessionName}`
                : `/api/sessions/${activeSensor}/${fullCurrentSessionName}?limit=${LIMIT}&offset=${currentOffset}`;

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();

                const newRows = Array.isArray(data) ? data : (data.rows || []);
                const total = data.total !== undefined ? data.total : newRows.length;

                // Annotate rows with their absolute position in DB to fix numbering
                const annotatedRows = newRows.map((r, i) => ({ ...r, absoluteIndex: currentOffset + i }));

                setTotalRows(total);

                if (isReset) {
                    setSelectedSessionRows(annotatedRows);
                } else {
                    setSelectedSessionRows(prev => {
                        // Append or prepend based on direction
                        if (direction === 'down') {
                            // Don't add duplicates (strict ID/timestamp check)
                            const existingIds = new Set(prev.map(p => p.id || p.timestamp));
                            const uniqueNewRows = annotatedRows.filter(r => !existingIds.has(r.id || r.timestamp));
                            return [...prev, ...uniqueNewRows];
                        } else {
                            const existingIds = new Set(prev.map(p => p.id || p.timestamp));
                            const uniqueNewRows = annotatedRows.filter(r => !existingIds.has(r.id || r.timestamp));
                            return [...uniqueNewRows, ...prev];
                        }
                    });
                }

                // Update hasMore based on total count
                if (annotatedRows.length < LIMIT || (currentOffset + annotatedRows.length >= total)) {
                    setHasMore(false);
                } else {
                    setHasMore(true);
                }
            } else {
                console.error("Failed to fetch session details");
                if (isReset) setSelectedSessionRows([]);
            }
        } catch (err) {
            console.error("Error fetching session details:", err);
            if (isReset) setSelectedSessionRows([]);
        } finally {
            setRowsLoading(false);
        }
    };

    // Pagination Handlers
    const handleNextPage = () => {
        if (!hasMore || rowsLoading) return;
        const nextOffset = offset + LIMIT;
        setOffset(nextOffset);
        setFetchDirection('down');
        fetchSessionDetails(nextOffset, false, 'down');
    };

    const handlePrevPage = () => {
        if (offset === 0 || rowsLoading) return;
        const prevOffset = Math.max(0, offset - LIMIT);
        setOffset(prevOffset);
        setFetchDirection('up');
        fetchSessionDetails(prevOffset, false, 'up');
        setHasMore(true);
    };

    const tableContainerRef = useRef(null);
    const scrollTimeout = useRef(null);

    const handleScroll = (e) => {
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

        scrollTimeout.current = setTimeout(() => {
            const { scrollTop, scrollHeight, clientHeight } = e.target;

            // Reached bottom
            if (scrollHeight - scrollTop <= clientHeight + 50) {
                handleNextPage();
            }
            // Reached top 
            // else if (scrollTop === 0) {
            //     handlePrevPage();
            // }
        }, 150);
    };

    const handleDeleteRow = async (rowId, e) => {
        e.stopPropagation();
        if (!fullCurrentSessionName) return;

        try {
            // Optimistic update
            const prevRows = [...selectedSessionRows];
            setSelectedSessionRows(prev => prev.filter(r => r.id !== rowId));

            const url = isTestMode
                ? `/api/prediction/sessions/${fullCurrentSessionName}/rows/${rowId}`
                : `/api/sessions/${activeSensor}/${fullCurrentSessionName}/rows/${rowId}`;

            const res = await fetch(url, {
                method: 'DELETE'
            });

            if (!res.ok) {
                console.error("Failed to delete row");
                // Revert on failure
                setSelectedSessionRows(prevRows);
            }
        } catch (err) {
            console.error("Error deleting row:", err);
        }
    };

    return (
        <div className="flex h-full bg-surface border-2 border-border rounded-xl overflow-hidden shadow-card p-1 gap-1">

            {/* LEFT PANE: Selected Session Table View */}
            <div className="flex-grow flex flex-col min-w-0 bg-bg/50 rounded-lg border border-muted overflow-hidden relative">
                {/* Table Header / Title */}
                <div className="px-3 py-2 border-b border-muted bg-surface/50 flex justify-between items-center">
                    <span className="text-xs font-bold text-muted uppercase tracking-wider">
                        {currentSessionName ? currentSessionName.replace(`${activeSensor.toLowerCase()}_session_`, '') : 'Select a Session'}
                    </span>
                    <span className="text-xs font-mono text-muted">
                        Total Saved: {totalRows}
                    </span>
                </div>

                {/* Table Content */}
                <div
                    className="flex-grow overflow-auto no-scrollbar relative"
                    ref={tableContainerRef}
                    onScroll={handleScroll}
                >
                    {rowsLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center text-muted text-xs animate-pulse bg-surface/50 z-20">
                            Loading data...
                        </div>
                    ) : selectedSessionRows.length === 0 && !rowsLoading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted text-xl opacity-50 gap-2">
                            <span className="text-6xl">📋</span>
                            <span >No data available</span>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-surface/50 sticky top-0 z-10 backdrop-blur-sm">
                                <tr>
                                    <th className="px-3 py-1.5 text-xs font-bold text-primary uppercase border-b border-text w-12">S.No</th>
                                    <th className="px-3 py-1.5 text-xs font-bold text-primary uppercase border-b border-text w-24">
                                        {isTestMode ? "Actual" : "Class"}
                                    </th>
                                    {isTestMode && (
                                        <th className="px-3 py-1.5 text-xs font-bold text-primary uppercase border-b border-text w-24">
                                            Predicted
                                        </th>
                                    )}
                                    {/* Dynamic Feature Headers */}
                                    {selectedSessionRows.length > 0 && selectedSessionRows[0].features && !Array.isArray(selectedSessionRows[0].features) ? (
                                        Object.keys(selectedSessionRows[0].features).map(key => (
                                            <th key={key} className="px-3 py-1.5 text-xs font-bold text-primary uppercase border-b border-text">
                                                {key}
                                            </th>
                                        ))
                                    ) : (
                                        <th className="px-3 py-1.5 text-xs font-bold text-muted uppercase border-b border-border">Features</th>
                                    )}
                                    <th className="pr-1 py-1 text-xs text-left font-bold text-primary uppercase border-b border-text w-10">
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
                                {memoizedRows}
                            </tbody>
                        </table>
                    )}

                </div>
            </div>

            {/* RIGHT PANE: Session List */}
            <div className="w-1/3 min-w-[180px] max-w-[250px] flex flex-col bg-surface rounded-lg border border-muted overflow-hidden">
                <div className="p-3 border-b border-muted bg-bg/30">
                    <h3 className="font-bold text-base text-text uppercase tracking-wide flex items-center justify-between pr-2 mb-2">
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
                            <button onClick={fetchSessions} className="text-muted hover:text-primary p-1">
                                <RefreshCw size={16} />
                            </button>
                        </div>
                    </h3>

                    {/* Create New - Hidden in Test Mode */}
                    {!isTestMode && !mergeMode && (
                        <div className="flex gap-1">
                            <input
                                className="w-full bg-bg border border-border rounded px-2 py-1 text-xs text-text focus:border-primary outline-none font-mono"
                                placeholder="New Session..."
                                value={newSessionInput}
                                onChange={e => setNewSessionInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
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
                    {sessions.length === 0 ? (
                        <div className="text-center text-muted text-base italic py-4">No saved sessions</div>
                    ) : (
                        <AnimatedList
                            items={sessions}
                            selectedIndex={activeSessionIndex}
                            onItemSelect={handleSessionSelect}
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
                                                className="w-full bg-transparent text-text text-sm px-1 outline-none"
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
                                            className={`flex justify-between items-center pr-2 py-1 rounded-md cursor-pointer transition-all ${isChecked ? 'bg-accent/10 border border-accent/20' : 'hover:bg-white/5 border border-transparent'}`}
                                        >
                                            <div className="flex items-center gap-3 pl-1">
                                                <div className={`w-4 h-4 rounded flex items-center justify-center transition-all ${isChecked ? 'bg-accent border-accent' : 'bg-transparent border-2 border-muted/50'}`}>
                                                    {isChecked && <Check size={12} className="text-white" />}
                                                </div>
                                                <span className={`text-base truncate ${isChecked ? 'font-bold text-accent' : 'text-muted'}`}>
                                                    {cleanName}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div onClick={() => handleSessionSelect(sessionName, index)} className={`flex justify-between items-center pr-2 py-0.5 rounded-md cursor-pointer transition-all group ${isSelected
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
                                                        className={`p-0.5 rounded hover:bg-primary/20 hover:text-primary transition-all text-border`}
                                                        title="Rename Session"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                onClick={(e) => handleDeleteSession(sessionName, e)}
                                                className={`p-0.5 rounded hover:bg-red-500/10 hover:text-red-400 transition-all ${isSelected ? 'text-primary/50' : 'text-border group-hover:text-muted'}`}
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
