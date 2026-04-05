import React, { useMemo } from 'react';
import { Trash2, Activity, Cpu, Zap, ListOrdered, ListX } from 'lucide-react';
import CustomNumberInput from '../ui/inputs/CustomNumberInput'

// --- Helper Functions ---
const getWindowTone = (status) => {
    switch (status) {
        case 'recording':
        case 'pending':
            return {
                card: 'bg-[var(--window-pending-bg)] border-[var(--window-pending-border)] hover:border-[var(--window-pending-border-strong)]',
                dot: 'bg-[var(--window-pending-line)]',
                text: 'text-[var(--window-pending-line)]',
                line: 'var(--window-pending-line)'
            };
        case 'saving':
            return {
                card: 'bg-[var(--window-pending-bg)] border-[var(--window-pending-border)] hover:border-[var(--window-pending-border-strong)] animate-pulse',
                dot: 'bg-[var(--window-pending-line)]',
                text: 'text-[var(--window-pending-line)]',
                line: 'var(--window-pending-line)'
            };
        case 'collected':
            return {
                card: 'bg-[var(--window-collected-bg)] border-[var(--window-collected-border)] hover:border-[var(--window-collected-border-strong)]',
                dot: 'bg-[var(--window-collected-line)]',
                text: 'text-[var(--window-collected-line)]',
                line: 'var(--window-collected-line)'
            };
        case 'saved':
        case 'correct':
            return {
                card: 'bg-[var(--window-saved-bg)] border-[var(--window-saved-border)] hover:border-[var(--window-saved-border-strong)]',
                dot: 'bg-[var(--window-saved-line)]',
                text: 'text-[var(--window-saved-line)]',
                line: 'var(--window-saved-line)'
            };
        default:
            return {
                card: 'bg-[var(--window-error-bg)] border-[var(--window-error-border)] hover:border-[var(--window-error-border-strong)]',
                dot: 'bg-[var(--window-error-line)]',
                text: 'text-[var(--window-error-line)]',
                line: 'var(--window-error-line)'
            };
    }
};

// --- Sub-components (Memoized) ---
const Sparkline = React.memo(({ data, color = '#10b981' }) => {
    if (!data || data.length < 2) return null;
    const width = 100;
    const height = 30;
    const min = Math.min(...data);
    const calculatedMax = Math.max(...data);
    const range = calculatedMax - min || 1;

    // Use a fixed step for downsampling to guarantee performance
    const maxPoints = 50;
    const step = Math.max(1, Math.ceil(data.length / maxPoints));
    
    let pathPoints = "";
    for (let i = 0; i < data.length; i += step) {
        const v = data[i];
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * height;
        pathPoints += `${x},${y} `;
    }

    return (
        <svg width={width} height={height} className="overflow-visible" preserveAspectRatio="none">
            <polyline points={pathPoints} fill="none" stroke={color} strokeWidth="1.5" />
        </svg>
    );
});

