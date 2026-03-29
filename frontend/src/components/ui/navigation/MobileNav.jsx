import React from 'react';
import { Terminal, Gamepad2, Brain, HandMetal, FlaskConical, Settings2, Bot } from 'lucide-react';

export default function MobileNav({ currentPage, setCurrentPage, mobileMainView, setMobileMainView }) {
    const navItems = [
        { id: 'live', icon: Terminal, label: 'Terminal', href: '#live' },
        { id: 'dino', icon: Gamepad2, label: 'Dino', href: '#dino' },
        { id: 'eeg_dashboard', icon: Brain, label: 'EEG', href: '#eeg_dashboard' },
        { id: 'rps', icon: HandMetal, label: 'RPS', href: '#rps' },
        { id: 'lab', icon: FlaskConical, label: 'Lab', href: '#lab' },
        { id: 'servo_claw', icon: Bot, label: 'Servo', href: '#servo_claw' }
    ]

    return (
        <aside className="w-[4.5rem] bg-surface/80 backdrop-blur-md border-r border-border h-full flex flex-col items-center py-4 space-y-4 z-[45] portrait:flex lg:hidden overflow-y-auto">
            <div className="h-[94px] shrink-0" /> {/* Spacer for header */}

            {/* Nav Pages */}
            {navItems.map(item => {
                const isActive = currentPage === item.id;
                const Icon = item.icon;
                return (
                    <a
                        key={item.id}
                        href={item.href}
                        onClick={() => setCurrentPage(item.id)}
                        className={`p-3 rounded-2xl transition-all shrink-0 ${isActive ? 'bg-primary/20 text-primary shadow-lg border border-primary/50' : 'text-muted hover:text-text hover:bg-surface border border-transparent'}`}
                        title={item.label}
                    >
                        <Icon size={24} />
                    </a>
                )
            })}

            <div className="flex-grow shrink-0 min-h-[20px]" />

            {/* Toggle Settings Sidebar (Only on Live page) */}
            {currentPage === 'live' && (
                <button
                    onClick={() => setMobileMainView(prev => prev === 'settings' ? 'graphs' : 'settings')}
                    className={`p-3 rounded-2xl transition-all shrink-0 mb-4 ${mobileMainView === 'settings' ? 'bg-primary text-white shadow-lg' : 'bg-surface border border-border text-muted hover:text-text hover:border-primary/50'}`}
                    title="Control Panel"
                >
                    <Settings2 size={24} />
                </button>
            )}
            <div className="h-[20px] shrink-0" />
        </aside>
    )
}
