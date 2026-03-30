import Tree from 'react-d3-tree';
import { useState, useEffect, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Trash2, Rocket, ArrowRight, Save, Target, ListOrdered, Database, Hand, Eye, Network, Grid3X3, Brain, PieChart, RefreshCw, Sliders, ChevronLeft, ChevronRight, Circle,
    ArrowRightFromLine, Info, BookOpen
} from 'lucide-react';
import { soundHandler } from '../../handlers/SoundHandler';
import { useTheme } from '../../contexts/ThemeContext';
import CustomSelect from '../ui/inputs/CustomSelect';
import CustomSlider from '../ui/inputs/CustomSlider';

const TabButton = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={`px-6 py-2 font-medium rounded-t-lg transition-colors ${active
            ? 'bg-[var(--surface)] text-[var(--accent)] border-t border-x border-[var(--border)]'
            : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]/50'
            }`}
    >
        {children}
    </button>
);

// Helper for tree
const renderCustomNodeElement = ({ nodeDatum, toggleNode }) => (
    <g>
        <circle r="15" fill="var(--primary)" stroke="var(--border)" onClick={toggleNode} />
        <text fill="var(--text)" x="20" dy="5" strokeWidth="0">{nodeDatum.name}</text>
        {nodeDatum.attributes && (
            <text fill="var(--muted)" x="20" dy="25" strokeWidth="0" fontSize="10">
                {Object.entries(nodeDatum.attributes).map(([k, v]) => `${k}: ${v}`).join(', ')}
            </text>
        )}
    </g>
);

// --- NEW/UPDATED COMPONENTS ---

const SavedModelsList = ({ models, selectedModelName, onSelect, onDelete }) => (
    <div className="flex flex-col h-full overflow-hidden">
        <div className="text-lg flex justify-around items-center font-bold text-[var(--muted)] uppercase tracking-widest mb-2 border-b border-[var(--border)] pb-2 px-1">
            <span className=' flex flex-row items-center'>
                <Save color='var(--text)' className="mr-2 w-5 h-5" /> Saved Models
            </span>
        </div>
        <div className="flex-1 overflow-y-auto pr-1 space-y-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {models.length === 0 ? (
                <div className="text-xs text-[var(--muted)] text-center py-4 italic opacity-50">No saved models</div>
            ) : (
                models.map(m => (
                    <div
                        key={m.name}
                        onClick={() => onSelect(m.name)}
                        className={`group flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${selectedModelName === m.name
                            ? 'bg-[var(--primary)]/10 border border-[var(--primary)]'
                            : 'bg-[var(--bg)] border border-transparent hover:border-[var(--border)]'
                            }`}
                    >
                        <div className="min-w-0">
                            <div className={`text-sm font-medium truncate ${selectedModelName === m.name ? 'text-[var(--primary)]' : 'text-[var(--text)]'}`}>
                                {m.name}
                            </div>
                            <div className="text-[10px] text-[var(--muted)] truncate">
                                {new Date(m.created_at).toLocaleDateString()}
                            </div>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(m.name); }}
                            className="p-1 text-[var(--muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete Model"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))
            )}
        </div>
    </div>
);

