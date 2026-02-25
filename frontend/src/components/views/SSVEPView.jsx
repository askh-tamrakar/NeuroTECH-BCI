import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Play, Square, Activity, MousePointer2, Keyboard, Sun, Monitor, Power, Zap, Trash2, History } from 'lucide-react';
import SSVEPStimulus from './ssvep/SSVEPStimulus';
import { soundHandler } from '../../handlers/SoundHandler';

const COMMON_KEYS = ['W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape'];
const MOUSE_ACTIONS = ['Left Click', 'Right Click', 'Double Click'];

export default function SSVEPView({ wsData, wsEvent }) {
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

        let detectedFreq = 0;
        if (wsEvent.frequency) {
            detectedFreq = wsEvent.frequency;
        } else if (wsEvent.event && !isNaN(parseFloat(wsEvent.event))) {
            detectedFreq = parseFloat(wsEvent.event);
        } else if (wsEvent.features && wsEvent.features.peak_freq) {
            detectedFreq = wsEvent.features.peak_freq;
        }

        if (detectedFreq > 0) {
            setRealTimeFreq(detectedFreq);
        }

        if (wsEvent.event === 'DETECTION' || detectedFreq > 0) {
            const closest = configs.reduce((prev, curr) => {
                return Math.abs(curr.freq - detectedFreq) < Math.abs(prev.freq - detectedFreq) ? curr : prev;
            });

            if (Math.abs(closest.freq - detectedFreq) < 0.5) {
                const msg = `Detected ${detectedFreq.toFixed(1)}Hz -> ${closest.label}`;
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
        <div className="w-full h-full flex bg-black overflow-hidden relative">
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

            {/* Right Sidebar Container */}
            <div
                className={`transition-all duration-500 ease-in-out border-l border-border bg-surface flex flex-col h-full overflow-hidden ${showSidebar ? 'w-96 opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-full border-none'
                    }`}
            >
                {/* Fixed Container */}
                <div className="flex-grow flex flex-col overflow-hidden p-4 gap-3 font-mono">

                    {/* Header */}
                    <div className="flex items-center justify-between shrink-0">
                        <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                            <Settings size={20} /> SSVEP SETUP
                        </h3>
                        <div className={`w-3 h-3 rounded-full animate-pulse ${globalRunning ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'}`} />
                    </div>

                    {/* Config Settings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0 bg-bg/30 p-3 rounded-xl border border-border/50">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-bold text-muted uppercase tracking-widest">
                                <span className="flex items-center gap-1"><Sun size={12} /> Brightness</span>
                                <span className="text-primary">{Math.round(brightness * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.05"
                                value={brightness}
                                onChange={(e) => setBrightness(parseFloat(e.target.value))}
                                className="w-full accent-primary h-1 bg-bg rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-muted uppercase tracking-widest flex items-center gap-1">
                                <Monitor size={12} /> Refresh Rate
                            </label>
                            <div className="flex items-center gap-1">
                                <input
                                    type="number"
                                    value={refreshRate}
                                    onChange={(e) => setRefreshRate(parseInt(e.target.value) || 60)}
                                    className="w-12 bg-bg border border-border rounded px-1 py-0.5 text-center font-bold text-primary focus:border-primary/50 outline-none"
                                />
                                <span className="text-[10px] text-muted">FPS</span>
                            </div>
                        </div>
                    </div>

                    {/* Real-time Frequency Card - Condensed */}
                    <div className="bg-bg/50 border border-primary/20 rounded-xl p-3 flex items-center justify-between shrink-0">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-muted uppercase tracking-widest flex items-center gap-1 mb-1">
                                <Activity size={12} className="text-primary" /> Signal
                            </span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-black text-primary tabular-nums">
                                    {realTimeFreq ? realTimeFreq.toFixed(2) : '0.00'}
                                </span>
                                <span className="text-xs font-bold text-muted">Hz</span>
                            </div>
                        </div>
                        <div className="w-1/2 flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                <span className="text-[8px] text-primary/70">LIVE</span>
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
                    <div className="flex flex-col flex-1 min-h-[150px] border border-border/50 rounded-xl bg-bg/20 p-2 shrink-0">
                        <div className="flex items-center justify-between mb-1 pb-1 border-b border-border/30 shrink-0">
                            <h4 className="text-[10px] font-bold text-muted uppercase tracking-widest flex items-center gap-1">
                                <History size={12} /> System Activity
                            </h4>
                            <button
                                onClick={() => setLogs([])}
                                className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded text-muted transition-colors"
                                title="Clear Logs"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>

                        <div className="flex-grow overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-primary/20 hover:scrollbar-thumb-primary/40">
                            {logs.length === 0 ? (
                                <div className="text-[10px] text-muted italic text-center py-2">No activity...</div>
                            ) : (
                                logs.slice().reverse().map((log) => (
                                    <div key={log.id} className="text-[10px] border-b border-border/10 pb-0.5 flex items-start gap-1 group">
                                        <span className="text-muted/50 tabular-nums shrink-0">{log.time}</span>
                                        <div className="flex-grow flex items-center gap-1">
                                            {log.type === 'DETECTION' && <Zap size={10} className="text-yellow-500 shrink-0" />}
                                            <span className={log.type === 'DETECTION' ? 'text-primary font-bold' : 'text-text/70'}>
                                                {log.message}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Global Actions */}
                    <div className="grid grid-cols-2 gap-2 shrink-0">
                        <button
                            onClick={globalRunning ? stopFlicker : startFlicker}
                            className={`w-full py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2 ${globalRunning
                                ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20'
                                : 'bg-green-500/10 border-green-500/50 text-green-500 hover:bg-green-500/20 shadow-glow'
                                }`}
                        >
                            {globalRunning ? <><Square size={14} /> Stop</> : <><Play size={14} /> Start</>}
                        </button>

                        {!globalRunning && (
                            <button
                                onClick={runProtocol}
                                className="w-full py-2 bg-primary/10 border-2 border-primary/50 text-primary rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-primary/20 transition-all flex items-center justify-center gap-2"
                            >
                                <Zap size={14} /> Protocol
                            </button>
                        )}
                    </div>

                    {/* Target Settings - DECREASED HEIGHT, fixed size instead of flex-grow */}
                    <div className="flex flex-col h-[180px] shrink-0 overflow-hidden border border-border/50 rounded-xl bg-bg/10">
                        <div className="p-2 border-b border-border/50 bg-bg/30 shrink-0">
                            <h4 className="text-[10px] font-bold text-muted uppercase tracking-widest">Targets</h4>
                        </div>
                        <div className="flex flex-col flex-grow overflow-y-auto p-2 gap-2 scrollbar-thin scrollbar-thumb-primary/20">
                            {configs.map((cfg) => (
                                <div key={cfg.id} className={`p-3 rounded-xl border transition-all space-y-2 shrink-0 ${cfg.enabled ? 'bg-bg/50 border-border' : 'bg-bg/20 border-border/30 grayscale opacity-60'}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 overflow-hidden flex-grow">
                                            <button
                                                onClick={() => updateConfig(cfg.id, { enabled: !cfg.enabled })}
                                                className={`p-1.5 rounded-lg transition-all shrink-0 ${cfg.enabled ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-bg border border-border text-muted hover:border-primary/50'}`}
                                                title={cfg.enabled ? "Disable Target" : "Enable Target"}
                                            >
                                                <Power size={12} />
                                            </button>
                                            <input
                                                className="bg-transparent font-bold text-sm outline-none focus:text-primary transition-colors w-full"
                                                value={cfg.label}
                                                onChange={(e) => updateConfig(cfg.id, { label: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <input
                                                type="number"
                                                value={cfg.freq}
                                                onChange={(e) => updateConfig(cfg.id, { freq: parseFloat(e.target.value) || 0 })}
                                                className="w-14 bg-bg border border-border rounded px-2 py-0.5 text-center text-primary font-bold focus:border-primary/50 outline-none"
                                            />
                                            <span className="text-[10px] text-muted">Hz</span>
                                        </div>
                                    </div>

                                    {/* Mapping Selection */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase text-muted flex items-center gap-1"><Keyboard size={10} /> Key</label>
                                            <select
                                                className="w-full bg-bg border border-border rounded px-1 py-1 text-[10px] outline-none focus:border-primary/50"
                                                value={cfg.mappedKey || 'None'}
                                                onChange={(e) => updateConfig(cfg.id, { mappedKey: e.target.value })}
                                            >
                                                <option value="None">None</option>
                                                {COMMON_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase text-muted flex items-center gap-1"><MousePointer2 size={10} /> Mouse</label>
                                            <select
                                                className="w-full bg-bg border border-border rounded px-1 py-1 text-[10px] outline-none focus:border-primary/50"
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

            {/* View Toggle Button */}
            <button
                onClick={() => setShowSidebar(!showSidebar)}
                className={`absolute top-4 right-4 z-50 p-2.5 rounded-full border border-primary/20 bg-surface/80 backdrop-blur-md shadow-glow hover:bg-primary/10 transition-all ${!showSidebar ? 'rotate-180' : ''
                    }`}
                title={showSidebar ? "Hide Controls" : "Show Controls"}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                    <path d="M9 18l6-6-6-6" />
                </svg>
            </button>
        </div>
    );
}
