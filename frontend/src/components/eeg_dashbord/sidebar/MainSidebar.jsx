import React from 'react';
import { Activity, Music, Wind, Eye, Grid, Layers } from 'lucide-react';
import { useSidebar } from '../pages/SidebarContext';

const MainSidebar = ({ currentView, onSelect }) => {
    const { sidebarMode, setSidebarMode } = useSidebar();

    const btn = (view, Icon, label) => (
        <button
            className={`flex items-center gap-4 px-3 py-4 rounded-[20px] transition-all font-black text-lg border whitespace-nowrap ${currentView === view
                ? 'bg-[var(--primary)]/20 text-[var(--primary)] border-[var(--primary)]/50 shadow-lg scale-[1.02]'
                : 'text-[var(--text)] hover:bg-[var(--bg)] border-transparent opacity-60 hover:opacity-100 hover:scale-[1.02]'
                }`}
            onClick={() => onSelect(view)}
        >
            <Icon size={24} strokeWidth={2.5} className="shrink-0" /> 
            <span className="truncate">{label}</span>
        </button>
    );

    return (
        <div className="flex flex-col h-full w-full p-4 font-mono transition-opacity duration-300">
            <div className="flex items-center justify-between mb-6 px-2">
                <h2 className="text-xl font-black text-[var(--primary)] tracking-[6px] uppercase">
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
                <p className="text-[13px] font-black text-[var(--muted)] uppercase tracking-[5px] px-2 mb-3 opacity-50">
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