const SplitAccuracyCard = ({ accuracy, n_samples, source, models, selectedModelName, onSelectModel, onDeleteModel }) => (
    <div className="card h-full flex flex-col p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm hover:shadow-md transition-shadow">

        <div className="flex-1 flex flex-row gap-2 min-h-0 w-full">
            {/* LEFT: List */}
            <div className="w-1/2 border-r border-[var(--border)] pr-2">
                <SavedModelsList
                    models={models}
                    selectedModelName={selectedModelName}
                    onSelect={onSelectModel}
                    onDelete={onDeleteModel}
                />
            </div>

            {/* RIGHT: Accuracy Display */}
            <div className="w-1/2 border-[var(--border)]">
                <div className="flex flex-col h-full overflow-hidden">
                    <h3 className="text-lg flex justify-around items-center font-bold text-[var(--muted)] uppercase tracking-widest border-b border-[var(--border)] pb-2">
                        <span className=' flex flex-row items-center'>
                            <Target color='var(--text)' className="mr-2 w-5 h-5" /> Accuracy
                        </span>
                    </h3>
                    <div className="flex flex-col justify-center items-center text-center h-full w-full">
                        {accuracy !== null && accuracy !== undefined ? (
                            <>
                                <div className="text-4xl lg:text-5xl font-black text-[var(--primary)] mb-2">{(accuracy * 100).toFixed(1)}%</div>
                                <p className="text-sm text-[var(--text)] opacity-70">on {n_samples} test samples</p>
                                {source && <p className="text-xs text-[var(--muted)] mt-2 font-mono bg-[var(--bg)] px-2 py-1 rounded border border-[var(--border)] max-w-full truncate" title={source}>{source}</p>}
                            </>
                        ) : (
                            <div className="text-center opacity-50">
                                <div className="text-2xl text-[var(--muted)] mb-1">--</div>
                                <p className="text-xs text-[var(--muted)]">Select or Train a Model</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </div>
);

const FEATURE_METADATA = {
    'EEG': {
        'score_1': { full: 'Target 1 Strength', short: 'T1-SC', detail: 'The normalized spectral power for the first SSVEP target frequency.' },
        'score_2': { full: 'Target 2 Strength', short: 'T2-SC', detail: 'The normalized spectral power for the second SSVEP target frequency.' },
        'score_3': { full: 'Target 3 Strength', short: 'T3-SC', detail: 'The normalized spectral power for the third SSVEP target frequency.' },
        'score_4': { full: 'Target 4 Strength', short: 'T4-SC', detail: 'The normalized spectral power for the fourth SSVEP target frequency.' },
        'score_5': { full: 'Target 5 Strength', short: 'T5-SC', detail: 'The normalized spectral power for the fifth SSVEP target frequency.' },
        'score_6': { full: 'Target 6 Strength', short: 'T6-SC', detail: 'The normalized spectral power for the sixth SSVEP target frequency.' },
        'max_score': { full: 'Peak Target Power', short: 'MAX', detail: 'The highest score observed across all monitored SSVEP frequencies.' },
        'second_max_score': { full: 'Sub-Peak Power', short: 'SEC-MAX', detail: 'The second highest score; used to calculate detection ratio.' },
        'score_ratio': { full: 'Dominance Ratio', short: 'RATIO', detail: 'Ratio between peak and sub-peak power. Higher values indicate more confident detection.' },
        'score_mean': { full: 'Mean Spectral Power', short: 'MEAN', detail: 'Average power across the entire frequency range being monitored.' },
        'score_std': { full: 'Spectral Multiplicity', short: 'STD', detail: 'Standard deviation of frequency scores, indicating peak sharpness.' },
        'peak_freq': { full: 'Detected Peak (Hz)', short: 'PEAK', detail: 'The specific frequency in Hertz where the maximum power was detected.' },
        'dominant_freq': { full: 'Dominant Target', short: 'DOM-FQ', detail: 'The target frequency that exhibited the highest raw CCA correlation score.' },
        'peak_target_freq': { full: 'Peak Target Frequency', short: 'PK-TGT', detail: 'The target frequency most strongly activated based on the hybrid alignment algorithm.' },
        'bp_delta': { full: 'Delta Band Power', short: 'BPD', detail: 'Absolute spectral power in the 0.5-4 Hz range. Often reflects eye movement artifacts or sleep states.' },
        'bp_theta': { full: 'Theta Band Power', short: 'BPT', detail: 'Absolute spectral power in the 4-8 Hz range. Relevant for assessing drowsiness and deep relaxation.' },
        'bp_alpha': { full: 'Alpha Band Power', short: 'BPA', detail: 'Absolute spectral power in the 8-13 Hz range. High power indicates a relaxed, eyes-closed awake state.' },
        'bp_beta': { full: 'Beta Band Power', short: 'BPB', detail: 'Absolute spectral power in the 13-30 Hz range. Indicates active concentration, focus, or motor planning.' },
        'bp_gamma': { full: 'Gamma Band Power', short: 'BPG', detail: 'Absolute spectral power in the 30+ Hz range. Associated with high-level cognitive processing and sensory binding.' },
        'rel_delta': { full: 'Relative Delta', short: 'rBPD', detail: 'Ratio of Delta band power to total EEG power. Controls for absolute signal amplitude fluctuations.' },
        'rel_theta': { full: 'Relative Theta', short: 'rBPT', detail: 'Ratio of Theta band power to total EEG power.' },
        'rel_alpha': { full: 'Relative Alpha', short: 'rBPA', detail: 'Ratio of Alpha band power to total EEG power.' },
        'rel_beta': { full: 'Relative Beta', short: 'rBPB', detail: 'Ratio of Beta band power to total EEG power.' },
        'rel_gamma': { full: 'Relative Gamma', short: 'rBPG', detail: 'Ratio of Gamma band power to total EEG power.' },
        'max': { full: 'Max Voltage', short: 'MAXv', detail: 'The maximum filtered voltage present in the specific signal window.' },
        'min': { full: 'Min Voltage', short: 'MINv', detail: 'The minimum filtered voltage present in the specific signal window.' }
    },
    'EMG': {
        'mav': { full: 'Mean Absolute Value', short: 'MAV', detail: 'Average amplitude of the rectified EMG signal. Primary indicator of muscle contraction force.' },
        'rms': { full: 'Root Mean Square', short: 'RMS', detail: 'The square root of the mean power of the signal. Reflects the active motor unit count.' },
        'zc': { full: 'Zero Crossings', short: 'ZC', detail: 'Frequency of signal baseline crossings. Relates to motor unit firing rates and noise levels.' },
        'wl': { full: 'Waveform Length', short: 'WL', detail: 'Cumulative length of the EMG waveform. Captures amplitude, frequency, and duration in one metric.' },
        'ssi': { full: 'Simple Square Integral', short: 'SSI', detail: 'Total energy content of the signal window. Useful for long-duration gesture classification.' },
        'wamp': { full: 'Willison Amplitude', short: 'WAMP', detail: 'Number of times the slope changes beyond a threshold. Indicates motor unit recruitment patterns.' },
        'iemg': { full: 'Integrated EMG', short: 'IEMG', detail: 'Area under the curve of the rectified EMG signal. Represents total muscle effort.' },
        'var': { full: 'Signal Variance', short: 'VAR', detail: 'Variance of the EMG signal. Higher values indicate higher amplitude fluctuations.' },
        'ssc': { full: 'Slope Sign Changes', short: 'SSC', detail: 'Measures how often the slope of the signal changes direction. Acts as a frequency domain proxy.' },
        'mean_freq': { full: 'Mean Frequency', short: 'MNF', detail: 'The power-weighted average frequency of the spectrum. Decreases reliably with muscle fatigue.' },
        'median_freq': { full: 'Median Frequency', short: 'MDF', detail: 'The frequency that divides the power spectrum in half. A highly robust indicator of fatigue.' },
        'spectral_entropy': { full: 'Spectral Entropy', short: 'SPEN', detail: 'Measures the information complexity in the frequency domain. High entropy means wide-band activity.' },
        'peak': { full: 'Peak Amplitude', short: 'PEAK', detail: 'Maximum absolute amplitude recorded within the window.' },
        'range': { full: 'Signal Range', short: 'RNG', detail: 'The peak-to-peak difference between the maximum and minimum amplitude within the window.' },
        'd_mav': { full: 'Delta Mean Absolute Value', short: 'ΔMAV', detail: 'Rate of change of the mean absolute value between consecutive windows. Indicates rapid muscle activation.' },
        'd_rms': { full: 'Delta Root Mean Square', short: 'ΔRMS', detail: 'Change in RMS power. High spikes represent explosive motor unit recruitment.' },
        'd_iemg': { full: 'Delta Integrated EMG', short: 'ΔIEMG', detail: 'Change in total window energy. Differentiates sustained tension from sudden flexes.' },
        'd_var': { full: 'Delta Variance', short: 'ΔVAR', detail: 'Change in signal variance. Reflects sudden bursts or drops in muscle fiber recruitment.' },
        'd_wl': { full: 'Delta Waveform Length', short: 'ΔWL', detail: 'Change in waveform length. Detects shifts in frequency and amplitude simultaneously.' },
        'd_zc': { full: 'Delta Zero Crossings', short: 'ΔZC', detail: 'Change in crossing rate. Useful for detecting the onset of muscle fatigue or noise injection.' },
        'd_ssc': { full: 'Delta Slope Sign Changes', short: 'ΔSSC', detail: 'Change in slope direction frequency. Adds temporal dynamics to frequency estimates.' },
        'd_mean_freq': { full: 'Delta Mean Frequency', short: 'ΔMNF', detail: 'Shift in mean frequency. Large negative drops are strong indicators of mounting fatigue.' },
        'd_median_freq': { full: 'Delta Median Frequency', short: 'ΔMDF', detail: 'Shift in median frequency. Tracks the slowing of motor unit action potentials.' },
        'd_spectral_entropy': { full: 'Delta Spectral Entropy', short: 'ΔSPEN', detail: 'Fluctuation in frequency complexity. Identifies transitions from resting to active states.' }
    },
    'EOG': {
        'blink_dur': { full: 'Blink Duration', short: 'DUR', detail: 'Total time in milliseconds of a vertical signal spike corresponding to an eyelid blink.' },
        'blink_amp': { full: 'Blink Peak Power', short: 'AMP', detail: 'Maximum voltage recorded during an eye blink event.' },
        'v_slope': { full: 'Vertical Gaze Velocity', short: 'V-SLOPE', detail: 'Rate of change in the vertical eye signal, used to detect looking up or down.' },
        'h_slope': { full: 'Horizontal Gaze Velocity', short: 'H-SLOPE', detail: 'Rate of change in the horizontal eye signal, used for left/right eye gaze tracking.' },
        'energy': { full: 'Eye Movement Energy', short: 'ENGY', detail: 'Total power of the eye movement signal window, indicating blink or saccade intensity.' },
        'rise_time_ms': { full: 'Blink Rise Time (ms)', short: 'RISE', detail: 'Time taken to reach peak amplitude. Faster rise times indicate more explosive eye movements or sharp blinks.' },
        'fall_time_ms': { full: 'Blink Fall Time (ms)', short: 'FALL', detail: 'Time taken to return to baseline from the peak. Slower fall times may indicate drowsiness.' },
        'asymmetry': { full: 'Blink Asymmetry Ratio', short: 'ASYM', detail: 'Ratio of rise time to fall time. Characterizes the morphological structure of the blink sequence.' },
        'peak_count': { full: 'Blink Peak Count', short: 'PKCT', detail: 'Number of distinct sub-peaks detected. Used to differentiate single from double or flutter blinks.' }
    },
    'GENERIC': {
        'mean': { full: 'Mean Amplitude', short: 'MEAN', detail: 'The average value of the signal window. Represents the DC offset or baseline shift.' },
        'median': { full: 'Median Value', short: 'MED', detail: 'The middle value (50th percentile) of the signal distribution; robust to transient noise.' },
        'variance': { full: 'Signal Variance', short: 'VAR', detail: 'Measure of signal power spread. High variance indicates intense physiological activity.' },
        'std': { full: 'Standard Deviation', short: 'STD', detail: 'The average deviation from the signal baseline. Used to detect signal stability.' },
        'entropy': { full: 'Signal Entropy', short: 'ENT', detail: 'Measures signal complexity. High entropy suggests chaotic or high-information activity.' },
        'skewness': { full: 'Signal Skewness', short: 'SKEW', detail: 'Measures asymmetry in the signal. Detects if activity biased towards positive or negative peaks.' },
        'kurtosis': { full: 'Signal Kurtosis', short: 'KURT', detail: 'Measures peak sharpness. High values detect sharp transient spikes or eye blinks.' },
        'energy': { full: 'Total Energy', short: 'ENGY', detail: 'Cumulative signal power. Primary measure of total effort or intensity in the window.' },
        'mobility': { full: 'Hjorth Mobility', short: 'MOB', detail: 'Relates to the mean frequency of the signal. Essential for gesture classification.' },
        'complexity': { full: 'Hjorth Complexity', short: 'CMPLX', detail: 'Measures how much the signal shape differs from a pure sine wave.' }
    }
};

const FeatureInsightCard = ({ importances, featureOrder, sensor }) => {
    const [view, setView] = useState('importance'); // 'importance' or 'list'
    const [selectedFeature, setSelectedFeature] = useState(null);

    const sensorMetadata = FEATURE_METADATA[sensor] || {};
    const genericMetadata = FEATURE_METADATA['GENERIC'] || {};
    const fullMetadata = { ...genericMetadata, ...sensorMetadata };
    const features = featureOrder || Object.keys(sensorMetadata) || [
        'score_1', 'score_2', 'score_3', 'score_4', 'score_5', 'score_6',
        'max_score', 'second_max_score', 'score_ratio', 'score_mean', 'score_std', 'peak_freq'
    ];

    useEffect(() => {
        if (features.length > 0) {
            setSelectedFeature(features[0]);
        }
    }, [sensor, features.length]);

    const sortedImportances = Object.entries(importances || {}).sort(([, a], [, b]) => b - a);
    const activeDetail = fullMetadata[selectedFeature] || { full: selectedFeature, short: selectedFeature, detail: 'No detailed metadata available for this feature.' };

    return (
        <div className="card h-full flex flex-col p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm relative group/card overflow-hidden">
            <div className="flex justify-between items-center mb-4 border-b border-[var(--border)] pb-2">
                <h3 className="text-[18px] flex items-center font-bold text-[var(--muted)] uppercase tracking-widest">
                    <ListOrdered size={32} className='mr-4 border border-text bg-bg rounded-[4px]' color='var(--text)' />
                    <span className="flex items-center gap-2">
                        {view === 'importance' ? 'Top Features' : 'Feature Set'}
                        <span className="text-[12px] bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 rounded-full text-[var(--text)] font-mono">{view === 'importance' ? sortedImportances.length : features.length}</span>
                    </span>
                    <span className="ml-3 text-[10px] bg-[var(--primary)]/20 text-[var(--primary)] px-2 py-0.5 rounded-full">{sensor}</span>
                </h3>

                <button
                    onClick={() => setView(view === 'importance' ? 'list' : 'importance')}
                    className="p-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider"
                >
                    {view === 'importance' ? <Grid3X3 size={14} /> : <ListOrdered size={14} />}
                    {view === 'importance' ? 'Grid' : 'Rank'}
                </button>
            </div>

            <div className="flex-1 min-h-0 relative">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={view}
                        initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
                        transition={{ duration: 0.3 }}
                        className="h-full"
                    >
                        {view === 'importance' ? (
                            <ul className="h-full overflow-y-auto pr-2 space-y-1.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {sortedImportances.length > 0 ? sortedImportances.map(([name, imp]) => (
                                    <li key={name} className="flex items-center text-[var(--text)] group hover:bg-[var(--bg)]/30 rounded-lg px-2 py-1 transition-all border border-transparent hover:border-[var(--border)]">
                                        <span className="w-24 font-mono text-[14px] text-[var(--muted)] truncate font-bold" title={name}>{fullMetadata[name]?.short || name}</span>
                                        <div className="flex-1 h-2 bg-[var(--bg)] rounded-full mx-2 overflow-hidden border border-[var(--border)]/50">
                                            <div className="h-full bg-[var(--primary)] group-hover:bg-[var(--accent)] transition-all shadow-[0_0_8px_var(--primary)]" style={{ width: `${Math.min(100, Math.max(0, imp * 100))}%` }}></div>
                                        </div>
                                        <span className="text-[14px] w-12 text-right font-black">{(imp * 100).toFixed(1)}%</span>
                                    </li>
                                )) : (
                                    <div className="flex flex-col items-center justify-center h-full opacity-30 italic text-sm">No importance data available</div>
                                )}
                            </ul>
                        ) : (
                            <div className="h-full flex gap-3">
                                {/* Left Side: Master List */}
                                <div className="w-[45%] flex flex-col min-h-0">
                                    <div className="flex-1 overflow-y-auto pr-2 space-y-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                        {features.map((feature) => (
                                            <button
                                                key={feature}
                                                onClick={() => setSelectedFeature(feature)}
                                                className={`w-full text-left rounded-lg border px-2 py-1 transition-all flex flex-col gap-0 group/btn ${selectedFeature === feature
                                                    ? 'bg-[var(--primary)]/15 border-[var(--primary)] shadow-[0_0_12px_var(--primary)]/20 shadow-inner'
                                                    : 'bg-[var(--bg)]/30 border-[var(--border)] hover:border-[var(--muted)]'
                                                    }`}
                                            >
                                                <div className={`text-[12px] font-black tracking-widest ${selectedFeature === feature ? 'text-[var(--primary)]' : 'text-[var(--muted)]'}`}>
                                                    {fullMetadata[feature]?.short || feature}
                                                </div>
                                                <div className="text-[10px] text-[var(--text)] opacity-60 truncate group-hover/btn:opacity-100 transition-opacity">
                                                    {fullMetadata[feature]?.full || feature}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Right Side: Detail Card */}
                                <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg)]/40 rounded-xl border border-[var(--border)] p-4 relative shadow-2xl">
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={selectedFeature}
                                            initial={{ opacity: 0, x: 10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            transition={{ duration: 0.2 }}
                                            className="h-full flex flex-col"
                                        >
                                            <div className="text-[10px] uppercase font-bold text-[var(--primary)] tracking-[0.2em] mb-1">Feature Detail</div>
                                            <h4 className="text-[18px] font-black text-[var(--text)] leading-tight mb-3 border-b border-[var(--border)] pb-2">
                                                {activeDetail.full}
                                            </h4>
                                            <p className="text-[14px] leading-relaxed text-[var(--muted)] font-medium">
                                                {activeDetail.detail}
                                            </p>

                                            <div className="mt-auto pt-4 flex justify-between items-center text-[10px] font-bold text-[var(--muted)] border-t border-[var(--border)]/50">
                                                <span className="uppercase tracking-widest">Type: Signal Feature</span>
                                                <span className="font-mono bg-[var(--bg)] px-2 py-0.5 rounded border border-[var(--border)]">{selectedFeature}</span>
                                            </div>
                                        </motion.div>
                                    </AnimatePresence>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};

const HyperparametersCard = ({ params, onChange }) => (
    <div className="card h-full flex flex-col p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm">
        <div className="text-[18px] flex items-center font-bold text-[var(--muted)] uppercase tracking-widest border-b border-[var(--border)] pb-2">
            <Sliders size={32} className='mr-4 border border-text bg-bg rounded-[4px]' color='var(--text)' /> Hyperparameters
        </div>
        <div className="pt-2 px-2 space-y-1 flex-1 overflow-hidden">
            <div>
                <div className="flex justify-between">
                    <span className="text-xs font-bold text-[var(--text)] uppercase tracking-tight">Trees</span>
                    <span className="text-sm font-black font-mono text-[var(--primary)]">{params.n_estimators}</span>
                </div>
                <CustomSlider
                    min={5}
                    max={500}
                    step={5}
                    value={params.n_estimators}
                    onChange={(v) => onChange({ target: { name: 'n_estimators', value: v } })}
                />
            </div>
            <div>
                <div className="flex justify-between">
                    <span className="text-xs font-bold text-[var(--text)] uppercase tracking-tight">Max Depth</span>
                    <span className="text-sm font-black font-mono text-[var(--primary)]">{params.max_depth}</span>
                </div>
                <CustomSlider
                    min={2}
                    max={50}
                    step={1}
                    value={params.max_depth}
                    onChange={(v) => onChange({ target: { name: 'max_depth', value: v } })}
                />
            </div>
            <div>
                <div className="flex justify-between">
                    <span className="text-xs font-bold text-[var(--text)] uppercase tracking-tight">Test Size</span>
                    <span className="text-sm font-black font-mono text-[var(--primary)]">{params.test_size}</span>
                </div>
                <CustomSlider
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={params.test_size}
                    onChange={(v) => onChange({ target: { name: 'test_size', value: v } })}
                />
            </div>
            <div>
                <div className="flex justify-between">
                    <span className="text-xs font-bold text-[var(--text)] uppercase tracking-tight">Pruning</span>
                    <span className="text-sm font-black font-mono text-[var(--primary)]">{params.min_impurity_decrease}</span>
                </div>
                <CustomSlider
                    min={0}
                    max={0.1}
                    step={0.001}
                    value={params.min_impurity_decrease}
                    onChange={(v) => onChange({ target: { name: 'min_impurity_decrease', value: v } })}
                />
            </div>
        </div>
    </div>
);

const EEGModelInsightCard = ({ result, selectedSessionName, params }) => {
    // Calculate split from test_size (e.g. 0.2 -> 80/20)
    const testSize = params?.test_size || 0.2;
    const trainPct = Math.round((1 - testSize) * 100);
    const testPct = Math.round(testSize * 100);

    return (
        <div className="card h-full flex flex-col p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm relative group/insight">
            <h3 className="text-[18px] flex items-center font-bold text-[var(--muted)] uppercase tracking-widest border-b border-[var(--border)] pb-2">
                <Brain size={32} className='mr-4 border border-text bg-bg rounded-[4px]' color='var(--text)' /> EEG Model Insight
            </h3>

            <div className="flex-1 grid grid-cols-3 gap-6 py-4 min-h-0">
                {/* Left: Identity - Highly Legible */}
                <div className="flex flex-col justify-between border-r border-[var(--border)] pr-6">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)] mb-0.5 font-bold">Model Name</div>
                        <div className="text-3xl font-black text-[var(--primary)] truncate" title={result?.model_name || 'Neuro'}>
                            {result?.model_name || 'Neuro'}
                        </div>
                    </div>
                    <div className="space-y-2.5 mt-4">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Classifier</span>
                            <span className="font-mono text-sm font-bold text-[var(--primary)] px-2 py-1 bg-[var(--bg)] rounded-lg border border-[var(--border)] shadow-sm">{result?.classifier || 'LDA'}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-bold">Session</span>
                            <span className="text-sm font-black text-[var(--text)] truncate opacity-90" title={selectedSessionName}>{selectedSessionName}</span>
                        </div>
                    </div>
                </div>

                {/* Middle: Pipeline Detail - ENLARGED & COMPACT */}
                <div className="flex flex-col justify-between border-r border-[var(--border)] px-4 text-center">
                    <div className="space-y-3.5">
                        <div>
                            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)] mb-1 font-bold">Data Split</div>
                            <div className="text-4xl font-black text-[var(--text)] tracking-tighter">
                                <span className="text-[var(--primary)]">{trainPct}</span>
                                <span className="mx-1 text-[var(--muted)] opacity-50">/</span>
                                <span className="text-[var(--accent)]">{testPct}</span>
                            </div>
                            <div className="text-[10px] uppercase text-[var(--muted)] mt-0.5 font-mono font-bold tracking-tight">Train/Test %</div>
                        </div>

                        <div className="pt-3 border-t border-[var(--border)]/50">
                            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)] mb-1 font-bold">Optimization</div>
                            <div className="text-xl font-black text-[var(--text)] uppercase tracking-tight">{result?.solver ? result.solver.toUpperCase() : 'LSQR + AUTO'}</div>
                            <div className="text-[10px] uppercase text-[var(--muted)] font-mono font-bold">Shrinkage: Lead-Led</div>
                        </div>
                    </div>
                </div>

                {/* Right: Model Specifics - High Density */}
                <div className="flex flex-col justify-between pl-6 font-bold">
                    <div>
                        <div className="flex justify-between items-end mb-1">
                            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">Components</div>
                            <div className="text-3xl font-black text-[var(--primary)]">{result?.visualization?.component_count ?? '6'}</div>
                        </div>
                        <div className="w-full h-2 bg-[var(--bg)] rounded-full overflow-hidden border border-[var(--border)] shadow-inner">
                            <div className="h-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary)]" style={{ width: `${(result?.visualization?.component_count || 6) * 10}%` }} />
                        </div>
                    </div>

                    <div className="space-y-2.5 mt-4">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Validation</span>
                            <span className="text-xs font-mono font-black text-[var(--text)] bg-[var(--bg)] px-2 py-0.25 rounded border border-[var(--border)]">K-Fold: 5</span>
                        </div>
                        <div className="flex flex-col gap-1 pt-2.5 border-t border-[var(--border)]">
                            <span className="text-[10px] uppercase tracking-widest text-[var(--muted)]">File Path</span>
                            <span className="text-[10px] font-mono font-bold text-[var(--primary)] truncate py-1 px-2 bg-[var(--bg)] rounded-lg border border-[var(--border)]" title={result?.model_path}>
                                {result?.model_path ? result.model_path.split(/[\\/]/).pop() : 'Neuro.joblib'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const EEGHyperparametersCard = ({ params, onChange }) => (
    <div className="card h-full flex flex-col p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm">
        <h3 className="text-[18px] flex items-center font-bold text-[var(--muted)] uppercase tracking-widest border-b border-[var(--border)] pb-2">
            <Sliders size={32} className='mr-4 border border-text bg-bg rounded-[4px]' color='var(--text)' /> EEG Parameters
        </h3>
        <div className="py-2 px-2 space-y-3 flex-1 overflow-visible">
            <div>
                <div className="text-base font-bold text-[var(--text)] uppercase tracking-tight mb-1">Solver</div>
                <CustomSelect
                    value={params.solver || 'eigen'}
                    onChange={(value) => onChange({ target: { name: 'solver', value } })}
                    options={[
                        { value: 'svd', label: 'SVD' },
                        { value: 'lsqr', label: 'LSQR' },
                        { value: 'eigen', label: 'Eigen' }
                    ]}
                />
            </div>
            <div>
                <div className="text-base font-bold text-[var(--text)] uppercase tracking-tight mb-1">Shrinkage</div>
                <CustomSelect
                    value={params.shrinkage || 'auto'}
                    onChange={(value) => onChange({ target: { name: 'shrinkage', value } })}
                    options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'none', label: 'Manual' }
                    ]}
                />
            </div>
            <div>
                <div className="flex justify-between mb-0.5">
                    <span className="text-base font-bold text-[var(--text)] uppercase tracking-tight">Test Size</span>
                    <span className="text-sm font-black font-mono text-[var(--primary)]">{params.test_size}</span>
                </div>
                <CustomSlider
                    min={0.1}
                    max={0.5}
                    step={0.05}
                    value={params.test_size}
                    onChange={(v) => onChange({ target: { name: 'test_size', value: v } })}
                />
            </div>
        </div>
    </div>
);


