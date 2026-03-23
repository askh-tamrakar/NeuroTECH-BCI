import React, { useState } from 'react';
import { Activity, BrainCircuit, Play, Square, Settings, Cpu, Zap, RadioReceiver } from 'lucide-react';
import { soundHandler } from '../../handlers/SoundHandler';

export default function ServoClawView({ wsEvent, isConnected }) {
    // -------------------------------------------------------------
    // STATES
    // -------------------------------------------------------------
    const [ssvepActive, setSsvepActive] = useState(false);
    const [mlActive, setMlActive] = useState(false);
    const [emgActive, setEmgActive] = useState(false);

    const [clawStatus, setClawStatus] = useState('Idle');

    // -------------------------------------------------------------
    // HANDLERS
    // -------------------------------------------------------------
    const toggleAll = () => {
        soundHandler?.playClick?.();
        const anyActive = ssvepActive || mlActive || emgActive;
        const nextState = !anyActive;
        setSsvepActive(nextState);
        setMlActive(nextState);
        setEmgActive(nextState);
        updateClawStatus(nextState, nextState, nextState);
    };

    const toggleDetection = (detectionType) => {
        soundHandler?.playClick?.();
        
        if (detectionType === 'ssvep') {
            const nextState = !ssvepActive;
            setSsvepActive(nextState);
            updateClawStatus(nextState, mlActive, emgActive);
        } else if (detectionType === 'ml') {
            const nextState = !mlActive;
            setMlActive(nextState);
            updateClawStatus(ssvepActive, nextState, emgActive);
        } else if (detectionType === 'emg') {
            const nextState = !emgActive;
            setEmgActive(nextState);
            updateClawStatus(ssvepActive, mlActive, nextState);
        }
    };

    const updateClawStatus = (s, m, e) => {
        if (s && m && e) {
            setClawStatus('Fully Active [All Modes]');
        } else if (s || m || e) {
            setClawStatus('Listening...');
        } else {
            setClawStatus('Idle');
        }
    };

    const testMovement = (action) => {
        soundHandler?.playClick?.();
        setClawStatus(`Executing: ${action}`);
        setTimeout(() => {
            updateClawStatus(ssvepActive, mlActive, emgActive);
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
        <div className="p-6 lg:p-12 max-w-7xl mx-auto flex flex-col gap-8 w-full animate-in fade-in duration-500">
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
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                            (ssvepActive || mlActive || emgActive) 
                                ? 'bg-red-500/10 border border-red-500/50 text-red-500 hover:bg-red-500/20' 
                                : 'bg-primary border border-primary text-primary-contrast shadow-glow hover:opacity-90'
                        }`}
                    >
                        {(ssvepActive || mlActive || emgActive) ? <Square size={18} /> : <Play size={18} />}
                        {(ssvepActive || mlActive || emgActive) ? 'Stop All' : 'Start All Detections'}
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-xl text-sm font-bold text-text hover:border-primary/50 transition-colors">
                        <Settings size={18} />
                        Calibrate
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
                            id: 'ml',
                            title: 'Motor Imagery',
                            icon: BrainCircuit,
                            active: mlActive,
                            description: 'Decodes imagined movements (left/right arm) via ML.'
                        })}
                        {renderDetectionCard({
                            id: 'emg',
                            title: 'EMG / Blink',
                            icon: Zap,
                            active: emgActive,
                            description: 'Detects facial muscle variations like jaw clench or blink.'
                        })}
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
                            <div className="relative">
                                {/* Simulated Claw Graphic (Icon based for now) */}
                                <Cpu size={80} className={`text-text transition-all duration-500 ${clawStatus !== 'Idle' ? 'text-primary scale-110' : 'opacity-50'}`} />
                                {clawStatus.includes('Open') && (
                                    <div className="absolute inset-0 border-4 border-primary/50 rounded-full animate-ping" />
                                )}
                            </div>
                            <div className="mt-6 text-center">
                                <p className="text-lg font-bold text-text tracking-wide">{clawStatus}</p>
                                <p className="text-sm text-muted mt-1">Waiting for BCI input...</p>
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
