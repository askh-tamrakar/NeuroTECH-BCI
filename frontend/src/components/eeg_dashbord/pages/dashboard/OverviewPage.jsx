import React from 'react';
import { Activity, Music, Wind, Eye, Grid, MonitorPlay, Layers } from 'lucide-react';

const OVERVIEW_APPS = [
    { id: 'music', title: 'Music Control', icon: Music, desc: 'Control playback using frontal lobe focus states.' },
    { id: 'meditation', title: 'Meditation Trainer', icon: Wind, desc: 'Guided neurofeedback breathing sessions.' },
    { id: 'bubble', title: 'Bubble Game', icon: Activity, desc: 'Interactive peak wave game.' },
    { id: 'ssvep', title: 'SSVEP Interface', icon: Eye, desc: 'Visual cortex stimulation via flickering targets.' },
];

/**
 * OverviewPage — Grid of EEG app cards shown on the dashboard landing page.
 * Props: onSelect (fn)
 */
const OverviewPage = ({ onSelect }) => (
    <div className="eeg-overview-container animate-fade-in w-full">
        <h1 className="eeg-overview-title">Applications Dashboard</h1>
        <p className="eeg-overview-subtitle">Select a neuro-application to begin session.</p>
        <div className="eeg-app-grid">
            {OVERVIEW_APPS.map(app => (
                <div key={app.id} className="eeg-app-card" onClick={() => onSelect(app.id)}>
                    <div className="eeg-app-icon"><app.icon size={28} /></div>
                    <h3>{app.title}</h3>
                    <p>{app.desc}</p>
                </div>
            ))}
        </div>
    </div>
);

export default OverviewPage;
