import React from 'react';
import { ScrollText, Activity, Trash2, Zap, History } from 'lucide-react';

export default function SSVEPDebugLog({ logs, clearLogs, realTimeFreq }) {
    return (
        <div className="flex flex-col gap-4 font-mono">
            {/* Real-time Frequency Card */}
            <div className="bg-bg/50 border border-primary/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-widest flex items-center gap-1">
                        <Activity size={12} className="text-primary" /> Signal Frequency
                    </span>
                    <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-[8px] text-primary/70">LIVE</span>
                    </div>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-primary tabular-nums">
                        {realTimeFreq ? realTimeFreq.toFixed(2) : '0.00'}
                    </span>
                    <span className="text-sm font-bold text-muted">Hz</span>
                </div>
                <div className="mt-2 h-1 bg-bg rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-300 shadow-[0_0_8px_var(--primary)]"
                        style={{ width: `${Math.min((realTimeFreq || 0) * 4, 100)}%` }}
                    />
                </div>
            </div>

            {/* Debug Event Log */}
            <div className="flex flex-col min-h-[200px] max-h-[400px]">
                <div className="flex items-center justify-between mb-3 shrink-0">
                    <h4 className="text-[10px] font-bold text-muted uppercase tracking-widest flex items-center gap-2">
                        <History size={14} /> System Activity
                    </h4>
                    <button
                        onClick={clearLogs}
                        className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors text-muted"
                        title="Clear Logs"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto space-y-1 pr-2 scrollbar-thin scrollbar-thumb-primary/20 hover:scrollbar-thumb-primary/40">
                    {logs.length === 0 ? (
                        <div className="text-[10px] text-muted italic text-center py-4">No activity yet...</div>
                    ) : (
                        logs.map((log) => (
                            <div key={log.id} className="text-[10px] border-b border-border/10 pb-1 flex items-start gap-2 group">
                                <span className="text-muted/50 tabular-nums shrink-0">{log.time}</span>
                                <div className="flex-grow flex items-center gap-2">
                                    {log.type === 'DETECTION' && <Zap size={10} className="text-yellow-500 shrink-0" />}
                                    <span className={log.type === 'DETECTION' ? 'text-primary font-bold' : 'text-text/70'}>
                                        {log.message}
                                    </span>
                                </div>
                            </div>
                        ))
                    ).reverse()}
                </div>
            </div>
        </div>
    );
}