const EEGLDAVisualizationCard = ({ result }) => {
    const [view, setView] = useState('data'); // 'data' or 'guide'
    const centroids = result?.visualization?.class_centroids || [];
    const signatures = result?.visualization?.class_signatures || [];

    return (
        <div className="card h-full flex flex-col px-4 pb-4 pt-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm relative group/lda">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
                <h3 className="text-[18px] flex items-center font-bold text-[var(--muted)] uppercase tracking-widest">
                    <PieChart size={32} className='mr-2 border border-text bg-bg rounded-[4px]' color='var(--text)' /> LDA Signature View
                </h3>

                {/* View Toggle */}
                <button
                    onClick={() => setView(view === 'data' ? 'guide' : 'data')}
                    className="p-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider"
                    title={view === 'data' ? "View Technical Details / Guide" : "Return to Data View"}
                >
                    {view === 'data' ? <Info size={14} /> : <BookOpen size={14} />}
                    {view === 'data' ? 'Details' : 'Data'}
                </button>
            </div>

            <div className="flex-1 min-h-0 relative">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={view}
                        initial={{ opacity: 0, filter: 'blur(8px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, filter: 'blur(8px)' }}
                        transition={{ duration: 0.3 }}
                        className="h-full"
                    >
                        {view === 'data' ? (
                            <div className="pt-2 border-b border-border flex-1 grid gap-4 lg:grid-cols-2 h-full min-h-0">
                                <div className="space-y-4 overflow-y-auto h-full pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                    <div className="text-xs uppercase tracking-widest text-[var(--muted)] sticky top-0 bg-[var(--surface)] py-1 z-10">Class Centroids</div>
                                    {centroids.length ? centroids.map((centroid) => (
                                        <Fragment key={centroid.label}>
                                            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/30 px-3 py-3 transition-all hover:bg-[var(--bg)]/40">
                                                <div className="flex items-center justify-between text-[22px] font-bold">
                                                    <span><RenderClassLabel label={centroid.name} sensor="EEG" /></span>
                                                    <span className="text-[var(--primary)] text-base">{centroid.count} samples</span>
                                                </div>
                                                <div className="mt-2 flex gap-6 text-[15px] font-mono text-[var(--muted)]">
                                                    <span className="flex items-center gap-1.5 uppercase tracking-tighter">LD1 <b className="text-[var(--text)] text-[18px]">{centroid.ld1?.toFixed?.(2) ?? '0.00'}</b></span>
                                                    <span className="flex items-center gap-1.5 uppercase tracking-tighter">LD2 <b className="text-[var(--text)] text-[18px]">{centroid.ld2?.toFixed?.(2) ?? '0.00'}</b></span>
                                                </div>
                                            </div>
                                            <div />
                                        </Fragment>
                                    )) : (
                                        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/25 px-3 py-4 text-xs text-[var(--muted)]">
                                            Centroid visualization will appear after training or evaluation returns the LDA projection.
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-4 overflow-y-auto h-full pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                    <div className="text-xs uppercase tracking-widest text-[var(--muted)] sticky top-0 bg-[var(--surface)] py-1 z-10">Class Signatures</div>
                                    {signatures.length ? signatures.map((signature) => (
                                        <Fragment key={signature.label}>
                                            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/30 px-3 py-4 transition-all hover:bg-[var(--bg)]/40">
                                                <div className="text-[20px] font-bold text-[var(--text)] mb-3"><RenderClassLabel label={signature.name} sensor="EEG" /></div>
                                                <div className="space-y-2.5">
                                                    {signature.signature.map((feature) => (
                                                        <div key={`${signature.label}-${feature.feature}`} className="flex items-center gap-3">
                                                            <span className="w-28 text-[15px] font-mono text-[var(--muted)] truncate">{feature.feature}</span>
                                                            <div className="flex-1 h-3 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden">
                                                                <div className="h-full bg-[var(--primary)]" style={{ width: `${Math.max(4, feature.relative * 100)}%` }} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div />
                                        </Fragment>
                                    )) : (
                                        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/25 px-3 py-4 text-xs text-[var(--muted)]">
                                            Signature bars will appear once the backend returns class-level LDA weights.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full pt-6 overflow-y-auto pr-4 space-y-6 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                <div className="space-y-3">
                                    <h4 className="text-[34px] font-black text-[var(--primary)] uppercase tracking-tighter leading-none">Class Centroids Guide</h4>
                                    <p className="text-[18px] text-[var(--text)] leading-relaxed opacity-90 font-medium">
                                        Each brain state is projected into a <b>2D Discriminant Space</b>. The centroids represent the statistical center of all neurofeedback samples for that target.
                                        LD1 and LD2 are axes optimized to maximize the separation between your focused concentration and rest states.
                                    </p>
                                </div>
                                <div className="border-t border-[var(--border)] pt-2 space-y-3">
                                    <h4 className="text-[34px] font-black text-[var(--primary)] uppercase tracking-tighter leading-none">Signature Significance</h4>
                                    <p className="text-[18px] text-[var(--text)] leading-relaxed opacity-90 font-medium">
                                        Signatures reveal the <b>diagnostic weight</b> of each feature score. A longer bar indicates that the specific frequency or metric was a primary driver for identifying that state successfully.
                                        Use these to verify which brain frequencies are providing the most robust control signals for your BCI.
                                    </p>
                                </div>
                                <div className="bg-text/5 p-6 rounded-2xl border-l-[8px] border-primary text-[17px] text-text font-mono shadow-lg">
                                    <b className="text-[var(--primary)] block mb-1 text-[20px]">DATA INSIGHT:</b>
                                    Stable classification is achieved when centroids are widely separated and signature weights are consistently strong across features.
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};

const RenderClassLabel = ({ label, sensor }) => {
    const val = String(label);

    // EOG Special Icons
    if (sensor === 'EOG') {
        if (val === '0' || val.toLowerCase() === 'rest') return <span className="flex items-center justify-center" title="Rest (0)"><Circle className="w-4 h-4 opacity-40" /></span>;
        if (val === '1' || val.toLowerCase() === 'singleblink') return <span className="flex items-center justify-center" title="Single Blink (1)"><Eye className="w-4 h-4 text-[var(--primary)]" /></span>;
        if (val === '2' || val.toLowerCase() === 'doubleblink') return (
            <span className="flex items-center justify-center gap-0.5" title="Double Blink (2)">
                <Eye className="w-4 h-4 text-[var(--primary)]" />
                <Eye className="w-4 h-4 text-[var(--primary)] -ml-1.5" />
            </span>
        );
    }

    // EEG / SSVEP frequency labels
    if (sensor === 'EEG') {
        const freqMap = {
            'Target 1': '8Hz',
            'Target 2': '9Hz',
            'Target 3': '12Hz',
            'Target 4': '14.4Hz',
            'Target 5': '16Hz',
            'Target 6': '18Hz',
            '1': '8Hz',
            '2': '9Hz',
            '3': '12Hz',
            '4': '14.4Hz',
            '5': '16Hz',
            '6': '18Hz'
        };

        // If the label is already a frequency (e.g. "8Hz"), just show it
        if (val.includes('Hz')) return <span>{val}</span>;
        // If it's a known generic target name or index, map it
        if (freqMap[val]) return <span>{freqMap[val]}</span>;
        // Rest handling
        if (val === '0' || val.toLowerCase() === 'rest') return <span>Rest</span>;
    }

    // EMG Labels Fallback
    if (sensor === 'EMG') {
        const emgMap = {
            '0': 'Rest',
            '1': 'Rock',
            '2': 'Paper',
            '3': 'Scissors'
        };
        if (emgMap[val]) return <span>{emgMap[val]}</span>;
    }

    // Default fallback
    return <span>{label}</span>;
}

const ConfusionMatrixCard = ({ matrix, labels, n_samples, sensor }) => {
    // ADJUST THIS SCALE TO CHANGE SIZE (e.g. 0.8 to shrink, 1.2 to enlarge)
    const scale = 1.125;
    const cellSize = Math.floor(64 * scale);
    const labelWidth = Math.max(cellSize, 70); // Tighter label column

    // Precisely calculate the total width of the matrix to eliminate right-side space
    const totalTableWidth = (labels?.length || 0) * cellSize + labelWidth;
    const cardWidth = sensor === 'EEG' ? totalTableWidth + 32 : null; // 32 for px-4 padding

    return (
        <div
            className={`card bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm pt-1 pr-4 pb-5 ${sensor === 'EEG' ? 'h-fit ml-0' : 'h-full flex flex-col'}`}
            style={sensor === 'EEG' ? { width: cardWidth, minWidth: cardWidth } : {}}
        >
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-2 pt-2 gap-2 overflow-hidden">
                <h3 className="text-[18px] flex items-center font-bold text-[var(--muted)] uppercase tracking-widest truncate">
                    <Grid3X3 size={28} className='mr-2 border border-text bg-bg rounded-[4px] shrink-0' color='var(--bg)' fill='var(--text)' />
                    <span className="truncate">Confusion Matrix</span>
                    {n_samples !== undefined && <span className="ml-1 text-[12px] normal-case opacity-70 shrink-0">({n_samples}) Samples</span>}
                </h3>
                <div className="flex items-center gap-1.5 text-[13px] bg-[var(--bg)] px-[6px] py-[2px] shrink-0">
                    <span className="font-bold text-[var(--text)]">Actual</span>
                    <span className="text-[var(--muted)]"><ArrowRight size={12} /></span>
                    <span className="font-bold text-[var(--primary)]">Predicted</span>
                </div>
            </div>
            <div className={`flex-grow overflow-auto relative [&::-webkit-scrollbar]:hidden ${sensor === 'EEG' ? '' : 'flex flex-col h-full'}`} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {matrix ? (
                    <table className={`text-center text-[var(--text)] border-collapse table-fixed ${sensor === 'EEG' ? 'w-auto' : 'min-w-[42rem] w-full h-full text-[16px]'}`}>
                        <thead>
                            <tr>
                                <th className="p-2 text-left text-[var(--muted)] font-normal italic border-b border-[var(--border)] bg-[var(--bg)]/30" style={sensor === 'EEG' ? { width: labelWidth, fontSize: 12 * scale } : { width: 70 }}>Class</th>
                                {labels.map((l, i) => (
                                    <th key={i} className="p-2 font-bold text-[var(--primary)] border-b border-[var(--border)] bg-[var(--bg)]/10 truncate" style={sensor === 'EEG' ? { width: cellSize, fontSize: 12 * scale } : {}}>
                                        <RenderClassLabel label={l} sensor={sensor} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {matrix.map((row, i) => (
                                <tr key={i} className="hover:bg-[var(--surface)]/50 transition-colors group">
                                    <td className="py-1 pl-2 font-bold text-[var(--text)] text-left border-r border-[var(--border)] bg-[var(--bg)]/20 truncate" style={sensor === 'EEG' ? { width: labelWidth, height: cellSize, fontSize: 12 * scale } : {}}>
                                        <RenderClassLabel label={labels[i]} sensor={sensor} />
                                    </td>
                                    {row.map((cell, j) => (
                                        <td key={j} className={`border border-[var(--border)] transition-all ${i === j
                                            ? 'bg-[var(--primary)]/20 font-black text-[var(--primary)]'
                                            : cell > 0 ? 'bg-red-500/10 text-red-400 font-medium' : 'text-[var(--muted)] opacity-20'
                                            }`}
                                            style={sensor === 'EEG' ? { width: cellSize, height: cellSize, p: 0, fontSize: 15 * scale } : { p: 2 }}>
                                            {cell}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="text-3xl text-[var(--muted)] mb-1">N/A</div>
                        <p className="text-sm text-[var(--muted)] opacity-60">No confusion data</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const getDepth = (node) => {
    if (!node) return 0;
    if (!node.children || node.children.length === 0) return 1;
    return 1 + Math.max(...node.children.map(getDepth));
};

const DecisionTreeCard = ({ structure, treeIndex, totalTrees, onTreeChange, loading }) => {
    const depth = getDepth(structure);
    return (
        <div className="card h-full flex flex-col p-0 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden relative group">
            <div className="absolute top-4 left-4 z-10 bg-[var(--bg)]/90 backdrop-blur px-3 py-2 rounded border border-[var(--border)] shadow-sm flex flex-col gap-2">
                <div className="flex justify-between items-center gap-4">
                    <h3 className="text-sm flex items-center font-bold text-[var(--text)]">
                        <Network size={28} className='mr-2 border border-text bg-bg rounded-[4px]' color='var(--text)' /> Decision Tree Visualization
                    </h3>
                    <span className="text-xs font-mono text-[var(--primary)]">Tree {treeIndex + 1} / {totalTrees}</span>
                </div>

                {totalTrees > 1 && (
                    <div className="flex items-center gap-2">
                        <button
                            disabled={treeIndex <= 0}
                            onClick={() => onTreeChange(treeIndex - 1)}
                            className="p-1 rounded hover:bg-[var(--surface)] disabled:opacity-30"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <input
                            type="range"
                            min="0"
                            max={totalTrees - 1}
                            value={treeIndex}
                            onChange={(e) => onTreeChange(parseInt(e.target.value))}
                            className="w-32 accent-[var(--primary)] h-1.5"
                        />
                        <button
                            disabled={treeIndex >= totalTrees - 1}
                            onClick={() => onTreeChange(treeIndex + 1)}
                            className="p-1 rounded hover:bg-[var(--surface)] disabled:opacity-30"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>

            <div className={`w-full h-full bg-[var(--bg)] transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`} style={{ minHeight: '400px' }}>
                {structure ? (
                    <Tree
                        /* key={treeIndex} Force re-render removed to keep zoom */
                        data={structure}
                        orientation="vertical"
                        translate={{ x: 400, y: 50 }}
                        pathFunc="step"
                        depthFactor={depth < 10 ? 100 : undefined}
                        separation={{ siblings: 1.5, nonSiblings: 2 }}
                        zoomable={true}
                        renderCustomNodeElement={renderCustomNodeElement}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-[var(--muted)]">Loading Tree...</div>
                )}
            </div>
        </div>
    );
};

// // Updated ControlPanel (Added Model Name Input)
const ControlPanel = ({
    onTrain,
    loading,
    sessions,
    selectedSession,
    onSessionSelect,
    onRefreshSessions,
    activeTab,
    setActiveTab,
    modelName,
    setModelName,
    onSwitchLab
}) => (
    <div className="space-y-4">
        {/* Session Select */}
        <div className="card p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex flex-col gap-2">
            <span className="flex flex-row justify-between">
                <div className="p-1 flex items-center justify-between gap-2 bg-surface/50">
                    <div className="flex flex-row items-center gap-2.5">
                        <span className="flex flex-row text-[22px] items-center font-bold tracking-tight">
                            <Brain size={24} className="text-primary mr-1" /> ML Training
                            <button
                                onClick={onSwitchLab}
                                className="transition-all group flex items-center ml-4 gap-3"
                                title="Switch to Data Collection"
                            >
                                < ArrowRightFromLine size={18} className="text-muted group-hover:text-primary transition-all group-hover:translate-x-0.5" />
                                <Database size={24} className="text-muted group-hover:text-primary transition-colors" />
                            </button>
                        </span>
                    </div>
                </div>

                {/* TABS */}
                <span className="flex bg-[var(--surface)] rounded-s-[20px] rounded-e-[6px] p-1 border border-[var(--border)]">
                    <button
                        onClick={() => { setActiveTab('EMG'); onSessionSelect(null); }}
                        className={`px-1 py-1 rounded-s-[20px] rounded-e-[6px] text-sm font-medium transition-all ${activeTab === 'EMG' ? 'bg-[var(--primary)] text-bg ' : 'text-[var(--text)] hover:text-[var(--primary)]'} `}
                    >
                        <Hand className="inline mr-1 w-4 h-4" /> EMG
                    </button>
                    <button
                        onClick={() => { setActiveTab('EOG'); onSessionSelect(null); }}
                        className={`px-1 py-1 rounded-[6px] text-sm font-medium transition-all ${activeTab === 'EOG' ? 'bg-[var(--primary)] text-bg ' : 'text-[var(--text)] hover:text-[var(--primary)]'} `}
                    >
                        <Eye className="inline mr-1 w-4 h-4" /> EOG
                    </button>
                    <button
                        onClick={() => { setActiveTab('EEG'); onSessionSelect(null); }}
                        className={`px-1 py-1 rounded-[6px] text-sm font-medium transition-all ${activeTab === 'EEG' ? 'bg-[var(--primary)] text-bg ' : 'text-[var(--text)] hover:text-[var(--primary)]'} `}
                    >
                        <Brain className="inline mr-1 w-4 h-4" /> EEG
                    </button>
                </span>
            </span>

            <div className="relative group">
                <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder={`Name for new ${activeTab} model...`}
                    className="w-full bg-bg text-text border-[2px] border-border rounded-[6px] px-4 py-2 text-[16px] focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] font-mono text-muted group-focus-within:text-primary">.model</div>
            </div>

            <div className="flex gap-2">
                <CustomSelect
                    className="flex"
                    value={selectedSession || ''}
                    onChange={(val) => onSessionSelect(val)}
                    options={[
                        { value: "", label: "All Available Data" },
                        ...sessions.map(s => ({ value: s.table, label: s.name }))
                    ]}
                    placeholder="Select Session..."
                />
                <button onClick={onRefreshSessions} className="p-2.5 border-[2px] border-[var(--border)] rounded-lg hover:bg-[var(--bg)] text-[var(--text)]" title="Refresh Sessions"><RefreshCw className="w-5 h-5" /></button>
            </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 gap-3 overflow-visible">
            {/* Shimmer Effect */}
            <button
                onClick={onTrain}
                disabled={loading}
                className="w-full flex items-center justify-center py-3 bg-primary text-primary-contrast rounded-xl font-bold text-[10px] tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)] hover:shadow-[0_0_30px_rgba(var(--primary-rgb),0.4)] hover:scale-[1.05] hover:z-50 active:scale-95 group relative overflow-hidden disabled:opacity-20"
            >
                <div className="absolute inset-0 bg-white/30 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out skew-x-12" />
                <span className="relative z-10 text-xl gap-4 flex items-center justify-center w-full">
                    {loading ? 'Training...' : (
                        <>
                            Train
                            <motion.span
                                initial={{ rotate: 0 }}
                                whileHover={{
                                    rotate: [0, -10, 10, -10, 10, 0],
                                    y: [0, -2, 0]
                                }}
                                transition={{ duration: 0.5, repeat: Infinity }}
                                className="inline-block"
                            >
                                <Rocket size={34} />
                            </motion.span>
                            Model
                        </>
                    )}
                </span>
            </button>
        </div>
    </div>
);

export default function MLTrainingView({ onSwitchLab }) {
    const { currentThemeId } = useTheme();
    const API_BASE_URL = import.meta.env.VITE_API_URL || '';
    const [activeTab, setActiveTab] = useState('EMG');

    // --- SESSIONS ---
    const [availableSessions, setAvailableSessions] = useState([]);
    const [selectedSession, setSelectedSession] = useState(null);

    // Fetch sessions
    const fetchSessions = async () => {
        try {
            const sensor = activeTab;
            const res = await fetch(`${API_BASE_URL}/api/sessions/${sensor}`);
            if (res.ok) {
                const data = await res.json();
                if (data.tables) {
                    const formatted = data.tables.map(t => ({
                        table: t,
                        name: t.replace(`${sensor.toLowerCase()}_session_`, '')
                    }));
                    setAvailableSessions(formatted.reverse());
                } else if (Array.isArray(data)) {
                    setAvailableSessions(data);
                }
            }
        } catch (e) {
            console.error("Failed to list sessions:", e);
        }
    };

    // --- GENERIC MODEL STATE ---
    const [models, setModels] = useState([]);
    const [selectedModels, setSelectedModels] = useState({ EMG: null, EOG: null, EEG: null });
    const selectedModelName = selectedModels[activeTab];

    const [trainModelNameInput, setTrainModelNameInput] = useState('');

    // Result States per sensor to persist when switching tabs? 
    // Or just one activeResult? One activeResult is simpler but clears on switch.
    // Let's use a ref or object to cache if we wanted, but state is fine.
    const [results, setResults] = useState({ EMG: null, EOG: null, EEG: null });
    const [evalResults, setEvalResults] = useState({ EMG: null, EOG: null, EEG: null });

    // Params per sensor
    const [params, setParams] = useState({
        EMG: { n_estimators: 100, max_depth: 8, test_size: 0.2, min_impurity_decrease: 0.0 },
        EOG: { n_estimators: 50, max_depth: 5, test_size: 0.2, min_impurity_decrease: 0.0 },
        EEG: { test_size: 0.2, solver: 'eigen', shrinkage: 'auto' }
    });

    const activeResult = results[activeTab];
    const activeEvalResult = evalResults[activeTab];
    const activeParams = params[activeTab];
    const selectedSessionName = selectedSession
        ? (availableSessions.find(s => s.table === selectedSession)?.name || selectedSession)
        : 'All Available Data';

    const fetchModels = async (forcedName = null) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/models/${activeTab}`);
            if (res.ok) {
                const data = await res.json();
                setModels(data);

                // Smarter Auto-load: Only if nothing is selected or current selection is invalid
                if (data.length > 0) {
                    const activeModel = data.find(m => m.active);
                    const currentName = forcedName || selectedModelName;
                    const currentModelExists = data.find(m => m.name === currentName);

                    if (!currentName || !currentModelExists) {
                        if (activeModel) {
                            setSelectedModels(prev => ({ ...prev, [activeTab]: activeModel.name }));
                        } else if (!currentName) {
                            // Only force-load the first model if we have NO selection at all (Initial Page Load)
                            const firstModel = data[0].name;
                            setSelectedModels(prev => ({ ...prev, [activeTab]: firstModel }));
                            handleLoadModel(firstModel);
                        }
                    }
                    // If we have a currentName and it exists in the list, we DON'T override 
                    // it with the 'active' flag from the backend yet to avoid race conditions.
                }
            }
        } catch (e) {
            console.error("Failed to list models", e);
        }
    };

    const handleDeleteModel = async (name) => {
        // Removed confirmation as requested
        try {
            const res = await fetch(`${API_BASE_URL}/api/models/${activeTab}/${name}`, { method: 'DELETE' });
            if (res.ok) {
                fetchModels();
                if (selectedModelName === name) setSelectedModels(prev => ({ ...prev, [activeTab]: null }));
            }
        } catch (e) {
            console.error("Delete failed: ", e);
        }
    };

    const handleLoadModel = async (name) => {
        setSelectedModels(prev => ({ ...prev, [activeTab]: name }));
        // Clear previous training result so evaluation shows instead
        setResults(prev => ({ ...prev, [activeTab]: null }));

        try {
            setEvalLoading(true);
            const res = await fetch(`${API_BASE_URL}/api/models/${activeTab}/load`, {
                method: 'POST',
                body: JSON.stringify({ model_name: name }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (!res.ok) throw new Error("Failed to load model backend");

            soundHandler.playMLSwitch(); // Play sound on successful model load

            // After loading, trigger eval to refresh UI
            setTreeIndex(0);
            handleEval(name);
        } catch (e) {
            setError(e.message);
        } finally {
            setEvalLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
        fetchModels();
        // Initial eval info for active Tab default model
        handleEval();
    }, [activeTab]); // When tab changes

    // Also re-fetch if session changes? Maybe useful for context, but not critical for model list.
    useEffect(() => {
        // Reload evaluation if a model is "active" or just generally for the current view
        handleEval();
    }, [selectedSession]);


    // --- SHARED STATE ---
    const [loading, setLoading] = useState(false);
    const [evalLoading, setEvalLoading] = useState(false);
    const [error, setError] = useState(null);

    // --- TREE INSPECTION STATE ---
    const [treeIndex, setTreeIndex] = useState(0);
    const [treeLoading, setTreeLoading] = useState(false);

    const fetchTree = async (index) => {
        if (activeTab === 'EEG') return;
        const model = selectedModelName;
        if (!model) return;

        setTreeIndex(index);
        setTreeLoading(true);
        soundHandler.playMLTreeStep(); // Play sound on tree step
        try {
            const res = await fetch(`${API_BASE_URL}/api/model/tree`, {
                method: 'POST',
                body: JSON.stringify({ sensor: activeTab, model_name: model, tree_index: index }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.tree_structure) {
                    // Update whichever result is active
                    if (activeResult) {
                        setResults(prev => ({
                            ...prev,
                            [activeTab]: { ...prev[activeTab], tree_structure: data.tree_structure }
                        }));
                    } else if (activeEvalResult) {
                        setEvalResults(prev => ({
                            ...prev,
                            [activeTab]: { ...prev[activeTab], tree_structure: data.tree_structure }
                        }));
                    }
                }
            }
        } catch (e) { console.error(e); } finally { setTreeLoading(false); }
    };

    // --- HELPERS ---
    const handleParamChange = (e) => {
        const { name, value } = e.target;
        let parsedValue = value;
        if (name === 'test_size' || name === 'min_impurity_decrease') {
            parsedValue = parseFloat(value);
        } else if (name === 'n_estimators' || name === 'max_depth') {
            parsedValue = parseInt(value);
        }
        setParams(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab],
                [name]: parsedValue
            }
        }));
    };

    const getSourceName = (isTrain) => {
        const name = selectedSession
            ? (availableSessions.find(s => s.table === selectedSession)?.name || selectedSession)
            : 'All Available Data';
        return `${isTrain ? 'Trained' : 'Evaluated'} on: ${name}`;
    };

    // --- GENERIC TRAIN/EVAL ---

    const handleTrain = async () => {
        if (!trainModelNameInput.trim()) {
            setError("Please name your model");
            return;
        }
        setLoading(true); setError(null);
        // Clear result for this tab
        // setResults(prev => ({ ...prev, [activeTab]: null }));

        try {
            const endpointMap = {
                'EMG': `${API_BASE_URL}/api/train-emg-rf`,
                'EOG': `${API_BASE_URL}/api/train-eog-rf`,
                'EEG': `${API_BASE_URL}/api/train-eeg-lda`
            };

            const modelNameFinal = trainModelNameInput.trim();

            const res = await fetch(endpointMap[activeTab], {
                method: 'POST',
                body: JSON.stringify({
                    ...activeParams,
                    table_name: selectedSession || 'ALL',
                    model_name: modelNameFinal,
                    sensor: activeTab
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Training failed');

            setResults(prev => ({ ...prev, [activeTab]: { ...data, source: getSourceName(true) } }));
            // Clear previous evaluation result so training result shows instead
            setEvalResults(prev => ({ ...prev, [activeTab]: null }));
            setSelectedModels(prev => ({ ...prev, [activeTab]: modelNameFinal }));
            setTreeIndex(0);

            // Refresh list but without triggering it to override our selection
            await fetchModels(modelNameFinal);
        } catch (e) { setError(e.message); } finally { setLoading(false); }
    };

    const handleEval = async (forceModelName = null) => {
        setEvalLoading(true); setError(null);
        // setEvalResults(prev => ({ ...prev, [activeTab]: null }));

        try {
            const endpointMap = {
                'EMG': `${API_BASE_URL}/api/model/evaluate`,
                'EOG': `${API_BASE_URL}/api/model/evaluate/eog`,
                'EEG': `${API_BASE_URL}/api/model/evaluate/eeg`
            };

            const res = await fetch(endpointMap[activeTab], {
                method: 'POST',
                body: JSON.stringify({
                    table_name: selectedSession || undefined,
                    model_name: forceModelName || selectedModelName || undefined,
                    sensor: activeTab
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (!res.ok) {
                return;
            }

            setEvalResults(prev => ({ ...prev, [activeTab]: { ...data, source: getSourceName(false) } }));

            if (data.hyperparameters) {
                setParams(prev => ({
                    ...prev,
                    [activeTab]: { ...prev[activeTab], ...data.hyperparameters }
                }));
            }

            // Only update selection if it was null (e.g. initial load) or if we explicitly requested a model
            if (data.model_name && (!selectedModelName || forceModelName)) {
                setSelectedModels(prev => ({ ...prev, [activeTab]: data.model_name }));
            }
        } catch (e) {
            console.log("Eval check info (ignore if just checking):", e);
        } finally { setEvalLoading(false); }
    };



    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden p-4" key={currentThemeId}>
            {/* ERROR DISPLAY */}
            {error && <div className="w-full bg-red-900/20 border border-red-500 text-red-200 py-2 rounded mb-4 flex justify-between items-center shrink-0 text-sm px-4">
                <span><strong>Error:</strong> {error}</span>
                <button onClick={() => setError(null)} className="underline">Dismiss</button>
            </div>}

            {/* CONTENT scrollable container */}
            <div className="flex-1 overflow-hidden">
                <div className="h-full grid grid-cols-12 grid-rows-6 gap-4 overflow-visible">
                    {/* LEFT SIDEBAR CONTROLS (Span 3) - NOW CONTAINS ACCURACY & FEATURES TOO */}
                    <div className="col-span-12 lg:col-span-3 row-span-6 flex flex-col gap-4 min-h-0">
                        {/* 1. CONTROLS */}
                        <div className="shrink-0">
                            <ControlPanel
                                onTrain={handleTrain}
                                loading={loading}
                                evalLoading={evalLoading}
                                sessions={availableSessions}
                                selectedSession={selectedSession}
                                onSessionSelect={setSelectedSession}
                                onRefreshSessions={fetchSessions}
                                onSwitchLab={onSwitchLab}
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                                modelName={trainModelNameInput}
                                setModelName={setTrainModelNameInput}
                            />
                        </div>

                        {/* 2. ACCURACY - SPLIT PANEL */}
                        <div className="shrink-0 h-64">
                            <SplitAccuracyCard
                                accuracy={(activeResult || activeEvalResult)?.accuracy}
                                n_samples={(activeResult || activeEvalResult)?.n_samples}
                                source={(activeResult || activeEvalResult)?.source}
                                models={models}
                                selectedModelName={selectedModelName}
                                onSelectModel={handleLoadModel}
                                onDeleteModel={handleDeleteModel}
                            />
                        </div>

                        <div className="flex-1 flex-grow-4 min-h-0">
                            <FeatureInsightCard
                                importances={(activeResult || activeEvalResult)?.feature_importances}
                                featureOrder={(activeResult || activeEvalResult)?.feature_order}
                                sensor={activeTab}
                            />
                        </div>
                    </div>

                    {/* MAIN BENTO GRID (Span 9) */}
                    {(activeResult || activeEvalResult) ? (
                        <>
                            {activeTab !== 'EEG' ? (
                                <>
                                    <div className="col-span-12 md:col-span-9 row-span-4 min-h-0 flex flex-col overflow-hidden">
                                        <DecisionTreeCard
                                            structure={(activeResult || activeEvalResult).tree_structure}
                                            treeIndex={treeIndex}
                                            totalTrees={activeParams.n_estimators}
                                            onTreeChange={fetchTree}
                                            loading={loading || treeLoading}
                                        />
                                    </div>

                                    <div className="col-span-12 md:col-span-3 row-span-2 min-h-0 flex flex-col overflow-hidden">
                                        <HyperparametersCard
                                            params={activeParams}
                                            onChange={handleParamChange}
                                        />
                                    </div>

                                    <div className="col-span-12 md:col-span-6 row-span-2 min-h-0 flex flex-col overflow-hidden">
                                        <ConfusionMatrixCard
                                            matrix={(activeResult || activeEvalResult).confusion_matrix}
                                            labels={(activeResult || activeEvalResult).labels || []}
                                            n_samples={(activeResult || activeEvalResult).n_samples}
                                            sensor={activeTab}
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="col-span-12 md:col-span-9 row-span-6 min-h-0 flex flex-col overflow-hidden">
                                        <div className="grid grid-cols-12 grid-rows-6 gap-4 h-full">
                                            {/* Top Row (Rows 1-4): Matrix (fit) and LDA Signature (expanding) */}
                                            <div className="col-span-12 row-span-4 flex gap-4 min-h-0 overflow-hidden">
                                                <ConfusionMatrixCard
                                                    matrix={(activeResult || activeEvalResult).confusion_matrix}
                                                    labels={(activeResult || activeEvalResult).labels || []}
                                                    n_samples={(activeResult || activeEvalResult).n_samples}
                                                    sensor={activeTab}
                                                />
                                                <div className="flex-grow min-h-0 flex flex-col overflow-hidden">
                                                    <EEGLDAVisualizationCard result={activeResult || activeEvalResult} />
                                                </div>
                                            </div>

                                            <div className="col-span-12 lg:col-span-4 row-span-2 min-h-0 flex flex-col overflow-hidden">
                                                <EEGHyperparametersCard
                                                    params={activeParams}
                                                    onChange={handleParamChange}
                                                />
                                            </div>
                                            <div className="col-span-12 lg:col-span-8 row-span-2 min-h-0 flex flex-col overflow-hidden">
                                                <EEGModelInsightCard
                                                    result={activeResult || activeEvalResult}
                                                    selectedSessionName={selectedSessionName}
                                                    params={activeParams}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="col-span-12 lg:col-span-9 row-span-6 card border-2 border-dashed border-[var(--border)] rounded-xl flex flex-col items-center justify-center text-[var(--muted)] bg-[var(--surface)]/50">
                            {/* Empty state showing Hyperparams Card as preview/setup if desired, or just empty */}
                            <div className="text-center">
                                <div className="text-6xl mb-6 opacity-20 flex justify-center"><PieChart className="w-24 h-24" /></div>
                                <p className="text-lg font-medium">Model workspace empty</p>
                                <p className="text-sm opacity-70">Train a new model or load an existing one from the sidebar.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
}

