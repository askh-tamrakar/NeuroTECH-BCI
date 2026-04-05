import React from 'react';
import { Activity, Music, Wind, Eye, Grid, Layers } from 'lucide-react';

const MainSidebar = ({ currentView, onSelect, sidebarMode, setSidebarMode, isFullContainer, isCollapsed }) => {
    const btn = (view, Icon, label) => (
        <button
            onClick={() => onSelect(view)}
            className={`w-full group relative flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 border ${
                currentView === view 
                ? 'bg-[var(--primary)]/15 border-[var(--primary)]/40 text-[var(--primary)] shadow-[0_0_20px_rgba(var(--primary-rgb),0.15)]' 
                : 'bg-transparent border-transparent text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]'
            } ${isCollapsed ? 'justify-center px-0' : ''}`}
            title={isCollapsed ? label : ''}
        >
            <div className={`shrink-0 transition-transform duration-300 group-hover:scale-110 ${
                currentView === view ? 'drop-shadow-[0_0_8px_var(--primary)]' : ''
            }`}>
                <Icon size={24} strokeWidth={2.5} />
            </div>
            
            {!isCollapsed && (
                <div className="flex flex-col items-start transition-opacity duration-300">
                    <span className="text-sm font-black uppercase tracking-[2px]">
                        {label}
                    </span>
                </div>
            )}

            {currentView === view && (
                <div className="absolute right-4 w-1.5 h-1.5 rounded-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary)]" />
            )}
        </button>
    );

    return (
        <div className="flex-grow flex flex-col p-4 gap-6 font-mono transition-all duration-300 overflow-y-auto">
            <div className={`flex flex-col shrink-0 ${isCollapsed ? 'items-center' : 'px-2'}`}>
                {!isCollapsed ? (
                    <>
                        <h2 className="text-[22px] font-black text-[var(--primary)] tracking-[4px] mb-1">
                            NEURO-OS
                        </h2>
                    </>
                ) : (
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/15 flex items-center justify-center border border-[var(--primary)]/30 mb-2">
                        <Activity size={20} className="text-[var(--primary)]" />
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-1.5 flex-grow overflow-y-auto [&::-webkit-scrollbar]:hidden">
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
