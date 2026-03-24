import React, { useState } from 'react';
import { Activity, BrainCircuit, Play, Square, Settings, Cpu, Zap, RadioReceiver } from 'lucide-react';
import { soundHandler } from '../../handlers/SoundHandler';
import { CalibrationApi } from '../../services/calibrationApi';

export default function ServoClawView({ wsEvent, isConnected }) {
    // -------------------------------------------------------------
    // STATES
    // -------------------------------------------------------------
    const [ssvepActive, setSsvepActive] = useState(false);
    const [rpsActive, setRpsActive] = useState(false);
    const [blinkActive, setBlinkActive] = useState(false);

    const [ clawStatus, setClawStatus ] = useState('Idle');
    const [ lastAction, setLastAction ] = useState('Waiting for BCI input...');
    const [ currentAngle, setCurrentAngle ] = useState(97); // 97 is fully closed, 1 is fully open
    const [ eventLogs, setEventLogs ] = useState([]);

    // Data for models and config
    const [models, setModels] = useState({ eog: [], emg: [] });
    const [eegConfig, setEegConfig] = useState({ rest_threshold: 0.6, ratio_threshold: 1.2 });
    const API_BASE_URL = import.meta.env.VITE_API_URL || '';

    // Fetch initial models and config
    React.useEffect(() => {
        const fetchData = async () => {
            try {
                const [eogRes, emgRes, configRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/models/eog`),
                    fetch(`${API_BASE_URL}/api/models/emg`),
                    fetch(`${API_BASE_URL}/api/config`)
                ]);
                
                const eogModels = await eogRes.json();
                const emgModels = await emgRes.json();
                const configData = await configRes.json();
                
                setModels({
                    eog: eogModels,
                    emg: emgModels
                });
                
                if (configData.features && configData.features.EEG) {
                    setEegConfig({
                        rest_threshold: configData.features.EEG.rest_threshold || 0.6,
                        ratio_threshold: configData.features.EEG.ratio_threshold || 1.2
                    });
                }
            } catch (err) {
                console.error("Failed to load models/config for Servo Claw:", err);
            }
        };
        fetchData();
    }, [API_BASE_URL]);

    // Push Config to Backend for Servo.enabled and optionally thresholds/models
    const updateBackendConfig = React.useCallback(async (updates) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/config`);
            if (!res.ok) return;
            const config = await res.json();
            
            let changed = false;
            if (!config.features) config.features = {};
            
            // Apply Servo enabled
            if (updates.hasOwnProperty('servoEnabled')) {
                if (!config.features.Servo) config.features.Servo = {};
                if (config.features.Servo.enabled !== updates.servoEnabled) {
                    config.features.Servo.enabled = updates.servoEnabled;
                    changed = true;
                }
            }
            
            // Apply EEG config
            if (updates.eeg) {
                if (!config.features.EEG) config.features.EEG = {};
                if (updates.eeg.rest_threshold) { config.features.EEG.rest_threshold = updates.eeg.rest_threshold; changed = true; }
                if (updates.eeg.ratio_threshold) { config.features.EEG.ratio_threshold = updates.eeg.ratio_threshold; changed = true; }
            }
            
            // Apply active models
            if (updates.activeModelEOG || updates.activeModelEMG) {
                if (!config.active_models) config.active_models = {};
                if (updates.activeModelEOG && config.active_models.EOG !== updates.activeModelEOG) {
                    config.active_models.EOG = updates.activeModelEOG;
                    changed = true;
                }
                if (updates.activeModelEMG && config.active_models.EMG !== updates.activeModelEMG) {
                    config.active_models.EMG = updates.activeModelEMG;
                    changed = true;
                }
            }
            
            if (changed) {
                await fetch(`${API_BASE_URL}/api/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
            }
        } catch (err) {
            console.error("Failed to update backend config:", err);
        }
    }, [API_BASE_URL]);

    // Ensure physical servo is disabled when navigating away from this view
    React.useEffect(() => {
        return () => {
            console.log("ServoClawView unmounting - Disabling Servo hardware");
            updateBackendConfig({ servoEnabled: false });
        };
    }, [updateBackendConfig]);

    // Throttling for rapid repeated eye blink events
    const lastBlinkEventRef = React.useRef(0);

    // Sync Claw Status with incoming wsEvent
    React.useEffect(() => {
        if (!wsEvent || !wsEvent.event) return;
        const e = wsEvent.event;
        
        // Apply throttle for blinks
        if (e === 'SingleBlink' || e === 'DoubleBlink') {
            const now = Date.now();
            if (now - lastBlinkEventRef.current < 1000) {
                return; // Ignore repeated events within 1 second
            }
            lastBlinkEventRef.current = now;
        }

        let action = null;
        let newAngle = currentAngle;

        if (e === 'SingleBlink') {
            action = 'Degree (+ve)';
            newAngle = Math.min(97, currentAngle + 5);
        } else if (e === 'DoubleBlink') {
            action = 'Degree (-ve)';
            newAngle = Math.max(1, currentAngle - 5);
        } else if (e === 'Rock') {
            action = 'Full Closing';
            newAngle = 97;
        } else if (e === 'Paper') {
            action = 'Full Open';
            newAngle = 1;
        } else if (e === 'Scissors') {
            action = 'Snap MIDDLE';
            newAngle = 48;
        } else if (typeof e === 'string' && e.startsWith('TARGET_')) {
            action = `Preset (${e})`;
            newAngle = 82; 
        }
        
        if (action) {
            setClawStatus(`Executing: ${action}`);
            setLastAction(`Last event: ${e}`);
            setCurrentAngle(newAngle);
            
            const timeStr = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            // Log concise descriptive event
            setEventLogs(prev => [
                { id: Date.now() + Math.random(), text: `[${timeStr}] Event: ${e} -> ${action}` },
                ...prev
            ].slice(0, 50));

            const timer = setTimeout(() => {
                updateClawStatus(ssvepActive, rpsActive, blinkActive);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [wsEvent, ssvepActive, rpsActive, blinkActive, currentAngle]);

    // -------------------------------------------------------------
    // HANDLERS
    // -------------------------------------------------------------
    const toggleAll = () => {
        soundHandler?.playClick?.();
        const anyActive = ssvepActive || rpsActive || blinkActive;
        const nextState = !anyActive;
        setSsvepActive(nextState);
        setRpsActive(nextState);
        setBlinkActive(nextState);
        updateClawStatus(nextState, nextState, nextState);
        updateBackendConfig({ servoEnabled: nextState });
        CalibrationApi.togglePrediction('ALL', nextState).catch(err => console.error("Toggle All failed:", err));
    };

    const toggleDetection = (detectionType) => {
        soundHandler?.playClick?.();
        
        const newStates = {
            ssvep: detectionType === 'ssvep' ? !ssvepActive : ssvepActive,
            rps: detectionType === 'rps' ? !rpsActive : rpsActive,
            blink: detectionType === 'blink' ? !blinkActive : blinkActive
        };
        
        if (detectionType === 'ssvep') {
            setSsvepActive(newStates.ssvep);
            CalibrationApi.togglePrediction('EEG', newStates.ssvep).catch(err => console.error("SSVEP toggle failed:", err));
        } else if (detectionType === 'rps') {
            setRpsActive(newStates.rps);
            CalibrationApi.togglePrediction('EMG', newStates.rps).catch(err => console.error("RPS toggle failed:", err));
        } else if (detectionType === 'blink') {
            setBlinkActive(newStates.blink);
            CalibrationApi.togglePrediction('EOG', newStates.blink).catch(err => console.error("Blink toggle failed:", err));
        }
        
        updateClawStatus(newStates.ssvep, newStates.rps, newStates.blink);
        updateBackendConfig({ servoEnabled: (newStates.ssvep || newStates.rps || newStates.blink) });
    };

    const updateClawStatus = (s, r, b) => {
        if (s && r && b) {
            setClawStatus('Fully Active [All Modes]');
        } else if (s || r || b) {
            setClawStatus('Listening...');
        } else {
            setClawStatus('Idle');
        }
    };

    const testMovement = async (action) => {
        soundHandler?.playClick?.();
        setClawStatus(`Executing: ${action}`);
        setLastAction(`Manual: ${action}`);
        
        try {
            await CalibrationApi.sendManualClawCommand(action);
        } catch (e) {
            console.error("Failed manual override", e);
        }
        
        setTimeout(() => {
            updateClawStatus(ssvepActive, rpsActive, blinkActive);
        }, 2000);
    };

    // -------------------------------------------------------------
    // RENDER HELPERS
    // -------------------------------------------------------------
    const renderDetectionCard = ({ id, title, icon: Icon, active, description, settingsContent }) => {
        return (
            <div className={`p-6 rounded-2xl border transition-all duration-300 flex flex-col items-start gap-4 hover:border-primary/50 relative overflow-hidden ${active ? 'bg-primary/5 border-primary/50 shadow-glow' : 'bg-surface border-border'}`}>
                <div 
                    className="flex items-center justify-between w-full cursor-pointer z-10" 
                    onClick={() => toggleDetection(id)}
                >
                    <div className={`p-3 rounded-full ${active ? 'bg-primary text-primary-contrast' : 'bg-white/5 text-muted'}`}>
                        <Icon size={24} />
                    </div>
                    <button 
                        className={`w-[42px] h-[42px] flex items-center justify-center rounded-full border transition-all ${active ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20' : 'bg-green-500/10 border-green-500/50 text-green-500 hover:bg-green-500/20'}`}
                        onClick={(e) => { e.stopPropagation(); toggleDetection(id); }}
                    >
                        {active ? <Square size={18} /> : <Play size={18} />}
                    </button>
                </div>
                <div className="z-10 cursor-pointer" onClick={() => toggleDetection(id)}>
                    <h3 className={`text-lg font-bold ${active ? 'text-primary' : 'text-text'}`}>{title}</h3>
                    <p className="text-sm text-muted mt-1 leading-relaxed">{description}</p>
                </div>
                
                <div className="mt-auto pt-4 w-full border-t border-border flex justify-between items-center text-xs font-medium z-10">
                    <span className="text-muted">Status</span>
                    <span className={active ? "text-green-500 animate-pulse font-bold" : "text-muted"}>
                        {active ? "Active" : "Inactive"}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="p-6 lg:p-12 w-full flex flex-col gap-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
                <div>
                    <h1 className="text-3xl lg:text-4xl font-black tracking-tight flex items-center gap-3">
                        <Cpu className="text-primary" size={36} />
                        Servo Claw Control
                    </h1>
                    <p className="text-muted text-base lg:text-lg mt-2 font-medium">
                        Manage BCI detection modes and monitor the robotic claw.
                    </p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={toggleAll}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-md font-bold transition-colors ${
                            (ssvepActive || rpsActive || blinkActive) 
                                ? 'bg-red-500/10 border border-red-500/50 text-red-500 hover:bg-red-500/20' 
                                : 'bg-primary border border-primary text-primary-contrast shadow-glow hover:opacity-90'
                        }`}
                    >
                        {(ssvepActive || rpsActive || blinkActive) ? <Square size={20} /> : <Play size={20} />}
                        {(ssvepActive || rpsActive || blinkActive) ? 'Stop All' : 'Start All Detections'}
                    </button>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Detections (2/3 width on wide screens) */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <h2 className="text-xl font-bold border-b border-border pb-2 opacity-80 flex items-center gap-2">
                        <Activity size={20} />
                        Detection Modalities
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {renderDetectionCard({
                            id: 'ssvep',
                            title: 'SSVEP Detection',
                            icon: Activity,
                            active: ssvepActive,
                            description: 'Uses flickering visual stimuli to detect target focus.'
                        })}
                        {renderDetectionCard({
                            id: 'rps',
                            title: 'EMG RPS Control',
                            icon: BrainCircuit,
                            active: rpsActive,
                            description: 'Detects wrist movements (Rock, Paper, Scissors) via EMG.'
                        })}
                        {renderDetectionCard({
                            id: 'blink',
                            title: 'EOG Blink Control',
                            icon: Zap,
                            active: blinkActive,
                            description: 'Detects eye blinks (Single, Double) via EOG.'
                        })}
                    </div>
                    
                    {/* Bottom Section: Logs & Settings */}
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Event Logger */}
                        <div className="flex flex-col gap-4 h-56 border border-border/50 rounded-2xl bg-surface p-5 shadow-inner">
                            <div className="flex items-center justify-between border-b border-border/50 pb-2">
                                <h2 className="text-sm font-bold opacity-80 flex items-center gap-2 uppercase tracking-widest text-muted">
                                    <Activity size={16} />
                                    Action Log
                                </h2>
                                <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20">
                                    {eventLogs.length} Events
                                </span>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">
                                {eventLogs.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-muted text-sm italic">
                                        Awaiting detection events...
                                    </div>
                                ) : (
                                    eventLogs.map(log => (
                                        <div key={log.id} className="font-mono text-sm leading-relaxed text-primary/90 truncate py-0.5">
                                            <span dangerouslySetInnerHTML={{ __html: log.text.replace(/(\[.*?\])/g, '<span class="text-muted/60 font-bold">$1</span>').replace('->', '<span class="text-white/50 px-1">-></span>').replace(/Event:(.*?)->/, 'Event:<span class="text-primary font-bold px-1">$1</span>->') }} />
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Settings Controls */}
                        <div className="flex flex-col gap-4 h-56 border border-border/50 rounded-2xl bg-surface p-5 shadow-inner overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">
                            <h2 className="text-sm font-bold opacity-80 flex items-center gap-2 uppercase tracking-widest text-muted border-b border-border/50 pb-2">
                                <Settings size={16} />
                                Modality Config
                            </h2>

                            <div className="flex flex-col gap-4 mt-2">
                                {/* EOG Model */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-muted uppercase flex items-center gap-1.5">
                                        <Zap size={12} className="text-primary/70" />
                                        EOG Active Model
                                    </label>
                                    <select 
                                        className="bg-bg border border-border text-sm rounded-md px-3 py-2 w-full outline-none focus:border-primary/50 transition-colors"
                                        value={models.eog.find(m => m.active)?.name || ''}
                                        onChange={(e) => {
                                            const newEogModels = [...models.eog].map(m => ({...m, active: m.name === e.target.value}));
                                            setModels({...models, eog: newEogModels});
                                            updateBackendConfig({ activeModelEOG: e.target.value });
                                        }}
                                    >
                                        {models.eog.map(m => (
                                            <option key={m.name} value={m.name}>{m.name}</option>
                                        ))}
                                        {models.eog.length === 0 && <option value="" disabled>No models found</option>}
                                    </select>
                                </div>

                                {/* EMG Model */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-muted uppercase flex items-center gap-1.5">
                                        <BrainCircuit size={12} className="text-primary/70" />
                                        EMG Active Model
                                    </label>
                                    <select 
                                        className="bg-bg border border-border text-sm rounded-md px-3 py-2 w-full outline-none focus:border-primary/50 transition-colors"
                                        value={models.emg.find(m => m.active)?.name || ''}
                                        onChange={(e) => {
                                            const newEmgModels = [...models.emg].map(m => ({...m, active: m.name === e.target.value}));
                                            setModels({...models, emg: newEmgModels});
                                            updateBackendConfig({ activeModelEMG: e.target.value });
                                        }}
                                    >
                                        {models.emg.map(m => (
                                            <option key={m.name} value={m.name}>{m.name}</option>
                                        ))}
                                        {models.emg.length === 0 && <option value="" disabled>No models found</option>}
                                    </select>
                                </div>

                                {/* EEG Thresholds */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-muted uppercase flex items-center gap-1.5">
                                        <Activity size={12} className="text-primary/70" />
                                        SSVEP Thresholds
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs text-muted/80">Rest Ratio</span>
                                            <input 
                                                type="number" 
                                                step="0.05"
                                                className="bg-bg border border-border rounded px-3 py-1.5 text-sm outline-none focus:border-primary/50 transition-colors" 
                                                value={eegConfig.rest_threshold} 
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setEegConfig(prev => ({...prev, rest_threshold: val}));
                                                }}
                                                onBlur={() => updateBackendConfig({ eeg: eegConfig })}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs text-muted/80">Target Ratio</span>
                                            <input 
                                                type="number" 
                                                step="0.1"
                                                className="bg-bg border border-border rounded px-3 py-1.5 text-sm outline-none focus:border-primary/50 transition-colors" 
                                                value={eegConfig.ratio_threshold} 
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setEegConfig(prev => ({...prev, ratio_threshold: val}));
                                                }}
                                                onBlur={() => updateBackendConfig({ eeg: eegConfig })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Right Column: Claw Status (1/3 width on wide screens) */}
                <div className="flex flex-col gap-6">
                    <h2 className="text-xl font-bold border-b border-border pb-2 opacity-80 flex items-center gap-2">
                        <RadioReceiver size={20} />
                        Claw Status
                    </h2>

                    <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-6 shadow-xl relative overflow-hidden">
                        {/* Background glowing effect */}
                        <div className="absolute -top-20 -right-20 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-muted uppercase tracking-wider">Current State</span>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold border ${clawStatus === 'Idle' ? 'bg-surface border-border text-muted' : 'bg-primary/20 border-primary/50 text-primary animate-pulse'}`}>
                                {clawStatus}
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col items-center justify-center py-6">
                            <div className="relative w-48 h-48 flex items-end justify-center mb-8">
                                {/* Base */}
                                <div className="absolute bottom-0 w-24 h-12 bg-surface border-4 border-primary rounded-t-[1.5rem] z-10 shadow-[0_-5px_25px_rgba(var(--color-primary-rgb),0.15)] flex flex-col items-center justify-center gap-1">
                                    <div className="w-12 h-1.5 bg-primary/30 rounded-full" />
                                    <div className="w-8 h-1.5 bg-primary/20 rounded-full" />
                                </div>
                                
                                {/* Left Pincer */}
                                <div 
                                    className="absolute bottom-6 left-1/2 w-8 h-36 origin-bottom transition-transform duration-[600ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] z-0"
                                    style={{ transform: `translateX(-24px) rotate(-${90 * ((97 - currentAngle) / 96)}deg)` }}
                                >
                                    <div className="w-full h-full bg-surface border-4 border-primary rounded-t-full rounded-b-lg shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.2)] relative flex justify-end">
                                        {/* Grip pad */}
                                        <div className="absolute top-4 right-[-4px] w-2.5 h-16 bg-primary rounded-l-md shadow-[0_0_5px_rgba(var(--color-primary-rgb),0.5)]" />
                                    </div>
                                </div>
                                
                                {/* Right Pincer */}
                                <div 
                                    className="absolute bottom-6 right-1/2 w-8 h-36 origin-bottom transition-transform duration-[600ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] z-0"
                                    style={{ transform: `translateX(24px) rotate(${90 * ((97 - currentAngle) / 96)}deg)` }}
                                >
                                    <div className="w-full h-full bg-surface border-4 border-primary rounded-t-full rounded-b-lg shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.2)] relative flex justify-start">
                                        {/* Grip pad */}
                                        <div className="absolute top-4 left-[-4px] w-2.5 h-16 bg-primary rounded-r-md shadow-[0_0_5px_rgba(var(--color-primary-rgb),0.5)]" />
                                    </div>
                                </div>

                                {/* Angle Display Bubble */}
                                <div className="absolute -top-6 bg-surface border-2 border-primary/50 px-4 py-1.5 rounded-full z-20 shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.2)] flex items-center gap-2">
                                    <Cpu size={14} className="text-primary/70" />
                                    <span className="text-sm font-black text-primary tracking-widest tabular-nums">{Math.round(currentAngle)}°</span>
                                </div>
                            </div>
                            
                            <div className="mt-8 text-center bg-bg/50 px-6 py-4 rounded-2xl border border-border/50">
                                <p className="text-lg font-bold text-text tracking-wide mb-1">{clawStatus}</p>
                                <p className="text-sm font-medium text-muted">{lastAction}</p>
                            </div>
                        </div>

                        {/* Manual override controls for testing */}
                        <div className="border-t border-border pt-4">
                            <span className="text-xs font-bold text-muted uppercase tracking-wider mb-3 block">Manual Override</span>
                            <div className="grid grid-cols-2 gap-3">
                                <button className="py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-text transition-colors" onClick={() => testMovement('Open Claw')}>
                                    Open
                                </button>
                                <button className="py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-text transition-colors" onClick={() => testMovement('Close Claw')}>
                                    Close
                                </button>
                                <button className="col-span-2 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-text transition-colors" onClick={() => testMovement('Stop')}>
                                    Emergency Stop
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
