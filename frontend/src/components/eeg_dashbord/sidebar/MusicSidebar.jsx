import React from 'react';
import { Music, Activity, Wind, Eye, Grid, ChevronLeft, Menu } from 'lucide-react';

const MusicSidebar = ({ showSidebar, setShowSidebar, onBackToMenu, currentView, onSelect }) => {
    const btn = (view, Icon, label) => (
        <button
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm border ${currentView === view
                ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/30 shadow-sm'
                : 'text-[var(--text)] hover:bg-[var(--bg)] border-transparent'
                }`}
            onClick={() => onSelect(view)}
        >
            <Icon size={18} /> {label}
        </button>
    );

    return (
        <div className={`absolute left-0 top-0 bottom-0 z-10 transition-all duration-300 ease-in-out border-r border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md flex flex-col h-full pointer-events-auto select-none ${showSidebar ? 'w-80 overflow-y-auto overflow-x-hidden' : 'w-[4.25rem] overflow-visible'} [&::-webkit-scrollbar]:hidden `}>

            {!showSidebar && (
                <div className="flex flex-col items-center justify-start py-3 w-full animate-fade-in shrink-0 h-full gap-2">
                    <button onClick={onBackToMenu} className="hover:bg-white/10 p-2.5 rounded-full transition-colors group relative" title="Back to Menu">
                        <ChevronLeft size={26} className="text-[var(--text)]" />
                    </button>
                    <div className="w-full h-px bg-[var(--border)]/80 shrink-0 my-1" />
                    <button onClick={() => setShowSidebar(true)} className="hover:bg-white/10 p-2.5 rounded-full transition-colors group relative" title="Expand">
                        <Menu size={24} className="text-[var(--primary)]" />
                    </button>
                </div>
            )}

            <div className={`flex-grow flex flex-col p-4 font-mono transition-opacity duration-300 w-80 shrink-0 ${!showSidebar ? 'opacity-0 h-0 hidden' : 'opacity-100'}`}>
                {/* Page Header */}
                <div className="flex items-center justify-between mb-6 px-2">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/15 flex items-center justify-center border border-[var(--primary)]/30">
                            <Music size={18} className="text-[var(--primary)]" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-[var(--primary)] tracking-widest leading-none">
                                MUSIC CONTROL
                            </h2>
                            <p className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-widest mt-0.5">
                                Neural Audio Synergy
                            </p>
                        </div>
                    </div>
                    <button onClick={() => setShowSidebar(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <ChevronLeft size={22} className="text-[var(--text)]" />
                    </button>
                </div>

                {/* Page Info */}
                <div className="bg-[var(--bg)]/50 border border-[var(--primary)]/20 rounded-xl p-3 mb-4">
                    <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                        EEG-driven music control. Focus states modulate playback and effects in real-time.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse" />
                        <span className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-widest">
                            Frontal Lobe Mode
                        </span>
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex flex-col gap-1.5 flex-grow overflow-y-auto [&::-webkit-scrollbar]:hidden">
                    <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-[3px] px-2 mb-1">
                        Switch View
                    </p>
                    {btn('overview', Grid, 'Dashboard Overview')}
                    {btn('meditation', Wind, 'Meditation Trainer')}
                    {btn('bubble', Activity, 'Bubble Game')}
                    {btn('ssvep', Eye, 'SSVEP Interface')}
                </div>
            </div>
        </div>
    );
};

export default MusicSidebar;
