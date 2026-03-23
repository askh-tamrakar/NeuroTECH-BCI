const fs = require('fs');

const path = 'frontend/src/components/views/SSVEPView.jsx';
let code = fs.readFileSync(path, 'utf8');

const sidebarReplacement = `            {/* Right Sidebar */}
            <div
                className={\`transition-all duration-300 ease-in-out border-l border-border bg-surface/80 backdrop-blur-md flex flex-col h-full relative \${showSidebar ? 'w-80 overflow-y-auto overflow-x-hidden' : 'w-[4.5rem] overflow-visible'} [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']\`}
            >
                {/* Collapsed Icons Only State */}
                {!showSidebar && (
                    <div className="flex flex-col items-center gap-6 mt-4 w-full animate-fade-in shrink-0 h-full">
                        <button
                            onClick={() => setShowSidebar(true)}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors mb-2"
                            title="Expand Sidebar"
                        >
                            <Menu size={24} className="text-primary" />
                        </button>
                        <Settings size={24} className="text-primary animate-pulse" title="SSVEP Setup" />

                         <button onClick={() => setShowSidebar(true)} title="Signal" className="hover:text-primary transition-colors group relative">
                            <Activity size={20} className="text-muted group-hover:text-primary" />
                            <div className="absolute right-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Signal Frequency</div>
                        </button>

                        <button onClick={() => setShowSidebar(true)} title="System Activity" className="hover:text-primary transition-colors group relative">
                            <History size={20} className="text-muted group-hover:text-primary" />
                            {logs.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse blur-[1px]"></span>}
                            <div className="absolute right-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">System Activity</div>
                        </button>

                        <button onClick={() => setShowSidebar(true)} title="Global Actions" className="hover:text-primary transition-colors group relative">
                            {globalRunning ? <Square size={20} className="text-red-500" /> : <Play size={20} className="text-green-500" />}
                            <div className="absolute right-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Global Actions</div>
                        </button>

                        <button onClick={() => setShowSidebar(true)} title="Targets" className="hover:text-primary transition-colors group relative">
                            <Monitor size={20} className="text-muted group-hover:text-primary" />
                            <div className="absolute right-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Targets Settings</div>
                        </button>
                        
                        <div className="flex-1" />
                        <div className="flex flex-col gap-2 w-full items-center border-t border-border pt-4 pb-4 shrink-0">
                            <button onClick={() => setShowSidebar(true)} className={\`w-[42px] h-[42px] flex items-center justify-center rounded-full border transition-all shadow-sm group relative \${isConnected ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}\`} title={isConnected ? "Sensor Connected" : "Sensor Disconnected"}>
                                {isConnected ? <Zap size={18} /> : <Power size={18} />}
                                <div className="absolute right-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Sensor Status</div>
                            </button>
                        </div>
                    </div>
                )}

                {/* Fixed Container */}
                <div className={\`flex-grow flex flex-col overflow-hidden p-4 gap-3 font-mono transition-opacity duration-300 w-80 shrink-0 \${!showSidebar ? 'opacity-0 h-0 hidden' : 'opacity-100'}\`}>

                    {/* Header */}
                    <div className="flex items-center justify-between shrink-0 mb-2">
                        <div>
                            <h2 className="text-2xl font-bold text-text mb-1 flex items-center gap-3">
                                <Settings size={28} className="text-primary animate-pulse" />
                                <span style={{ letterSpacing: '2.3px' }}>Controls</span>
                            </h2>
                            <p className="text-xs text-muted">SSVEP Protocol</p>
                        </div>
                        <button
                            onClick={() => setShowSidebar(false)}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            title="Collapse Sidebar"
                        >
                            <ChevronLeft size={24} className="rotate-180" />
                        </button>
                    </div>

                    <div className="flex items-center justify-between shrink-0 border-t border-border/50 pt-2 pb-2">
                        <h4 className="text-xs font-bold text-muted uppercase tracking-widest">Global State</h4>
                        <div className={\`w-3 h-3 rounded-full animate-pulse \${globalRunning ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'}\`} />
                    </div>

                    {/* Global Actions */}
                    <div className="grid grid-cols-2 gap-2 shrink-0">
                        <button
                            onClick={globalRunning ? stopFlicker : startFlicker}
                            className={\`w-full py-2.5 rounded-xl text-base font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2 \${globalRunning
                                ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20'
                                : 'bg-green-500/10 border-green-500/50 text-green-500 hover:bg-green-500/20 shadow-glow'
                                }\`}
                        >
                            {globalRunning ? <><Square size={18} /> Stop</> : <><Play size={18} /> Start</>}
                        </button>

                        {!globalRunning && (
                            <button
                                onClick={runProtocol}
                                className="w-full py-2.5 bg-primary/10 border-2 border-primary/50 text-primary rounded-xl text-base font-bold uppercase tracking-widest hover:bg-primary/20 transition-all flex items-center justify-center gap-2 shadow-glow"
                            >
                                <Zap size={18} /> Protocol
                            </button>
                        )}
                    </div>

                    {/* Global Settings */}
                    <div className="flex flex-col gap-4 shrink-0 bg-bg/30 p-3 rounded-xl border border-border/50">
                        {/* Brightness */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm font-bold text-muted uppercase tracking-widest">
                                <span className="flex items-center gap-1"><Sun size={16} /> Brightness</span>
                                <span className="text-primary">{Math.round(brightness * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.05"
                                value={brightness}
                                onChange={(e) => setBrightness(parseFloat(e.target.value))}
                                className="w-full accent-primary h-1.5 bg-bg rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        {/* Refresh Rate */}
                        <div className="flex items-center justify-between border-t border-border/30 pt-3">
                            <label className="text-sm font-bold text-muted uppercase tracking-widest flex items-center gap-1">
                                <Monitor size={16} /> Refresh Rate
                            </label>
                            <div className="flex items-center gap-1">
                                <input
                                    type="number"
                                    value={refreshRate}
                                    onChange={(e) => setRefreshRate(parseInt(e.target.value) || 60)}
                                    className="w-14 bg-bg border border-border rounded px-1 py-0.5 text-center font-bold text-primary focus:border-primary/50 outline-none text-base"
                                />
                                <span className="text-sm text-muted">FPS</span>
                            </div>
                        </div>
                    </div>

                    {/* Real-time Meter */}
                    <div className="bg-bg/50 border border-primary/20 rounded-xl p-2 px-3 flex items-center justify-between shrink-0">
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-muted uppercase tracking-widest flex items-center gap-1 mb-1">
                                <Activity size={16} className="text-primary" /> Signal
                            </span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black text-primary tabular-nums">
                                    {realTimeFreq ? realTimeFreq.toFixed(2) : '0.00'}
                                </span>
                                <span className="text-base font-bold text-muted">Hz</span>
                            </div>
                        </div>
                        <div className="w-1/2 flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                <span className="text-xs font-bold text-primary/70">LIVE</span>
                            </div>
                            <div className="w-full mt-2 h-1 bg-bg rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-300 shadow-[0_0_8px_var(--primary)]"
                                    style={{ width: \`\${Math.min((realTimeFreq || 0) * 4, 100)}%\` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Debug Event Log */}
                    <div className="flex flex-col flex-none h-[110px] border border-border/50 rounded-xl bg-bg/20 p-2 shrink-0">
                        <div className="flex items-center justify-between mb-1 pb-1 border-b border-border/30 shrink-0">
                            <h4 className="text-sm font-bold text-muted uppercase tracking-widest flex items-center gap-1">
                                <History size={16} /> System Activity
                            </h4>
                            <button
                                onClick={() => setLogs([])}
                                className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded text-muted transition-colors"
                                title="Clear Logs"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>

                        <div className="flex-grow overflow-y-auto space-y-1 pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                            {logs.length === 0 ? (
                                <div className="text-sm text-muted italic text-center py-1">No activity...</div>
                            ) : (
                                logs.slice().reverse().map((log) => (
                                    <div key={log.id} className="text-sm border-b border-border/10 pb-1 flex items-start gap-1 group">
                                        <span className="text-muted/50 tabular-nums shrink-0">{log.time}</span>
                                        <div className="flex-grow flex items-center gap-1">
                                            {log.type === 'DETECTION' && <Zap size={14} className="text-yellow-500 shrink-0" />}
                                            <span className={log.type === 'DETECTION' ? 'text-primary font-bold' : 'text-text/70'}>
                                                {log.message}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Targets List */}
                    <div className="flex flex-col flex-1 min-h-[0] overflow-hidden border border-border/50 rounded-xl bg-bg/10">
                        <div className="p-2 border-b border-border/50 bg-bg/30 shrink-0">
                            <h4 className="text-sm font-bold text-muted uppercase tracking-widest">Targets</h4>
                        </div>
                        <div className="flex flex-col flex-grow overflow-y-auto p-2 gap-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                            {configs.map((cfg) => {
                                const isMouse = cfg.controlType === 'Mouse';
                                return (
                                <div key={cfg.id} className={\`p-3 rounded-xl border transition-all space-y-2 shrink-0 \${cfg.enabled ? 'bg-bg/50 border-border' : 'bg-bg/20 border-border/30 grayscale opacity-60'}\`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 overflow-hidden flex-grow">
                                            <button
                                                onClick={() => updateConfig(cfg.id, { enabled: !cfg.enabled })}
                                                className={\`p-1.5 rounded-lg transition-all shrink-0 \${cfg.enabled ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-bg border border-border text-muted hover:border-primary/50'}\`}
                                                title={cfg.enabled ? "Disable Target" : "Enable Target"}
                                            >
                                                <Power size={16} />
                                            </button>
                                            <input
                                                className="bg-transparent font-bold text-lg outline-none focus:text-primary transition-colors w-full"
                                                value={cfg.label}
                                                onChange={(e) => updateConfig(cfg.id, { label: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <input
                                                type="number"
                                                value={cfg.freq}
                                                onChange={(e) => updateConfig(cfg.id, { freq: parseFloat(e.target.value) || 0 })}
                                                className="w-16 bg-bg border border-border rounded px-2 py-0.5 text-center text-primary font-bold focus:border-primary/50 outline-none text-base"
                                            />
                                            <span className="text-sm text-muted">Hz</span>
                                        </div>
                                    </div>

                                    {/* Mapping Selection */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-xs uppercase text-muted flex items-center gap-1"><Keyboard size={14} /> Key</label>
                                            <select
                                                className="w-full bg-bg border border-border rounded px-2 py-1 text-sm font-medium outline-none focus:border-primary/50"
                                                value={cfg.mappedKey || 'None'}
                                                onChange={(e) => updateConfig(cfg.id, { mappedKey: e.target.value })}
                                                disabled={!cfg.enabled}
                                            >
                                                <option value="None">None</option>
                                                {COMMON_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs uppercase text-muted flex items-center gap-1"><MousePointer2 size={14} /> Mouse</label>
                                            <select
                                                className="w-full bg-bg border border-border rounded px-2 py-1 text-sm font-medium outline-none focus:border-primary/50"
                                                value={cfg.mappedMouse || 'None'}
                                                onChange={(e) => updateConfig(cfg.id, { mappedMouse: e.target.value })}
                                                disabled={!cfg.enabled}
                                            >
                                                <option value="None">None</option>
                                                {MOUSE_ACTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )})}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
`;

const startIndex = code.indexOf('{/* Right Sidebar */}');
if (startIndex !== -1) {
    code = code.substring(0, startIndex) + sidebarReplacement;
    if (!code.includes('Menu, ChevronLeft')) {
        code = code.replace("} from 'lucide-react';", ", Menu, ChevronLeft } from 'lucide-react';");
    }
    fs.writeFileSync(path, code);
    console.log("Successfully replaced sidebar.");
} else {
    console.error("Right Sidebar marker not found in SSVEPView.jsx!");
}
