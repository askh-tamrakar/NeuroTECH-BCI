import React from 'react';
import { Activity, Music, Wind, Eye, Grid, Layers } from 'lucide-react';
import { useSidebar } from '../pages/SidebarContext';

const MainSidebar = ({ currentView, onSelect }) => {
    const { sidebarMode, setSidebarMode } = useSidebar();

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
        <div className="flex flex-col h-full w-full p-4 font-mono transition-opacity duration-300">
            <div className="flex items-center justify-between mb-6 px-2">
                <h2 className="text-base font-black text-[var(--primary)] tracking-[4px] uppercase">
                    Navigator
                </h2>
                {currentView !== 'overview' && (
                    <button
                        onClick={() => setSidebarMode('page')}
                        className="nav-controls-toggle"
                        title="Switch to Controls"
                    >
                        <Layers size={14} />
                        NAV
                    </button>
                )}
            </div>

            <div className="flex flex-col gap-1.5 flex-grow overflow-y-auto [&::-webkit-scrollbar]:hidden">
                <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-[3px] px-2 mb-1">
                    Applications
                </p>
                {btn('overview', Grid, 'Dashboard Overview')}
                {btn('music', Music, 'Music Control')}
                {btn('meditation', Wind, 'Meditation Trainer')}
                {btn('bubble', Activity, 'Bubble Game')}
                {btn('ssvep', Eye, 'SSVEP Interface')}
            </div>

            <div className="mt-auto px-2 py-4 border-t border-[var(--border)]/50">
                <div className="flex items-center gap-3 opacity-60">
                    <div className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse" />
                    <span className="text-[10px] font-bold text-[var(--text)] uppercase tracking-wider">
                        System Ready
                    </span>
                </div>
            </div>
        </div>
    );
};

export default MainSidebar;
