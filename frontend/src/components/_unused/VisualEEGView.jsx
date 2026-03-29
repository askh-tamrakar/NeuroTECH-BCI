import React, { useState, useEffect, useRef } from 'react';
import { Activity, Brain, Zap, Activity as ActivityIcon, Info, Sliders, Layout } from 'lucide-react';
import SignalChart from '../charts/SignalChart';
import '../../styles/views/EEGDashboard.css';

const BANDS = [
    { name: 'Delta', key: 'delta', range: '0.5-4Hz', color: '#6366f1', description: 'Deep sleep, healing' },
    { name: 'Theta', key: 'theta', range: '4-8Hz', color: '#8b5cf6', description: 'Creativity, meditation' },
    { name: 'Alpha', key: 'alpha', range: '8-13Hz', color: '#10b981', description: 'Relaxation, visualization' },
    { name: 'Beta', key: 'beta', range: '12-30Hz', color: '#f59e0b', description: 'Alertness, focus' },
    { name: 'Gamma', key: 'gamma', range: '30-100Hz', color: '#ef4444', description: 'Peak concentration' }
];

export default function VisualEEGView({ wsEvent, isConnected }) {
    const chartRefs = useRef({});
    const [bands, setBands] = useState({
        delta: 0.1,
        theta: 0.1,
        alpha: 0.1,
        beta: 0.1,
        gamma: 0.1
    });
    const [brainState, setBrainState] = useState('Neutral');
    const [lastUpdate, setLastUpdate] = useState(null);

    // Process incoming EEG data
    useEffect(() => {
        if (!wsEvent) return;

        // Handle raw samples for the charts
        if (wsEvent.samples) {
            wsEvent.samples.forEach(sample => {
                if (sample.channels) {
                    // FP1 is usually 0, FP2 is 1 (or named)
                    const fp1 = sample.channels[0] ?? sample.channels.fp1;
                    const fp2 = sample.channels[1] ?? sample.channels.fp2;
                    
                    if (fp1 !== undefined && chartRefs.current[0]) {
                        chartRefs.current[0].addData([{ x: sample.timestamp, y: typeof fp1 === 'number' ? fp1 : fp1.value }]);
                    }
                    if (fp2 !== undefined && chartRefs.current[1]) {
                        chartRefs.current[1].addData([{ x: sample.timestamp, y: typeof fp2 === 'number' ? fp2 : fp2.value }]);
                    }
                }
            });
        }

        // Handle processed brain states/bands
        if (wsEvent.event === 'eeg_mode_result' && wsEvent.output) {
            const out = wsEvent.output;
            if (out.bands) setBands(out.bands);
            if (out.state) setBrainState(out.state);
            setLastUpdate(Date.now());
        }
    }, [wsEvent]);

    return (
        <div className="visual-eeg-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', padding: '20px' }}>
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl">
                        <Layout size={24} className="text-primary" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-text">Brain State Monitor</h2>
                        <p className="text-xs text-muted font-mono uppercase tracking-widest">Frontal Lobe Analysis (FP1 / FP2)</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className={`px-4 py-1.5 rounded-full border ${isConnected ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'} font-bold text-xs flex items-center gap-2`}>
                        <Zap size={14} fill="currentColor" />
                        {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                    </div>
                    <div className="px-4 py-1.5 rounded-full bg-surface/50 border border-border text-xs font-bold text-muted tabular-nums">
                        {lastUpdate ? `Last Sync: ${new Date(lastUpdate).toLocaleTimeString()}` : 'Waiting for Data...'}
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', flex: 1, minHeight: 0 }}>
                {/* Left: Signal Charts */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 0 }}>
                    <div style={{ flex: 1, minHeight: 0 }}>
                        <SignalChart
                            ref={el => chartRefs.current[0] = el}
                            graphNo="FP1"
                            title="Frontal Left"
                            color="#3b82f6"
                            height="100%"
                        />
                    </div>
                    <div style={{ flex: 1, minHeight: 0 }}>
                        <SignalChart
                            ref={el => chartRefs.current[1] = el}
                            graphNo="FP2"
                            title="Frontal Right"
                            color="#10b981"
                            height="100%"
                        />
                    </div>
                </div>

                {/* Right: Analytics Panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Current State Card */}
                    <div className="bg-surface/40 border border-border rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <Brain size={80} />
                        </div>
                        <h3 className="text-xs font-bold text-muted uppercase tracking-[3px] mb-4">Current Mental State</h3>
                        <div className="relative">
                            <span className="text-4xl font-black text-primary uppercase tracking-wider block mb-2">
                                {brainState}
                            </span>
                            <div className="flex items-center gap-2 text-xs font-bold text-muted">
                                <ActivityIcon size={14} className="text-primary" />
                                <span>Real-time Inference Active</span>
                            </div>
                        </div>
                    </div>

                    {/* Wave Bands Monitor */}
                    <div className="bg-surface/40 border border-border rounded-2xl p-6 flex-grow flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xs font-bold text-muted uppercase tracking-[3px]">Wave Bands</h3>
                            <Info size={16} className="text-muted hover:text-primary cursor-help" />
                        </div>
                        
                        <div className="flex flex-col gap-5 flex-grow justify-around">
                            {BANDS.map(band => (
                                <div key={band.key} className="space-y-2">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <span className="text-[13px] font-black text-text/90 uppercase tracking-wider">{band.name}</span>
                                            <span className="text-[10px] text-muted block font-mono">{band.range}</span>
                                        </div>
                                        <span className="text-xs font-bold text-primary font-mono">
                                            {Math.round(bands[band.key] * 100)}%
                                        </span>
                                    </div>
                                    <div className="h-2 bg-bg/50 rounded-full overflow-hidden border border-border/20">
                                        <div 
                                            className="h-full transition-all duration-500 rounded-full"
                                            style={{ 
                                                width: `${Math.min(bands[band.key] * 100, 100)}%`,
                                                backgroundColor: band.color,
                                                boxShadow: `0 0 10px ${band.color}44`
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 pt-6 border-t border-border/30">
                            <button className="w-full py-3 bg-primary/10 border border-primary/30 rounded-xl text-primary text-xs font-bold uppercase tracking-widest hover:bg-primary/20 transition-all flex items-center justify-center gap-2">
                                <Sliders size={14} /> Tune Model Parameters
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
