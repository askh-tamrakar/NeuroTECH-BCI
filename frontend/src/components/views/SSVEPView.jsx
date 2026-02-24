import React, { useState, useEffect, useCallback, useRef } from 'react';
import SSVEPStimulus from './ssvep/SSVEPStimulus';
import SSVEPControls from './ssvep/SSVEPControls';
import SSVEPDebugLog from './ssvep/SSVEPDebugLog';
import { soundHandler } from '../../handlers/SoundHandler';

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
                            <div key={cfg.id} className="border border-white/50 rounded-xl flex items-end p-2">
                                <span className="text-[10px] font-bold text-white">{cfg.label}</span>
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
                {/* Scrollable Content */}
                <div className="flex-grow overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-primary/20 p-6 space-y-8">
                    {/* Setup Section */}
                    <SSVEPControls
                        configs={configs}
                        updateConfig={updateConfig}
                        brightness={brightness}
                        setBrightness={setBrightness}
                        refreshRate={refreshRate}
                        setRefreshRate={setRefreshRate}
                        globalRunning={globalRunning}
                        startFlicker={startFlicker}
                        stopFlicker={stopFlicker}
                        runProtocol={runProtocol}
                    />

                    {/* Monitoring Section */}
                    <div className="border-t border-border pt-8 pb-4">
                        <SSVEPDebugLog
                            logs={logs}
                            clearLogs={() => setLogs([])}
                            realTimeFreq={realTimeFreq}
                        />
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