const WindowRow = React.memo(({ win, onDelete }) => {
    const tone = useMemo(() => getWindowTone(win.status), [win.status]);
    const duration = useMemo(() => (win.endTime - win.startTime).toFixed(0), [win.startTime, win.endTime]);

    return (
        <div className={`py-1 px-2 flex flex-col gap-0 rounded-lg border transition-all group hover:translate-x-1 animate-in slide-in-from-right-4 fade-in duration-300 ${tone.card}`}>
            <div className="flex justify-between items-center">
                <div className="flex flex-col gap-2">
                    <span className="font-bold text-sm text-text uppercase">{win.label}</span>
                    <div className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`}></span>
                        <span className={`text-xs uppercase ${tone.text}`}>
                            {(win.status === 'recording' || win.status === 'pending') ? 'Recording' :
                                (win.status === 'saving') ? 'Saving...' :
                                (win.status === 'collected') ? 'Ready' :
                                    (win.status === 'saved' || win.status === 'correct') ? (
                                        <span>
                                            {win.status === 'saved' ? 'Saved' : 'Correct'}
                                            {win.windows_saved > 1 && ` (x${win.windows_saved})`}
                                        </span>
                                    ) :
                                        (win.status === 'incorrect') ? 'Incorrect' :
                                            'Error'}
                        </span>
                    </div>
                </div>

                <div className="flex flex-col gap-2 content-center">
                    <div className="w-24 h-8 flex items-center">
                        <Sparkline data={win.samples} color={tone.line} />
                    </div>
                    <span className="text-xs text-[var(--text-secondary)] font-mono">
                        {duration}ms
                    </span>
                </div>

                <div className="flex gap-1 opacity-100">
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete?.(win.id); }}
                        className="p-1 hover:bg-red-500/10 rounded text-red-400 text-xs transition-colors"
                        title="Delete window"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
});

/**
 * WindowListPanel
 * Shows a list of labeled calibration windows with their status.
 */
function WindowListPanel({
    windows = [],
    onDelete,
    activeSensor,
    autoLimit = 30,
    onAutoLimitChange,
    batchSize = 5,
    onBatchSizeChange,
    numBatches = 6,
    onNumBatchesChange,
    autoCalibrate = false,
    onAutoCalibrateChange,
    onClearSaved,
    onDeleteAll,
}) {
    // Stats calculated in a single pass for efficiency
    const { recordingCount, processedCount, savedCount } = useMemo(() => {
        let rec = 0, proc = 0, sav = 0;
        for (const w of windows) {
            if (w.status === 'recording' || w.status === 'pending') rec++;
            else if (w.status === 'collected') proc++;
            else if (w.status === 'saved' || w.status === 'correct') sav++;
        }
        return { recordingCount: rec, processedCount: proc, savedCount: sav };
    }, [windows]);

    const statsTotal = processedCount + recordingCount + savedCount;
    const targetCount = autoLimit || 30;
    const progress = Math.min(100, (processedCount / targetCount) * 100);

    // Memoize the reversed windows list to avoid re-calculating it on every render
    const reversedWindows = useMemo(() => [...windows].reverse(), [windows]);

    return (
        <div className="flex flex-col h-full bg-[var(--surface)] border-2 border-[var(--border)] rounded-xl overflow-hidden shadow-card animate-in fade-in duration-300">
            {/* Header with stats and controls */}
            <div className="px-3 py-3 border-b border-[var(--border)] bg-[var(--bg)]/50 flex flex-col gap-1">
                <div className="flex justify-between items-center">
                    <div className="font-bold text-[var(--title)] flex items-center text-[20px] gap-2">
                        <Activity className="text-[var(--primary)] animate-pulse" size={24} />
                        Collected Windows
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded shadow-sm">
                            <span className="text-[12px] font-bold text-[var(--text-secondary)] uppercase">Limit:</span>
                            <span className="text-sm font-mono font-bold text-[var(--primary)]" title="Calculated: Batch Size × Batches">
                                {batchSize * numBatches}
                            </span>
                        </div>
                        <span className={`text-[14px] pl-1 border-l-2 border-t-2 border-b-2 border-[var(--border)] font-bold uppercase ${autoCalibrate ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'}`}>Auto</span>
                        <button
                            onClick={() => onAutoCalibrateChange?.(!autoCalibrate)}
                            className={`w-8 h-4 rounded-full relative transition-colors border-2 border-border ${autoCalibrate ? 'bg-primary' : 'bg-bg'}`}
                        >
                            <div className={`absolute top-0.5 bottom-0.5 w-3 rounded-full bg-text shadow transition-all ${autoCalibrate ? 'left-[calc(100%-14px)]' : 'left-0.5'}`} />
                        </button>
                    </div>
                </div>

                <div className="flex justify-between items-end">
                    <div className="flex gap-3 text-[14px] font-mono text-[var(--text-secondary)] uppercase tracking-widest">
                        <span>Total: <span className="text-[var(--text)]">{statsTotal}</span></span>
                        <span>Processed: <span className="text-[var(--window-collected-line)]">{processedCount}</span></span>
                        <span>Saved: <span className="text-[var(--window-saved-line)]">{savedCount}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onDeleteAll}
                            className="p-1 hover:bg-red-500/10 text-muted hover:text-red-500 rounded transition all"
                            title="Clear All"
                        >
                            <Trash2 size={20} />
                        </button>
                    </div>
                </div>

                {autoCalibrate && (
                    <div className="h-1 w-full bg-bg rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}
            </div>

            <div className="flex-grow min-h-0 flex flex-col overflow-y-auto relative pt-2 no-scrollbar px-2 space-y-2 pb-4">
                {reversedWindows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted italic opacity-50 space-y-2">
                        <ListX size={60} strokeWidth={1.5} />
                        <span className="text-2xl">No windows collected yet</span>
                    </div>
                ) : (
                    reversedWindows.map((win) => (
                        <WindowRow key={win.id} win={win} onDelete={onDelete} />
                    ))
                )}
            </div>

            <div className="p-2 border-t border-border bg-bg/50 flex items-center gap-2">
                <button
                    onClick={onClearSaved}
                    disabled={autoCalibrate}
                    className={`flex-1 py-1 rounded-lg font-bold text-[16px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${autoCalibrate
                        ? 'bg-bg text-muted border border-border cursor-not-allowed opacity-50'
                        : 'bg-emerald-500 text-white hover:opacity-90 shadow-glow'
                        }`}
                >
                    Save Windows
                </button>

                {autoCalibrate ? (
                    <div className="flex items-center gap-2">
                        <CustomNumberInput
                            value={batchSize}
                            onChange={(value) => onBatchSizeChange?.(Number(value))}
                            min={0}
                            unit={"Size"}
                        />
                        <CustomNumberInput
                            value={numBatches}
                            onChange={(value) => onNumBatchesChange?.(Number(value))}
                            min={0}
                            unit={"Batches"}
                        />
                    </div>
                ) : (
                    <CustomNumberInput
                        value={autoLimit}
                        onChange={(value) => onAutoLimitChange?.(Number(value))}
                        min={0}
                        unit={"Limit"}
                    />
                )}
            </div>
        </div>
    );
}

export default React.memo(WindowListPanel);
