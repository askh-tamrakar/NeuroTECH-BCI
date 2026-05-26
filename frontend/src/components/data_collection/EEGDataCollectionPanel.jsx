import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Target, Activity } from 'lucide-react';
import { FlickerStimulus } from '../../utils/stimulus';

export default function EEGDataCollectionPanel({
    isCalibrating,
    targetLabel,
    targetFrequency,
    onRecord,
    targetCount = 40,
    onFinished // callback to stop calibration
}) {
    // Phases: 'IDLE', 'REST_PRE', 'FOCUS', 'REST_POST'
    const [phase, setPhase] = useState('IDLE');
    const [timeLeft, setTimeLeft] = useState(0);
    const [protocolCount, setProtocolCount] = useState(0);

    // We use a ref for accurate timing
    const phaseTimeoutRef = useRef(null);
    const countdownIntervalRef = useRef(null);
    const focusStartMsRef = useRef(0);
    const animationFrameRef = useRef(null);
    const flickerRef = useRef(null);
    const stimulusElRef = useRef(null);
    const [isLedOn, setIsLedOn] = useState(false);

    // Sync isCalibrating
    useEffect(() => {
        if (!isCalibrating) {
            setPhase('IDLE');
            setTimeLeft(0);
            setIsLedOn(false);
            setProtocolCount(0);
            if (phaseTimeoutRef.current) clearTimeout(phaseTimeoutRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (flickerRef.current) flickerRef.current.stop();
        } else if (phase === 'IDLE') {
            startPhase('REST_PRE');
        }
    }, [isCalibrating]);

    const startPhase = useCallback((newPhase) => {
        setPhase(newPhase);

        if (phaseTimeoutRef.current) clearTimeout(phaseTimeoutRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        if (flickerRef.current) flickerRef.current.stop();

        setIsLedOn(false); // Default off

        let durationMs = 0;
        if (newPhase === 'REST_PRE') {
            durationMs = 2000;
        } else if (newPhase === 'FOCUS') {
            durationMs = 3000;
            focusStartMsRef.current = Date.now();
            startFlicker();
        } else if (newPhase === 'REST_POST') {
            durationMs = 2000;
        }

        setTimeLeft(Math.ceil(durationMs / 1000));

        // Start countdown
        countdownIntervalRef.current = setInterval(() => {
            setTimeLeft((prev) => Math.max(0, prev - 1));
        }, 1000);

        // Schedule next phase
        phaseTimeoutRef.current = setTimeout(() => {
            if (newPhase === 'REST_PRE') {
                startPhase('FOCUS');
            } else if (newPhase === 'FOCUS') {
                // FOCUS ended, trigger recording exactly now
                const endMs = Date.now();
                const startMs = focusStartMsRef.current + 500; // Ignore first 0.5s
                if (onRecord) {
                    onRecord(startMs, endMs, targetLabel);
                }

                // Trials increment after FOCUS finishes
                setProtocolCount(prev => {
                    const next = prev + 1;
                    if (next >= targetCount && onFinished) {
                        onFinished(); // Stop the calibration
                    }
                    return next;
                });

                startPhase('REST_POST');
            } else if (newPhase === 'REST_POST') {
                startPhase('REST_PRE'); // Loop
            }
        }, durationMs);

    }, [targetLabel, targetFrequency, onRecord, targetCount, onFinished]);

    const startFlicker = useCallback(() => {
        if (!targetFrequency || targetFrequency <= 0) return;

        if (!flickerRef.current) {
            flickerRef.current = new FlickerStimulus(targetFrequency, (isOn) => {
                // High-performance direct DOM update
                if (stimulusElRef.current) {
                    stimulusElRef.current.style.opacity = isOn ? '1' : '0';
                    stimulusElRef.current.style.backgroundColor = isOn ? 'white' : 'black';
                }
                // Keep react state in sync for other potential uses, 
                // but direct DOM is the primary flicker driver
                setIsLedOn(isOn);
            });
        } else {
            flickerRef.current.updateFrequency(targetFrequency);
        }
        flickerRef.current.start();
    }, [targetFrequency]);

    useEffect(() => {
        return () => {
            if (phaseTimeoutRef.current) clearTimeout(phaseTimeoutRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            if (flickerRef.current) flickerRef.current.stop();
        };
    }, []);

    // Calculate progress based on protocols (cycles)
    const effectiveTargetCount = Math.max(1, Number(targetCount) || 1);
    const trialCount = protocolCount;
    const progressPercent = Math.min(100, (trialCount / effectiveTargetCount) * 100);

    return (
        <div className="flex flex-col h-full bg-[var(--surface)] border-2 border-[var(--border)] rounded-xl overflow-hidden shadow-card animate-in fade-in duration-300">
            {/* Header */}
            <div className="px-3 py-3 border-b border-[var(--border)] bg-[var(--bg)]/50 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                    <div className="font-bold text-[var(--title)] flex items-center text-[18px] gap-2">
                        <Activity className="text-[var(--primary)] animate-pulse" size={20} />
                        SSVEP Collection
                    </div>
                    <div className="text-[14px] font-mono font-bold text-[var(--text-secondary)] uppercase bg-bg px-2 py-0.5 rounded border border-border">
                        Target: <span className="text-primary">{targetFrequency ? `${targetFrequency.toFixed(1)} Hz` : 'Rest'}</span>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                    <div className="flex justify-between items-end text-xs uppercase tracking-widest font-bold">
                        <span className="text-muted">Trials Collected</span>
                        <div className="flex gap-1">
                            <span className="text-text">{trialCount}</span>
                            <span className="text-muted">/ {effectiveTargetCount}</span>
                        </div>
                    </div>
                    <div className="h-2 w-full bg-bg rounded-full overflow-hidden shadow-inner">
                        <div
                            className={`h-full transition-all duration-500 ease-out ${trialCount >= effectiveTargetCount ? 'bg-emerald-500 shadow-glow' : 'bg-primary'}`}
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Stimulus Area */}
            <div className="flex-grow min-h-0 flex flex-col relative items-center justify-center p-1 bg-black/20">
                {phase === 'IDLE' ? (
                    <div className="text-center space-y-3 opacity-50">
                        <Target size={48} className="mx-auto" strokeWidth={1.5} />
                        <p className="text-lg font-bold uppercase tracking-widest">Waiting to Start</p>
                        <p className="text-sm text-muted max-w-xs">Select a frequency and click Start Collection to begin automated trials.</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center w-full h-full space-y-2 animate-in zoom-in-95 duration-300">
                        {/* Visual Stimulus */}
                        <div className="relative flex items-center justify-center w-full h-full rounded-2xl bg-[var(--bg)] border-2 border-border shadow-inner overflow-hidden">
                            {phase === 'FOCUS' ? (
                                <div
                                    ref={stimulusElRef}
                                    className="absolute inset-0 "
                                    style={{
                                        opacity: isLedOn ? 1 : 0,
                                        backgroundColor: isLedOn ? 'white' : 'black',
                                        boxShadow: isLedOn ? 'inset 0 0 50px rgba(255,255,255,0.8)' : 'none'
                                    }}
                                />
                            ) : (
                                <div className="text-[var(--muted)] opacity-50 scale-150">
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                    </svg>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-2 border-t border-[var(--border)] bg-[var(--bg)]/50 flex justify-between items-center">
                {/* Status Text Indicator */}
                <div className={`px-4 py-1.5 rounded-full border-2 text-sm font-black uppercase tracking-widest shadow-lg transition-colors duration-300 
                    ${isCalibrating
                        ? (phase === 'FOCUS'
                            ? 'bg-red-500/20 text-red-500 border-red-500 shadow-red-500/20'
                            : 'bg-blue-500/20 text-blue-500 border-blue-500 shadow-blue-500/20'
                        )
                        : 'bg-yellow-500/20 text-yellow-500 border-yellow-500 shadow-yellow-500/20'}`}>

                    {isCalibrating
                        ? (phase === 'FOCUS'
                            ? '🔴 RECORD'
                            : '⏸ REST')
                        : 'IDLE'}
                </div>
                <div className="text-[16px] font-black text-muted font-mono bg-surface px-2 py-1 rounded">
                    Protocol: 2s ↔ 3s ↔ 2s
                </div>
                {/* Countdown */}
                <div className="text-3xl font-mono font-black text-[var(--text-secondary)]">
                    00:0{timeLeft}
                </div>
            </div>
        </div>
    );
}
