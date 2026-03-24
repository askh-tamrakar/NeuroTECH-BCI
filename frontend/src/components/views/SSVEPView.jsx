import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Play, Square, Activity, MousePointer2, Keyboard, Sun, Monitor, Power, Zap, Trash2, History, Target, Menu, ChevronLeft, ChevronUp, ChevronDown } from 'lucide-react';
import SSVEPStimulus from '../ssvep/Stimulus';
import { soundHandler } from '../../handlers/SoundHandler';
import CustomNumberInput from '../ui/CustomNumberInput';
import CustomSelect from '../ui/CustomSelect';
import { CalibrationApi } from '../../services/calibrationApi';

const COMMON_KEYS = ['None', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape', 'P', 'Q', '0', '1', '2', '3'];
const MOUSE_ACTIONS = ['None', 'Left Click', 'Right Click', 'Double Click', 'Scroll Up', 'Scroll Down'];
const TARGET_DIVISORS = [18, 16, 12, 10, 9, 8];

function buildDynamicTargets(refreshRate, previousConfigs = []) {
    return TARGET_DIVISORS.map((divisor, index) => {
        const previous = previousConfigs[index] || {};
        const frequency = Number((refreshRate / divisor).toFixed(2));
        return {
            id: previous.id ?? index,
            freq: frequency,
            label: previous.label || `Target ${index + 1}`,
            mappedKey: previous.mappedKey || ['W', 'A', 'S', 'D', 'Space', 'Escape'][index] || 'None',
            mappedMouse: previous.mappedMouse || 'None',
            enabled: previous.enabled !== false,
            controlType: previous.controlType || 'Keyboard',
            divisor,
            source: 'dynamic',
        };
    });
}

export default function SSVEPView({ isConnected, wsEvent }) {
    const [showTargets, setShowTargets] = useState(true);
    const [brightness, setBrightness] = useState(() => {
        const stored = localStorage.getItem('ssvep_brightness');
        return stored ? parseFloat(stored) : 1.0;
    });
    const [refreshRate, setRefreshRate] = useState(() => {
        const stored = localStorage.getItem('ssvep_refreshRate');
        return stored ? parseInt(stored, 10) : 144;
    });
    const [configs, setConfigs] = useState(() => buildDynamicTargets(refreshRate));
    const refreshDetectedRef = useRef(false);

    useEffect(() => {
        localStorage.setItem('ssvep_brightness', brightness);
    }, [brightness]);

    useEffect(() => {
        localStorage.setItem('ssvep_refreshRate', refreshRate);
    }, [refreshRate]);

    useEffect(() => {
        let frameId = null;
        let cancelled = false;
        const samples = [];
        let lastTs = null;

        const tick = (ts) => {
            if (cancelled || refreshDetectedRef.current) return;
            if (lastTs !== null) {
                samples.push(ts - lastTs);
            }
            lastTs = ts;

            if (samples.length >= 30) {
                const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
                const estimated = Math.round(1000 / average);
                if (estimated >= 50 && estimated <= 360) {
                    refreshDetectedRef.current = true;
                    setRefreshRate(prev => Math.abs(prev - estimated) > 1 ? estimated : prev);
                }
                return;
            }

            frameId = requestAnimationFrame(tick);
        };

        frameId = requestAnimationFrame(tick);
        return () => {
            cancelled = true;
            if (frameId) cancelAnimationFrame(frameId);
        };
    }, []);

    useEffect(() => {
        setConfigs(prev => buildDynamicTargets(refreshRate, prev));
    }, [refreshRate]);

    const [globalRunning, setGlobalRunning] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // --- UI & Logging State ---
    const [openDropdownId, setOpenDropdownId] = useState(null);
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
                const eeg = data?.features?.EEG;
                if (eeg) {
                    let newRefRate = refreshRate;
                    if (eeg.refresh_rate) {
                        newRefRate = eeg.refresh_rate;
                        setRefreshRate(newRefRate);
                        localStorage.setItem('ssvep_refreshRate', newRefRate);
                    }
                    if (eeg.targets && Array.isArray(eeg.targets) && eeg.targets.length > 0) {
                        setConfigs(prev => buildDynamicTargets(newRefRate, eeg.targets));
                    }
                }
            })
            .catch(err => console.error("Failed to load generic config for SSVEP", err))
            .finally(() => setIsConfigLoaded(true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

                const mode = closest.controlType || 'Keyboard';
                if (mode === 'Keyboard' && closest.mappedKey && closest.mappedKey !== 'None') {
                    addLog(`Executing Key: ${closest.mappedKey}`, 'ACTION');
                } else if (mode === 'Mouse' && closest.mappedMouse && closest.mappedMouse !== 'None') {
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
                            rest_threshold: 0.6,
                            ratio_threshold: 1.2,
                            classifier: 'lda',
                            num_harmonics: 4,
                            window_len_sec: 1.5,
                            step_sec: 0.25,
                            smoothing_windows: 7,
                            refresh_rate: refreshRate
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
    }, [configs, refreshRate, isConfigLoaded]);

    // --- Controls ---
    const startFlicker = () => {
        setProtocolMode(false);
        setGlobalRunning(true);
        CalibrationApi.togglePrediction('EEG', true).catch(err => console.error('EEG prediction start failed:', err));
        addLog('Manual simulation started');
    };

    const stopFlicker = () => {
        setGlobalRunning(false);
        setProtocolMode(false);
        CalibrationApi.togglePrediction('EEG', false).catch(err => console.error('EEG prediction stop failed:', err));
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
        CalibrationApi.togglePrediction('EEG', true).catch(err => console.error('EEG prediction start failed:', err));
        addLog(`Protocol started (${newTrials.length} trials)`);
    };

    useEffect(() => {
        return () => {
            CalibrationApi.togglePrediction('EEG', false).catch(() => { });
        };
    }, []);

    return (
        <div className="w-full flex bg-black overflow-hidden relative h-[calc(100vh-129px)]">
            {/* Main Stimulus View */}
            <div className={`flex-grow flex flex-col items-center justify-center relative transition-all duration-300 ${showSidebar ? 'ml-80' : 'ml-[4.5rem]'}`}>
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
                        CalibrationApi.togglePrediction('EEG', false).catch(err => console.error('EEG prediction stop failed:', err));
                        addLog('Protocol finished');
                    }}
                />

                {!globalRunning && !protocolMode && (
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-[40px] p-[40px] pointer-events-none opacity-20">
                        {configs.map(cfg => (
                            <div key={cfg.id} className="border border-white/50 rounded-xl flex flex-col items-center justify-center relative shadow-lg bg-black/40">
                                <span className="text-[10px] font-bold text-white/50 absolute top-2 left-3">{cfg.label}</span>
                                <span className="text-4xl font-bold text-white drop-shadow-md">
                                    {(cfg.controlType || 'Keyboard') === 'Mouse'
                                        ? (cfg.mappedMouse !== 'None' ? cfg.mappedMouse : '-')
                                        : (cfg.mappedKey !== 'None' ? cfg.mappedKey : '-')}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Left Sidebar */}
            <div
                className={`absolute left-0 top-0 bottom-0 z-10 transition-all duration-300 ease-in-out border-r border-border bg-surface/80 backdrop-blur-md flex flex-col h-full ${showSidebar ? 'w-80 overflow-y-auto overflow-x-hidden' : 'w-[4.25rem] overflow-visible'} [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']`}
            >
                {/* Collapsed Icons Only State */}
                {!showSidebar && (
                    <div className="flex flex-col items-center justify-around py-3 w-full animate-fade-in shrink-0 h-full overflow-visible">
                        <button
                            onClick={() => setShowSidebar(true)}
                            className=" hover:bg-white/10 rounded-full transition-colors"
                            title="Expand Sidebar"
                        >
                            <Menu size={34} className="text-primary" />
                        </button>

                        <div className="w-full h-px bg-border/80 shrink-0" />

                        <div className="flex flex-col items-center cursor-default group relative w-full" title="Signal Frequency">
                            <Activity size={28} className="text-primary" />
                            <span className="text-[20px] font-black tabular-nums mt-1 text-primary">{realTimeFreq ? realTimeFreq.toFixed(1) : '0.0'}</span>
                            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-1.5 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Live Signal (Hz)</div>
                        </div>

                        <button onClick={() => setShowSidebar(true)} title="System Activity" className="hover:text-primary transition-colors group relative">
                            <History size={28} className="text-muted group-hover:text-primary" />
                            {logs.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse blur-[1px]"></span>}
                            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">System Activity Logs</div>
                        </button>

                        <div className="w-full h-px bg-border/80 shrink-0" />

                        <button onClick={globalRunning ? stopFlicker : startFlicker} title="Start/Stop Manual Simulation" className={`transition-colors group relative p-2 rounded-full ${globalRunning ? 'text-red-500 hover:bg-red-500/20' : 'text-green-500 hover:bg-green-500/20'}`}>
                            {globalRunning ? <Square size={28} /> : <Play size={28} />}
                            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-1.5 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">{globalRunning ? "Stop Simulation" : "Start Simulation"}</div>
                        </button>

                        {!globalRunning && (
                            <button onClick={runProtocol} title="Run Protocol" className="transition-colors group relative p-2 rounded-full text-primary hover:bg-primary/20">
                                <Zap size={28} />
                                <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Run Protocol</div>
                            </button>
                        )}

                        <div className="w-full h-px bg-border/80 shrink-0" />

                        <button onClick={() => setShowSidebar(true)} title="Targets Settings" className="hover:text-primary transition-colors group relative">
                            <Monitor size={28} className="text-muted group-hover:text-primary" />
                            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Targets Settings</div>
                        </button>

                        {configs.filter(c => c.enabled).map((cfg) => (
                            <div key={cfg.id} className="flex flex-col items-center group relative cursor-help" title={cfg.label}>
                                <Target size={28} className="text-primary/70 mb-1 group-hover:text-primary transition-colors" />
                                <span className="text-[18px] font-black text-text/80 group-hover:text-primary">{cfg.freq}</span>
                                <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">{cfg.label} ({cfg.freq}Hz)</div>
                            </div>
                        ))}

                        <div className="w-full h-px bg-border/80 shrink-0" />

                        <div className="flex flex-col w-full items-center shrink-0">
                            <button className={`w-[42px] h-[42px] flex items-center justify-center rounded-full border transition-all cursor-default shadow-sm group relative ${isConnected ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}`} title={isConnected ? "Sensor Connected" : "Sensor Disconnected"}>
                                {isConnected ? <Zap size={28} /> : <Power size={28} />}
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

                    {/* Global Settings */}
                    <div className="flex flex-col gap-4 shrink-0 bg-bg/30 p-3 rounded-xl border border-border/50">
                        {/* Brightness */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-base font-bold text-muted uppercase tracking-widest">
                                <span className="flex items-center gap-2"><Sun size={20} /> Brightness</span>
                                <span className="text-primary text-xl">{Math.round(brightness * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.05"
                                value={brightness}
                                onChange={(e) => setBrightness(parseFloat(e.target.value))}
                                className="w-full accent-primary cursor-pointer"
                            />
                        </div>

                        {/* Refresh Rate */}
                        <div className="flex items-center justify-between border-t border-border/30 pt-3">
                            <label className="text-base font-bold text-muted uppercase tracking-widest flex items-center gap-2">
                                <Monitor size={20} /> Refresh Rate
                            </label>
                            <div className="flex items-center">
                                <CustomNumberInput
                                    value={refreshRate}
                                    onChange={setRefreshRate}
                                    min={1}
                                    max={500}
                                    step={1}
                                    className="w-[6.5rem] !h-[2.25rem] !text-lg"
                                    unit="FPS"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Real-time Meter */}
                    <div className="bg-bg/50 border border-primary/20 rounded-xl p-3 flex items-center justify-between shrink-0">
                        <div className="flex flex-col">
                            <span className="text-base font-bold text-muted uppercase tracking-widest flex items-center gap-2 mb-1">
                                <Activity size={20} className="text-primary" /> Signal
                            </span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-black text-primary tabular-nums">
                                    {realTimeFreq ? realTimeFreq.toFixed(2) : '0.00'}
                                </span>
                                <span className="text-lg font-bold text-muted">Hz</span>
                            </div>
                        </div>
                        <div className="w-1/2 flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_var(--primary)]" />
                                <span className="text-sm font-bold text-primary/80">LIVE</span>
                            </div>
                            <div className="w-full mt-2 h-1 bg-bg rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-300 shadow-[0_0_8px_var(--primary)]"
                                    style={{ width: `${Math.min((realTimeFreq || 0) * 4, 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Targets List */}
                    <div className="flex flex-col shrink-0 overflow-hidden border border-primary/40 rounded-xl bg-bg/20 backdrop-blur-sm">
                        <div className="p-3 border-b border-primary/20 bg-bg/40 shrink-0 flex items-center justify-between cursor-pointer hover:bg-bg/60 transition-colors" onClick={() => setShowTargets(!showTargets)}>
                            <h4 className="text-base font-black text-primary/80 uppercase tracking-widest">Targets</h4>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black tracking-wider text-primary">{configs.filter(c => c.enabled).length} ACTIVE</span>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-primary transition-transform duration-300 ${!showTargets ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
                            </div>
                        </div>
                        <div className="flex flex-col p-2 gap-2">
                            {!showTargets ? (
                                <div className="space-y-1">
                                    {configs.map(cfg => (
                                        <div key={cfg.id} className={`flex items-center justify-between px-3 py-3 relative hover:bg-white/5 rounded-lg transition-colors group ${!cfg.enabled && 'grayscale opacity-50'}`}>
                                            <div className="flex items-center gap-3 w-5/12 overflow-hidden">
                                                <Target size={16} strokeWidth={2.5} className={cfg.enabled ? 'text-primary' : 'text-muted/50'} />
                                                <span className="text-[13px] font-bold truncate text-text/80 group-hover:text-text transition-colors">{cfg.label}</span>
                                            </div>
                                            {isSyncing && lastModifiedTargetId === cfg.id ? (
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_5px_currentColor] shrink-0" />
                                            ) : <span className="w-1.5 h-1.5 shrink-0" />}
                                            <div className="flex items-center gap-1.5 justify-center w-3/12 relative">
                                                <Activity size={14} className="text-primary/80" />
                                                <span className="text-[13px] font-black text-primary font-mono tracking-tight">{cfg.freq}Hz</span>
                                            </div>
                                            <div className="flex items-center gap-2 justify-end w-4/12">
                                                {!cfg.enabled ? <Power size={14} className="text-muted/50" /> : (cfg.controlType === 'Keyboard' ? <Keyboard size={14} className="text-muted/60" /> : <MousePointer2 size={14} className="text-muted/60" />)}
                                                <span className={`text-[13px] font-bold uppercase tracking-widest truncate ${cfg.enabled ? 'text-text' : 'text-muted/50'}`}>
                                                    {!cfg.enabled ? 'OFF' : (cfg.controlType === 'Keyboard' ? cfg.mappedKey : cfg.mappedMouse)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                configs.map((cfg, index) => {
                                    const isMouse = cfg.controlType === 'Mouse';
                                    return (
                                        <div key={cfg.id} className={`p-3 rounded-xl border transition-all space-y-2 shrink-0 relative transform-gpu ${cfg.enabled ? 'bg-bg/50 border-border' : 'bg-bg/20 border-border/30 grayscale opacity-60'}`} style={{ zIndex: openDropdownId === cfg.id ? 100 : 50 - index }}>
                                            <div className="flex items-center justify-between gap-1">
                                                <div className="flex items-center gap-2 overflow-hidden flex-grow">
                                                    <button
                                                        onClick={() => updateConfig(cfg.id, { enabled: !cfg.enabled })}
                                                        className={`p-1.5 rounded-[6px] transition-all shrink-0 ${cfg.enabled ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-bg border border-border text-muted hover:border-primary/50'}`}
                                                        title={cfg.enabled ? "Disable Target" : "Enable Target"}
                                                    >
                                                        <Power size={14} />
                                                    </button>
                                                    <input
                                                        className="bg-transparent font-bold text-base outline-none focus:text-primary transition-colors w-full"
                                                        value={cfg.label}
                                                        onChange={(e) => updateConfig(cfg.id, { label: e.target.value })}
                                                    />
                                                </div>

                                                {isSyncing && lastModifiedTargetId === cfg.id ? (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_5px_currentColor] shrink-0 mx-1" />
                                                ) : <span className="w-1.5 h-1.5 shrink-0 mx-1" />}

                                                <div className="flex items-center gap-2 shrink-0 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1">
                                                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary/70">{refreshRate}/{cfg.divisor}</span>
                                                    <span className="text-sm font-black text-primary">{cfg.freq}Hz</span>
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

                                                <div className="w-7/12">
                                                    {!isMouse ? (
                                                        <CustomSelect
                                                            options={COMMON_KEYS}
                                                            value={cfg.mappedKey || 'None'}
                                                            onChange={(val) => updateConfig(cfg.id, { mappedKey: val })}
                                                            disabled={!cfg.enabled}
                                                            triggerClassName="!px-2 !py-0.5 !h-[1.75rem] !text-xs !font-bold !rounded-[6px]"
                                                            direction={index >= 4 ? "up" : "down"}
                                                            onOpenChange={(isOpen) => setOpenDropdownId(isOpen ? cfg.id : null)}
                                                        />
                                                    ) : (
                                                        <CustomSelect
                                                            options={MOUSE_ACTIONS}
                                                            value={cfg.mappedMouse || 'None'}
                                                            onChange={(val) => updateConfig(cfg.id, { mappedMouse: val })}
                                                            disabled={!cfg.enabled}
                                                            triggerClassName="!px-2 !py-0.5 !h-[1.75rem] !text-xs !font-bold !rounded-[6px]"
                                                            direction={index >= 4 ? "up" : "down"}
                                                            onOpenChange={(isOpen) => setOpenDropdownId(isOpen ? cfg.id : null)}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {/* Debug Event Log */}
                    <div className="flex flex-col h-[420px] shrink-0 overflow-hidden border border-border/50 rounded-xl bg-bg/20 p-3">
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/30 shrink-0">
                            <h4 className="text-base font-bold text-muted uppercase tracking-widest flex items-center gap-2">
                                <History size={20} /> System Activity
                            </h4>
                            <button
                                onClick={() => setLogs([])}
                                className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded text-muted transition-colors"
                                title="Clear Logs"
                            >
                                <Trash2 size={20} />
                            </button>
                        </div>

                        <div className="flex-grow overflow-y-auto space-y-1.5 pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-primary/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-primary/40">
                            {logs.length === 0 ? (
                                <div className="text-base text-muted italic text-center py-2">No activity...</div>
                            ) : (
                                logs.slice().reverse().map((log) => (
                                    <div key={log.id} className="p-2.5 rounded-xl border border-border/40 bg-bg/40 flex items-center gap-3 transition-colors hover:bg-bg/60 group">
                                        <div className="flex flex-col items-center justify-center shrink-0 w-12 border-r border-border/30 pr-2">
                                            {log.type === 'DETECTION' ? <Zap size={18} className="text-primary mb-1" /> : (log.type === 'ERROR' ? <Power size={18} className="text-red-500 mb-1" /> : <Activity size={18} className="text-muted/70 mb-1" />)}
                                            <span className="text-[10px] font-mono text-muted/50 font-bold uppercase tracking-tighter truncate w-full text-center">{log.time}</span>
                                        </div>
                                        <div className="flex-grow flex items-center">
                                            <span className={`text-[15px] ${log.type === 'ERROR' ? 'text-red-400 font-bold' : (log.type === 'DETECTION' ? 'text-primary font-bold' : 'text-text/80 font-medium')}`}>
                                                {log.message}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
