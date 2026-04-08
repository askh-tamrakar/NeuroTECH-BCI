import React, { useState, useEffect, useCallback } from 'react';
import TimeSeriesZoomChart from '../charts/TimeSeriesZoomChart';

export default function TimeSeriesDemoView() {
    const [realtimeData, setRealtimeData] = useState([]);
    const [recordingData, setRecordingData] = useState([]);
    const [markedWindows, setMarkedWindows] = useState([
        { id: '1', startTime: 1000, endTime: 2500, label: 'Blink', status: 'correct' },
        { id: '2', startTime: 4000, endTime: 5500, label: 'Clench', status: 'incorrect' }
    ]);
    const [selectedWindow, setSelectedWindow] = useState(null);
    const [currentTime, setCurrentTime] = useState(0);

    // Simulate real-time data
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(prev => {
                const next = (prev + 100) % 10000;
                setRealtimeData(current => {
                    const newData = [...current, { 
                        time: next, 
                        value: Math.sin(next / 500) * 50 + (Math.random() * 10),
                        future: Math.sin((next + 1000) / 500) * 50
                    }];
                    // Keep last 5 seconds
                    return newData.filter(d => d.time > next - 5000 || next < 5000).slice(-100);
                });
                return next;
            });
        }, 100);
        return () => clearInterval(interval);
    }, []);

    // Static data for recording demo
    useEffect(() => {
        const data = [];
        for (let i = 0; i < 10000; i += 100) {
            data.push({
                time: i,
                value: Math.cos(i / 1000) * 30 + Math.sin(i / 200) * 20 + (Math.random() * 5)
            });
        }
        setRecordingData(data);
    }, []);

    const handleWindowSelect = useCallback((start, end) => {
        const newWindow = {
            id: Date.now().toString(),
            startTime: start,
            endTime: end,
            label: 'New Label',
            status: 'neutral'
        };
        setSelectedWindow({ startTime: start, endTime: end });
        setMarkedWindows(prev => [...prev, newWindow]);
    }, []);

    return (
        <div className="p-6 space-y-8 animate-in fade-in duration-500">
            <div className="space-y-2">
                <h2 className="text-3xl font-bold text-text">TimeSeriesZoomChart Demo</h2>
                <p className="text-muted">Exploring the capabilities of the BCI signal visualization component.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Real-time Mode Card */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-text">Real-time Mode</h3>
                        <span className="px-2 py-1 bg-green-500/10 text-green-500 text-xs rounded-full border border-green-500/20 uppercase font-bold">Live Stream</span>
                    </div>
                    <div className="h-[350px]">
                        <TimeSeriesZoomChart 
                            data={realtimeData}
                            title="Live EEG Signal (Channel A1)"
                            mode="realtime"
                            scannerX={currentTime}
                            scannerValue={realtimeData[realtimeData.length - 1]?.value}
                            color="#3b82f6"
                            timeWindowMs={5000}
                        />
                    </div>
                    <p className="text-xs text-muted">
                        Simulating a 5-second sliding window with a real-time scanner and "future" baseline prediction (faded line).
                    </p>
                </div>

                {/* Recording Mode Card */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-text">Recording / Labeling Mode</h3>
                        <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full border border-primary/20 uppercase font-bold">Interactive</span>
                    </div>
                    <div className="h-[350px]">
                        <TimeSeriesZoomChart 
                            data={recordingData}
                            title="Recorded Session (Drag to Select)"
                            mode="recording"
                            onWindowSelect={handleWindowSelect}
                            markedWindows={markedWindows}
                            activeWindow={selectedWindow}
                            color="#ec4899"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {markedWindows.map(win => (
                            <div key={win.id} className="text-[10px] px-2 py-1 bg-surface border border-muted rounded flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${win.status === 'correct' ? 'bg-green-500' : win.status === 'incorrect' ? 'bg-orange-500' : 'bg-gray-400'}`}></span>
                                {win.label}: {Math.round(win.startTime)}ms - {Math.round(win.endTime)}ms
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-muted">
                        Interactive selection mode. Click and drag on the chart to create new labels. The colored areas represent existing marked windows.
                    </p>
                </div>
            </div>

            <div className="bg-surface border border-muted p-4 rounded-xl">
                <h4 className="text-sm font-bold text-text mb-2">Technical Summary</h4>
                <ul className="text-xs text-muted list-disc list-inside space-y-1">
                    <li>Built on <b>Recharts</b> for high-performance SVG rendering.</li>
                    <li>Supports <b>ReferenceArea</b> for background highlights and labeling.</li>
                    <li><b>onWindowSelect</b> callback provides precise millisecond timestamps for ML training.</li>
                    <li><b>ResponsiveContainer</b> wrapper ensures fluid layout across device sizes.</li>
                    <li>Dynamic <b>hexToRgba</b> utility for translucent signal overlays.</li>
                </ul>
            </div>
        </div>
    );
}
