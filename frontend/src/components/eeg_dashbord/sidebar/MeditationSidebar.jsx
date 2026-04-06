import React from 'react';
import {
    Settings, Play, Square, Activity, Wind, Power, Zap,
    History, Menu, ChevronLeft, Brain, BookOpen, Eye, Grid,
    Music, Volume2, Trophy, Clock, Calendar, CheckSquare,
    Sparkles, VolumeX, Layers
} from 'lucide-react';
import { useSidebar } from '../pages/SidebarContext';

const PRESETS = [3, 5, 10, 15];
const WISDOM = [
    { quote: 'Wherever you are, be there totally.', author: '— Eckhart Tolle' },
    { quote: 'The present moment is the only moment available to us, and it is the door to all moments.', author: '— Thích Nhất Hạnh' },
    { quote: 'Meditation is not evasion; it is a serene encounter with reality.', author: '— Thích Nhất Hạnh' },
    { quote: 'The quieter you become, the more you are able to hear.', author: '— Rumi' },
    { quote: 'Your goal is not to battle with the mind, but to witness the mind.', author: '— Swami Muktananda' },
    { quote: 'Within you, there is a stillness and a sanctuary.', author: '— Hermann Hesse' },
    { quote: 'Peace comes from within. Do not seek it without.', author: '— Buddha' },
];
/* ── TRACK ROW sub-component ──────────────────── */
const TrackRow = ({ m, onToggle, onVol }) => (
    <div className={`flex flex-col gap-2 p-2.5 rounded-lg border transition-all ${m.active ? 'bg-primary/8 border-primary/40' : 'bg-surface/30 border-border/30 hover:border-primary/20'}`}>

        {/* Top row: animated bars + label + toggle */}
        <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
                {/* animated equalizer bars when playing */}
                <span className="flex items-end gap-[2px] h-3.5 shrink-0">
                    {m.active ? (
                        <>
                            <span className="w-[2px] bg-primary rounded-full" style={{ height: '40%', animation: 'musicbar 0.7s ease-in-out infinite', animationDelay: '0s' }} />
                            <span className="w-[2px] bg-primary rounded-full" style={{ height: '100%', animation: 'musicbar 0.7s ease-in-out infinite', animationDelay: '0.18s' }} />
                            <span className="w-[2px] bg-primary rounded-full" style={{ height: '60%', animation: 'musicbar 0.7s ease-in-out infinite', animationDelay: '0.36s' }} />
                            <span className="w-[2px] bg-primary rounded-full" style={{ height: '80%', animation: 'musicbar 0.7s ease-in-out infinite', animationDelay: '0.54s' }} />
                        </>
                    ) : (
                        <>
                            <span className="w-[2px] bg-border rounded-full" style={{ height: '30%' }} />
                            <span className="w-[2px] bg-border rounded-full" style={{ height: '55%' }} />
                            <span className="w-[2px] bg-border rounded-full" style={{ height: '40%' }} />
                            <span className="w-[2px] bg-border rounded-full" style={{ height: '65%' }} />
                        </>
                    )}
                </span>
                <span className={`text-[11px] font-bold truncate leading-none ${m.active ? 'text-primary' : 'text-muted'}`}>{m.label}</span>
            </div>
            <button
                onClick={() => onToggle(m.id)}
                className={`relative shrink-0 p-1.5 rounded-md transition-all ${m.active ? 'bg-primary text-bg shadow-[0_0_10px_var(--primary)]' : 'bg-surface border border-border text-muted hover:text-primary hover:border-primary/40'}`}
            >
                {m.active ? <Volume2 size={12} /> : <VolumeX size={12} />}
            </button>
        </div>

        {/* Volume slider — always visible, shows % */}
        <div className="flex items-center gap-2">
            <input
                type="range" min="0" max="100" step="1"
                value={Math.round(m.vol * 100)}
                onChange={e => onVol(m.id, parseInt(e.target.value) / 100)}
                className={`flex-1 h-1.5 rounded-lg appearance-none cursor-pointer ${m.active ? 'accent-primary' : 'accent-muted'}`}
                style={{
                    background: m.active
                        ? `linear-gradient(to right, var(--primary) 0%, var(--primary) ${Math.round(m.vol * 100)}%, rgba(255,255,255,0.1) ${Math.round(m.vol * 100)}%, rgba(255,255,255,0.1) 100%)`
                        : `linear-gradient(to right, var(--muted) 0%, var(--muted) ${Math.round(m.vol * 100)}%, rgba(255,255,255,0.07) ${Math.round(m.vol * 100)}%, rgba(255,255,255,0.07) 100%)`
                }}
            />
            <span className={`text-[10px] font-black font-mono w-7 text-right shrink-0 ${m.active ? 'text-primary' : 'text-muted/60'}`}>
                {Math.round(m.vol * 100)}%
            </span>
        </div>
    </div>
);

