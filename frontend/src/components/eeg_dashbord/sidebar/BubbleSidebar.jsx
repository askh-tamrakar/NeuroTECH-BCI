import React from 'react';
import {
    Play, Square, Activity,
    History, Gamepad2, Trash2, ArrowLeft
} from 'lucide-react';

const BubbleSidebar = ({
    stressScore,
    focusScore,
    globalRunning,
    containerRef,
    onBackToMenu,
    betaThreshold,
    setBetaThreshold
}) => {
    const focusDash = 201 - (Math.min(100, focusScore || 0) / 100) * 201;
    const stressDash = 201 - (Math.min(100, stressScore || 0) / 100) * 201;

    return (
        <div className="flex-grow flex flex-col p-4 gap-4 font-mono transition-opacity duration-300 w-full shrink-0 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:'none'] [&::-webkit-scrollbar]:hidden">
            <div className="flex items-center gap-3 rounded-xl border border-[var(--primary)]/20 bg-[var(--bg)]/40 px-3 py-2.5 shrink-0">
                {onBackToMenu && (
                    <button onClick={onBackToMenu} className="text-[var(--muted)] hover:text-[var(--primary)] transition-colors" title="Back to menu">
                        <ArrowLeft size={18} />
                    </button>
                )}
                <Gamepad2 size={18} className="text-[var(--primary)]" />
                <div>
                    <h3 className="text-[12px] font-black uppercase tracking-[3px] text-[var(--primary)]">Bubble Game</h3>
                    <p className="text-[10px] font-bold uppercase tracking-[2px] text-[var(--muted)]/70">Neural control panel</p>
                </div>
            </div>


            {/* Neural Metrics */}
            <div className="bg-[var(--bg)]/50 border border-[var(--primary)]/20 rounded-xl p-3 shrink-0 flex flex-col gap-3">
                <h4 className="text-[10px] font-bold text-[var(--muted)]/80 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={14} /> Neural Metrics
                </h4>
                <div className="flex justify-around">
                    {/* Focus Ring */}
                    <div className="relative w-[110px] h-[110px]">
                        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                            <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
                            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--primary)" strokeWidth="7"
                                strokeLinecap="round" strokeDasharray="201" strokeDashoffset={focusDash}
                                style={{ transition: 'stroke-dashoffset 0.3s ease-out', filter: 'drop-shadow(0 0 4px var(--primary))' }} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="font-display font-black text-2xl text-white drop-shadow-md">{focusScore || 0}%</span>
                            <span className="text-[9px] font-bold tracking-widest text-[var(--primary)] uppercase opacity-80 mt-1">FOCUS</span>
                        </div>
                    </div>
                    {/* Stress Ring */}
                    <div className="relative w-[110px] h-[110px]">
                        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                            <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
                            <circle cx="40" cy="40" r="32" fill="none" stroke="#f43f5e" strokeWidth="7"
                                strokeLinecap="round" strokeDasharray="201" strokeDashoffset={stressDash}
                                style={{ transition: 'stroke-dashoffset 0.3s ease-out', filter: 'drop-shadow(0 0 4px #f43f5e)' }} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="font-display font-black text-2xl text-white drop-shadow-md">{stressScore || 0}%</span>
                            <span className="text-[9px] font-bold tracking-widest text-red-400 uppercase opacity-80 mt-1">STRESS</span>
                        </div>
                    </div>
                </div>
                <div className="text-[9px] text-center text-[var(--muted)]/60 tracking-wider">
                    {stressScore > 70 ? 'High stress = more bubbles' : focusScore > 60 ? 'High focus = auto-popping' : 'Relax or focus to play'}
                </div>
            </div>


            {/* Live Band Analysis */}
            <div className="bg-[var(--bg)]/60 border border-[var(--primary)]/30 rounded-xl p-3 shrink-0 backdrop-blur-md pb-4 pt-4">
                <h4 className="text-[10px] font-bold text-[var(--primary)]/80 uppercase tracking-[2px] mb-4 flex justify-between items-center">
                    <span>EEG Bands (Live)</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse shadow-glow" />
                </h4>
                <div className="flex flex-col gap-2">
                    {[
                        { id: 'delta', label: 'δ DELTA', color: '#4466ff' },
                        { id: 'theta', label: 'θ THETA', color: '#8b5cf6' },
                        { id: 'alpha', label: 'α ALPHA', color: '#10b981' },
                        { id: 'beta', label: 'β BETA', color: 'var(--primary, #06b6d4)' },
                        { id: 'gamma', label: 'γ GAMMA', color: '#f59e0b' },
                    ].map(b => (
                        <div key={b.id} className="flex items-center gap-3 py-1">
                            <span className="text-xs tracking-widest font-bold opacity-80 w-[55px] shrink-0" style={{ color: b.color }}>{b.label}</span>
                            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                <div id={`bf-${b.id}`} className="h-full rounded-full transition-all duration-150 shadow-md" style={{ background: b.color, width: '0%' }} />
                            </div>
                            <span id={`bv-${b.id}`} className="text-xs w-10 text-right font-black" style={{ color: b.color }}>0%</span>
                        </div>
                    ))}
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
                <div id="session-history" className="flex-grow overflow-y-auto pr-1 scrollbar-hide flex flex-col gap-2">
                    {/* populated by JavaScript */}
                </div>
            </div>
        </div>
    );
};

export default BubbleSidebar;