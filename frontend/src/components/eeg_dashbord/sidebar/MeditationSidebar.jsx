import React from 'react';
import {
    Settings, Play, Square, Activity, Wind, Power, Zap,
    History, Menu, ChevronLeft, Brain, BookOpen, Eye, Grid,
    Music, Volume2, Trophy, Clock, Calendar, CheckSquare,
    Sparkles, VolumeX, Layers
} from 'lucide-react';

const WISDOM = [
    { quote: 'Wherever you are, be there totally.', author: '— Eckhart Tolle' },
    { quote: 'The present moment is the only moment available to us, and it is the door to all moments.', author: '— Thích Nhất Hạnh' },
    { quote: 'Meditation is not evasion; it is a serene encounter with reality.', author: '— Thích Nhất Hạnh' },
    { quote: 'The quieter you become, the more you are able to hear.', author: '— Rumi' },
    { quote: 'Your goal is not to battle with the mind, but to witness the mind.', author: '— Swami Muktananda' },
    { quote: 'Within you, there is a stillness and a sanctuary.', author: '— Hermann Hesse' },
    { quote: 'Peace comes from within. Do not seek it without.', author: '— Buddha' },
];

const MeditationSidebar = ({ 
    musicState, toggleMusic, updateVol, 
    masterVol, onMasterVol, stats, 
    wisdomIdx, isSessionRunning, selectedMin, 
    onToggleSession, onPresetChange, onToggleConn,
    sidebarMode, setSidebarMode, isCollapsed
}) => {
    const wisdom = WISDOM[wisdomIdx] || WISDOM[0];

    return (
        <div className="flex-grow flex flex-col p-4 font-mono transition-all duration-300 w-full shrink-0 overflow-y-auto">
            {/* Page Header */}
            <div className={`flex items-center justify-between mb-6 ${isCollapsed ? 'flex-col gap-4' : 'px-2'}`}>
                <div className={`flex items-center gap-3 min-w-0 ${isCollapsed ? 'flex-col' : ''}`}>
                    <div 
                        className="w-10 h-10 rounded-xl bg-[var(--primary)]/15 flex items-center justify-center border border-[var(--primary)]/30 shadow-glow shrink-0"
                        title={isCollapsed ? 'Meditation Trainer' : ''}
                    >
                        <Wind size={20} className="text-[var(--primary)]" />
                    </div>
                    {!isCollapsed && (
                        <div className="overflow-hidden">
                            <h2 className="text-[16px] font-black text-[var(--primary)] tracking-widest leading-none truncate">
                                MEDITATION TRAINER
                            </h2>
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setSidebarMode(sidebarMode === 'main' ? 'page' : 'main')}
                    className={`nav-controls-toggle ${isCollapsed ? 'w-10 h-10 p-0 flex items-center justify-center rounded-xl' : 'shrink-0 ml-2'}`}
                    title={isCollapsed ? "Switch to Navigation" : ""}
                >
                    <Layers size={14} />
                    {!isCollapsed && "NAV"}
                </button>
            </div>

            {/* Global Session Control */}
            <div className="shrink-0 mb-6">
                <button 
                    onClick={onToggleSession}
                    className={`w-full py-3.5 rounded-2xl text-sm font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 border-2 ${
                        isSessionRunning 
                        ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20' 
                        : 'bg-[var(--primary)]/10 border-[var(--primary)]/30 text-[var(--primary)] hover:bg-[var(--primary)]/20 shadow-glow'
                    } ${isCollapsed ? 'p-0 px-0' : ''}`}
                    title={isCollapsed ? (isSessionRunning ? "Stop Session" : "Start Session") : ""}
                >
                    {isSessionRunning ? <Square size={20} /> : <Play size={20} />}
                    {!isCollapsed && (isSessionRunning ? "Terminating..." : "Initiate Zen")}
                </button>
            </div>

            {/* Neural Metrics Rail */}
            <div className={`flex flex-col gap-4 ${isCollapsed ? 'items-center' : ''}`}>
                {!isCollapsed && (
                    <h4 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[3px] px-2 mb-2">
                        Neural Biometrics
                    </h4>
                )}
                <div className={`grid gap-3 ${isCollapsed ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {[
                        { label: 'CALM', val: stats?.calm || 0, color: 'var(--primary)', icon: Activity },
                        { label: 'FOCUS', val: stats?.focus || 0, color: 'var(--glow-green)', icon: Zap },
                    ].map(s => (
                        <div key={s.label} className={`bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col items-center justify-center ${isCollapsed ? 'w-14 h-14' : ''}`} title={isCollapsed ? `${s.label}: ${s.val}%` : ''}>
                            {isCollapsed ? (
                                <s.icon size={18} style={{ color: s.color }} />
                            ) : (
                                <>
                                    <span className="text-[9px] font-bold text-[var(--muted)] mb-1">{s.label}</span>
                                    <span className="text-xl font-black" style={{ color: s.color }}>{s.val}%</span>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Timer Rail */}
            <div className={`mt-8 flex flex-col ${isCollapsed ? 'items-center' : ''}`}>
                {!isCollapsed && (
                    <h4 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[3px] px-2 mb-4">
                        Session Duration
                    </h4>
                )}
                <div className={`flex items-center gap-2 ${isCollapsed ? 'flex-col' : 'px-2'}`}>
                    <Clock size={isCollapsed ? 20 : 16} className="text-[var(--primary)] opacity-60" title={isCollapsed ? 'Timer' : ''} />
                    {!isCollapsed ? (
                        <div className="flex-grow flex gap-2">
                            {[5, 10, 20, 30].map(m => (
                                <button
                                    key={m}
                                    onClick={() => onPresetChange(m)}
                                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-black transition-all border ${
                                        selectedMin === m 
                                        ? 'bg-[var(--primary)]/20 border-[var(--primary)]/40 text-[var(--primary)]' 
                                        : 'bg-transparent border-white/5 text-[var(--muted)] hover:bg-white/5'
                                    }`}
                                >
                                    {m}M
                                </button>
                            ))}
                        </div>
                    ) : (
                        <span className="text-xs font-black text-[var(--primary)]">{selectedMin}M</span>
                    )}
                </div>
            </div>

            {/* Soundscape Rail */}
            <div className={`mt-8 flex flex-col ${isCollapsed ? 'items-center' : ''}`}>
               {!isCollapsed && (
                    <h4 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[3px] px-2 mb-4">
                        Auditory Environment
                    </h4>
                )}
                <div className={`flex items-center gap-4 ${isCollapsed ? 'flex-col' : 'px-2'}`}>
                    <button 
                        onClick={toggleMusic}
                        className={`flex items-center justify-center transition-all ${
                            isCollapsed ? 'w-12 h-12 rounded-xl bg-white/5 border border-white/10' : 'p-2 rounded-lg bg-white/5 border border-white/10'
                        }`}
                        title={isCollapsed ? 'Toggle Soundscape' : ''}
                    >
                        {musicState.playing ? (
                            <Volume2 size={isCollapsed ? 22 : 18} className="text-[var(--primary)]" />
                        ) : (
                            <VolumeX size={isCollapsed ? 22 : 18} className="text-[var(--muted)]" />
                        )}
                    </button>
                    {!isCollapsed && (
                        <div className="flex-grow h-2 bg-white/5 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-[var(--primary)] transition-all duration-300"
                                style={{ width: `${masterVol * 100}%` }}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Wisdom Rail - Hidden in collapsed */}
            {!isCollapsed && (
                <div className="mt-auto pt-8">
                    <div className="bg-[var(--primary)]/5 border border-[var(--primary)]/10 rounded-2xl p-6 relative overflow-hidden group">
                        <Sparkles size={40} className="absolute -right-4 -bottom-4 text-[var(--primary)] opacity-5 transform group-hover:scale-125 transition-transform duration-700" />
                        <p className="text-sm font-medium text-[var(--text)] italic leading-relaxed relative z-10">
                            "{wisdom.quote}"
                        </p>
                        <p className="text-[10px] font-black text-[var(--primary)] uppercase tracking-widest mt-4 relative z-10">
                            {wisdom.author}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MeditationSidebar;
