import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Target, Activity, CheckCircle2 } from 'lucide-react';

export default function EEGDataCollectionPanel({
    isCalibrating,
    targetLabel,
    targetFrequency,
    onRecord,
    savedCount = 0,
    targetCount = 40
}) {
    // Phases: 'IDLE', 'REST_PRE', 'FOCUS', 'REST_POST'
    const [phase, setPhase] = useState('IDLE');
    const [timeLeft, setTimeLeft] = useState(0);
    // We use a ref for accurate timing
    const phaseTimeoutRef = useRef(null);
    const countdownIntervalRef = useRef(null);
    const focusStartMsRef = useRef(0);
    const animationFrameRef = useRef(null);
    const [isLedOn, setIsLedOn] = useState(false);

    // Initial state sync
    useEffect(() => {
        if (!isCalibrating) {
            setPhase('IDLE');
            setTimeLeft(0);
            setIsLedOn(false);
            if (phaseTimeoutRef.current) clearTimeout(phaseTimeoutRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        } else if (phase === 'IDLE') {
            startPhase('REST_PRE');
        }
    }, [isCalibrating]);

    const startPhase = useCallback((newPhase) => {
        setPhase(newPhase);

        if (phaseTimeoutRef.current) clearTimeout(phaseTimeoutRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

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
                startPhase('REST_POST');
            } else if (newPhase === 'REST_POST') {
                startPhase('REST_PRE'); // Loop
            }
        }, durationMs);

    }, [targetLabel, targetFrequency, onRecord]);

    const startFlicker = useCallback(() => {
        if (!targetFrequency || targetFrequency <= 0) return;

        const periodMs = 1000 / targetFrequency;
        const halfPeriodMs = periodMs / 2;
        let lastToggleTime = performance.now();

        const loop = (timestamp) => {
            const currentPhase = phase; 
            // We can't rely completely on 'phase' variable here due to closure, 
            // but we cancel animation frame when phase changes, so it's safe.
            
            if (timestamp - lastToggleTime >= halfPeriodMs) {
                setIsLedOn((prev) => !prev);
                lastToggleTime = timestamp;
            }
            animationFrameRef.current = requestAnimationFrame(loop);
        };
        animationFrameRef.current = requestAnimationFrame(loop);
    }, [targetFrequency]);

    useEffect(() => {
        return () => {
            if (phaseTimeoutRef.current) clearTimeout(phaseTimeoutRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, []);

    // Calculate progress
    const effectiveTargetCount = Math.max(1, Number(targetCount) || 1);
    const trialCount = Number(savedCount) || 0;
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
            <div className="flex-grow min-h-0 flex flex-col relative items-center justify-center p-4 bg-black/20">
                {phase === 'IDLE' ? (
                    <div className="text-center space-y-3 opacity-50">
                        <Target size={48} className="mx-auto" strokeWidth={1.5} />
                        <p className="text-lg font-bold uppercase tracking-widest">Waiting to Start</p>
                        <p className="text-sm text-muted max-w-xs">Select a frequency and click Start Collection to begin automated trials.</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center w-full h-full space-y-8 animate-in zoom-in-95 duration-300">
                        
                        {/* Status Text Indicator */}
                        <div className={`px-4 py-1.5 rounded-full border-2 text-sm font-black uppercase tracking-widest shadow-lg transition-colors duration-300 ${
                            phase === 'FOCUS' 
                                ? 'bg-red-500/20 text-red-500 border-red-500 shadow-red-500/20' 
                                : 'bg-blue-500/20 text-blue-500 border-blue-500 shadow-blue-500/20'
                        }`}>
                            {phase === 'FOCUS' ? '🔴 FOCUS & RECORD' : '⏸ REST'}
                        </div>

                        {/* Visual Stimulus */}
                        <div className="relative flex items-center justify-center w-48 h-48 sm:w-64 sm:h-64 rounded-2xl bg-[var(--bg)] border-2 border-border shadow-inner overflow-hidden">
                            {phase === 'FOCUS' ? (
                                <div 
                                    className={`absolute inset-0 transition-opacity duration-[10ms] ${isLedOn ? 'bg-white opacity-100' : 'bg-black opacity-0'}`}
                                    style={{ boxShadow: isLedOn ? 'inset 0 0 50px rgba(255,255,255,0.8)' : 'none' }}
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

                        {/* Countdown */}
                        <div className="text-3xl font-mono font-black text-[var(--text-secondary)]">
                            00:0{timeLeft}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-[var(--border)] bg-[var(--bg)]/50 flex justify-between items-center">
                <div className="text-xs uppercase font-bold text-muted flex items-center gap-1">
                    {trialCount >= effectiveTargetCount && <CheckCircle2 size={14} className="text-emerald-500" />}
                    {trialCount >= effectiveTargetCount ? 'Target Reached' : 'Auto-collecting'}
                </div>
                <div className="text-xs text-muted font-mono bg-surface px-2 py-1 rounded">
                    Protocol: 2s ↔ 3s ↔ 2s
                </div>
            </div>
        </div>
    );
}
