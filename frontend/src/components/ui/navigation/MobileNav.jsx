import React, { useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Terminal, Gamepad2, Brain, HandMetal, FlaskConical, Settings2, Bot } from 'lucide-react';

export default function MobileNav({ currentPage, mobileMainView, setMobileMainView }) {
    const navigate = useNavigate();
    const location = useLocation();

    const navItems = [
        { id: 'live', icon: Terminal, label: 'Terminal', href: '/dashboard/terminal' },
        { id: 'dino', icon: Gamepad2, label: 'Dino', href: '/dino' },
        { id: 'eeg_dashboard', icon: Brain, label: 'EEG', href: '/dashboard/eeg' },
        { id: 'rps', icon: HandMetal, label: 'RPS', href: '/dashboard/rps' },
        { id: 'lab', icon: FlaskConical, label: 'Lab', href: '/dashboard/lab/data_collection' },
        { id: 'servo_claw', icon: Bot, label: 'Servo', href: '/dashboard/servo_claw' }
    ]

    return (
        <aside className="w-[4.5rem] bg-surface/80 backdrop-blur-md border-r border-border h-full flex flex-col items-center py-4 space-y-4 z-[45] portrait:flex lg:hidden overflow-y-auto">
            <div className="h-[94px] shrink-0" /> {/* Spacer for header */}

            {/* Nav Pages */}
            {navItems.map(item => {
                const isActive = location.pathname.startsWith(item.href) || (item.id === 'live' && location.pathname.includes('/terminal'));
                const Icon = item.icon;
                return (
                    <Link
                        key={item.id}
                        to={item.href}
                        className={`p-3 rounded-2xl transition-all shrink-0 ${isActive ? 'bg-primary/20 text-primary shadow-lg border border-primary/50' : 'text-muted hover:text-text hover:bg-surface border border-transparent'}`}
                        title={item.label}
                    >
                        <Icon size={24} />
                    </Link>
                )
            })}

            <div className="flex-grow shrink-0 min-h-[20px]" />

            {/* Toggle Settings Sidebar (Only on Live page) */}
            {location.pathname.includes('/terminal') && (
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

