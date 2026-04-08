import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Radio } from 'lucide-react';
import FFTWorker from '../../workers/fft.worker.js?worker';

const FFTView = ({ wsUrl }) => {
    const [spectra, setSpectra] = useState({});
    const [selectedChannel, setSelectedChannel] = useState('ch1');

    // Connect to WebSockets to ensure data flows even if LiveView is unmounted
    useEffect(() => {
        if (!wsUrl) return;
        const dataWorker = new Worker(new URL('../../workers/data.worker.js', import.meta.url), { type: 'module' });
        dataWorker.postMessage({ type: 'CONNECT', payload: { url: wsUrl } });

        return () => {
            dataWorker.postMessage({ type: 'DISCONNECT' });
            dataWorker.terminate();
        };
    }, [wsUrl]);

    useEffect(() => {
        const worker = new FFTWorker();

        worker.onmessage = (e) => {
            if (e.data.type === 'FFT_RESULT') {
                setSpectra(e.data.payload);
                // Auto-select first channel if none selected
                if (!selectedChannel) {
                    const keys = Object.keys(e.data.payload);
                    if (keys.length > 0) setSelectedChannel(keys[0]);
                }
            }
        };

        return () => {
            worker.terminate();
        };
    }, []);

    const chartData = useMemo(() => {
        if (!spectra[selectedChannel]) return [];

        // Filter out extreme frequencies (keep 1Hz to 50Hz for normal EEG/SSVEP analysis)
        return spectra[selectedChannel].filter(d => d.freq >= 1 && d.freq <= 50);
    }, [spectra, selectedChannel]);

    return (
        <div className="eeg-view-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px' }}>
            <div className="eeg-view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div className="eeg-view-icon" style={{ padding: '10px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '12px' }}>
                        <Radio size={24} color="#a855f7" />
                    </div>
                    <h2 className="eeg-view-title" style={{ margin: 0, backgroundImage: 'linear-gradient(135deg, #a855f7, #d946ef)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '1.5rem', fontWeight: 'bold' }}>
                        Power Spectrum (FFT)
                    </h2>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    {Object.keys(spectra).map(ch => (
                        <button
                            key={ch}
                            onClick={() => setSelectedChannel(ch)}
                            style={{
                                padding: '6px 16px',
                                borderRadius: '20px',
                                border: `1px solid ${selectedChannel === ch ? '#a855f7' : 'rgba(255,255,255,0.1)'}`,
                                background: selectedChannel === ch ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                                color: selectedChannel === ch ? '#a855f7' : '#9ca3af',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                transition: 'all 0.2s'
                            }}
                        >
                            {ch.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            <div className="eeg-status-box" style={{ flexGrow: 1, borderColor: 'rgba(168, 85, 247, 0.2)', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '16px', padding: '20px', position: 'relative' }}>
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis
                                dataKey="freq"
                                stroke="#9ca3af"
                                tick={{ fill: '#9ca3af', fontSize: 12 }}
                                tickCount={25}
                                type="number"
                                domain={[1, 50]}
                                label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -10, fill: '#9ca3af' }}
                            />
                            <YAxis
                                stroke="#9ca3af"
                                tick={{ fill: '#9ca3af', fontSize: 12 }}
                                tickFormatter={(val) => val.toExponential(1)}
                                label={{ value: 'Power', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid #a855f7', borderRadius: '8px' }}
                                itemStyle={{ color: '#a855f7', fontWeight: 'bold' }}
                                labelStyle={{ color: '#fff' }}
                                formatter={(value) => [value.toExponential(2), 'Power']}
                                labelFormatter={(label) => `${label} Hz`}
                            />
                            <Line
                                type="monotone"
                                dataKey="power"
                                stroke="#a855f7"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 6, fill: '#d946ef', stroke: '#fff', strokeWidth: 2 }}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="waiting-container" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                        <div className="loader-circle" style={{ borderTopColor: '#a855f7' }}></div>
                        <p style={{ marginTop: '15px', color: '#9ca3af' }}>Waiting for EEG stream from worker...</p>
                    </div>
                )}

                {chartData.length > 0 && (
                    <div style={{ position: 'absolute', top: '20px', right: '30px', background: 'rgba(0,0,0,0.6)', padding: '5px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Live Render: </span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#22c55e' }}>Active</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FFTView;
