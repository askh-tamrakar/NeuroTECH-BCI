import React from 'react';
import {
    Settings, Play, Square, Activity, MousePointer2, Zap,
    History, Menu, ChevronLeft, Gamepad2, Mouse, Trash2, Power, Layers
} from 'lucide-react';

/**
 * BubbleSidebar — page-specific controls sidebar for BubbleGameView.
 */
const BubbleSidebar = ({
    onBackToMenu,
    mouseMode, setMouseMode,
    difficulty, setDifficulty,
    realTimeFreq,
    focusScore,
    globalRunning,
    containerRef,
    sidebarMode,
    setSidebarMode,
}) => {
    // ... within the return ...
    const dashOffset = 201 - (Math.min(100, focusScore || 0) / 100) * 201;

    return (
        <div className="flex-grow flex flex-col p-4 gap-4 font-mono transition-opacity duration-300 w-full shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 mb-1">
                <div>
                    <h2 className="text-[20px] font-bold text-[var(--text)] flex items-center gap-2.5 tracking-[1.5px]">
                        <Gamepad2 size={22} className="text-[var(--primary)]" />
                        <span style={{ letterSpacing: '2px' }}>BUBBLE GAME</span>
                    </h2>
                </div>
                <button
                    onClick={() => setSidebarMode(sidebarMode === 'main' ? 'page' : 'main')}
                    className="nav-controls-toggle"
                    title="Switch to Navigation"
                >
                    <Layers size={14} />
                    NAV
                </button>
            </div>

            {/* Global Play/Stop */}
            <div className="shrink-0 mb-1">
                <button onClick={() => globalRunning ? containerRef.current?.stopGameHandler() : containerRef.current?.startGameHandler()} className={`w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-[3px] transition-all flex items-center justify-center gap-3 border-2 shadow-lg ${globalRunning ? 'bg-red-500/10 border-red-500/40 text-red-500 hover:bg-red-500/20' : 'bg-green-500/10 border-green-500/40 text-green-500 hover:bg-green-500/20'}`}>
                    {globalRunning ? <><Square size={20} /> END SESSION</> : <><Play size={20} /> NEW SESSION</>}
                </button>
            </div>

            {/* Game Mode */}
            <div className="bg-[var(--bg)]/50 border border-[var(--primary)]/20 rounded-xl p-3 shrink-0 flex flex-col gap-3">
                <h4 className="text-[10px] font-bold text-[var(--muted)]/80 uppercase tracking-widest flex items-center gap-2">
                    <Settings size={14} /> Control Mode
                </h4>
                <div className="flex gap-2 w-full p-1 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
                    <button
                        id="mode-indicator-switch"
                        onClick={() => setMouseMode(false)}
                        className={`flex-1 py-1.5 rounded-md text-[11px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${!mouseMode ? 'bg-[var(--primary)]/20 text-[var(--primary)] shadow-[0_0_8px_rgba(var(--primary-rgb),0.3)]' : 'text-[var(--muted)] hover:bg-white/5'}`}
                    >
                        <Zap size={14} /> SENSOR
                    </button>
                    <button
                        onClick={() => setMouseMode(true)}
                        className={`flex-1 py-1.5 rounded-md text-[11px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${mouseMode ? 'bg-amber-500/20 text-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]' : 'text-[var(--muted)] hover:bg-white/5'}`}
                    >
                        <Mouse size={14} /> MANUAL
                    </button>
                </div>

                <h4 className="text-[10px] font-bold text-[var(--muted)]/80 uppercase tracking-widest flex items-center gap-2 mt-3">
                    <Activity size={14} /> Difficulty Level
                </h4>
                <div className="flex gap-2 w-full p-1 bg-[var(--surface)] rounded-lg border border-[var(--border)] mb-1">
                    {[1, 2, 3].map(lvl => (
                        <button
                            key={lvl}
                            onClick={() => setDifficulty(lvl)}
                            className={`flex-1 py-1.5 rounded-md text-[11px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${difficulty === lvl ? 'bg-[var(--primary)]/20 text-[var(--primary)] shadow-[0_0_8px_rgba(var(--primary-rgb),0.3)]' : 'text-[var(--muted)] hover:bg-white/5'}`}
                        >
                            LVL {lvl}
                        </button>
                    ))}
                </div>
            </div>

            {/* Live Band Analysis */}
            <div className="bg-[var(--bg)]/60 border border-[var(--primary)]/30 rounded-xl p-3 shrink-0 backdrop-blur-md pb-4 pt-4">
                <h4 className="text-[10px] font-bold text-[var(--primary)]/80 uppercase tracking-[2px] mb-4 flex justify-between items-center">
                    <span>EEG Bands (Live · Peak)</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse shadow-glow" />
                </h4>
                <div className="flex flex-col gap-2">
                    {[
                        { id: 'delta', label: 'δ DELTA', color: '#4466ff' },
                        { id: 'theta', label: 'θ THETA', color: 'var(--glow-violet)' },
                        { id: 'alpha', label: 'α ALPHA', color: 'var(--glow-green)' },
                        { id: 'beta', label: 'β BETA', color: 'var(--primary)' },
                        { id: 'gamma', label: 'γ GAMMA', color: 'var(--glow-amber)' },
                    ].map(b => (
                        <div key={b.id} className="flex items-center gap-2">
                            <span className="text-[10px] tracking-widest font-bold opacity-60 w-[48px] shrink-0" style={{ color: b.color }}>{b.label}</span>
                            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div id={`bf-${b.id}`} className="h-full rounded-full transition-all duration-150 shadow-md" style={{ background: b.color, width: '0%' }} />
                            </div>
                            <span id={`bv-${b.id}`} className="text-[10px] w-8 text-right font-black" style={{ color: b.color }}>0%</span>
                            <span id={`pk-${b.id}`} className="text-[9px] w-6 text-right font-black text-amber-500/80">0%</span>
                        </div>
                    ))}
                </div>
                <div className="h-px w-full bg-white/5 my-4" />
                <div className="relative w-[100px] h-[100px] mx-auto">
                    <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                        <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                        <circle id="bd-attn-fill" cx="40" cy="40" r="32" fill="none" stroke="var(--primary)" strokeWidth="8"
                            strokeLinecap="round" strokeDasharray="201" strokeDashoffset={dashOffset}
                            style={{ transition: 'stroke-dashoffset 0.3s ease-out', filter: 'drop-shadow(0 0 4px var(--primary))' }} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span id="bd-attn-val" className="font-display font-black text-2xl text-white drop-shadow-md">{focusScore || 0}%</span>
                        <span className="text-[8px] font-bold tracking-widest text-[var(--primary)] uppercase mt-0.5 opacity-80">FOCUS</span>
                    </div>
                </div>
            </div>

            {/* Session History */}
            <div className="flex flex-col h-[250px] shrink-0 border border-[var(--border)] rounded-xl bg-[var(--bg)]/40 p-3 pt-3">
                <h4 className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-[3px] mb-3 flex items-center justify-between border-b border-[var(--border)]/50 pb-2">
                    <div className="flex items-center gap-2"><History size={14} /> History</div>
                    <button onClick={() => containerRef.current?.clearHistoryHandler()} className="text-[var(--text-error)] opacity-70 hover:opacity-100 transition-opacity" title="Clear History">
                        <Trash2 size={12} />
                    </button>
                </h4>
                <div id="session-history" className="flex-grow overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[var(--primary)]/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[var(--primary)]/40 flex flex-col gap-2">
                    {/* populated by JavaScript */}
                </div>
            </div>
        </div>
    );
};

export default BubbleSidebar;
