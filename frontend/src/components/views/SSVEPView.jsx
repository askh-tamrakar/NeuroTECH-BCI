<<<<<<< HEAD
import React, { useState, useEffect, useRef, useCallback } from 'react';

// ==========================================
// SSVEP STIMULATION VIEW
// ==========================================
// Features:
// - High-precision timing using requestAnimationFrame
// - Direct DOM manipulation for performance (bypassing React render loop for flicker)
// - 3x2 Grid layout
// - Photodiode sync marker
// - Experiment protocol support
// - VSync / Monitor Refresh Lock support (Frame Counting)
// - Theme Aware (Uses CSS Variables)

export default function SSVEPView() {
    // --- Configuration State ---
    const [configs, setConfigs] = useState([
        { id: 0, freq: 8, label: 'Target 1' },
        { id: 1, freq: 10, label: 'Target 2' },
        { id: 2, freq: 12, label: 'Target 3' },
        { id: 3, freq: 15, label: 'Target 4' },
        { id: 4, freq: 18, label: 'Target 5' },
        { id: 5, freq: 20, label: 'Target 6' },
    ]);

    const [brightness, setBrightness] = useState(1.0);
    const [globalRunning, setGlobalRunning] = useState(false);

    // VSync / Refresh Rate State
    const [refreshRate, setRefreshRate] = useState(60);

    // Experiment Protocol State
    const [protocolMode, setProtocolMode] = useState(false);
    const [protocolState, setProtocolState] = useState('IDLE'); // IDLE, CUE, STIM, REST
    const [currentTrialIdx, setCurrentTrialIdx] = useState(0);
    const [trials, setTrials] = useState([]);

    // --- Refs for Animation Loop ---
    const requestRef = useRef();
    const startTimeRef = useRef();
    const frameCountRef = useRef(0);

    // Refs to DOM elements for direct manipulation
    const ledRefs = useRef([]);
    const photoDiodeRef = useRef();

    // Experiment timing refs
    const lastStateChangeRef = useRef(0);
    const protocolConfig = useRef({
        cueDuration: 2000,
        stimDuration: 5000,
        restDuration: 2000,
        rounds: 3 // rounds per target
    });

    // --- Measure Refresh Rate on Mount ---
    useEffect(() => {
        let frames = 0;
        let start = performance.now();
        let active = true;

        const measureLoop = (now) => {
            if (!active) return;
            frames++;
            if (now - start >= 1000) {
                const rate = Math.round(frames * 1000 / (now - start));
                console.log(`[SSVEP] Measured Refresh Rate: ${rate}Hz`);
                // Snap to common rates to avoid jitter noise
                if (rate > 58 && rate < 62) setRefreshRate(60);
                else if (rate > 118 && rate < 122) setRefreshRate(120);
                else if (rate > 142 && rate < 146) setRefreshRate(144);
                else setRefreshRate(rate);

                active = false;
            } else {
                requestAnimationFrame(measureLoop);
            }
        };
        requestAnimationFrame(measureLoop);
        return () => { active = false; };
    }, []);

    // --- Experiment Logic ---
    const startProtocol = () => {
        // Generate randomized trials
        const newTrials = [];
        for (let r = 0; r < protocolConfig.current.rounds; r++) {
            // Shuffle targets for each round
            const roundTargets = [...configs].sort(() => Math.random() - 0.5);
            roundTargets.forEach(t => newTrials.push(t.id));
        }

        setTrials(newTrials);
        setCurrentTrialIdx(0);
        setProtocolMode(true);
        setProtocolState('REST'); // Start with rest
        lastStateChangeRef.current = performance.now();
        setGlobalRunning(true);
    };

    const stopProtocol = () => {
        setProtocolMode(false);
        setProtocolState('IDLE');
        setGlobalRunning(false);
    };

    // --- Animation Loop ---
    const animate = useCallback((time) => {
        if (!startTimeRef.current) startTimeRef.current = time;
        const elapsed = time - startTimeRef.current;
        frameCountRef.current++;

        // 1. Handle Protocol State Transitions
        if (protocolMode && globalRunning) {
            const stateElapsed = time - lastStateChangeRef.current;

            if (protocolState === 'REST') {
                if (stateElapsed > protocolConfig.current.restDuration) {
                    setProtocolState('CUE');
                    lastStateChangeRef.current = time;
                }
            } else if (protocolState === 'CUE') {
                if (stateElapsed > protocolConfig.current.cueDuration) {
                    setProtocolState('STIM');
                    lastStateChangeRef.current = time;
                }
            } else if (protocolState === 'STIM') {
                if (stateElapsed > protocolConfig.current.stimDuration) {
                    // Next trial
                    if (currentTrialIdx < trials.length - 1) {
                        setCurrentTrialIdx(prev => prev + 1);
                        setProtocolState('REST');
                    } else {
                        stopProtocol(); // Finished
                    }
                    lastStateChangeRef.current = time;
                }
            }
        }

        // 2. Flicker Logic
        const isFlickering = (globalRunning && !protocolMode) || (protocolMode && protocolState === 'STIM');

        configs.forEach((cfg, idx) => {
            const el = ledRefs.current[idx];
            if (!el) return;

            if (isFlickering) {
                let isOn = false;

                // --- Frame Counting (Monitor Locked) ---
                // Always use frame counting for best phase stability in SSVEP
                // Calculate period in frames. e.g. 60Hz / 10Hz = 6 frames period.
                const period = Math.max(2, Math.round(refreshRate / cfg.freq));
                // 50% duty cycle
                isOn = (frameCountRef.current % period) < (period / 2);

                // Scientific Color Standards
                // ON: Near-White (245, 245, 245) scaled by brightness
                // OFF: Near-Black (5, 5, 5)
                if (isOn) {
                    el.style.backgroundColor = `rgba(245, 245, 245, ${brightness})`;
                    el.style.opacity = 1;
                } else {
                    el.style.backgroundColor = 'rgb(5, 5, 5)';
                    el.style.opacity = 1;
                }
                el.style.boxShadow = 'none';

            } else {
                // If not flickering, handle cue/rest visualization
                if (protocolMode && protocolState === 'CUE') {
                    // Highlight target during cue
                    const isTarget = trials[currentTrialIdx] === cfg.id;
                    el.style.backgroundColor = isTarget ? 'rgb(245, 245, 245)' : 'rgb(20, 20, 20)';
                    el.style.borderColor = isTarget ? '#ffffff' : '#333333';
                    el.style.borderWidth = isTarget ? '4px' : '1px';
                } else if (protocolMode && protocolState === 'REST') {
                    el.style.backgroundColor = 'rgb(0, 0, 0)';
                    el.style.border = '1px solid #111';
                } else {
                    // Stopped state - Dim Static White
                    el.style.backgroundColor = 'rgb(40, 40, 40)';
                    el.style.border = '1px solid #333';
                }
                el.style.boxShadow = 'none';
            }
        });

        // 3. Photodiode Logic
        // Flips every frame when stimulating to signal active data collection
        if (photoDiodeRef.current) {
            if (isFlickering) {
                // Toggle every frame for max temporal resolution or sync trial events
                // We use frame count parity for simple 1/2 refresh rate sync check
                const isWhite = frameCountRef.current % 2 === 0;
                photoDiodeRef.current.style.backgroundColor = isWhite ? '#ffffff' : '#000000';
            } else {
                photoDiodeRef.current.style.backgroundColor = '#000000';
            }
        }

        requestRef.current = requestAnimationFrame(animate);
    }, [configs, brightness, globalRunning, protocolMode, protocolState, currentTrialIdx, trials, refreshRate]);

    useEffect(() => {
        if (globalRunning) {
            requestRef.current = requestAnimationFrame(animate);
        } else {
            // Reset styles when stopped
            ledRefs.current.forEach(el => {
                if (el) {
                    el.style.backgroundColor = 'rgb(40, 40, 40)';
                    el.style.opacity = 1;
                    el.style.border = 'none';
                }
            });
            cancelAnimationFrame(requestRef.current);
        }
        return () => cancelAnimationFrame(requestRef.current);
    }, [globalRunning, animate]);

    // --- UI State ---
    const [showControls, setShowControls] = useState(true);

    return (
        <div
            className="w-full h-full relative overflow-hidden flex flex-col font-mono"
            style={{ backgroundColor: '#000000', color: '#ffffff' }}
        >
            <div className="h-[94px] shrink-0" />
            {/* --- Photodiode Marker (Bottom Left) --- */}
            <div
                ref={photoDiodeRef}
                className="absolute bottom-0 left-0 w-16 h-16 bg-black z-50"
            />

            {/* --- Toggle Controls Button (Top Right, Fades Out) --- */}
            <button
                onClick={() => setShowControls(!showControls)}
                className={`absolute top-4 right-4 z-50 p-2 rounded-lg border transition-opacity duration-300 ${globalRunning ? 'opacity-20 hover:opacity-100' : 'opacity-100'}`}
                style={{
                    backgroundColor: 'rgba(20, 20, 20, 0.8)',
                    borderColor: '#333',
                    color: '#fff'
                }}
            >
                {showControls ? 'Hide Controls' : 'Show Controls'}
            </button>

            {/* --- Grid Layout --- */}
            <div className="flex-grow grid grid-cols-3 grid-rows-2 gap-8 p-12 relative z-10 w-full max-h-[90vh] mx-auto">
                {configs.map((cfg, idx) => {
                    // Calculate effective frequency (Frame Locked)
                    const effectiveFreq = (refreshRate / Math.max(2, Math.round(refreshRate / cfg.freq))).toFixed(1);

                    return (
                        <div key={cfg.id} className="flex flex-col items-center justify-center p-4 relative group">
                            {/* The LED Tile */}
                            <div
                                ref={el => ledRefs.current[idx] = el}
                                className="w-48 h-48 md:w-64 md:h-64 rounded-xl transition-none"
                                style={{
                                    backgroundColor: 'rgb(40, 40, 40)', // Initial static color
                                    boxShadow: 'none'
                                }}
                            >
                                {/* Center Fixation Cross (Always visible for focus) */}
                                <div className="w-full h-full flex items-center justify-center">
                                    <span className="font-bold text-4xl opacity-50" style={{ color: '#000000' }}>+</span>
                                </div>
                            </div>

                            {/* Controls (visible ONLY when NOT running) */}
                            {(!globalRunning || showControls) && (
                                <div className={`mt-4 flex flex-col items-center gap-2 transition-opacity duration-300 ${globalRunning ? 'opacity-50' : ''}`}>
                                    <span className="text-sm font-bold" style={{ color: 'var(--muted)' }}>{cfg.label}</span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={cfg.freq}
                                            onChange={(e) => updateFreq(cfg.id, e.target.value)}
                                            disabled={globalRunning}
                                            className="w-16 border rounded px-2 py-1 text-center font-bold outline-none disabled:opacity-50"
                                            style={{
                                                backgroundColor: 'color-mix(in srgb, var(--bg) 90%, var(--primary))',
                                                borderColor: 'var(--border)',
                                                color: 'var(--primary)'
                                            }}
                                        />
                                        <span className="text-xs" style={{ color: 'var(--muted)' }}>Hz</span>
                                    </div>
                                    {Math.abs(effectiveFreq - cfg.freq) > 0.1 && (
                                        <span className="text-[10px] text-yellow-500">
                                            Act: {effectiveFreq}Hz
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* --- Global Controls (Bottom Overlay) --- */}
            {showControls && (
                <div
                    className="absolute bottom-8 right-8 z-40 flex flex-col gap-4 p-6 rounded-2xl border backdrop-blur-sm transition-all duration-300"
                    style={{
                        backgroundColor: 'color-mix(in srgb, var(--bg) 90%, transparent)',
                        borderColor: 'var(--border)'
                    }}
                >
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-lg" style={{ color: 'var(--primary)' }}>SSVEP Control</h3>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: globalRunning ? '#00ff00' : '#ff0000' }} />
                    </div>

                    {/* Manual Start/Stop */}
                    <button
                        onClick={() => {
                            if (globalRunning) {
                                stopProtocol();
                                setGlobalRunning(false);
                            } else {
                                // Manual mode (just flicker)
                                setGlobalRunning(true);
                                // Optional: Auto-hide controls on start? 
                                // setShowControls(false); 
                            }
                        }}
                        className={`px-8 py-3 rounded-lg font-bold uppercase tracking-wider transition-all border`}
                        style={{
                            backgroundColor: globalRunning ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                            color: globalRunning ? '#ef4444' : '#22c55e',
                            borderColor: globalRunning ? 'rgba(239, 68, 68, 0.5)' : 'rgba(34, 197, 94, 0.5)'
                        }}
                    >
                        {globalRunning ? 'Stop All' : 'Start Flicker'}
                    </button>

                    {/* Protocol Start */}
                    {!globalRunning && (
                        <button
                            onClick={startProtocol}
                            className="px-8 py-2 rounded-lg font-bold uppercase tracking-wider text-sm border"
                            style={{
                                backgroundColor: 'color-mix(in srgb, var(--primary) 20%, transparent)',
                                color: 'var(--primary)',
                                borderColor: 'var(--primary)'
                            }}
                        >
                            Run Protocol
                        </button>
                    )}

                    {/* Options Grid */}
                    <div className="grid grid-cols-2 gap-4 mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                        {/* Brightness */}
                        <div className="space-y-1">
                            <label className="text-xs uppercase font-bold" style={{ color: 'var(--muted)' }}>Brightness</label>
=======
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Play, Square, Activity, MousePointer2, Keyboard, Sun, Monitor, Power, Zap, Trash2, History } from 'lucide-react';
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

        let detectedFreq = 0;
        if (wsEvent.frequency) {
            detectedFreq = wsEvent.frequency;
        } else if (typeof wsEvent.event === 'string' && wsEvent.event.startsWith('TARGET_')) {
            // Parse FBCCA event (e.g., 'TARGET_10_0HZ' -> 10.0)
            const numStr = wsEvent.event.replace('TARGET_', '').replace('HZ', '').replace('_', '.');
            detectedFreq = parseFloat(numStr);
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
        <div className="w-full flex bg-black overflow-hidden relative h-[calc(100vh-129px)]">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 shrink-0 bg-bg/30 p-2 rounded-xl border border-border/50">
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm font-bold text-muted uppercase tracking-widest">
                                <span className="flex items-center gap-1"><Sun size={16} /> Brightness</span>
                                <span className="text-primary">{Math.round(brightness * 100)}%</span>
                            </div>
>>>>>>> extra-features
                            <input
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.05"
                                value={brightness}
                                onChange={(e) => setBrightness(parseFloat(e.target.value))}
<<<<<<< HEAD
                                className="w-full"
                                style={{ accentColor: 'var(--primary)' }}
                            />
                        </div>

                        {/* Monitor Hz */}
                        <div className="space-y-1 flex flex-col">
                            <label className="text-xs uppercase font-bold" style={{ color: 'var(--muted)' }}>
                                Monitor Hz
                            </label>
                            <input
                                type="number"
                                value={refreshRate}
                                onChange={(e) => setRefreshRate(parseInt(e.target.value) || 60)}
                                className="w-full text-xs border rounded px-2 py-1 text-center font-bold outline-none bg-transparent"
                                style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
                            />
                        </div>
                    </div>

                    {/* Status Info */}
                    {protocolMode && (
                        <div className="mt-2 p-2 rounded text-xs font-mono space-y-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                            <div className="flex justify-between" style={{ color: 'var(--muted)' }}>
                                <span>State:</span>
                                <span className="font-bold" style={{ color: 'var(--text)' }}>{protocolState}</span>
                            </div>
                            <div className="flex justify-between" style={{ color: 'var(--muted)' }}>
                                <span>Trial:</span>
                                <span style={{ color: 'var(--text)' }}>{currentTrialIdx + 1} / {trials.length}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="h-[35px] shrink-0" />
=======
                                className="w-full accent-primary h-1 bg-bg rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        <div className="flex items-center justify-between">
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
                                className="w-full py-2.5 bg-primary/10 border-2 border-primary/50 text-primary rounded-xl text-base font-bold uppercase tracking-widest hover:bg-primary/20 transition-all flex items-center justify-center gap-2"
                            >
                                <Zap size={18} /> Protocol
                            </button>
                        )}
                    </div>

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
>>>>>>> extra-features
        </div>
    );
}
