import React, { useMemo } from 'react';
import { Trash2, Activity, ListX, Ban } from 'lucide-react';
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
        case 'aborted':
            return {
                card: 'bg-zinc-900/30 border-zinc-700 hover:border-zinc-600',
                dot: 'bg-zinc-500',
                text: 'text-zinc-400',
                line: '#71717a'
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

const GESTURE_EMOJIS = { Rock: '\u270A', Paper: '\u270B', Scissors: '\u270C\uFE0F', Rest: '\uD83D\uDE0C' };

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
    const canDelete = !['saved', 'correct'].includes(win.status);
    const emoji = GESTURE_EMOJIS[win.label] || '?';

    const statusLabel =
        (win.status === 'recording' || win.status === 'pending') ? 'Rec' :
        win.status === 'collected' ? 'Ready' :
        win.status === 'saved' ? `Saved${win.windows_saved > 1 ? ` \u00d7${win.windows_saved}` : ''}` :
        win.status === 'correct' ? `Correct${win.windows_saved > 1 ? ` \u00d7${win.windows_saved}` : ''}` :
        win.status === 'incorrect' ? 'Incorrect' :
        win.status === 'aborted' ? 'Aborted' : 'Error';

    return (
        <div className={`py-1 px-2 rounded-lg border transition-all hover:translate-x-1 animate-in slide-in-from-right-4 fade-in duration-300 ${tone.card}`}>
            <div className="flex items-center gap-2">
                {/* Emoji + label */}
                <div className="flex flex-col items-center w-10 shrink-0">
                    <span className="text-3xl leading-none">{emoji}</span>
                    <span className="text-[12px] font-bold uppercase text-muted leading-none mt-1">{win.label}</span>
                </div>

                {/* Status + duration */}
                <div className="flex flex-col gap-0.5 min-w-[62px]">
                    <div className="flex items-center gap-1">
                        {win.status === 'aborted'
                            ? <Ban size={14} className={tone.text} />
                            : <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
                        }
                        <span className={`text-sm uppercase font-bold leading-none ${tone.text}`}>{statusLabel}</span>
                    </div>
                    <span className="text-sm text-muted font-mono">{duration}ms</span>
                </div>

                {/* Sparkline */}
                <div className="flex-1 h-10 flex items-center justify-center overflow-hidden">
                    <Sparkline data={win.samples} color={tone.line} />
                </div>

                {/* Delete button */}
                <div className="shrink-0">
                    {canDelete && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete?.(win.id); }}
                            className="p-1 hover:bg-red-500/10 rounded text-red-400 text-xs transition-colors"
                            title="Delete window"
                        >
                            <Trash2 size={22} />
                        </button>
                    )}
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
    progressMode = 'captures',
    progressCurrent = 0,
    progressTotal = 1,
    progressPercent = 0,
    currentBatchIndex = 0,
    isCalibrationMode = false,
    perClassLimit = null,
    numClasses = 4,
    onPerClassLimitChange,
}) {
    // Stats calculated in a single pass for efficiency
    const { recordingCount, processedCount, savedCount, batchProcessed, batchSaved } = useMemo(() => {
        let rec = 0, proc = 0, sav = 0, bProc = 0, bSav = 0;
        for (const w of windows) {
            if (w.status === 'recording' || w.status === 'pending') rec++;
            else if (w.status === 'collected') proc++;
            else if (w.status === 'saved' || w.status === 'correct') sav++;
            if (Number(w.batchIndex || 0) === currentBatchIndex) {
                if (w.status === 'collected' || w.status === 'saved' || w.status === 'correct') bProc++;
                if (w.status === 'saved' || w.status === 'correct') bSav++;
            }
        }
        return { recordingCount: rec, processedCount: proc, savedCount: sav, batchProcessed: bProc, batchSaved: bSav };
    }, [windows, currentBatchIndex]);

    const targetCount = Math.max(1,
        isCalibrationMode && perClassLimit !== null
            ? (perClassLimit * numClasses)
            : autoCalibrate
                ? (batchSize * numBatches)
                : (autoLimit || 30)
    );
    const statsTotal = processedCount + recordingCount + savedCount;
    const progress = Math.min(100, Number(progressPercent) || 0);
    const progressLabel = progressMode === 'batches' ? 'Batches' : 'Captures';
    const progressValueText = progressMode === 'batches'
        ? `${Math.min(progressCurrent, progressTotal)} / ${Math.max(1, progressTotal)}`
        : `${Math.min(progressCurrent, progressTotal)} / ${Math.max(1, progressTotal)}`;

    // Memoize the reversed windows list to avoid re-calculating it on every render
    const reversedWindows = useMemo(() => [...windows].reverse(), [windows]);

    return (
        <div className="flex flex-col h-full bg-[var(--surface)] border-2 border-[var(--border)] rounded-xl overflow-hidden shadow-card animate-in fade-in duration-300">
            {/* Header with stats and controls */}
            <div className="px-3 py-3 border-b border-[var(--border)] bg-[var(--bg)]/50 flex flex-col gap-1">
                <div className="flex justify-between items-center">
                    <div className="font-bold text-[var(--title)] flex items-center text-[20px] gap-2">
                        <Activity className="text-[var(--primary)] animate-pulse" size={24} />
                        Collected Captures
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded shadow-sm">
                            <span className="text-[12px] font-bold text-[var(--text-secondary)] uppercase">Target:</span>
                            <span
                                className="text-sm font-mono font-bold text-[var(--primary)]"
                                title={isCalibrationMode && perClassLimit !== null ? `${perClassLimit} per class × ${numClasses} classes` : 'Batch Size × Batches'}
                            >
                                {targetCount}
                            </span>
                            {isCalibrationMode && perClassLimit !== null && (
                                <span className="text-[10px] text-muted font-bold">×{numClasses}</span>
                            )}
                        </div>
                        <span className={`text-[14px] pl-1 border-l-2 border-t-2 border-b-2 border-[var(--border)] font-bold uppercase ${(autoCalibrate && !isCalibrationMode) ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'}`}>Auto</span>
                        <button
                            onClick={() => {
                                if (isCalibrationMode) return;
                                onAutoCalibrateChange?.(!autoCalibrate);
                            }}
                            disabled={isCalibrationMode}
                            className={`w-8 h-4 rounded-full relative transition-colors border-2 border-border ${isCalibrationMode ? 'opacity-50 cursor-not-allowed bg-bg border-border/40' : autoCalibrate ? 'bg-primary border-text' : 'bg-bg'}`}
                        >
                            <div className={`absolute top-0.5 bottom-0.5 w-3 rounded-full shadow transition-all ${(autoCalibrate && !isCalibrationMode) ? 'left-[calc(100%-14px)] bg-bg' : 'left-0.5 bg-text'}`} />
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
                        <div className="text-[14px] font-bold uppercase tracking-wider text-muted">
                            {progress.toFixed(2)}%
                        </div>
                        <button
                            onClick={onDeleteAll}
                            className="p-1 hover:bg-red-500/10 text-muted hover:text-red-500 rounded transition all"
                            title="Delete Latest Unsaved"
                        >
                            <Trash2 size={20} />
                        </button>
                    </div>
                </div>

                {autoCalibrate ? (
                    /* Auto mode: two stacked progress rows (top=current batch, bottom=overall) */
                    <div className="flex flex-col w-full mt-1 rounded overflow-hidden">
                        <div className="relative h-1.5 w-full bg-bg">
                            <div className="absolute top-0 left-0 h-full bg-sky-500 transition-all duration-500 ease-out"
                                style={{ width: `${Math.min(100, (batchProcessed / Math.max(1, batchSize)) * 100)}%` }} />
                            <div className="absolute top-0 left-0 h-full bg-emerald-700 transition-all duration-500 ease-out"
                                style={{ width: `${Math.min(100, (batchSaved / Math.max(1, batchSize)) * 100)}%` }} />
                        </div>
                        <div className="w-full" style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.7)' }} />
                        <div className="relative h-1.5 w-full bg-bg">
                            <div className="absolute top-0 left-0 h-full transition-all duration-500 ease-out"
                                style={{ width: `${Math.min(100, (statsTotal / targetCount) * 100)}%`, backgroundColor: 'var(--primary)' }} />
                            <div className="absolute top-0 left-0 h-full bg-emerald-700 transition-all duration-500 ease-out"
                                style={{ width: `${Math.min(100, (savedCount / targetCount) * 100)}%` }} />
                        </div>
                    </div>
                ) : (
                    /* Manual mode: single bar with 3 layered solid colors, all relative to targetCount */
                    <div className="relative mt-1 h-2 w-full bg-bg rounded-full overflow-hidden">
                        <div className="absolute top-0 left-0 h-full transition-all duration-500 ease-out"
                            style={{ width: `${Math.min(100, (statsTotal / targetCount) * 100)}%`, backgroundColor: 'var(--primary)' }} />
                        <div className="absolute top-0 left-0 h-full bg-sky-400 transition-all duration-500 ease-out"
                            style={{ width: `${Math.min(100, (processedCount / targetCount) * 100)}%` }} />
                        <div className="absolute top-0 left-0 h-full bg-emerald-700 transition-all duration-500 ease-out"
                            style={{ width: `${Math.min(100, (savedCount / targetCount) * 100)}%` }} />
                    </div>
                )}
            </div>

            <div className="flex-grow min-h-0 flex flex-col overflow-y-auto relative pt-2 no-scrollbar px-2 space-y-2 pb-4">
                {reversedWindows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted italic opacity-50 space-y-2">
                        <ListX size={60} strokeWidth={1.5} />
                        <span className="text-2xl">No captures collected yet</span>
                    </div>
                ) : (
                    reversedWindows.map((win) => (
                        <WindowRow key={win.id} win={win} onDelete={onDelete} />
                    ))
                )}
            </div>

            <div className="border-t border-border bg-bg/50 p-2">
                <div className="flex items-center gap-2">
                    <button
                        onClick={onClearSaved}
                        disabled={autoCalibrate}
                        className={`flex-1 min-w-0 py-1 rounded-lg font-bold text-[16px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${autoCalibrate
                            ? 'bg-bg text-muted border border-border cursor-not-allowed opacity-50'
                            : 'bg-emerald-500 text-white hover:opacity-90 shadow-glow'
                            }`}
                    >
                        {isCalibrationMode ? 'Append Captures' : 'Save Captures'}
                    </button>

                    {autoCalibrate ? (
                        <>
                            <div className="flex items-center gap-1 bg-bg border border-border rounded-lg pl-1 h-[34px] shrink-0">
                                <span className="text-[12px] font-bold text-muted uppercase tracking-wider whitespace-nowrap">Size</span>
                                <CustomNumberInput
                                    value={batchSize}
                                    onChange={(value) => onBatchSizeChange?.(Number(value))}
                                    min={1}
                                    borderless
                                    className="w-[50px]"
                                />
                            </div>
                            <div className="flex items-center gap-1 bg-bg border border-border rounded-lg pl-1 h-[34px] shrink-0">
                                <span className="text-[12px] font-bold text-muted uppercase tracking-wider whitespace-nowrap">Batch</span>
                                <CustomNumberInput
                                    value={numBatches}
                                    onChange={(value) => onNumBatchesChange?.(Number(value))}
                                    min={1}
                                    borderless
                                    className="w-[50px]"
                                />
                            </div>
                        </>
                    ) : isCalibrationMode && perClassLimit !== null ? (
                        <div className="flex items-center gap-1 bg-bg border border-border rounded-lg pl-1 h-[34px] shrink-0">
                            <span className="text-[12px] font-bold text-muted uppercase tracking-wider whitespace-nowrap">Per Class</span>
                            <CustomNumberInput
                                value={perClassLimit}
                                onChange={(value) => onPerClassLimitChange?.(Number(value))}
                                min={1}
                                borderless
                                className="w-[50px]"
                            />
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 bg-bg border border-border rounded-lg pl-1 h-[34px] shrink-0">
                            <span className="text-[12px] font-bold text-muted uppercase tracking-wider">Limit</span>
                            <CustomNumberInput
                                value={autoLimit}
                                onChange={(value) => onAutoLimitChange?.(Number(value))}
                                min={1}
                                borderless
                                className="w-[50px]"
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default React.memo(WindowListPanel);
