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
    labels = ['Rock', 'Paper', 'Scissors', 'Rest'],
    inline = false
}) {
    // Steps: 'intro', 'countdown', 'recording', 'done'
    const [step, setStep] = useState('intro');
    const [labelIndex, setLabelIndex] = useState(0);
    const [countdown, setCountdown] = useState(3);

    // Store callbacks in ref to avoid re-triggering countdown effect
    const callbacksRef = React.useRef({ labels, targetCount, setTargetLabel, setAutoLimit, onStartRecording });
    useEffect(() => {
        callbacksRef.current = { labels, targetCount, setTargetLabel, setAutoLimit, onStartRecording };
    }, [labels, targetCount, setTargetLabel, setAutoLimit, onStartRecording]);

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
                const { labels: cLabels, targetCount: cTargetCount, setTargetLabel: cSetTargetLabel, setAutoLimit: cSetAutoLimit, onStartRecording: cOnStartRecording } = callbacksRef.current;
                const target = cLabels[labelIndex];
                cSetTargetLabel(target);
                cSetAutoLimit(cTargetCount);
                setTimeout(() => {
                    cOnStartRecording(target);
                    setStep('recording');
                    soundHandler.playRPSStart(); // generic start sound
                }, 100);
            }
        }
        return () => clearTimeout(timer);
    }, [step, countdown, labelIndex]);

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

    const content = (
        <>
            {/* Close Button */}
            {step !== 'recording' && (
                <button onClick={onClose} className={`absolute ${inline ? 'top-2 right-2' : 'top-4 right-4'} text-muted hover:text-white transition-colors z-50`}>
                    <X size={inline ? 16 : 24} />
                </button>
            )}

            {/* Header */}
            <div className={`border-b border-border/50 bg-primary/5 flex items-center gap-3 relative overflow-hidden ${inline ? 'p-3' : 'p-6'}`}>
                <div className="absolute -right-4 -top-4 text-primary/10">
                    <Brain size={inline ? 60 : 120} />
                </div>
                <Brain className="text-primary z-10" size={inline ? 20 : 32} />
                <div className="z-10">
                    <h2 className={`${inline ? 'text-sm' : 'text-2xl'} font-bold text-white tracking-tight`}>{inline ? 'Auto Sequence' : 'Calibration Wizard'}</h2>
                    {!inline && <p className="text-primary/80 font-mono text-sm uppercase tracking-widest">{sensor} Gesture Model</p>}
                </div>
            </div>

            {/* Content Area */}
            <div className={`${inline ? 'p-4 min-h-[200px]' : 'p-8 min-h-[300px]'} flex flex-col items-center justify-center text-center`}>

                {step === 'intro' && (
                    <div className="space-y-4 animate-in zoom-in duration-300 w-full">
                        <div className="flex items-center justify-center gap-3">
                            <div className={`inline-flex items-center justify-center ${inline ? 'w-10 h-10' : 'w-16 h-16'} rounded-full bg-primary/20 text-primary shrink-0`}>
                                <Target size={inline ? 20 : 32} />
                            </div>
                            <p className={`${inline ? 'text-[11px] leading-tight' : 'text-lg'} text-text text-left max-w-[160px]`}>
                                Record exactly <strong>{targetCount} captures</strong> for each gesture.
                            </p>
                        </div>
                        <div className={`grid ${inline ? 'grid-cols-2 gap-x-2 gap-y-2 mt-4' : 'flex flex-wrap justify-center gap-1.5 mt-2'}`}>
                            {labels.map((l, i) => (
                                <span key={i} className={`px-2 py-1 bg-surface font-mono ${inline ? 'text-[10px]' : 'text-xs'} border border-border rounded text-muted text-center truncate`}>
                                    {l}
                                </span>
                            ))}
                        </div>
                        <button
                            onClick={() => setStep('countdown')}
                            className={`mt-4 ${inline ? 'px-4 py-2 text-sm' : 'px-8 py-3 text-lg'} bg-primary text-primary-contrast rounded-xl font-bold shadow-lg shadow-primary/30 hover:scale-105 transition-all w-full flex items-center justify-center gap-2`}
                        >
                            <Play size={inline ? 14 : 20} fill="currentColor" /> START SEQUENCE
                        </button>
                    </div>
                )}

                {step === 'countdown' && (
                    <div className="space-y-2 animate-in fade-in duration-200">
                        <h3 className={`${inline ? 'text-xs' : 'text-xl'} text-muted font-bold uppercase tracking-widest`}>Prepare for</h3>
                        <div className={`${inline ? 'text-3xl' : 'text-6xl'} font-black text-primary drop-shadow-lg scale-110 mb-4`}>
                            {currentLabel}
                        </div>
                        <div className={`${inline ? 'text-[60px]' : 'text-[120px]'} font-mono leading-none font-bold text-white relative`}>
                            <span className="absolute inset-0 animate-ping opacity-20 text-primary">{countdown}</span>
                            {countdown}
                        </div>
                    </div>
                )}

                {step === 'recording' && (
                    <div className={`w-full ${inline ? 'space-y-4' : 'space-y-8'} animate-in slide-in-from-bottom-4 duration-300`}>
                        <div>
                            <h3 className={`${inline ? 'text-[10px]' : 'text-sm'} text-muted font-bold uppercase tracking-widest mb-1`}>Recording</h3>
                            <div className={`${inline ? 'text-2xl' : 'text-5xl'} font-black text-white flex items-center justify-center gap-2`}>
                                <span className={`relative flex ${inline ? 'h-3 w-3' : 'h-6 w-6'}`}>
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className={`relative inline-flex rounded-full ${inline ? 'h-3 w-3' : 'h-6 w-6'} bg-red-500`}></span>
                                </span>
                                {currentLabel}
                            </div>
                        </div>

                        <div className="w-full space-y-1">
                            <div className={`flex justify-between ${inline ? 'text-[10px]' : 'text-sm'} font-mono font-bold`}>
                                <span className="text-muted">Progress</span>
                                <span className="text-primary">{readyCount} / {targetCount}</span>
                            </div>
                            <div className={`${inline ? 'h-2.5' : 'h-4'} w-full bg-bg rounded-full overflow-hidden border border-border`}>
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
                            className={`px-4 py-1.5 bg-bg border border-border text-muted rounded-lg hover:text-red-400 hover:border-red-400/50 transition-colors mx-auto flex items-center gap-2 ${inline ? 'text-xs' : 'text-sm'}`}
                        >
                            <Square size={inline ? 12 : 16} /> Cancel Sequence
                        </button>
                    </div>
                )}

                {step === 'done' && (
                    <div className={`space-y-4 animate-in zoom-in duration-500 delay-150`}>
                        <div className={`inline-flex items-center justify-center ${inline ? 'w-12 h-12' : 'w-24 h-24'} rounded-full bg-emerald-500/20 text-emerald-500 mb-1 shadow-[0_0_30px_rgba(16,185,129,0.3)]`}>
                            <CheckCircle size={inline ? 24 : 50} />
                        </div>
                        <div>
                            <h2 className={`${inline ? 'text-lg' : 'text-3xl'} font-black text-white mb-1`}>Complete!</h2>
                            <p className="text-muted text-xs">Collected {targetCount} captures per gesture.</p>
                        </div>
                        <div className={`flex gap-2 w-full mt-4`}>
                            <button
                                onClick={onClose}
                                className={`flex-1 py-2 bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 rounded-xl font-bold transition-all ${inline ? 'text-xs' : ''}`}
                            >
                                Finish
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Progress Footer (Steps) */}
            {(step === 'countdown' || step === 'recording') && (
                <div className={`bg-bg/50 ${inline ? 'p-2' : 'p-4'} border-t border-border flex justify-center gap-1.5`}>
                    {labels.map((l, i) => (
                        <div
                            key={i}
                            className={`${inline ? 'h-1.5' : 'h-2'} rounded-full transition-all duration-300 ${i < labelIndex ? 'bg-emerald-500 w-8' :
                                i === labelIndex ? 'bg-primary w-12 shadow-[0_0_10px_rgba(255,255,255,0.2)]' :
                                    'bg-border w-6'
                                }`}
                            title={l}
                        />
                    ))}
                </div>
            )}
        </>
    );

    if (inline) {
        return (
            <div className="bg-surface/30 border border-primary/20 rounded-xl overflow-hidden flex flex-col relative w-full animate-in fade-in zoom-in-95 duration-300 shadow-inner">
                {content}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-surface border border-primary/30 rounded-2xl shadow-2xl shadow-primary/20 max-w-lg w-full overflow-hidden flex flex-col relative">
                {content}
            </div>
        </div>
    );
}
