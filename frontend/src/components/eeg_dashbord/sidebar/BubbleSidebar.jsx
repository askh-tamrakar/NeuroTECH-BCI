import React from 'react';
import {
    Settings, Play, Square, Activity, MousePointer2, Zap,
    History, Menu, ChevronLeft, Gamepad2, Mouse, Trash2, Power
} from 'lucide-react';

/**
 * BubbleSidebar — page-specific controls sidebar for BubbleGameView.
 * Props: showSidebar, setShowSidebar, onBackToMenu, mouseMode, setMouseMode,
 *        difficulty, setDifficulty, realTimeFreq, globalRunning, containerRef
 */
const BubbleSidebar = ({
    showSidebar, setShowSidebar,
    onBackToMenu,
    mouseMode, setMouseMode,
    difficulty, setDifficulty,
    realTimeFreq,
    globalRunning,
    containerRef,
}) => {
    return (
        <div
            className={`absolute left-0 top-0 bottom-0 z-10 transition-all duration-300 ease-in-out border-r border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md flex flex-col h-full pointer-events-auto select-none ${showSidebar ? 'w-80 overflow-y-auto overflow-x-hidden' : 'w-[4.25rem] overflow-visible'} [&::-webkit-scrollbar]:hidden`}
        >
            {/* ── Collapsed Sidebar ──────────────────────────────── */}
            {!showSidebar && (
                <div className="flex flex-col items-center justify-start py-3 w-full animate-fade-in shrink-0 h-full overflow-visible gap-2">
                    <button onClick={onBackToMenu} className="hover:bg-white/10 p-2.5 rounded-full transition-colors group relative" title="Back to Menu">
                        <ChevronLeft size={26} className="text-[var(--text)]" />
                        <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--primary)] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50">Back to Menu</div>
                    </button>

                    <div className="w-full h-px bg-[var(--border)]/80 shrink-0 my-1" />

                    <button onClick={() => setShowSidebar(true)} className="hover:bg-white/10 p-2.5 rounded-full transition-colors group relative" title="Expand Bar">
                        <Menu size={24} className="text-[var(--primary)]" />
                        <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[var(--surface)] px-3 py-1.5 rounded-lg text-xs font-bold text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50">Expand Sidebar</div>
                    </button>

                    <div className="w-full h-px bg-[var(--border)]/80 shrink-0 my-1" />

                    <button
                        onClick={() => { setMouseMode(!mouseMode); const btn = document.getElementById('mode-indicator-switch'); if (btn) btn.textContent = mouseMode ? '⚡ SENSOR' : '🖱 MANUAL'; }}
                        className={`p-2.5 rounded-full transition-colors group relative ${mouseMode ? 'text-amber-500 bg-amber-500/10' : 'text-[var(--primary)] bg-[var(--primary)]/10'}`}
                        title="Mode Select"
                    >
                        {mouseMode ? <Mouse size={24} /> : <Zap size={24} />}
                        <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 shadow-glow">
                            Mode: {mouseMode ? 'MANUAL' : 'SENSOR'}
                        </div>
                    </button>

                    <div className="w-full h-px bg-[var(--border)]/80 shrink-0 my-1" />

                    <div className="flex flex-col items-center group relative cursor-default w-full py-2">
                        <Activity size={24} className="text-[var(--primary)] mb-1" />
                        <span className="text-sm font-black text-[var(--primary)]">{realTimeFreq}</span>
                        <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50">Score/Signal Power</div>
                    </div>

                    <button onClick={() => setShowSidebar(true)} className="hover:bg-white/10 p-2.5 rounded-full transition-colors group relative mt-auto">
                        <History size={24} className="text-[var(--muted)]" />
                        <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[var(--surface)] px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50">SESSION LOG</div>
                    </button>

                    <button onClick={() => globalRunning ? containerRef.current?.stopGameHandler() : containerRef.current?.startGameHandler()} className={`p-3 rounded-full group relative transition-all shadow-md ${globalRunning ? 'text-red-500 bg-red-500/10 hover:bg-red-500/20' : 'text-green-500 bg-green-500/10 hover:bg-green-500/20'}`} style={{ marginBottom: '20px' }}>
                        {globalRunning ? <Square size={26} /> : <Play size={26} />}
                        <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[var(--surface)] px-3 py-1.5 rounded-lg text-xs font-bold text-white opacity-0 group-hover:opacity-100 pointer-events-none z-50">
                            {globalRunning ? 'End Session' : 'Start Session'}
                        </div>
                    </button>
                </div>
            )}

            {/* ── Expanded Sidebar ───────────────────────────────── */}
            <div className={`flex-grow flex flex-col p-4 gap-4 font-mono transition-opacity duration-300 w-80 shrink-0 ${!showSidebar ? 'opacity-0 h-0 hidden' : 'opacity-100'}`}>

                {/* Header */}
                <div className="flex items-center justify-between shrink-0 mb-1">
                    <div>
                        <h2 className="text-[22px] font-bold text-[var(--text)] mb-1 flex items-center gap-3 tracking-[2px]">
                            <Gamepad2 size={26} className="text-[var(--primary)]" />
                            BUBBLE GAME
                        </h2>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onBackToMenu} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <ChevronLeft size={22} className="text-[var(--text)]" />
                        </button>
                        <button onClick={() => setShowSidebar(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <ChevronLeft size={22} className="rotate-180 text-[var(--text)]" />
                        </button>
                    </div>
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
                    <p className="text-[10px] text-[var(--muted)] leading-relaxed italic opacity-80">
                        {mouseMode ? 'Use mouse movement. Game dynamically scales based on cursor proximity.' : 'Focus level scales up cursor aura to pop bubbles entirely with your mind.'}
                    </p>
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
                                strokeLinecap="round" strokeDasharray="201" strokeDashoffset="201"
                                style={{ transition: 'stroke-dashoffset 0.3s ease-out', filter: 'drop-shadow(0 0 4px var(--primary))' }} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span id="bd-attn-val" className="font-display font-black text-2xl text-white drop-shadow-md">0%</span>
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
        </div>
    );
};

export default BubbleSidebar;
