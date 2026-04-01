import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import SSVEPStimulus from './SSVEPStimulus';
import { soundHandler } from '../../handlers/SoundHandler';
import { CalibrationApi } from '../../services/calibrationApi';
import SSVEPSidebar from './sidebar/SSVEPSidebar';

const COMMON_KEYS = ['None', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape', 'P', 'Q', '0', '1', '2', '3'];
const MOUSE_ACTIONS = ['None', 'Left Click', 'Right Click', 'Double Click', 'Scroll Up', 'Scroll Down'];
const TARGET_DIVISORS = [18, 16, 12, 10, 9, 8];

function buildDynamicTargets(refreshRate, previousConfigs = []) {
    return TARGET_DIVISORS.map((divisor, index) => {
        const previous = previousConfigs[index] || {};
        const isManual = previous.isManual === true;
        const autoFreq = Number((refreshRate / divisor).toFixed(2));
        const frequency = isManual ? (previous.freq ?? autoFreq) : autoFreq;

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
            isManual: isManual
        };
    });
}

export default function SSVEPView({ isConnected, wsEvent, onBackToMenu }) {
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
        setConfigs(prev => {
            const isAutoDynamicLayout =
                prev.length === TARGET_DIVISORS.length &&
                prev.every(cfg => TARGET_DIVISORS.includes(cfg.divisor));
            return isAutoDynamicLayout ? buildDynamicTargets(refreshRate, prev) : prev;
        });
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
    const [useML, setUseML] = useState(true);
    const [scoreVector, setScoreVector] = useState([]);
    const [availableModels, setAvailableModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');
    const [predictedFreq, setPredictedFreq] = useState(0);

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
                    setUseML(typeof eeg.use_ml_pipeline === 'boolean'
                        ? eeg.use_ml_pipeline
                        : String(eeg.classifier || 'fbcca').toLowerCase() === 'lda');
                    let newRefRate = refreshRate;
                    if (eeg.refresh_rate) {
                        newRefRate = eeg.refresh_rate;
                        setRefreshRate(newRefRate);
                        localStorage.setItem('ssvep_refreshRate', newRefRate);
                    }
                    if (eeg.targets && Array.isArray(eeg.targets) && eeg.targets.length > 0) {
                        setConfigs(eeg.targets);
                    }
                }
                if (data?.active_models?.EEG) {
                    setSelectedModel(data.active_models.EEG);
                }
            })
            .catch(err => console.error("Failed to load generic config for SSVEP", err))
            .finally(() => setIsConfigLoaded(true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetch('/api/models/EEG')
            .then(res => res.json())
            .then(data => {
                if (!Array.isArray(data)) return;
                setAvailableModels(data);
                const activeModel = data.find(model => model.active);
                setSelectedModel(prev => prev || activeModel?.name || data[0]?.name || '');
            })
            .catch(err => console.error('Failed to load EEG models for SSVEP', err));
    }, []);

    useEffect(() => {
        if (!selectedModel) return;
        fetch('/api/models/EEG/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_name: selectedModel })
        }).catch(err => console.error('Failed to activate EEG model for SSVEP', err));
    }, [selectedModel]);

    useEffect(() => {
        if (!wsEvent) return;

        let freqValue = null;
        let predictedValue = null;
        if (wsEvent.event === 'eeg_prediction' && wsEvent.peak_frequency !== undefined) {
            freqValue = wsEvent.peak_frequency;
            predictedValue = wsEvent.predicted_frequency ?? wsEvent.frequency;
        } else if (wsEvent.event === 'eeg_prediction' && wsEvent.frequency !== undefined) {
            freqValue = wsEvent.frequency;
            predictedValue = wsEvent.predicted_frequency ?? wsEvent.frequency;
        } else if (typeof wsEvent.event === 'string' && wsEvent.event.startsWith('TARGET_')) {
            const numStr = wsEvent.event.replace('TARGET_', '').replace('HZ', '').replace('_', '.');
            freqValue = parseFloat(numStr);
        } else if (wsEvent.features?.peak_freq !== undefined) {
            freqValue = wsEvent.features.peak_freq;
        }

        if (freqValue !== null) {
            setRealTimeFreq(freqValue);
        }
        if (predictedValue !== null && predictedValue !== undefined) {
            setPredictedFreq(predictedValue || 0);
        }

        if (wsEvent.features?.display_score_vector) {
            setScoreVector(wsEvent.features.display_score_vector);
        } else if (wsEvent.features?.hybrid_score_vector) {
            setScoreVector(wsEvent.features.hybrid_score_vector);
        } else if (wsEvent.features?.normalized_score_vector) {
            setScoreVector(wsEvent.features.normalized_score_vector);
        } else if (wsEvent.features?.score_vector) {
            setScoreVector(wsEvent.features.score_vector);
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
                            target_freqs: configs.map(c => c.freq),
                            targets: configs.map(c => ({
                                ...c,
                                controlType: !c.enabled ? 'None' : (c.controlType || 'Keyboard')
                            })),
                            rest_threshold: 0.6,
                            ratio_threshold: 1.2,
                            classifier: useML ? 'lda' : 'fbcca',
                            use_ml_pipeline: useML,
                            num_harmonics: 4,
                            window_len_sec: 1.5,
                            step_sec: 0.25,
                            smoothing_windows: 7,
                            refresh_rate: refreshRate
                        }
                    },
                    active_models: {
                        EEG: selectedModel || null
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
                setTimeout(() => setIsSyncing(false), 300);
            }
        };

        const timeoutId = setTimeout(syncConfig, 500);
        return () => clearTimeout(timeoutId);
    }, [configs, refreshRate, isConfigLoaded, useML, selectedModel]);

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

    // rightWidth kept for legacy reference; sidebar is managed by SSVEPSidebar component
    const rightWidth = showSidebar ? 'mr-80' : 'mr-[4.5rem]';

    return (
        <div className="w-full flex bg-[var(--bg)] overflow-hidden relative h-full">
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
                            <div key={cfg.id} className="border border-white/50 rounded-xl flex flex-col items-center justify-center relative shadow-lg bg-[var(--bg)]/40">
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

            {/* ── Page-Specific Sidebar (SSVEPSidebar) ── */}
            <SSVEPSidebar
                showSidebar={showSidebar}
                setShowSidebar={setShowSidebar}
                onBackToMenu={onBackToMenu}
                useML={useML}
                setUseML={setUseML}
                availableModels={availableModels}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                addLog={addLog}
                realTimeFreq={realTimeFreq}
                predictedFreq={predictedFreq}
                scoreVector={scoreVector}
                configs={configs}
                updateConfig={updateConfig}
                isSyncing={isSyncing}
                lastModifiedTargetId={lastModifiedTargetId}
                globalRunning={globalRunning}
                protocolMode={protocolMode}
                startFlicker={startFlicker}
                stopFlicker={stopFlicker}
                runProtocol={runProtocol}
                brightness={brightness}
                setBrightness={setBrightness}
                refreshRate={refreshRate}
                setRefreshRate={setRefreshRate}
                logs={logs}
                setLogs={setLogs}
                showTargets={showTargets}
                setShowTargets={setShowTargets}
                openDropdownId={openDropdownId}
                setOpenDropdownId={setOpenDropdownId}
                isConnected={isConnected}
            />
        </div>
    );
}
