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

    // Sync Claw Status with incoming wsEvent
    React.useEffect(() => {
        if (!wsEvent || !wsEvent.event) return;
        const e = wsEvent.event;
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
            ].slice(0, 100));

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
        CalibrationApi.togglePrediction('ALL', nextState).catch(err => console.error("Toggle All failed:", err));
    };

    const toggleDetection = (detectionType) => {
        soundHandler?.playClick?.();

        if (detectionType === 'ssvep') {
            const nextState = !ssvepActive;
            setSsvepActive(nextState);
            updateClawStatus(nextState, rpsActive, blinkActive);
            CalibrationApi.togglePrediction('EEG', nextState).catch(err => console.error("SSVEP toggle failed:", err));
        } else if (detectionType === 'rps') {
            const nextState = !rpsActive;
            setRpsActive(nextState);
            updateClawStatus(ssvepActive, nextState, blinkActive);
            CalibrationApi.togglePrediction('EMG', nextState).catch(err => console.error("RPS toggle failed:", err));
        } else if (detectionType === 'blink') {
            const nextState = !blinkActive;
            setBlinkActive(nextState);
            updateClawStatus(ssvepActive, rpsActive, nextState);
            CalibrationApi.togglePrediction('EOG', nextState).catch(err => console.error("Blink toggle failed:", err));
        }
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
    const renderDetectionCard = ({ id, title, icon: Icon, active, description }) => {
        return (
            <div className={`p-6 rounded-2xl border transition-all duration-300 flex flex-col items-start gap-4 hover:border-primary/50 cursor-pointer ${active ? 'bg-primary/5 border-primary/50 shadow-glow' : 'bg-surface border-border'}`} onClick={() => toggleDetection(id)}>
                <div className="flex items-center justify-between w-full">
                    <div className={`p-3 rounded-full ${active ? 'bg-primary text-primary-contrast' : 'bg-white/5 text-muted'}`}>
                        <Icon size={24} />
                    </div>
                    <button className={`w-[42px] h-[42px] flex items-center justify-center rounded-full border transition-all ${active ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20' : 'bg-green-500/10 border-green-500/50 text-green-500 hover:bg-green-500/20'}`}>
                        {active ? <Square size={18} /> : <Play size={18} />}
                    </button>
                </div>
                <div>
                    <h3 className={`text-lg font-bold ${active ? 'text-primary' : 'text-text'}`}>{title}</h3>
                    <p className="text-sm text-muted mt-1">{description}</p>
                </div>
                <div className="mt-auto pt-4 w-full border-t border-border flex justify-between items-center text-xs font-medium">
                    <span className="text-muted">Status</span>
                    <span className={active ? "text-green-500 animate-pulse" : "text-muted"}>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
                    
                    {/* Event Logger */}
                    <div className="mt-4 flex flex-col gap-4 h-64 border border-border/50 rounded-2xl bg-surface p-5 shadow-inner">
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                            <h2 className="text-sm font-bold opacity-80 flex items-center gap-2 uppercase tracking-widest text-muted">
                                <Activity size={16} />
                                Action Log
                            </h2>
                            <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20">
                                {eventLogs.length} Events
                            </span>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                            {eventLogs.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-muted text-sm italic">
                                    Awaiting detection events...
                                </div>
                            ) : (
                                eventLogs.map(log => (
                                    <div key={log.id} className="font-mono text-sm leading-relaxed text-primary/90 truncate py-0.5">
                                        {/* Highlight the timestamp and the arrow to make it super readable */}
                                        <span dangerouslySetInnerHTML={{ __html: log.text.replace(/(\[.*?\])/g, '<span class="text-muted/60 font-bold">$1</span>').replace('->', '<span class="text-white/50 px-1">-></span>').replace(/Event:(.*?)->/, 'Event:<span class="text-primary font-bold px-1">$1</span>->') }} />
                                    </div>
                                ))
                            )}
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
