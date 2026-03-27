import React from 'react';
import { motion } from 'framer-motion';
import { Database, Brain } from 'lucide-react';

const DEFAULT_TABS = [
    { id: 'data', label: 'DATA COLLECTION', icon: Database },
    { id: 'ml', label: 'ML TRAINING', icon: Brain }
];

export default function CustomSwitchPill({ 
    activeTab, 
    onSwitch, 
    tabs = DEFAULT_TABS,
    className = "" 
}) {

    return (
        <div className={`flex bg-black/40 backdrop-blur-md border border-white/5 rounded-full p-1.5 relative w-full shadow-2xl overflow-hidden ${className}`}>
            {/* Sliding Background Pill */}
            <motion.div
                className="absolute inset-y-1 rounded-full bg-primary border border-primary/50 shadow-[0_0_20px_rgba(var(--primary-rgb),0.4)]"
                initial={false}
                animate={{
                    left: tabs.findIndex(t => t.id === activeTab) === 0 ? '6px' : '50%',
                    right: tabs.findIndex(t => t.id === activeTab) === 0 ? '50%' : '6px',
                }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
            />

            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onSwitch(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-full relative z-10 transition-all duration-300 ${
                        activeTab === tab.id 
                            ? 'text-black font-black' 
                            : 'text-primary/70 hover:text-primary'
                    }`}
                >
                    <tab.icon 
                        size={15} 
                        className={activeTab === tab.id ? 'stroke-[3px]' : 'stroke-[2px] opacity-70'} 
                    />
                    <span className="text-[10px] font-black tracking-[0.15em] whitespace-nowrap">
                        {tab.label}
                    </span>
                </button>
            ))}
        </div>
    );
}
