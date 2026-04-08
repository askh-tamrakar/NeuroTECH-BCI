import React from 'react';
import { Music, Activity, Play, Pause, Volume2, VolumeX, Headphones, FastForward } from 'lucide-react';

const MusicSidebar = ({
    isPlaying, togglePlayback,
    isMuted, setIsMuted,
    result, stateTheme,
    stressScore = 0, focusScore = 0,
    currentState = 'Neutral', stateLevel = 0,
}) => {
    const focusDash = 201 - (Math.min(100, focusScore) / 100) * 201;
    const stressDash = 201 - (Math.min(100, stressScore) / 100) * 201;

    return (
        <div className="flex-grow flex flex-col p-4 font-mono transition-opacity duration-300 w-full shrink-0 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:'none'] [&::-webkit-scrollbar]:hidden">
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--primary)]/20 bg-[var(--bg)]/40 px-3 py-2.5">
                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/15 flex items-center justify-center border border-[var(--primary)]/30 shadow-glow">
                    <Music size={20} className="text-[var(--primary)]" />
                </div>
                <div>
                    <h3 className="text-lg font-black text-[var(--primary)] tracking-widest leading-none">
                        MUSIC SYNERGY
                    </h3>
                    <p className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-widest mt-1">
                        Neural Audio Response
                    </p>
                </div>
            </div>

            {/* Playback Controls */}
            <div className="bg-[var(--bg)]/50 border border-[var(--primary)]/20 rounded-2xl p-4 mb-4 flex flex-col gap-4 shadow-glow">
                <h4 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[3px] border-b border-[var(--border)]/50 pb-2">
                    Active Session
                </h4>

                <div className="flex items-center justify-center gap-4">
                    <button
                        onClick={togglePlayback}
                        className="w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-glow"
                        style={{
                            background: `linear-gradient(135deg, ${stateTheme.primary}, ${stateTheme.secondary})`,
                            boxShadow: `0 8px 20px ${stateTheme.glow}`
                        }}
                    >
                        {isPlaying ? <Pause size={28} color="white" /> : <Play size={28} fill="white" color="white" />}
                    </button>

                    <button
                        onClick={() => setIsMuted(!isMuted)}
                        className={`w-14 h-14 rounded-full border flex items-center justify-center transition-all ${isMuted ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                    >
                        {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                    </button>
                </div>

                <div className="flex flex-col items-center gap-1 mt-2">
                    <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-tighter">Current Resonance</span>
                    <span className="text-xl font-black tracking-widest uppercase" style={{ color: stateTheme.primary, textShadow: `0 0 10px ${stateTheme.glow}` }}>
                        {currentState}
                    </span>
                    <span className="text-[9px] text-[var(--muted)]/60">Level: {stateLevel}%</span>
                </div>
            </div>

            {/* Neural Metrics */}
            <div className="bg-[var(--bg)]/40 border border-[var(--border)] rounded-xl p-4 mb-4">
                <h4 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[3px] mb-3">
                    Neural Metrics
                </h4>
                <div className="flex justify-around mb-3">
                    {/* Focus Ring */}
                    <div className="relative w-[70px] h-[70px]">
                        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                            <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                            <circle cx="40" cy="40" r="32" fill="none" stroke="#0ea5e9" strokeWidth="6"
                                strokeLinecap="round" strokeDasharray="201" strokeDashoffset={focusDash}
                                style={{ transition: 'stroke-dashoffset 0.3s', filter: 'drop-shadow(0 0 3px #0ea5e9)' }} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="font-display font-black text-sm text-white">{Math.round(focusScore)}%</span>
                            <span className="text-[7px] font-bold tracking-widest text-cyan-400 uppercase">FOCUS</span>
                        </div>
                    </div>
                    {/* Stress Ring */}
                    <div className="relative w-[70px] h-[70px]">
                        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                            <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                            <circle cx="40" cy="40" r="32" fill="none" stroke="#f43f5e" strokeWidth="6"
                                strokeLinecap="round" strokeDasharray="201" strokeDashoffset={stressDash}
                                style={{ transition: 'stroke-dashoffset 0.3s', filter: 'drop-shadow(0 0 3px #f43f5e)' }} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="font-display font-black text-sm text-white">{Math.round(stressScore)}%</span>
                            <span className="text-[7px] font-bold tracking-widest text-red-400 uppercase">STRESS</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                    {result?.output?.action?.includes('tempo') ? <FastForward size={18} className="text-[var(--primary)]" /> :
                        result?.output?.action?.includes('volume') ? <Activity size={18} className="text-[var(--primary)]" /> : <Headphones size={18} className="text-[var(--primary)]" />}
                    <span className="text-[11px] font-medium text-white/80 leading-snug">
                        {result?.output?.action || 'Monitoring Auditory Cortex...'}
                    </span>
                </div>
            </div>

            {/* State Visualization Legend */}
            <div className="mt-auto border-t border-[var(--border)]/30 pt-4">
                <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-[2px] mb-3">State Legend</p>
                <div className="grid grid-cols-2 gap-2">
                    {[
                        { label: 'Focus', color: '#0ea5e9' },
                        { label: 'Calm', color: '#a855f7' },
                        { label: 'Relaxed', color: '#22c55e' },
                        { label: 'Stressed', color: '#f43f5e' },
                        { label: 'Drowsy', color: '#f59e0b' },
                    ].map(s => (
                        <div key={s.label} className={`flex items-center gap-2 ${s.label === currentState ? 'opacity-100' : 'opacity-40'}`}>
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color, boxShadow: s.label === currentState ? `0 0 8px ${s.color}` : 'none' }} />
                            <span className="text-[10px] font-bold text-[var(--muted)]">{s.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default MusicSidebar;