import React, { useState, useEffect } from 'react';
import { Target, CheckCircle, Brain, Play, Square, X, Loader2 } from 'lucide-react';
import { soundHandler } from '../../handlers/SoundHandler';

export default function AutoCalibrationWizard({
    isActive,
    onClose,
    sensor,
    onStartRecording,
    onStopRecording,
    setTargetLabel,
    setAutoLimit,
    readyCount,
    isRecording,
    targetCount = 10,
    labels = ['Rock', 'Paper', 'Scissors', 'Rest']
}) {
    // Steps: 'intro', 'countdown', 'recording', 'done'
    const [step, setStep] = useState('intro');
    const [labelIndex, setLabelIndex] = useState(0);
    const [countdown, setCountdown] = useState(3);

    // Reset state when wizard opens
    useEffect(() => {
        if (isActive) {
            setStep('intro');
            setLabelIndex(0);
            setCountdown(3);
        }
    }, [isActive]);

    // Handle countdown logic
    useEffect(() => {
        let timer;
        if (step === 'countdown') {
            if (countdown > 0) {
                timer = setTimeout(() => setCountdown(c => c - 1), 1000);
            } else {
                // Countdown finished, start recording
                const target = labels[labelIndex];
                setTargetLabel(target);
                setAutoLimit(targetCount);
                setTimeout(() => {
                    onStartRecording();
                    setStep('recording');
                    soundHandler.playRPSStart(); // generic start sound
                }, 100);
            }
        }
        return () => clearTimeout(timer);
    }, [step, countdown, labelIndex, labels, targetCount, setTargetLabel, setAutoLimit, onStartRecording]);

    // Monitor recording progress
    useEffect(() => {
        if (step === 'recording') {
            if (readyCount >= targetCount && !isRecording) {
                // Finished recording this label
                soundHandler.playRPSWin(); // success sound
                if (labelIndex + 1 < labels.length) {
                    // Next label
                    setLabelIndex(i => i + 1);
                    setCountdown(3);
                    setStep('countdown');
                } else {
                    // All done
                    setStep('done');
                }
            }
        }
    }, [step, readyCount, targetCount, isRecording, labelIndex, labels.length]);

    if (!isActive) return null;

    const currentLabel = labels[labelIndex];
    const progressPercent = Math.min(100, (readyCount / targetCount) * 100);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-surface border border-primary/30 rounded-2xl shadow-2xl shadow-primary/20 max-w-lg w-full overflow-hidden flex flex-col relative">

                {/* Close Button */}
                {(step === 'intro' || step === 'done') && (
                    <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                )}

                {/* Header */}
                <div className="p-6 border-b border-border/50 bg-primary/5 flex items-center gap-3 relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 text-primary/10">
                        <Brain size={120} />
                    </div>
                    <Brain className="text-primary z-10" size={32} />
                    <div className="z-10">
                        <h2 className="text-2xl font-bold text-white tracking-tight">Calibration Wizard</h2>
                        <p className="text-primary/80 font-mono text-sm uppercase tracking-widest">{sensor} Gesture Model</p>
                    </div>
                </div>

                {/* Content Area */}
                <div className="p-8 min-h-[300px] flex flex-col items-center justify-center text-center">

                    {step === 'intro' && (
                        <div className="space-y-6 animate-in zoom-in duration-300">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/20 text-primary mb-2">
                                <Target size={40} />
                            </div>
                            <p className="text-lg text-text max-w-sm mx-auto">
                                This wizard will guide you through recording exactly <strong>{targetCount} samples</strong> for each required gesture.
                            </p>
                            <div className="flex flex-wrap justify-center gap-2 mt-4">
                                {labels.map((l, i) => (
                                    <span key={i} className="px-3 py-1 bg-surface font-mono text-xs border border-border rounded text-muted">
                                        {l}
                                    </span>
                                ))}
                            </div>
                            <button
                                onClick={() => setStep('countdown')}
                                className="mt-8 px-8 py-3 bg-primary text-primary-contrast rounded-xl font-bold text-lg shadow-lg shadow-primary/30 hover:scale-105 transition-all w-full flex items-center justify-center gap-2"
                            >
                                <Play size={20} fill="currentColor" /> START SEQUENCE
                            </button>
                        </div>
                    )}

                    {step === 'countdown' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <h3 className="text-xl text-muted font-bold uppercase tracking-widest">Prepare for</h3>
                            <div className="text-6xl font-black text-primary drop-shadow-lg scale-110 mb-8">
                                {currentLabel}
                            </div>
                            <div className="text-[120px] font-mono leading-none font-bold text-white relative">
                                <span className="absolute inset-0 animate-ping opacity-20 text-primary">{countdown}</span>
                                {countdown}
                            </div>
                        </div>
                    )}

                    {step === 'recording' && (
                        <div className="w-full space-y-8 animate-in slide-in-from-bottom-4 duration-300">
                            <div>
                                <h3 className="text-sm text-muted font-bold uppercase tracking-widest mb-2">Currently Recording</h3>
                                <div className="text-5xl font-black text-white flex items-center justify-center gap-4">
                                    <span className="relative flex h-6 w-6">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-6 w-6 bg-red-500"></span>
                                    </span>
                                    {currentLabel}
                                </div>
                            </div>

                            <div className="w-full space-y-2">
                                <div className="flex justify-between text-sm font-mono font-bold">
                                    <span className="text-muted">Progress</span>
                                    <span className="text-primary">{readyCount} / {targetCount}</span>
                                </div>
                                <div className="h-4 w-full bg-bg rounded-full overflow-hidden border border-border">
                                    <div
                                        className="h-full bg-primary transition-all duration-300 relative overflow-hidden"
                                        style={{ width: `${progressPercent}%` }}
                                    >
                                        <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_1s_infinite] -skew-x-12 translate-x-[-100%]"></div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    onStopRecording();
                                    setStep('intro');
                                }}
                                className="px-6 py-2 bg-bg border border-border text-muted rounded-lg hover:text-red-400 hover:border-red-400/50 transition-colors mx-auto flex items-center gap-2"
                            >
                                <Square size={16} /> Cancel Sequence
                            </button>
                        </div>
                    )}

                    {step === 'done' && (
                        <div className="space-y-6 animate-in zoom-in duration-500 delay-150">
                            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-emerald-500/20 text-emerald-500 mb-2 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                                <CheckCircle size={50} />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-white mb-2">Calibration Complete!</h2>
                                <p className="text-muted text-lg">Successfully collected {targetCount} windows for all gestures.</p>
                            </div>
                            <div className="flex gap-4 w-full mt-8">
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-3 bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 rounded-xl font-bold transition-all"
                                >
                                    Finish
                                </button>
                                {/* Future extension: Auto-Train Model button here */}
                            </div>
                        </div>
                    )}
                </div>

                {/* Progress Footer (Steps) */}
                {(step === 'countdown' || step === 'recording') && (
                    <div className="bg-bg/50 p-4 border-t border-border flex justify-center gap-2">
                        {labels.map((l, i) => (
                            <div
                                key={i}
                                className={`h-2 rounded-full transition-all duration-300 ${i < labelIndex ? 'bg-emerald-500 w-12' :
                                        i === labelIndex ? 'bg-primary w-16 shadow-[0_0_10px_rgba(255,255,255,0.2)]' :
                                            'bg-border w-8'
                                    }`}
                                title={l}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