const MeditationSidebar = ({
    containerRef,
    stats,
    musicState,
    toggleMusic,
    updateVol,
    masterVol = 1.0,
    onMasterVol = () => { },
    wisdomIdx = 0,
}) => {
    const { sidebarMode, setSidebarMode } = useSidebar();
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
                <button
                    onClick={() => setSidebarMode('main')}
                    className="nav-controls-toggle"
                    title="Switch to Navigation"
                >
                    <Layers size={14} />
                    CTRL
                </button>
            </div>

            <div className="flex flex-col gap-4 h-full overflow-y-auto [&::-webkit-scrollbar]:hidden pb-10">

                {/* Start Session Button */}
                <div className="shrink-0">
                    <button id="med-session-btn" onClick={() => containerRef.current?.sessionBtnHandler()} className="w-full py-4 rounded-xl text-sm font-black uppercase tracking-[3px] transition-all flex items-center justify-center gap-3 border-2 bg-green-500/10 border-green-500/40 text-green-500 hover:bg-green-500/20 shadow-glow">
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
                            <button key={min} className={`med-preset-btn py-1.5 rounded-md border transition-all font-mono text-[10px] tracking-wider ${min === 5 ? 'bg-yellow-500 text-black border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'bg-surface/50 border-border text-muted hover:border-yellow-500'}`} data-min={min} onClick={() => containerRef.current?.presetHandler(min)}>{min}M</button>
                        ))}
                    </div>
                </div>

                {/* Soundscape Mixer */}
                <div className="bg-bg/50 border border-primary/20 rounded-xl p-3 shrink-0 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-bold text-muted/80 uppercase tracking-widest flex items-center gap-2">
                            <Volume2 size={14} /> Soundscape Mixer
                        </h4>
                        <div className="flex items-center gap-2">
                            {musicState.some(m => m.active) && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                    {musicState.filter(m => m.active).length} PLAYING
                                </span>
                            )}
                            {musicState.some(m => m.active) && (
                                <button
                                    onClick={() => musicState.filter(m => m.active).forEach(m => toggleMusic(m.id))}
                                    className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
                                >
                                    STOP ALL
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Master Volume */}
                    <div className="flex items-center gap-2 px-0.5">
                        <Volume2 size={10} className="text-muted shrink-0" />
                        <input
                            type="range" min="0" max="100" step="1"
                            value={Math.round(masterVol * 100)}
                            onChange={e => onMasterVol(parseInt(e.target.value) / 100)}
                            className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
                            style={{ background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${Math.round(masterVol * 100)}%, rgba(255,255,255,0.08) ${Math.round(masterVol * 100)}%, rgba(255,255,255,0.08) 100%)` }}
                        />
                        <span className="text-[10px] font-black font-mono text-primary w-7 text-right shrink-0">
                            {Math.round(masterVol * 100)}%
                        </span>
                    </div>

                    {/* Meditation tracks */}
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[9px] font-black tracking-widest uppercase text-primary/60 flex items-center gap-1.5 px-0.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400" /> Meditation
                        </span>
                        {musicState.filter(m => m.category === 'meditation').map(m => (
                            <TrackRow key={m.id} m={m} onToggle={toggleMusic} onVol={updateVol} />
                        ))}
                    </div>

                    {/* Focus tracks */}
                    <div className="flex flex-col gap-1.5 mt-1">
                        <span className="text-[9px] font-black tracking-widest uppercase text-primary/60 flex items-center gap-1.5 px-0.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400" /> Focus
                        </span>
                        {musicState.filter(m => m.category === 'focus').map(m => (
                            <TrackRow key={m.id} m={m} onToggle={toggleMusic} onVol={updateVol} />
                        ))}
                    </div>
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
