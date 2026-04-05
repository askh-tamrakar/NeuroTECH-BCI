import React from 'react';
import { Music, Activity, Wind, Eye, Grid, ChevronLeft, Menu, Play, Pause, Volume2, VolumeX, Headphones, FastForward, Layers } from 'lucide-react';

const MusicSidebar = ({ 
    isPlaying, togglePlayback, 
    isMuted, setIsMuted, 
    result, stateTheme,
    tracks = [], currentTrack = {}, onSelectTrack,
    sidebarMode, setSidebarMode, 
    isCollapsed
}) => {
    return (
        <div className="flex-grow flex flex-col p-4 font-mono transition-all duration-300 w-full shrink-0 overflow-y-auto">
            {/* Header */}
            <div className={`flex items-center justify-between mb-6 ${isCollapsed ? 'flex-col gap-4' : 'px-2'}`}>
                <div className={`flex items-center gap-3 min-w-0 ${isCollapsed ? 'flex-col' : ''}`}>
                    <div 
                        className="w-10 h-10 rounded-xl bg-[var(--primary)]/15 flex items-center justify-center border border-[var(--primary)]/30 shadow-glow shrink-0"
                        title={isCollapsed ? 'Music Synergy' : ''}
                    >
                        <Music size={20} className="text-[var(--primary)]" />
                    </div>
                    {!isCollapsed && (
                        <div className="overflow-hidden">
                            <h2 className="text-[16px] font-black text-[var(--primary)] tracking-widest leading-none truncate">
                                MUSIC SYNERGY
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

            {/* Playback Controls Rail */}
            <div className={`bg-[var(--bg)]/50 border border-[var(--primary)]/20 rounded-2xl mb-4 flex flex-col gap-4 shadow-xl transition-all ${isCollapsed ? 'p-2 py-4' : 'p-4'}`}>
                {!isCollapsed && (
                    <h4 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[3px] border-b border-[var(--border)]/50 pb-2">
                        Active Session
                    </h4>
                )}
                
                <div className={`flex items-center justify-center ${isCollapsed ? 'flex-col gap-3' : 'gap-4'}`}>
                    <button
                        onClick={togglePlayback}
                        className={`rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-lg ${isCollapsed ? 'w-12 h-12' : 'w-14 h-14'}`}
                        style={{ 
                            background: `linear-gradient(135deg, ${stateTheme.primary}, ${stateTheme.secondary})`,
                            boxShadow: `0 8px 20px ${stateTheme.glow}`
                        }}
                        title={isCollapsed ? (isPlaying ? 'Pause' : 'Play') : ''}
                    >
                        {isPlaying ? <Pause size={isCollapsed ? 22 : 28} color="white" /> : <Play size={isCollapsed ? 22 : 28} fill="white" color="white" />}
                    </button>

                    <button
                        onClick={() => setIsMuted(!isMuted)}
                        className={`rounded-full border flex items-center justify-center transition-all ${isCollapsed ? 'w-10 h-10' : 'w-14 h-14'} ${isMuted ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                        title={isCollapsed ? 'Toggle Mute' : ''}
                    >
                        {isMuted ? <VolumeX size={isCollapsed ? 18 : 24} /> : <Volume2 size={isCollapsed ? 18 : 24} />}
                    </button>
                </div>

                {!isCollapsed && (
                    <div className="flex flex-col items-center gap-1 mt-2">
                        <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-tighter truncate w-full text-center px-2">
                           Playing: {currentTrack.label || 'None'}
                        </span>
                        <span className="text-xl font-black tracking-widest uppercase" style={{ color: stateTheme.primary, textShadow: `0 0 10px ${stateTheme.glow}` }}>
                            {result?.state || 'Neutral'}
                        </span>
                    </div>
                )}
            </div>

            {/* Track Library Rail */}
            <div className={`flex flex-col mb-6 ${isCollapsed ? 'items-center' : ''}`}>
                {!isCollapsed && (
                    <h4 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[3px] px-2 mb-4">
                        Track Library
                    </h4>
                )}
                <div className={`flex flex-col gap-2 w-full ${isCollapsed ? 'items-center' : 'px-2'}`}>
                    {tracks.map(track => (
                        <button
                            key={track.id}
                            onClick={() => onSelectTrack(track)}
                            className={`flex items-center gap-3 p-2 rounded-xl border transition-all text-left ${
                                currentTrack.id === track.id 
                                ? 'bg-[var(--primary)]/20 border-[var(--primary)]/40 shadow-glow' 
                                : 'bg-white/5 border-white/5 hover:bg-white/10'
                            } ${isCollapsed ? 'w-10 h-10 justify-center overflow-hidden' : 'w-full'}`}
                            title={isCollapsed ? track.label : ''}
                        >
                            <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${currentTrack.id === track.id ? 'bg-[var(--primary)] text-white' : 'bg-white/10 text-[var(--muted)]'}`}>
                                <Music size={12} />
                            </div>
                            {!isCollapsed && (
                                <div className="min-w-0 flex-grow">
                                    <div className={`text-[10px] font-black truncate ${currentTrack.id === track.id ? 'text-white' : 'text-white/60'}`}>
                                        {track.label}
                                    </div>
                                    <div className="text-[8px] font-bold text-[var(--muted)] uppercase tracking-widest opacity-60">
                                        {track.category}
                                    </div>
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Neural Insights Rail */}
            <div className={`bg-[var(--bg)]/40 border border-[var(--border)] rounded-xl transition-all ${isCollapsed ? 'p-2 py-4 flex flex-col items-center gap-4' : 'p-4 mb-4'}`}>
                 {!isCollapsed && (
                    <h4 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[3px] mb-3">
                        Neural Insight
                    </h4>
                )}
                <div className={`flex items-center bg-white/5 rounded-lg border border-white/5 transition-all ${isCollapsed ? 'w-12 h-12 justify-center' : 'gap-3 p-3'}`} title={isCollapsed ? (result?.action || 'Monitoring...') : ''}>
                    {result?.action?.includes('tempo') ? <FastForward size={18} className="text-[var(--primary)]" /> :
                     result?.action?.includes('volume') ? <Activity size={18} className="text-[var(--primary)]" /> : <Headphones size={18} className="text-[var(--primary)]" />}
                    {!isCollapsed && (
                        <span className="text-[11px] font-medium text-white/80 leading-snug">
                            {result?.action || 'Monitoring Auditory Cortex...'}
                        </span>
                    )}
                </div>
                {!isCollapsed && (
                    <p className="text-[10px] text-[var(--muted)] mt-3 leading-relaxed italic opacity-70">
                        EEG states modulate real-time DSP parameters. Higher focus levels increase harmonic clarity.
                    </p>
                )}
            </div>

            {/* State Visualization Legend - Hidden in collapsed */}
            {!isCollapsed && (
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
            )}
        </div>
    );
};

export default MusicSidebar;
