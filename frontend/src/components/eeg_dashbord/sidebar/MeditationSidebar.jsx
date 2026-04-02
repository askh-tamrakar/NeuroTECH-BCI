import React from 'react';
import {
    Settings, Play, Square, Activity, Wind, Power, Zap,
    History, Menu, ChevronLeft, Brain, BookOpen, Eye, Grid,
    Music, Volume2, Trophy, Clock, Calendar, CheckSquare,
    Sparkles, VolumeX
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

const PRESETS = [3, 5, 10, 15];

const MeditationSidebar = ({
    containerRef,
    stats,
    musicState,
    toggleMusic,
    updateVol,
    wisdomIdx = 0,
}) => {
    const wisdom = WISDOM[wisdomIdx] || WISDOM[0];

    return (
        <div className="flex-grow flex flex-col p-4 gap-4 font-mono transition-opacity duration-300 w-full shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 mb-1">
                <div>
                    <h2 className="text-[22px] font-bold text-text mb-1 flex items-center gap-3 tracking-[2px]">
                        <Wind size={26} className="text-primary" />
                        <span style={{ letterSpacing: '2.3px' }}>NEURO TRAINER</span>
                    </h2>
                </div>
            </div>

            <div className="flex flex-col gap-4 h-full overflow-y-auto [&::-webkit-scrollbar]:hidden pb-10">

                {/* Start Session Button */}
                <div className="shrink-0">
                    <button id="med-session-btn" onClick={() => containerRef.current?.sessionBtnHandler()} className="w-full py-4 rounded-xl text-sm font-black uppercase tracking-[3px] transition-all flex items-center justify-center gap-3 border-2 shadow-lg bg-green-500/10 border-green-500/40 text-green-500 hover:bg-green-500/20 shadow-glow">
                        <Play size={20} /> NEW SESSION
                    </button>
                </div>

                {/* Live Focus Mode */}
                <div className="bg-bg/50 border border-primary/20 rounded-xl p-3 shrink-0 flex flex-col gap-3">
                    <h4 className="text-[10px] font-bold text-muted/80 uppercase tracking-widest flex items-center gap-2">
                        <Activity size={14} /> Live Focus Mode
                    </h4>
                    <div id="med-exp-conn-box" className="bg-surface/50 border border-red-500/20 rounded-lg p-2.5 flex items-center justify-between cursor-pointer hover:bg-bg/70 transition-all" onClick={() => containerRef.current?.toggleConnHandler()}>
                        <div className="flex items-center gap-3">
                            <Zap id="med-exp-conn-icon-live" size={18} className="text-green-500 hidden" />
                            <Power id="med-exp-conn-icon-sim" size={18} className="text-red-500" />
                            <span id="med-exp-conn-text" className="text-xs font-bold tracking-widest">SIMULATING</span>
                        </div>
                        <span className="text-[9px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded border border-red-500/20">MOCK</span>
                    </div>
                    <div className="flex flex-col gap-2 p-2.5 bg-surface/30 border border-border/50 rounded-lg">
                        <div className="flex justify-between items-center mb-1">
                            <div id="med-phase-badge" className="text-[11px] font-black tracking-widest text-muted">READY</div>
                            <div id="med-timer-big" className="text-lg font-black text-primary font-mono tabular-nums">05:00</div>
                        </div>
                        <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                            <div id="med-exp-calm-pip" className="h-full bg-primary transition-all duration-300" style={{ width: '0%' }} />
                        </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                        {PRESETS.map(min => (
                            <button key={min} className={`med-preset-btn py-1.5 rounded-md border transition-all font-mono text-[10px] tracking-wider ${min === 5 ? 'bg-primary text-bg border-primary shadow-glow' : 'bg-surface/50 border-border text-muted hover:border-primary'}`} data-min={min} onClick={() => containerRef.current?.presetHandler(min)}>{min}M</button>
                        ))}
                    </div>
                </div>

                {/* Soundscape Mixer */}
                <div className="bg-bg/50 border border-primary/20 rounded-xl p-3 shrink-0 flex flex-col gap-3">
                    <h4 className="text-[10px] font-bold text-muted/80 uppercase tracking-widest flex items-center gap-2">
                        <Volume2 size={14} /> Soundscape Mixer
                    </h4>
                    <div className="flex flex-col gap-2.5">
                        {musicState.map(m => (
                            <div key={m.id} className="flex flex-col gap-2 p-2 rounded-lg bg-surface/30 border border-border/30 hover:border-primary/30 transition-all">
                                <div className="flex items-center justify-between">
                                    <span className={`text-[11px] font-bold tracking-tight ${m.active ? 'text-primary' : 'text-muted'}`}>{m.label}</span>
                                    <button onClick={() => toggleMusic(m.id)} className={`p-1 rounded-md transition-all ${m.active ? 'bg-primary text-bg' : 'bg-surface border border-border text-muted hover:text-text'}`}>
                                        {m.active ? <Volume2 size={12} /> : <VolumeX size={12} />}
                                    </button>
                                </div>
                                {m.active && (
                                    <input type="range" min="0" max="1" step="0.01" value={m.vol} onChange={e => updateVol(m.id, parseFloat(e.target.value))} className="w-full h-1 bg-primary/20 rounded-lg appearance-none cursor-pointer accent-primary" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Performance */}
                <div className="bg-bg/50 border border-primary/20 rounded-xl p-3 shrink-0 flex flex-col gap-3">
                    <h4 className="text-[10px] font-bold text-muted/80 uppercase tracking-widest flex items-center gap-2">
                        <Trophy size={14} /> Performance
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-surface/30 p-2.5 rounded-lg border border-border/50 flex flex-col items-center">
                            <span className="text-[10px] text-muted uppercase tracking-tighter mb-1">STREAK</span>
                            <span className="text-xl font-black text-orange-500">🔥 {stats.streak}D</span>
                        </div>
                        <div className="bg-surface/30 p-2.5 rounded-lg border border-border/50 flex flex-col items-center">
                            <span className="text-[10px] text-muted uppercase tracking-tighter mb-1">TOTAL</span>
                            <span className="text-xl font-black text-primary">{stats.totalMin}M</span>
                        </div>
                    </div>
                    <div className="p-2.5 bg-surface/30 border border-border/50 rounded-lg">
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[10px] font-bold text-muted">LEVEL {Math.floor(stats.xp / 1000) + 1}</span>
                            <span className="text-[10px] font-mono text-primary">{stats.xp % 1000}/1000 XP</span>
                        </div>
                        <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-primary to-blue-400" style={{ width: `${(stats.xp % 1000) / 10}%` }} />
                        </div>
                    </div>
                    {stats.sessions.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                            <span className="text-[9px] font-black text-muted uppercase tracking-widest block mb-2">RECENT SESSIONS</span>
                            {stats.sessions.slice(0, 3).map((s, idx) => (
                                <div key={idx} className="flex items-center justify-between text-[10px] bg-bg/30 p-1.5 rounded border border-border/40">
                                    <div className="flex gap-2 items-center">
                                        <Calendar size={10} className="text-primary" />
                                        <span className="font-bold opacity-80">{s.duration}</span>
                                    </div>
                                    <span className="font-mono text-primary font-black">{s.avgCalm}% CALM</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Daily Wisdom */}
                <div className="mt-2 border border-border/50 bg-bg/20 rounded-xl p-3 shrink-0">
                    <div className="flex items-center gap-2 text-primary/80 font-mono text-[9px] font-bold uppercase tracking-widest mb-1.5">
                        <BookOpen size={12} /> Daily Wisdom
                    </div>
                    <p className="text-[11px] text-text/80 italic mb-1.5 leading-relaxed">"{wisdom.quote}"</p>
                    <p className="text-[10px] text-primary/70">{wisdom.author}</p>
                </div>
            </div>
        </div>
    );
};

export default MeditationSidebar;
