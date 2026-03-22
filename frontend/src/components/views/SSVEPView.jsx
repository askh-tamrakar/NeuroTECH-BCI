import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Play, Square, Activity, MousePointer2, Keyboard, Sun, Monitor, Power, Zap, Trash2, History, Menu, ChevronLeft } from 'lucide-react';
import SSVEPStimulus from './ssvep/SSVEPStimulus';
import { soundHandler } from '../../handlers/SoundHandler';

const COMMON_KEYS = ['W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape'];
const MOUSE_ACTIONS = ['Left Click', 'Right Click', 'Double Click'];

export default function SSVEPView({ isConnected, wsEvent }) {
    // --- Configuration State ---
    const [configs, setConfigs] = useState([
        { id: 0, freq: 8, label: 'Target 1', mappedKey: 'W', mappedMouse: 'None', enabled: true },
        { id: 1, freq: 10, label: 'Target 2', mappedKey: 'A', mappedMouse: 'None', enabled: true },
        { id: 2, freq: 12, label: 'Target 3', mappedKey: 'S', mappedMouse: 'None', enabled: true },
        { id: 3, freq: 15, label: 'Target 4', mappedKey: 'D', mappedMouse: 'None', enabled: true },
        { id: 4, freq: 18, label: 'Target 5', mappedKey: 'Space', mappedMouse: 'None', enabled: true },
        { id: 5, freq: 20, label: 'Target 6', mappedKey: 'Escape', mappedMouse: 'None', enabled: true },
    ]);

    const [brightness, setBrightness] = useState(1.0);
    const [refreshRate, setRefreshRate] = useState(60);
    const [globalRunning, setGlobalRunning] = useState(false);

    // --- UI & Logging State ---
    const [showSidebar, setShowSidebar] = useState(true);
    const [logs, setLogs] = useState([]);
    const [realTimeFreq, setRealTimeFreq] = useState(0);

    // --- Protocol State ---
    const [protocolMode, setProtocolMode] = useState(false);
    const [protocolState, setProtocolState] = useState('IDLE');
    const [currentTrialIdx, setCurrentTrialIdx] = useState(0);
    const [trials, setTrials] = useState([]);

    const addLog = useCallback((message, type = 'INFO') => {
        const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLogs(prev => [...prev, { id: Date.now() + Math.random(), time, message, type }].slice(-100));
    }, []);

    const updateConfig = (id, newValues) => {
        setConfigs(prev => prev.map(cfg => cfg.id === id ? { ...cfg, ...newValues } : cfg));
    };

    // --- Detection Handling ---
    useEffect(() => {
        if (!wsEvent) return;

        // 1. Unified Frequency Extraction Logic (for UI feedback)
        let freqValue = null;
        if (wsEvent.event === 'eeg_prediction' && wsEvent.frequency !== undefined) {
            freqValue = wsEvent.frequency;
        } else if (typeof wsEvent.event === 'string' && wsEvent.event.startsWith('TARGET_')) {
            const numStr = wsEvent.event.replace('TARGET_', '').replace('HZ', '').replace('_', '.');
            freqValue = parseFloat(numStr);
        } else if (wsEvent.features?.peak_freq !== undefined) {
            freqValue = wsEvent.features.peak_freq;
        }

        // 2. Always update Real-time Frequency display (for smooth gauge feedback)
        if (freqValue !== null) {
            setRealTimeFreq(freqValue);
        }

        // 3. Trigger Actions only on CONFIRMED detections
        // We reject 'eeg_prediction' here to prevent the rapid switching spam in logs/sounds
        const isConfirmedDetection =
            (typeof wsEvent.event === 'string' && wsEvent.event.startsWith('TARGET_')) ||
            wsEvent.event === 'DETECTION';

        if (isConfirmedDetection && freqValue > 0) {
            const closest = configs.reduce((prev, curr) => {
                return Math.abs(curr.freq - freqValue) < Math.abs(prev.freq - freqValue) ? curr : prev;
            });

            if (Math.abs(closest.freq - freqValue) < 0.5) {
                const msg = `Confirmed: ${freqValue.toFixed(1)}Hz -> ${closest.label}`;
                addLog(msg, 'DETECTION');
                soundHandler.playSuccess();

                if (closest.mappedKey !== 'None') {
                    addLog(`Executing Key: ${closest.mappedKey}`, 'ACTION');
                }
                if (closest.mappedMouse !== 'None') {
                    addLog(`Executing Mouse: ${closest.mappedMouse}`, 'ACTION');
                }
            }
        }
    }, [wsEvent, configs, addLog]);

    // --- Controls ---
    const startFlicker = () => {
        setProtocolMode(false);
        setGlobalRunning(true);
        addLog('Manual simulation started');
    };

    const stopFlicker = () => {
        setGlobalRunning(false);
        setProtocolMode(false);
        addLog('Simulation stopped');
    };

    const runProtocol = () => {
        const newTrials = [];
        const rounds = 3;
        for (let r = 0; r < rounds; r++) {
            const roundTargets = configs.filter(c => c.enabled).sort(() => Math.random() - 0.5);
            roundTargets.forEach(t => newTrials.push(t.id));
        }

        if (newTrials.length === 0) {
            addLog('Cannot start protocol: No enabled targets', 'ERROR');
            return;
        }

        setTrials(newTrials);
        setCurrentTrialIdx(0);
        setProtocolMode(true);
        setGlobalRunning(true);
        addLog(`Protocol started (${newTrials.length} trials)`);
    };

    return (
        <div className="w-full flex flex-row-reverse bg-black overflow-hidden relative h-[calc(100vh-129px)]">
            {/* Main Stimulus View */}
            <div className={`flex-grow flex flex-col items-center justify-center relative transition-all duration-300 ${showSidebar ? 'pr-0' : 'pr-0'}`}>
                <SSVEPStimulus
                    configs={configs}
                    brightness={brightness}
                    refreshRate={refreshRate}
                    running={globalRunning}
                    protocolMode={protocolMode}
                    trials={trials}
                    onProtocolUpdate={(state, idx) => {
                        setProtocolState(state);
                        if (idx !== undefined) setCurrentTrialIdx(idx);
                        addLog(`Protocol State: ${state} ${idx !== undefined ? `(Trial ${idx + 1})` : ''}`);
                    }}
                    onProtocolFinished={() => {
                        setGlobalRunning(false);
                        setProtocolMode(false);
                        addLog('Protocol finished');
                    }}
                />

                {/* Grid Overlay for Labeling */}
                {!globalRunning && !protocolMode && (
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-[40px] p-[40px] pointer-events-none opacity-20">
                        {configs.map(cfg => (
                            <div key={cfg.id} className="border border-white/50 rounded-xl flex flex-col items-center justify-center relative shadow-lg bg-black/40">
                                <span className="text-[10px] font-bold text-white/50 absolute top-2 left-3">{cfg.label}</span>
                                <span className="text-4xl font-bold text-white drop-shadow-md">
                                    {cfg.mappedKey !== 'None' ? cfg.mappedKey : '-'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Left Sidebar Container (visually left via row-reverse) */}
            <div
                className={`transition-all duration-300 ease-in-out border-r border-border bg-surface/80 backdrop-blur-md flex flex-col h-full relative ${showSidebar ? 'w-80 overflow-y-auto overflow-x-hidden' : 'w-[4.5rem] overflow-visible'} [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']`}
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
                            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Signal Frequency</div>
                        </button>
                        
                        <button onClick={() => setShowSidebar(true)} title="System Activity" className="hover:text-primary transition-colors group relative">
                            <History size={20} className="text-muted group-hover:text-primary" />
                            {logs.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse blur-[1px]"></span>}
                            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">System Activity</div>
                        </button>
                        
                        <button onClick={() => setShowSidebar(true)} title="Global Actions" className="hover:text-primary transition-colors group relative">
                            {globalRunning ? <Square size={20} className="text-red-500" /> : <Play size={20} className="text-green-500" />}
                            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Global Actions</div>
                        </button>
                        
                        <button onClick={() => setShowSidebar(true)} title="Targets" className="hover:text-primary transition-colors group relative">
                            <Monitor size={20} className="text-muted group-hover:text-primary" />
                            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Targets Settings</div>
                        </button>
                        
                        <div className="flex-1" />
                        <div className="flex flex-col gap-2 w-full items-center border-t border-border pt-4 pb-4 shrink-0">
                           <button onClick={() => setShowSidebar(true)} className={`w-[42px] h-[42px] flex items-center justify-center rounded-full border transition-all shadow-sm group relative ${isConnected ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}`} title={isConnected ? "Sensor Connected" : "Sensor Disconnected"}>
                              {isConnected ? <Zap size={18} /> : <Power size={18} />}
                              <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Sensor Status</div>
                           </button>
                        </div>
                    </div>
                )}

                {/* Fixed Container */}
                <div className={`flex-grow flex flex-col overflow-hidden p-4 gap-3 font-mono transition-opacity duration-300 w-80 shrink-0 ${!showSidebar ? 'opacity-0 h-0 hidden' : 'opacity-100'}`}>

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
                            <ChevronLeft size={24} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between shrink-0 border-t border-border/50 pt-2 pb-2">
                        <h4 className="text-xs font-bold text-muted uppercase tracking-widest">Global State</h4>
                        <div className={`w-3 h-3 rounded-full animate-pulse ${globalRunning ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'}`} />
                    </div>

                    {/* Global Actions */}
                    <div className="grid grid-cols-2 gap-2 shrink-0">
                        <button
                            onClick={globalRunning ? stopFlicker : startFlicker}
                            className={`w-full py-2.5 rounded-xl text-base font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2 ${globalRunning
                                ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20'
                                : 'bg-green-500/10 border-green-500/50 text-green-500 hover:bg-green-500/20 shadow-glow'
                                }`}
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

                    {/* Config Settings */}
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

                    {/* Real-time Frequency Card - Condensed */}
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
                                    style={{ width: `${Math.min((realTimeFreq || 0) * 4, 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Debug Event Log - CHANGED from h-[100px] to flex-grow with flex-basis min height */}
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

                    {/* Removed Global Actions (moved up) */}

                    {/* Target Settings - DECREASED HEIGHT, fixed size instead of flex-grow */}
                    <div className="flex flex-col flex-1 min-h-[0] overflow-hidden border border-border/50 rounded-xl bg-bg/10">
                        <div className="p-2 border-b border-border/50 bg-bg/30 shrink-0">
                            <h4 className="text-sm font-bold text-muted uppercase tracking-widest">Targets</h4>
                        </div>
                        <div className="flex flex-col flex-grow overflow-y-auto p-2 gap-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                            {configs.map((cfg) => (
                                <div key={cfg.id} className={`p-3 rounded-xl border transition-all space-y-2 shrink-0 ${cfg.enabled ? 'bg-bg/50 border-border' : 'bg-bg/20 border-border/30 grayscale opacity-60'}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 overflow-hidden flex-grow">
                                            <button
                                                onClick={() => updateConfig(cfg.id, { enabled: !cfg.enabled })}
                                                className={`p-1.5 rounded-lg transition-all shrink-0 ${cfg.enabled ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-bg border border-border text-muted hover:border-primary/50'}`}
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
                                            >
                                                <option value="None">None</option>
                                                {MOUSE_ACTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>

            
            {/* View Toggle Button Removed - Moved inside Sidebar */}
        </div>
    );
}
