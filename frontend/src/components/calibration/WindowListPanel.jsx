import React from 'react';
import { Trash2, Activity, Cpu, Zap, ListOrdered, ListX } from 'lucide-react';

/**
 * WindowListPanel
 * Shows a list of labeled calibration windows with their status.
 */
export default function WindowListPanel({
    windows = [],
    onDelete,
    onHighlight,
    activeSensor,
    autoLimit = 30,
    onAutoLimitChange,
    autoCalibrate = false,
    onAutoCalibrateChange,
    onClearSaved,
    onDeleteAll,
    windowProgress = {}
}) {
    const stats = {
        total: windows.length,
        saved: windows.filter(w => w.status === 'saved' || w.status === 'correct').length,
    };

    // Helper for sparkline
    const Sparkline = ({ data, color = '#10b981' }) => {
        if (!data || data.length < 2) return null;
        const width = 100;
        const height = 30;
        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;

        // Downsample for performance if needed
        const step = Math.ceil(data.length / 50);
        const points = data.filter((_, i) => i % step === 0).map((v, i, arr) => {
            const x = (i / (arr.length - 1)) * width;
            const y = height - ((v - min) / range) * height;
            return `${x},${y}`;
        }).join(' ');

        return (
            <svg width={width} height={height} className="overflow-visible">
                <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
            </svg>
        );
    };

    // Track progress of the CURRENT BATCH (Active/Collected), not total saved history
    const targetCount = autoLimit || 30;
    const activeCount = windows.filter(w => w.status === 'recording' || w.status === 'pending' || w.status === 'collected').length;
    const progress = Math.min(100, (activeCount / targetCount) * 100);

    return (
        <div className="flex flex-col h-full bg-surface border-2 border-border rounded-xl overflow-hidden shadow-card animate-in fade-in duration-300">
            {/* Header with stats and controls */}
            <div className="px-3 py-3 border-b border-border bg-bg/50 flex flex-col gap-1">
                <div className="flex justify-between items-center">
                    <div className="font-bold text-text flex items-center text-[20px] gap-2">
                        <Activity className="text-primary animate-pulse" size={24} />
                        Collected Windows
                    </div>

                    {/* Auto-Calibration/Limit Toggle */}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-bg px-2 py-1 rounded border border-muted">
                            <span className="text-[12px] font-bold text-muted uppercase">Limit:</span>
                            <input
                                type="number"
                                className="w-8 bg-transparent text-sm font-mono text-center outline-none text-text appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                value={autoLimit}
                                onChange={(e) => onAutoLimitChange?.(Number(e.target.value))}
                            />
                        </div>
                        {/* <div className="h-6 w-[2px] bg-border mx-1"></div> */}
                        <span className={`text-[14px] pl-1 border-l-2 border-t-2 border-b-2 border-border font-bold uppercase ${autoCalibrate ? 'text-primary' : 'text-muted'}`}>Auto</span>
                        <button
                            onClick={() => onAutoCalibrateChange?.(!autoCalibrate)}
                            className={`w-8 h-4 rounded-full relative transition-colors border-2 border-border ${autoCalibrate ? 'bg-primary' : 'bg-bg'}`}
                        >
                            <div className={`absolute top-0.5 bottom-0.5 w-3 rounded-full bg-text shadow transition-all ${autoCalibrate ? 'left-[calc(100%-14px)]' : 'left-0.5'}`} />
                        </button>
                    </div>
                </div>

                <div className="flex justify-between items-end">
                    <div className="flex gap-4 text-[16px] font-mono text-muted uppercase tracking-widest">
                        <span>Total: <span className="text-text">{stats.total}</span></span>
                        <span>Processed: <span className="text-blue-400">{activeCount}</span></span>
                        <span>Saved: <span className="text-emerald-400">{stats.saved}</span></span>
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

                {/* Progress Bar (Only visible in Auto mode) */}
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
                {windows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted italic opacity-50 space-y-2">
                        <ListX size={60} strokeWidth={1.5} />
                        <span className="text-2xl">No windows collected yet</span>
                    </div>
                ) : (
                    windows.slice().reverse().map((win, index) => (
                        <div
                            key={win.id || index}
                            onClick={() => onHighlight?.(win)}
                            className={`py-1 px-2 flex flex-col gap-0 rounded-lg border transition-all cursor-pointer group hover:translate-x-1 ${(win.status === 'recording' || win.status === 'pending')
                                ? 'bg-yellow-500/5 border-yellow-500/50 hover:border-yellow-500' // Yellow (Pending)
                                : (win.status === 'collected')
                                    ? 'bg-blue-500/5 border-blue-500/50 hover:border-blue-500' // Blue (Ready)
                                    : (win.status === 'saved' || win.status === 'correct')
                                        ? 'bg-emerald-500/5 border-emerald-500/50 hover:border-emerald-500' // Green (Saved)
                                        : (win.status === 'error' || win.status === 'incorrect')
                                            ? 'bg-red-500/5 border-red-500/50 hover:border-red-500' // Red (Error)
                                            : 'bg-black/5 border-gray-600 hover:border-black' // Black (Unknown)
                                }`}
                        >
                            <div className="flex justify-between items-center">
                                <div className="flex flex-col gap-2">
                                    {/* Class Indicator */}
                                    <span className="font-bold text-sm text-text uppercase">{win.label}</span>

                                    {/* Status Indicator */}
                                    <div className="flex items-center gap-1">
                                        <span className={`w-1.5 h-1.5 rounded-full ${(win.status === 'recording' || win.status === 'pending') ? 'bg-yellow-500' :
                                            (win.status === 'collected') ? 'bg-blue-500' :
                                                (win.status === 'saved' || win.status === 'correct') ? 'bg-emerald-500' :
                                                    (win.status === 'error' || win.status === 'incorrect') ? 'bg-red-500' :
                                                        'bg-gray-600'
                                            }`}></span>
                                        <span className={`text-xs uppercase ${(win.status === 'recording' || win.status === 'pending') ? 'text-yellow-500' :
                                            (win.status === 'collected') ? 'text-blue-500' :
                                                (win.status === 'saved' || win.status === 'correct') ? 'text-emerald-500' :
                                                    (win.status === 'error' || win.status === 'incorrect') ? 'text-red-500' :
                                                        'text-muted'
                                            }`}>
                                            {(win.status === 'recording' || win.status === 'pending') ? 'Recording' :
                                                (win.status === 'collected') ? 'Ready' :
                                                    (win.status === 'saved') ? 'Saved' :
                                                        (win.status === 'correct') ? 'Correct' :
                                                            (win.status === 'incorrect') ? 'Incorrect' :
                                                                'Error'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 content-center">
                                    {/* Graph */}
                                    <div className="w-24 h-8 flex items-center">
                                        <Sparkline data={win.samples} color={
                                            (win.status === 'recording' || win.status === 'pending') ? '#eab308' :
                                                (win.status === 'collected') ? '#3b82f6' :
                                                    (win.status === 'saved' || win.status === 'correct') ? '#10b981' :
                                                        (win.status === 'error' || win.status === 'incorrect') ? '#ef4444' :
                                                            '#6b7280'
                                        } />
                                    </div>
                                    <span className="text-xs text-muted font-mono">
                                        {(win.endTime - win.startTime).toFixed(0)}ms
                                    </span>
                                </div>

                                <div className="flex gap-1 opacity-100">
                                    {/* Trash */}
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
                    ))
                )}
            </div>

            {/* Footer with Append Sample */}
            <div className="p-2 border-t border-border bg-bg/50">
                <button
                    onClick={onClearSaved}
                    disabled={autoCalibrate}
                    className={`w-full py-1 rounded-lg font-bold text-[16px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${autoCalibrate
                        ? 'bg-bg text-muted border border-border cursor-not-allowed opacity-50'
                        : 'bg-emerald-500 text-white hover:opacity-90 shadow-glow'
                        }`}
                >
                    Append Sample
                </button>
            </div>
        </div >
    );
}
