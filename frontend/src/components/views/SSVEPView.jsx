import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Play, Square, Activity, MousePointer2, Keyboard, Sun, Monitor, Power, Zap, Trash2, History, Target } from 'lucide-react';
import SSVEPStimulus from '../ssvep/SSVEPStimulus';
import { soundHandler } from '../../handlers/SoundHandler';

const COMMON_KEYS = ['None', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape', 'P', 'Q', '0', '1', '2', '3'];
const MOUSE_ACTIONS = ['None', 'Left Click', 'Right Click', 'Double Click', 'Scroll Up', 'Scroll Down'];

export default function SSVEPView({ isConnected, wsEvent }) {
    const [showTargets, setShowTargets] = useState(true);
    const [configs, setConfigs] = useState([
        { id: 0, freq: 8, label: 'Target 1', mappedKey: 'W', mappedMouse: 'None', enabled: true, controlType: 'Keyboard' },
        { id: 1, freq: 10, label: 'Target 2', mappedKey: 'A', mappedMouse: 'None', enabled: true, controlType: 'Keyboard' },
        { id: 2, freq: 12, label: 'Target 3', mappedKey: 'S', mappedMouse: 'None', enabled: true, controlType: 'Keyboard' },
        { id: 3, freq: 15, label: 'Target 4', mappedKey: 'D', mappedMouse: 'None', enabled: true, controlType: 'Keyboard' },
        { id: 4, freq: 18, label: 'Target 5', mappedKey: 'Space', mappedMouse: 'None', enabled: true, controlType: 'Keyboard' },
        { id: 5, freq: 20, label: 'Target 6', mappedKey: 'Escape', mappedMouse: 'None', enabled: true, controlType: 'Keyboard' },
    ]);

    const [brightness, setBrightness] = useState(1.0);
    const [refreshRate, setRefreshRate] = useState(60);
    const [globalRunning, setGlobalRunning] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

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

    const [lastModifiedTargetId, setLastModifiedTargetId] = useState(null);

    const updateConfig = (id, newValues) => {
        setLastModifiedTargetId(id);
        setConfigs(prev => prev.map(cfg => cfg.id === id ? { ...cfg, ...newValues } : cfg));
    };

    // --- Load Config on Mount ---
    const [isConfigLoaded, setIsConfigLoaded] = useState(false);
    useEffect(() => {
        fetch('/api/config')
            .then(res => res.json())
            .then(data => {
                const loadedTargets = data?.features?.EEG?.targets;
                if (loadedTargets && Array.isArray(loadedTargets) && loadedTargets.length > 0) {
                    // Update current defaults with loaded config while maintaining structure
                    setConfigs(prev => prev.map(p => {
                        const match = loadedTargets.find(t => t.id === p.id);
                        if (match) {
                            return { ...p, ...match };
                        }
                        return p;
                    }));
                }
            })
            .catch(err => console.error("Failed to load generic config for SSVEP", err))
            .finally(() => setIsConfigLoaded(true));
    }, []);

    useEffect(() => {
        if (!wsEvent) return;

        let freqValue = null;
        if (wsEvent.event === 'eeg_prediction' && wsEvent.frequency !== undefined) {
            freqValue = wsEvent.frequency;
        } else if (typeof wsEvent.event === 'string' && wsEvent.event.startsWith('TARGET_')) {
            const numStr = wsEvent.event.replace('TARGET_', '').replace('HZ', '').replace('_', '.');
            freqValue = parseFloat(numStr);
        } else if (wsEvent.features?.peak_freq !== undefined) {
            freqValue = wsEvent.features.peak_freq;
        }

        if (freqValue !== null) {
            setRealTimeFreq(freqValue);
        }

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

                const type = closest.controlType || 'Keyboard';
                if (type === 'Keyboard' && closest.mappedKey !== 'None') {
                    addLog(`Executing Key: ${closest.mappedKey}`, 'ACTION');
                } else if (type === 'Mouse' && closest.mappedMouse !== 'None') {
                    addLog(`Executing Mouse: ${closest.mappedMouse}`, 'ACTION');
                }
            }
        }
    }, [wsEvent, configs, addLog]);

    // --- Auto-Sync to Backend ---
    useEffect(() => {
        if (!isConfigLoaded) return;

        const syncConfig = async () => {
            setIsSyncing(true);
            try {
                const payload = {
                    features: {
                        EEG: {
                            target_freqs: configs.map(c => c.freq), // Pass all to ensure backend captures disabled ones
                            targets: configs.map(c => ({
                                ...c,
                                controlType: !c.enabled ? 'None' : (c.controlType || 'Keyboard')
                            })),
                            rest_threshold: 0.45,
                            window_len_sec: 1.0
                        }
                    }
                };

                const response = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) throw new Error('Sync failed');
            } catch (err) {
                console.error(`Sync error: ${err.message}`);
            } finally {
                setTimeout(() => setIsSyncing(false), 300); // Visual delay for spinner
            }
        };

        const timeoutId = setTimeout(syncConfig, 500); // 500ms debounce
        return () => clearTimeout(timeoutId);
    }, [configs]);

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
        <div className="w-full flex bg-black overflow-hidden relative h-[calc(100vh-129px)]">
            {/* Main Stimulus View */}
            <div className={`flex-grow flex flex-col items-center justify-center relative transition-all duration-300`}>
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

                {!globalRunning && !protocolMode && (
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-[40px] p-[40px] pointer-events-none opacity-20 text-center">
                        {configs.map(cfg => (
                            <div key={cfg.id} className="border border-white/50 rounded-2xl flex flex-col items-center justify-center relative shadow-lg bg-black/40">
                                <span className="text-[10px] font-black text-white/50 absolute top-3 left-1/2 -translate-x-1/2 uppercase tracking-widest">{cfg.label}</span>
                                <span className="text-4xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">
                                    {(cfg.controlType === 'Keyboard' ? cfg.mappedKey : cfg.mappedMouse) || '-'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Right Sidebar */}
            <div className={`transition-all duration-500 ease-in-out border-l border-border bg-surface flex flex-col h-full overflow-hidden ${showSidebar ? 'w-96 opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-full border-none'}`}>
                <div className="flex-grow flex flex-col overflow-hidden p-4 gap-3 font-mono">
                    <div className="flex items-center justify-between shrink-0">
                        <h3 className="text-[24px] font-bold text-primary flex items-center gap-2">
                            <Settings size={30} /> SSVEP SETUP
                        </h3>
                        <div className={`w-3 h-3 rounded-full ${globalRunning ? 'bg-green-500 shadow-[0_0_10px_#22c55e] animate-pulse' : 'bg-red-500'}`} />
                    </div>

                    {/* Global Settings */}
                    <div className="grid grid-rows gap-2 shrink-0 bg-bg/30 p-2 rounded-xl border border-border/80">
                        <div className="space-y-1 ">
                            <div className="flex items-center justify-between text-[16px] font-bold text-muted uppercase tracking-widest px-1">
                                <span className="flex items-center gap-1"><Sun size={20} /> Brightness</span>
                                <span className="text-primary text-[16px]">{Math.round(brightness * 100)}%</span>
                            </div>
                            <input type="range" min="0.1" max="1" step="0.05" value={brightness} onChange={(e) => setBrightness(parseFloat(e.target.value))} className="w-full accent-primary h-1 bg-bg rounded-lg appearance-none cursor-pointer" />
                        </div>
                        <div className='w-full h-[1px] bg-border/60'></div>
                        <div className="flex items-center justify-between">
                            <label className="text-[16px] font-bold text-muted uppercase tracking-widest flex items-center gap-1"><Monitor size={20} /> Refresh Rate</label>
                            <div className="flex items-center gap-1">
                                <input type="number" value={refreshRate} onChange={(e) => setRefreshRate(parseInt(e.target.value) || 60)} className="w-14 bg-bg border border-border rounded px-1 py-0.5 text-center font-bold text-primary focus:border-primary/50 outline-none text-base" />
                                <span className="text-[16px] text-muted">FPS</span>
                            </div>
                        </div>
                    </div>

                    {/* Real-time Meter */}
                    <div className="bg-bg/50 border border-border/80 rounded-xl p-2 px-3 flex items-center justify-between shrink-0">
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold text-muted uppercase tracking-widest flex items-center gap-1 mb-1"><Activity size={20} className="text-primary" /> Signal</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black text-primary tabular-nums">{realTimeFreq ? realTimeFreq.toFixed(2) : '0.00'}</span>
                                <span className="text-[18px] font-bold text-muted">Hz</span>
                            </div>
                        </div>
                        <div className="w-3/5 flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary animate-pulse" /><span className="text-[16px] font-bold text-primary/70">LIVE</span></div>
                            <div className="w-full mt-2 h-1 bg-bg rounded-full overflow-hidden"><div className="h-full bg-primary transition-all duration-300" style={{ width: `${Math.min((realTimeFreq || 0) * 4, 100)}%` }} /></div>
                        </div>
                    </div>

                    {/* Log Container */}
                    <div className={`flex flex-col border border-border/80 rounded-xl bg-bg/20 p-2 shrink-0 overflow-hidden transition-all duration-300 ${!showTargets ? 'flex-grow min-h-[200px]' : 'flex-none h-[110px]'}`}>
                        <div className="flex items-center justify-between mb-1 pb-1 border-b border-border/60 shrink-0">
                            <h4 className="text-[16px] font-bold text-muted uppercase tracking-widest flex items-center gap-1"><History size={20} /> System Activity</h4>
                            <button onClick={() => setLogs([])} className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded text-muted transition-colors"><Trash2 size={20} /></button>
                        </div>
                        <div className="flex-grow overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                            {logs.length === 0 ? <div className="text-[16px] text-muted italic text-center py-1">No activity...</div> : logs.slice().reverse().map(log => (
                                <div key={log.id} className="text-sm border-b border-border/40 pb-1 flex items-start gap-1 group">
                                    <span className="text-muted/50 tabular-nums shrink-0">{log.time}</span>
                                    <div className="flex-grow flex items-center gap-1 min-w-0">
                                        {log.type === 'DETECTION' && <Zap size={14} className="text-yellow-500 shrink-0" />}
                                        <span className={log.type === 'DETECTION' ? 'text-primary font-bold' : 'text-text/70'}>{log.message}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-4 shrink-0 py-2">
                        <button
                            onClick={globalRunning ? stopFlicker : startFlicker}
                            className={`w-full py-3 rounded-[12px] text-sm font-bold uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 border ${globalRunning
                                ? 'bg-red-900/20 border-red-500/50 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:bg-red-900/40 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                                : 'bg-[#1b2f21]/60 border-[#22c55e]/40 text-[#4ade80] shadow-[0_0_15px_rgba(34,197,94,0.15)] hover:bg-[#1b2f21] hover:border-[#22c55e]/60 hover:shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                                }`}
                        >
                            {globalRunning ? <><Square size={16} /> Stop</> : <><Play size={16} /> Start</>}
                        </button>
                        <button
                            onClick={runProtocol}
                            className="w-full py-3 rounded-[12px] text-sm font-bold uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 border bg-[#362f1c]/60 border-[#eab308]/40 text-[#fde047] shadow-[0_0_15px_rgba(234,179,8,0.15)] hover:bg-[#362f1c] hover:border-[#eab308]/60 hover:shadow-[0_0_20px_rgba(234,179,8,0.3)]"
                        >
                            <Zap size={16} /> Protocol
                        </button>
                    </div>

                    {/* Targets List */}
                    <div
                        className="p-2 border-b border-border/50 bg-bg/30 shrink-0 flex items-center justify-between cursor-pointer hover:bg-bg/50 transition-colors"
                        onClick={() => setShowTargets(!showTargets)}
                        title={showTargets ? "Hide Targets" : "Show Targets"}
                    >
                        <h4 className="text-sm font-bold text-muted uppercase tracking-widest px-1 flex items-center gap-2">
                            Targets
                        </h4>
                        <div className="flex items-center gap-2">
                            <span className="text-[16px] font-bold text-primary/60">{configs.filter(c => c.enabled).length} ACTIVE</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-muted transition-transform duration-300 ${showTargets ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
                        </div>
                    </div>
                    <div className="flex flex-col flex-grow overflow-y-auto p-2 gap-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {!showTargets ? (
                            <div className="space-y-0 mt-1">
                                {configs.map(cfg => (
                                    <div key={cfg.id} className={`flex items-center justify-between px-2 py-2.5 hover:bg-bg/40 rounded transition-colors group ${!cfg.enabled && 'grayscale opacity-50'}`}>
                                        <div className="flex items-center gap-2 w-5/12 overflow-hidden">
                                            <Target size={16} className={cfg.enabled ? 'text-primary' : 'text-muted/50'} />
                                            <span className="text-sm font-bold truncate text-muted group-hover:text-text transition-colors">{cfg.label}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 justify-center w-3/12 relative">
                                            <Activity size={14} className="text-primary/70" />
                                            <span className="text-[13px] font-black text-primary font-mono">{cfg.freq}Hz</span>
                                            {isSyncing && lastModifiedTargetId === cfg.id && (
                                                <span className="absolute -right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_5px_currentColor]" />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 justify-end w-4/12">
                                            {!cfg.enabled ? <Power size={14} className="text-muted/50" /> : (cfg.controlType === 'Keyboard' ? <Keyboard size={14} className="text-muted/70" /> : <MousePointer2 size={14} className="text-muted/70" />)}
                                            <span className={`text-xs font-bold uppercase tracking-widest truncate ${cfg.enabled ? 'text-text' : 'text-muted/50'}`}>
                                                {!cfg.enabled ? 'OFF' : (cfg.controlType === 'Keyboard' ? cfg.mappedKey : cfg.mappedMouse)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            configs.map((cfg) => {
                                const isMouse = cfg.controlType === 'Mouse';
                                return (
                                    <div key={cfg.id} className={`p-3 rounded-xl border transition-all space-y-2 shrink-0 transform-gpu ${cfg.enabled ? 'bg-bg/50 border-border' : 'bg-bg/20 border-border/30 grayscale opacity-60'}`}>
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

                                        {/* Mapping Selection & Mode Toggle */}
                                        <div className="flex items-center justify-between pt-1 border-t border-border/10">
                                            <div className="flex items-center gap-2 flex-grow">
                                                <span className={`text-[10px] font-bold uppercase tracking-tight ${!isMouse ? 'text-primary' : 'text-muted'}`}>Key</span>
                                                <button
                                                    onClick={() => updateConfig(cfg.id, { controlType: isMouse ? 'Keyboard' : 'Mouse' })}
                                                    className={`w-8 h-4 shrink-0 rounded-full flex items-center transition-colors border-2 border-border ${isMouse ? 'bg-primary' : 'bg-bg'}`}
                                                    disabled={!cfg.enabled}
                                                >
                                                    <div className={`h-2.5 w-2.5 rounded-full bg-text shadow transition-transform duration-200 ${isMouse ? 'translate-x-[16px]' : 'translate-x-[2px]'}`} />
                                                </button>
                                                <span className={`text-[10px] font-bold uppercase tracking-tight ${isMouse ? 'text-primary' : 'text-muted'}`}>Mouse</span>
                                            </div>

                                            <div className="w-1/2">
                                                {!isMouse ? (
                                                    <select
                                                        className="w-full bg-bg border border-border rounded px-2 py-1 text-xs font-bold text-text outline-none focus:border-primary/50"
                                                        value={cfg.mappedKey || 'None'}
                                                        onChange={(e) => updateConfig(cfg.id, { mappedKey: e.target.value })}
                                                        disabled={!cfg.enabled}
                                                    >
                                                        {COMMON_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                                                    </select>
                                                ) : (
                                                    <select
                                                        className="w-full bg-bg border border-border rounded px-2 py-1 text-xs font-bold text-text outline-none focus:border-primary/50"
                                                        value={cfg.mappedMouse || 'None'}
                                                        onChange={(e) => updateConfig(cfg.id, { mappedMouse: e.target.value })}
                                                        disabled={!cfg.enabled}
                                                    >
                                                        {MOUSE_ACTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                                                    </select>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }))}
                    </div>
                </div>
            </div>

            {/* View Toggle */}
            <button onClick={() => setShowSidebar(!showSidebar)} className={`absolute top-4 right-4 z-50 p-2 rounded-full border border-primary/20 bg-bg/80 backdrop-blur-md shadow-glow hover:bg-primary/10 transition-all ${!showSidebar ? 'rotate-180' : ''}`} title={showSidebar ? "Hide" : "Show"}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M9 18l6-6-6-6" /></svg>
            </button>
        </div>
    );
}
