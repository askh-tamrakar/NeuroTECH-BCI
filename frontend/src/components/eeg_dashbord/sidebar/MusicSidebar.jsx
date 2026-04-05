import React from 'react';
import { Music, Activity, Wind, Eye, Grid, ChevronLeft, Menu, Play, Pause, Volume2, VolumeX, Headphones, FastForward } from 'lucide-react';

const MusicSidebar = ({ 
    isPlaying, togglePlayback, 
    isMuted, setIsMuted, 
    result, stateTheme 
}) => {
    return (
        <div className="flex-grow flex flex-col p-4 font-mono transition-opacity duration-300 w-full shrink-0">
            {/* Page Header */}
            <div className="flex items-center justify-between mb-6 px-2">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/15 flex items-center justify-center border border-[var(--primary)]/30 shadow-glow">
                        <Music size={20} className="text-[var(--primary)]" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-[var(--primary)] tracking-widest leading-none">
                            MUSIC SYNERGY
                        </h2>
                        <p className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-widest mt-1">
                            Neural Audio Response
                        </p>
                    </div>
                </div>
            </div>

            {/* Playback Controls */}
            <div className="bg-[var(--bg)]/50 border border-[var(--primary)]/20 rounded-2xl p-4 mb-4 flex flex-col gap-4 shadow-xl">
                <h4 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[3px] border-b border-[var(--border)]/50 pb-2">
                    Active Session
                </h4>
                
                <div className="flex items-center justify-center gap-4">
                    <button
                        onClick={togglePlayback}
                        className="w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-lg"
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
                        {result?.state || 'Awaiting...'}
                    </span>
                </div>
            </div>

            {/* Neural Insights */}
            <div className="bg-[var(--bg)]/40 border border-[var(--border)] rounded-xl p-4 mb-4">
                 <h4 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[3px] mb-3">
                    Neural Insight
                </h4>
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                    {result?.action?.includes('tempo') ? <FastForward size={18} className="text-[var(--primary)]" /> :
                     result?.action?.includes('volume') ? <Activity size={18} className="text-[var(--primary)]" /> : <Headphones size={18} className="text-[var(--primary)]" />}
                    <span className="text-[11px] font-medium text-white/80 leading-snug">
                        {result?.action || 'Monitoring Auditory Cortex...'}
                    </span>
                </div>
                <p className="text-[10px] text-[var(--muted)] mt-3 leading-relaxed italic opacity-70">
                    EEG states modulate real-time DSP parameters. Higher focus levels increase harmonic clarity.
                </p>
            </div>

            {/* State Visualization Legend */}
            <div className="mt-auto border-t border-[var(--border)]/30 pt-4">
                <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-[2px] mb-3">State Legend</p>
                <div className="grid grid-cols-2 gap-2">
                    {[
                        { label: 'Focus', color: '#0ea5e9' },
                        { label: 'Calm', color: '#a855f7' },
                        { label: 'Relax', color: '#22c55e' },
                        { label: 'Stress', color: '#f43f5e' }
                    ].map(s => (
                        <div key={s.label} className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color, boxShadow: `0 0 5px ${s.color}` }} />
                            <span className="text-[10px] font-bold text-[var(--muted)]">{s.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default MusicSidebar;
