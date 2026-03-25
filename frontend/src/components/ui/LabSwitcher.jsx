import React from 'react';
import { motion } from 'framer-motion';
import { Database, Brain } from 'lucide-react';

export default function LabSwitcher({ activeTab, onSwitch }) {
    const tabs = [
        { id: 'data', label: 'DATA COLLECTION', icon: Database },
        { id: 'ml', label: 'ML TRAINING', icon: Brain }
    ];

    return (
        <div className="flex bg-surface/50 border border-border rounded-full p-1 relative w-full max-w-[400px] mx-auto mb-4">
            {/* Sliding Background Pill */}
            <motion.div
                className="absolute inset-y-1 rounded-full bg-primary/20 border border-primary/30 shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]"
                initial={false}
                animate={{
                    left: activeTab === 'data' ? '4px' : '50%',
                    right: activeTab === 'data' ? '50%' : '4px',
                }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />

            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onSwitch(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-full relative z-10 transition-colors duration-300 ${
                        activeTab === tab.id ? 'text-primary' : 'text-muted hover:text-text'
                    }`}
                >
                    <tab.icon size={16} className={activeTab === tab.id ? 'text-primary' : 'text-muted'} />
                    <span className="text-[11px] font-black tracking-widest">{tab.label}</span>
                </button>
            ))}
        </div>
    );
}
