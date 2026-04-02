import Tree from 'react-d3-tree';
import { useState, useEffect, Fragment, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Trash2, Rocket, ArrowRight, Save, Target, ListOrdered,
    Database, Hand, Eye, Network, Grid3X3, Brain, PieChart,
    RefreshCw, Sliders, ChevronLeft, ChevronRight, Circle,
    ArrowRightFromLine, Info, BookOpen, BrainCircuit
} from 'lucide-react';
import { soundHandler } from '../../handlers/SoundHandler';
import { useTheme } from '../../contexts/ThemeContext';
import CustomSelect from '../ui/inputs/CustomSelect';
import CustomSlider from '../ui/inputs/CustomSlider';
import RangeSlider from '../ui/inputs/RangeSlider';
import { AccuracyRadialChart } from '../ui/display/AccuracyRadialChart';
import HalfCircleProgress from '../ui/display/HalfCircleProgress';


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
        <div className="text-lg flex justify-around items-center font-bold text-[var(--muted)] uppercase tracking-widest mb-2 border-b border-[var(--border)] pb-1 px-1">
            <span className=' flex flex-row items-center'>
                <Save color='var(--text)' className="mr-2 w-5 h-5" /> Models
            </span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {models.length === 0 ? (
                <div className="text-xs text-[var(--muted)] text-center py-4 italic opacity-50">No saved models</div>
            ) : (
                models.map(m => (
                    <div
                        key={m.name}
                        onClick={() => onSelect(m.name)}
                        className={`group flex items-center justify-between p-1 rounded cursor-pointer transition-colors ${selectedModelName === m.name
                            ? 'bg-text/5 border border-text/60'
                            : 'bg-[var(--bg)] border border-transparent hover:border-[var(--border)]'
                            }`}
                    >
                        <div className="min-w-0">
                            <span className='flex flex-row items-center'>
                                <BrainCircuit size={24} className={`mr-2 ${selectedModelName === m.name ? 'text-primary/90' : 'text-text/50'}`} />
                                <div className='flex flex-col items-start'>
                                    <div className={`text-[16px] font-medium truncate ${selectedModelName === m.name ? 'text-primary' : 'text-[var(--text)]'}`}>
                                        {m.name}
                                    </div>
                                    <div className="text-[12px] text-[var(--muted)] truncate">
                                        {new Date(m.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            </span>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(m.name); }}
                            className="p-1 text-[var(--muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete Model"
                        >
                            <Trash2 size={22} />
                        </button>
                    </div>
                ))
            )}
        </div>
    </div>
);

const SplitAccuracyCard = ({ result, models, selectedModelName, onSelectModel, onDeleteModel, params, totalSamples }) => {
    const accuracy = result?.accuracy;
    const n_samples = result?.n_samples;
    const source = result?.source;
    const verdict = getVerdict(result?.train_accuracy, result?.validation_accuracy, result?.test_accuracy || result?.accuracy);

    const tSamples = Math.round((n_samples || result?.split_summary?.total_samples || totalSamples || 0) * (params?.train_ratio || 0.7));
    const vSamples = Math.round((n_samples || result?.split_summary?.total_samples || totalSamples || 0) * (params?.val_ratio || 0.15));
    const teSamples = Math.round((n_samples || result?.split_summary?.total_samples || totalSamples || 0) * (params?.test_ratio || 0.15));

    let descStr = '';
    if (tSamples > 0) {
        descStr = `${tSamples} Trn|${vSamples} Val|${teSamples} Tst`;
    }

    return (
        <div className="card h-full flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex-1 flex flex-row gap-2 min-h-0 w-full">
                <div className="w-2/5 border-r border-[var(--border)] pr-2">
                    <SavedModelsList
                        models={models}
                        selectedModelName={selectedModelName}
                        onSelect={onSelectModel}
                        onDelete={onDeleteModel}
                    />
                </div>

                <div className="w-3/5 border-[var(--border)]">
                    <div className="flex flex-col h-full overflow-hidden">
                        <h3 className="text-lg flex justify-around items-center font-bold text-[var(--muted)] uppercase tracking-widest border-b border-[var(--border)] pb-1 px-1">
                            <span className=' flex flex-row items-center'>
                                <Target color='var(--text)' className="mr-2 w-5 h-5" /> {!selectedModelName ? 'Data Partition' : 'Performance'}
                            </span>
                        </h3>
                        <div className="flex-1 flex items-center justify-center min-h-0">
                            {!selectedModelName ? (
                                <AccuracyRadialChart
                                    mode="split"
                                    trainAcc={params?.train_ratio || 0.7}
                                    valAcc={params?.val_ratio || 0.15}
                                    testAcc={params?.test_ratio || 0.15}
                                    trainSamples={tSamples}
                                    valSamples={vSamples}
                                    testSamples={teSamples}
                                    verdict={{
                                        text: `${params ? Math.round(((params.train_ratio || 0.7) + (params.val_ratio || 0.15)) / (params.val_ratio || 0.15)) : 5} FOLDS`,
                                        color: 'text-[var(--primary)]',
                                        bg: 'bg-transparent',
                                        desc: descStr
                                    }}
                                />
                            ) : accuracy !== null && accuracy !== undefined ? (
                                <AccuracyRadialChart
                                    mode="accuracy"
                                    trainAcc={result.train_accuracy}
                                    valAcc={result.validation_accuracy}
                                    testAcc={result.test_accuracy || result.accuracy}
                                    trainSamples={result.split_summary?.train_samples || null}
                                    valSamples={result.split_summary?.val_samples || null}
                                    testSamples={result.split_summary?.test_samples || null}
                                    verdict={verdict}
                                />
                            ) : (
                                <div className="text-center opacity-50">
                                    <div className="text-2xl text-[var(--muted)] mb-1">--</div>
                                    <p className="text-xs text-[var(--muted)]">Select or Train</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

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

const pct = (val) => val === undefined || val === null || isNaN(val) ? '--' : `${(val * 100).toFixed(1)}%`;
const card = "bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm";

const getVerdict = (trainAcc, valAcc, testAcc) => {
    if (!trainAcc || !valAcc) return { text: '--', color: 'text-[var(--muted)]', bg: 'bg-[var(--bg)]/10', desc: 'No data' };
    const gap = trainAcc - valAcc;

    if (trainAcc < 0.65) return { text: 'HIGH BIAS ( UNDERFIT )', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', desc: 'Model lacks capacity or features' };
    if (trainAcc > 0.98 && valAcc < 0.85) return { text: 'SEVERE OVERFIT', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', desc: 'Memorized training data' };
    if (gap > 0.12) return { text: 'HIGH VARIANCE ( OVERFIT )', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', desc: 'Poor generalization / wide gap' };
    if (valAcc > 0.80) return { text: 'OPTIMAL FIT', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', desc: 'Model generalized well' };

    return { text: 'MODERATE FIT', color: 'text-[var(--primary)]', bg: 'bg-[var(--primary)]/10 border-[var(--primary)]/30', desc: 'Acceptable performance' };
};

const historyId = (item) => item?.model_id || item?.id || '--';
const historyCandidate = (item) => item?.candidate_index || item?.candidate_idx || 0;
const historyFold = (item) => item?.fold_index || item?.fold_idx || 0;
const historyParams = (item) => item?.hyperparameters || item?.params || {};

const HistoryList = ({ history = [], selectedId, onSelect, emptyText = 'No training history available.' }) => {
    const grouped = useMemo(() => {
        const groups = {};
        history.forEach((item) => {
            const key = historyCandidate(item);
            if (!groups[key]) groups[key] = { idx: key, params: historyParams(item), folds: [] };
            groups[key].folds.push(item);
        });
        return Object.values(groups)
            .sort((a, b) => a.idx - b.idx)
            .map(group => ({ ...group, folds: group.folds.sort((a, b) => historyFold(a) - historyFold(b)) }));
    }, [history]);

    if (!grouped.length) {
        return <div className="flex h-full items-center justify-center text-sm italic text-[var(--muted)] opacity-60">{emptyText}</div>;
    }

    return (
        <div className="space-y-2">
            {grouped.map((cand) => (
                <div key={cand.idx} className="p-3 rounded-xl bg-[var(--bg)]/50 border border-[var(--border)]">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <div className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[0.18em]">Candidate {cand.idx}</div>
                            <div className="text-[10px] text-[var(--text)] font-mono truncate">
                                {Object.entries(cand.params).map(([k, v]) => `${k}: ${v}`).join(' | ') || 'No hyperparameters recorded'}
                            </div>
                        </div>
                        <div className="text-xs font-black text-[var(--primary)]">
                            {Math.round((cand.folds.reduce((acc, fold) => acc + (fold.accuracy || 0), 0) / cand.folds.length) * 100)}%
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {cand.folds.map((item) => {
                            const id = historyId(item);
                            return (
                                <button
                                    key={id}
                                    onClick={() => onSelect?.(item)}
                                    className={`px-2 py-1 rounded-md border font-mono text-[10px] transition-all ${selectedId === id ? 'bg-[var(--primary)]/15 border-[var(--primary)] text-[var(--primary)]' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)]/50'}`}
                                >
                                    {id}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

const HistoryDetailCard = ({ item }) => {
    if (!item) {
        return <div className="flex h-full items-center justify-center text-sm italic text-[var(--muted)] opacity-60">Click a model ID like C01F1 to inspect it.</div>;
    }

    const params = historyParams(item);
    return (
        <div className="h-full p-4 rounded-xl bg-[var(--bg)]/40 border border-[var(--border)] space-y-3 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-black">Model ID</div>
                    <div className="text-2xl font-black text-[var(--primary)] font-mono">{historyId(item)}</div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-black">Validation</div>
                    <div className="text-xl font-black text-[var(--text)]">{pct(item.validation_accuracy ?? item.accuracy)}</div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <div className="text-[10px] uppercase text-[var(--muted)] font-black mb-1">Candidate / Fold</div>
                    <div className="text-sm font-mono text-[var(--text)]">{historyCandidate(item)} / {historyFold(item)}</div>
                </div>
                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <div className="text-[10px] uppercase text-[var(--muted)] font-black mb-1">Train Accuracy</div>
                    <div className="text-sm font-mono text-[var(--text)]">{pct(item.train_accuracy)}</div>
                </div>
                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <div className="text-[10px] uppercase text-[var(--muted)] font-black mb-1">Train Samples</div>
                    <div className="text-sm font-mono text-[var(--text)]">{item.n_train_samples ?? '--'}</div>
                </div>
                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <div className="text-[10px] uppercase text-[var(--muted)] font-black mb-1">Validation Samples</div>
                    <div className="text-sm font-mono text-[var(--text)]">{item.n_validation_samples ?? '--'}</div>
                </div>
            </div>
            <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <div className="text-[10px] uppercase text-[var(--muted)] font-black mb-2">Hyperparameters</div>
                <div className="grid grid-cols-2 gap-2">
                    {Object.entries(params).map(([key, value]) => (
                        <div key={key} className="rounded-md bg-[var(--bg)] px-2 py-1 border border-[var(--border)]">
                            <div className="text-[9px] uppercase text-[var(--muted)] font-black">{key}</div>
                            <div className="text-[11px] font-mono text-[var(--text)] truncate">{String(value)}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <div className="text-[10px] uppercase text-[var(--muted)] font-black mb-1">Saved Artifact</div>
                <div className="text-[11px] font-mono text-[var(--primary)] break-all">{item.artifact_path || '--'}</div>
            </div>
        </div>
    );
};

const TrainingHistoryCard = ({ title = 'Training History', history = [], selectedItem, onSelectItem, detailLabel = 'Model Detail' }) => (
    <div className={`${card} h-full flex flex-col overflow-hidden`}>
        <div className="p-3 border-b border-[var(--border)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-[var(--primary)]" />
                <span className="text-xs font-black text-[var(--muted)] uppercase tracking-[0.2em]">{title}</span>
            </div>
            <span className="text-[10px] text-[var(--muted)] font-bold">{history.length} Models</span>
        </div>
        <div className="flex-1 min-h-0 grid grid-cols-12 gap-3 p-3">
            <div className="col-span-12 lg:col-span-7 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <HistoryList history={history} selectedId={historyId(selectedItem)} onSelect={onSelectItem} />
            </div>
            <div className="col-span-12 lg:col-span-5 min-h-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-black mb-2">{detailLabel}</div>
                <HistoryDetailCard item={selectedItem} />
            </div>
        </div>
    </div>
);

const formatDuration = (seconds) => {
    if (seconds === undefined || seconds === null || Number.isNaN(Number(seconds))) return '--';
    const total = Math.max(0, Math.round(Number(seconds)));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

const StoredRunsList = ({ models = [], activeModelName, onSelectRun }) => (
    <div className="space-y-2">
        {models.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm italic text-[var(--muted)] opacity-60">No saved training runs yet.</div>
        ) : models.map((model) => (
            <button
                key={model.name}
                onClick={() => onSelectRun?.(model.name)}
                className={`w-full text-left rounded-xl border p-3 transition-all ${activeModelName === model.name ? 'bg-[var(--primary)]/10 border-[var(--primary)]' : 'bg-[var(--bg)]/40 border-[var(--border)] hover:border-[var(--primary)]/40'}`}
            >
                <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] font-black">Best Model</div>
                        <div className="text-sm font-black text-[var(--text)] truncate">{model.name}</div>
                    </div>
                    <div className="text-xs font-black text-[var(--primary)]">{pct(model.accuracy)}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-[10px] font-mono">
                    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1">Candidates: {model.total_candidates ?? '--'}</div>
                    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1">Folds: {model.k_folds ?? '--'}</div>
                    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1">Saved Models: {model.total_models ?? '--'}</div>
                    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1">Time: {formatDuration(model.training_duration_seconds)}</div>
                </div>
                <div className="mt-2 text-[10px] text-[var(--muted)]">{model.created_at ? new Date(model.created_at).toLocaleString() : 'Unknown time'}</div>
            </button>
        ))}
    </div>
);

const ControlPanelCard = ({ params, setParamsTab, job, activeTab, models = [], activeModelName, onSelectRun }) => {
    const minVal = Math.round((params.train_ratio || 0.7) * 100);
    const maxVal = Math.round(((params.train_ratio || 0.7) + (params.val_ratio || 0.15)) * 100);

    return (
        <div className={`p-4 ${card} h-full flex flex-col relative`}>
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2 mb-4 shrink-0">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--muted)] uppercase tracking-widest">
                    <Sliders className="w-5 h-5 text-[var(--text)]" />
                    Hyperparameters
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <div className="space-y-4">
                    <div className="mb-2">
                        <div className="text-[12px] font-bold text-[var(--muted)] uppercase tracking-tight mb-2 pl-2">Data Split Configuration</div>
                        <div className="px-2 pb-2">
                            <RangeSlider
                                min={0} max={100} step={1}
                                minValue={minVal} maxValue={maxVal}
                                leftColor="var(--text)"
                                middleColor="var(--muted)"
                                rightColor="var(--accent)"
                                hideLabels={false}
                                onChange={(vals) => {
                                    setParamsTab({
                                        train_ratio: vals.left / 100,
                                        val_ratio: vals.middle / 100,
                                        test_ratio: vals.right / 100,
                                        k_folds: Math.round((vals.left + vals.middle) / vals.middle)
                                    });
                                }}
                            />
                        </div>
                    </div>

                    <div><div className="flex justify-between text-sm mb-1"><span className="font-bold text-[var(--text)] uppercase tracking-tight">Search Res</span><span className="font-black text-[var(--primary)]">{params.search_resolution}</span></div><CustomSlider min={2} max={10} step={1} value={params.search_resolution} onChange={(value) => setParamsTab({ search_resolution: value })} /></div>

                    {activeTab !== 'EEG' ? (
                        <>
                            <div>
                                <div className="flex justify-between items-end mb-1">
                                    <span className="font-bold text-[var(--text)] uppercase tracking-tight">Estimators</span>
                                    <div className="flex items-center gap-1 font-mono text-xs"><span className="font-black text-[var(--primary)]">{params.n_estimators_min || 50}</span><span className="text-[var(--muted)]">-</span><span className="font-black text-[var(--primary)]">{params.n_estimators_max || 200}</span></div>
                                </div>
                                <div className="px-2 pb-2"><RangeSlider min={10} max={500} step={10} minValue={params.n_estimators_min || 50} maxValue={params.n_estimators_max || 200} hideLabels={true} color="var(--primary)" onChange={(vals) => setParamsTab({ n_estimators_min: vals.min, n_estimators_max: vals.max })} /></div>
                            </div>
                            <div>
                                <div className="flex justify-between items-end mb-1">
                                    <span className="font-bold text-[var(--text)] uppercase tracking-tight">Max Depth</span>
                                    <div className="flex items-center gap-1 font-mono text-xs"><span className="font-black text-[var(--primary)]">{params.max_depth_min || 5}</span><span className="text-[var(--muted)]">-</span><span className="font-black text-[var(--primary)]">{params.max_depth_max || 15}</span></div>
                                </div>
                                <div className="px-2 pb-2"><RangeSlider min={2} max={30} step={1} minValue={params.max_depth_min || 5} maxValue={params.max_depth_max || 15} hideLabels={true} color="var(--primary)" onChange={(vals) => setParamsTab({ max_depth_min: vals.min, max_depth_max: vals.max })} /></div>
                            </div>
                            <div>
                                <div className="flex justify-between items-end mb-1">
                                    <span className="font-bold text-[var(--text)] uppercase tracking-tight">Min Impurity</span>
                                    <div className="flex items-center gap-1 font-mono text-xs"><span className="font-black text-[var(--primary)]">{params.min_impurity_decrease_min || 0}</span><span className="text-[var(--muted)]">-</span><span className="font-black text-[var(--primary)]">{params.min_impurity_decrease_max || 0.05}</span></div>
                                </div>
                                <div className="px-2 pb-2"><RangeSlider min={0} max={0.1} step={0.005} minValue={params.min_impurity_decrease_min || 0} maxValue={params.min_impurity_decrease_max || 0.05} hideLabels={true} color="var(--primary)" onChange={(vals) => setParamsTab({ min_impurity_decrease_min: vals.min, min_impurity_decrease_max: vals.max })} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <div><div className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-tight mb-1">Criterion</div><CustomSelect value={params.criterion || 'gini'} onChange={(value) => setParamsTab({ criterion: value })} options={[{ value: 'gini', label: 'Gini' }, { value: 'entropy', label: 'Entropy' }, { value: 'gini,entropy', label: 'Both' }]} /></div>
                                <div><div className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-tight mb-1">Features</div><CustomSelect value={params.max_features || 'sqrt'} onChange={(value) => setParamsTab({ max_features: value })} options={[{ value: 'sqrt', label: 'Sqrt' }, { value: 'log2', label: 'Log2' }, { value: 'None', label: 'None' }, { value: 'sqrt,log2', label: 'Sqrt+Log2' }]} /></div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <div className="flex justify-between items-end mb-1 mt-4">
                                    <span className="font-bold text-[var(--text)] uppercase tracking-tight">Tolerance</span>
                                    <div className="flex items-center gap-1 font-mono text-xs"><span className="font-black text-[var(--primary)]">{params.tol_min || 0.0001}</span><span className="text-[var(--muted)]">-</span><span className="font-black text-[var(--primary)]">{params.tol_max || 0.001}</span></div>
                                </div>
                                <div className="px-2 pb-2"><RangeSlider min={0.0001} max={0.01} step={0.0001} minValue={params.tol_min || 0.0001} maxValue={params.tol_max || 0.001} hideLabels={true} color="var(--primary)" onChange={(vals) => setParamsTab({ tol_min: vals.min, tol_max: vals.max })} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <div><div className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-tight mb-1">Solver</div><CustomSelect value={params.solver || 'eigen'} onChange={(value) => setParamsTab({ solver: value })} options={[{ value: 'svd', label: 'SVD' }, { value: 'lsqr', label: 'LSQR' }, { value: 'eigen', label: 'Eigen' }, { value: 'svd,lsqr,eigen', label: 'All' }]} /></div>
                                <div><div className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-tight mb-1">Shrinkage</div><CustomSelect value={params.shrinkage || 'auto'} onChange={(value) => setParamsTab({ shrinkage: value })} options={[{ value: 'auto', label: 'Auto' }, { value: 'none', label: 'None' }, { value: 'auto,none', label: 'Both' }]} /></div>
                            </div>
                        </>
                    )}

                    <div className="pt-3 border-t border-[var(--border)]/50">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-[12px] font-bold text-[var(--muted)] uppercase tracking-tight">Saved Training Runs</div>
                            <div className="text-[10px] font-mono text-[var(--primary)]">{models.length} Runs</div>
                        </div>
                        <div className="max-h-48 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            <StoredRunsList models={models} activeModelName={activeModelName} onSelectRun={onSelectRun} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const TrainingStatusDashboard = ({ job, countdown, params, activeTab, selectedHistoryItem, onSelectHistory }) => {
    const latestFold = job?.history?.[job.history.length - 1];

    return (
        <div className="flex flex-col h-full gap-4 overflow-hidden animate-in fade-in duration-500">
            {/* Top Row: Progress and Current Stats */}
            <div className="grid grid-cols-12 gap-4 h-1/2">
                <div className={`col-span-12 lg:col-span-8 ${card} flex flex-col items-center justify-center relative overflow-hidden group`}>
                    <div className="absolute inset-0 bg-gradient-to-b from-[var(--primary)]/5 to-transparent opacity-50" />

                    <div className="relative z-10 flex flex-col items-center">
                        <HalfCircleProgress
                            progress={job?.progress || 0}
                            size={320}
                            strokeWidth={16}
                            label={countdown !== null ? "Loading Results" : "Training Progress"}
                            statusText={countdown !== null ? `Evaluation starting in ${countdown}s` : `Candidate ${job?.candidate_index || 0} / ${job?.total_candidates || 0}`}
                        />

                        {countdown !== null && (
                            <div className="mt-4 flex items-center gap-3 px-4 py-2 rounded-full bg-[var(--primary)]/20 border border-[var(--primary)] text-[var(--primary)] font-bold animate-bounce shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]">
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span className="text-sm uppercase tracking-widest">Finalizing Model... {countdown}s</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className={`col-span-12 lg:col-span-4 ${card} flex flex-col overflow-hidden`}>
                    <div className="p-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface)]/50">
                        <span className="text-xs font-black text-[var(--muted)] uppercase tracking-[0.2em]">Live Metrics</span>
                        {latestFold && (
                            <span className="text-[10px] font-mono bg-[var(--primary)]/10 text-[var(--primary)] px-2 py-0.5 rounded border border-[var(--primary)]/20">
                                {historyId(latestFold)}
                            </span>
                        )}
                    </div>
                    <div className="flex-1 p-4 flex flex-col justify-center gap-6">
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-bold text-[var(--muted)] uppercase mb-1">Current Accuracy</span>
                            <span className="text-5xl font-black text-[var(--text)] font-mono">
                                {latestFold ? Math.round(latestFold.accuracy * 100) : '--'}<span className="text-xl opacity-30">%</span>
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col items-center p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                                <span className="text-[9px] font-bold text-[var(--muted)] uppercase mb-1">Candidate</span>
                                <span className="text-lg font-black text-[var(--primary)] font-mono">#{job?.candidate_index || 0}</span>
                            </div>
                            <div className="flex flex-col items-center p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                                <span className="text-[9px] font-bold text-[var(--muted)] uppercase mb-1">Fold</span>
                                <span className="text-lg font-black text-[var(--primary)] font-mono">{job?.fold_index || 0}/{job?.total_folds || 5}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Row: History and Params */}
            <div className="grid grid-cols-12 gap-4 h-1/2 min-h-0">
                <div className="col-span-12 lg:col-span-7 min-h-0">
                    <TrainingHistoryCard title="Training History" history={job?.history || []} selectedItem={selectedHistoryItem} onSelectItem={onSelectHistory} detailLabel="Current Fold Detail" />
                </div>

                <div className={`col-span-12 lg:col-span-5 ${card} flex flex-col overflow-hidden`}>
                    <div className="p-3 border-b border-[var(--border)] flex items-center gap-2 shrink-0">
                        <Sliders className="w-4 h-4 text-[var(--primary)]" />
                        <span className="text-xs font-black text-[var(--muted)] uppercase tracking-[0.2em]">Active Parameters</span>
                    </div>
                    <div className="flex-1 p-4 grid grid-cols-2 gap-3 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {Object.entries(params)
                            .filter(([k]) => !['table_name', 'model_name', 'train_ratio', 'val_ratio', 'test_ratio'].includes(k))
                            .map(([key, val]) => (
                                <div key={key} className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex flex-col">
                                    <span className="text-[8px] font-black text-[var(--muted)] uppercase mb-1 tracking-wider">{key.replace(/_/g, ' ')}</span>
                                    <span className="text-sm font-black text-[var(--primary)] truncate">{val?.toString() || '--'}</span>
                                </div>
                            ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const InsightCard = ({ result, sensor, onMatrixToggle, onHistoryToggle }) => {
    if (!result) return <div className={`p-4 ${card} h-full text-[var(--muted)] flex items-center justify-center italic relative`}>No insight data available yet.</div>;

    const v = getVerdict(result.train_accuracy, result.validation_accuracy, result.test_accuracy || result.accuracy);
    const mRow = (label, val, perc = false, mono = false) => (
        <div className="flex justify-between items-center py-1.5 border-b border-[var(--border)]/50 last:border-0">
            <span className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider">{label}</span>
            <span className={`text-[13px] font-black ${mono ? 'font-mono' : ''} text-[var(--text)]`}>{val === '--' ? val : (perc ? pct(val) : val)}</span>
        </div>
    );

    return (
        <div className={`p-4 ${card} h-full overflow-auto flex flex-col [&::-webkit-scrollbar]:hidden`} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-3 shrink-0">
                <div className="flex items-center gap-2 text-[15px] font-bold text-[var(--muted)] uppercase tracking-widest"><Info className="w-5 h-5 text-[var(--text)]" /> {sensor} Data Insights</div>
                <div className="flex items-center gap-2">
                    {onHistoryToggle && (
                        <button onClick={onHistoryToggle} className="p-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm">
                            <BookOpen size={14} /> Training History
                        </button>
                    )}
                    {onMatrixToggle && (
                        <button onClick={onMatrixToggle} className="p-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm">
                            <Grid3X3 size={14} /> Matrix
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden space-y-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <div className="h-64 border border-[var(--border)] bg-[var(--bg)]/10 rounded-2xl overflow-hidden shadow-inner">
                    <AccuracyRadialChart
                        trainAcc={result.train_accuracy}
                        valAcc={result.validation_accuracy}
                        testAcc={result.test_accuracy || result.accuracy}
                        trainSamples={result.split_summary?.train_samples}
                        valSamples={result.split_summary?.val_samples}
                        testSamples={result.split_summary?.test_samples}
                        verdict={v}
                    />
                </div>

                <div className={`border ${v.bg} rounded-xl p-4 shadow-inner relative overflow-hidden group`}>
                    <div className="absolute top-0 right-0 p-2 opacity-10 blur-[1px] group-hover:opacity-20 transition-opacity">
                        <Target size={48} color='var(--primary)' />
                    </div>
                    <div className="flex justify-between items-center mb-1">
                        <div className="text-[10px] text-[var(--muted)] uppercase font-black tracking-widest">Model Suitability</div>
                        <div className="text-[10px] uppercase tracking-widest text-[var(--primary)] font-bold">{sensor} Pipeline</div>
                    </div>
                    <div className={`text-2xl font-black tracking-tight ${v.color}`}>{v.text}</div>
                    {v.desc && <div className="text-xs text-[var(--text)] opacity-80 mt-1.5 font-medium leading-relaxed">{v.desc}</div>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm">
                        <div className="text-[11px] uppercase text-[var(--primary)] font-black tracking-widest mb-2 border-b border-[var(--border)]/50 pb-1">Performance Details</div>
                        {mRow('Mean CV Score', result.mean_accuracy, true, true)}
                        {mRow('Total Average', result.average_accuracy, true, true)}
                        {mRow('Fold Variance Dev', result.fold_std, false, true)}
                        {mRow('Train-Val Spread', result.train_val_gap, false, true)}
                        {mRow('Worst Fold', result.fold_min, true, true)}
                    </div>
                    <div className="p-3 bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm">
                        <div className="text-[11px] uppercase text-[var(--accent)] font-black tracking-widest mb-2 border-b border-[var(--border)]/50 pb-1">Split Distribution</div>
                        {mRow('Train Samples', result.split_summary?.train_samples || '--', false, true)}
                        {mRow('Val Samples', result.split_summary?.val_samples || '--', false, true)}
                        {mRow('Test Samples', result.split_summary?.test_samples ?? '--', false, true)}
                        {mRow('Class Groups', result.group_counts ? Object.keys(result.group_counts).length : '--', false, true)}
                        <div className="mt-2 pt-2 border-t border-[var(--border)]/50 text-[10px] text-[var(--muted)] font-mono text-right truncate">
                            MODE: {result.split_summary?.split_mode ?? 'K-FOLD'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};



const EEGModelInsightCard = ({ result, selectedSessionName, params, onHistoryToggle }) => {
    // Calculate split from RangeSlider ratios
    const trainPct = Math.round((params?.train_ratio || 0.7) * 100);
    const valPct = Math.round((params?.val_ratio || 0.15) * 100);
    const testPct = Math.round((params?.test_ratio || 0.15) * 100);

    return (
        <div className="card h-full flex flex-col p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm relative group/insight">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                <h3 className="text-[18px] flex items-center font-bold text-[var(--muted)] uppercase tracking-widest">
                    <Brain size={32} className='mr-4 border border-text bg-bg rounded-[4px]' color='var(--text)' /> EEG Model Insight
                </h3>
                {onHistoryToggle && (
                    <button onClick={onHistoryToggle} className="p-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm">
                        <BookOpen size={14} /> Training History
                    </button>
                )}
            </div>

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
                            <div className="text-2xl font-black text-[var(--text)] tracking-tighter">
                                <span className="text-[var(--primary)]">{trainPct}</span>
                                <span className="mx-1 text-[var(--muted)] opacity-50">/</span>
                                <span className="text-[var(--accent)]">{valPct}</span>
                                <span className="mx-1 text-[var(--muted)] opacity-50">/</span>
                                <span className="text-[var(--text)]">{testPct}</span>
                            </div>
                            <div className="text-[10px] uppercase text-[var(--muted)] mt-0.5 font-mono font-bold tracking-tight">Train/Val/Test %</div>
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
        // If the label is already a frequency (e.g. "8Hz"), just show it
        if (val.includes('Hz')) return <span>{val}</span>;
        if (!Number.isNaN(Number(val)) && Number(val) > 0) return <span>{`${Number(val)}Hz`}</span>;
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
                                            style={sensor === 'EEG' ? { width: cellSize, height: cellSize, padding: 0, fontSize: 20 * scale } : (sensor === 'EMG' ? { fontSize: 20 * scale, padding: 2 } : { fontSize: 24 * scale, padding: 2 })}>
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
    const API_BASE_URL = buildApiUrl('');
    const [activeTab, setActiveTab] = useState('EMG');

    // --- SESSIONS ---
    const [availableSessions, setAvailableSessions] = useState([]);
    const [selectedSession, setSelectedSession] = useState(null);
    const [sessionTotalSamples, setSessionTotalSamples] = useState(0);

    // Fetch total samples for selected session to display in Split UI
    useEffect(() => {
        if (!selectedSession) {
            fetch(`${API_BASE_URL}/api/dataset-size/${activeTab}`)
                .then(res => res.json())
                .then(data => {
                    if (data && typeof data.total !== 'undefined') {
                        setSessionTotalSamples(data.total);
                    } else {
                        setSessionTotalSamples(0);
                    }
                })
                .catch(e => {
                    console.error("Base dataset fetch error:", e);
                    setSessionTotalSamples(0);
                });
            return;
        }
        fetch(`${API_BASE_URL}/api/sessions/${activeTab}/${selectedSession}?limit=1`)
            .then(res => res.json())
            .then(data => {
                if (data && typeof data.total !== 'undefined') {
                    setSessionTotalSamples(data.total);
                } else {
                    setSessionTotalSamples(0);
                }
            })
            .catch(e => {
                console.error("Session fetch error:", e);
                setSessionTotalSamples(0);
            });
    }, [selectedSession, activeTab]);

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
    const [trainingJob, setTrainingJob] = useState(null);
    const [countdown, setCountdown] = useState(null);
    const [lastHistory, setLastHistory] = useState({ EMG: [], EOG: [], EEG: [] });
    const [selectedHistoryItems, setSelectedHistoryItems] = useState({ EMG: null, EOG: null, EEG: null });
    const [insightView, setInsightView] = useState('matrix'); // 'matrix' or 'insight' or 'history'

    // Params per sensor
    const [params, setParams] = useState({
        EMG: { n_estimators_min: 50, n_estimators_max: 200, max_depth_min: 5, max_depth_max: 15, test_ratio: 0.15, val_ratio: 0.15, train_ratio: 0.7, k_folds: 5, search_resolution: 3, min_impurity_decrease_max: 0.05 },
        EOG: { n_estimators_min: 50, n_estimators_max: 200, max_depth_min: 5, max_depth_max: 15, test_ratio: 0.15, val_ratio: 0.15, train_ratio: 0.7, k_folds: 5, search_resolution: 3, min_impurity_decrease_max: 0.05 },
        EEG: { test_size: 0.2, solver: 'eigen', shrinkage: 'auto' }
    });

    const activeResult = results[activeTab];
    const activeEvalResult = evalResults[activeTab];
    const activeParams = params[activeTab];
    const activeHistory = trainingJob?.history?.length ? trainingJob.history : ((activeResult || activeEvalResult)?.training_history || lastHistory[activeTab] || []);
    const selectedHistoryItem = selectedHistoryItems[activeTab] || activeHistory[activeHistory.length - 1] || null;
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
                    const currentName = forcedName || selectedModelName;
                    const currentModelExists = data.find(m => m.name === currentName);

                    if (!currentName || !currentModelExists) {
                        // We NO LONGER auto-load the active or first model.
                        // The user must explicitly select a model to fill the workspace.
                        setSelectedModels(prev => ({ ...prev, [activeTab]: null }));
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
        if (name === selectedModelName) {
            // Unselect if already selected
            setSelectedModels(prev => ({ ...prev, [activeTab]: null }));
            setResults(prev => ({ ...prev, [activeTab]: null }));
            setEvalResults(prev => ({ ...prev, [activeTab]: null }));
            return;
        }

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
        // Initial eval info only if a model is already selected
        if (selectedModelName) {
            handleEval();
        }
    }, [activeTab]); // When tab changes

    // Also re-fetch if session changes? Maybe useful for context, but not critical for model list.
    useEffect(() => {
        // Reload evaluation only if a model is already selected
        if (selectedModelName) {
            handleEval(selectedModelName);
        }
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

    const pollJob = async (jobId) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/train-jobs/${jobId}`);
            const data = await res.json();
            setTrainingJob(data);
            if (data.status === 'completed' || data.status === 'failed' || data.status === 'error') {
                return data; // Done
            }
            // Poll again very quickly (150ms ping)
            await new Promise(r => setTimeout(r, 150));
            return pollJob(jobId);
        } catch (e) {
            console.error("Polling error", e);
            setTrainingJob(prev => ({ ...prev, status: 'failed' }));
            throw e;
        }
    };

    const handleTrain = async () => {
        soundHandler.playMLTrain();
        if (!trainModelNameInput.trim()) {
            setError("Please name your model");
            return;
        }
        setLoading(true); setError(null);

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
                    k_folds: Math.round((activeParams.train_ratio + activeParams.val_ratio) / activeParams.val_ratio),
                    table_name: selectedSession || 'ALL',
                    model_name: modelNameFinal,
                    sensor: activeTab
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Training failed');

            if (data.job_id) {
                const finalJobResult = await pollJob(data.job_id);
                if (finalJobResult && (finalJobResult.status === 'completed' || finalJobResult.status === 'success')) {
                    // Start 5-second countdown
                    setCountdown(5);
                    const timer = setInterval(() => {
                        setCountdown(c => {
                            if (c <= 1) {
                                clearInterval(timer);
                                // Finalize
                                const resObj = finalJobResult.result || finalJobResult;
                                setResults(prev => ({ ...prev, [activeTab]: { ...resObj, source: getSourceName(true) } }));
                                setEvalResults(prev => ({ ...prev, [activeTab]: null }));
                                setSelectedModels(prev => ({ ...prev, [activeTab]: modelNameFinal }));
                                const history = finalJobResult.history || resObj.training_history || [];
                                setLastHistory(prev => ({ ...prev, [activeTab]: history }));
                                setSelectedHistoryItems(prev => ({ ...prev, [activeTab]: history[history.length - 1] || null }));
                                setTreeIndex(0);
                                fetchModels(modelNameFinal);
                                setTrainingJob(null);
                                setCountdown(null);
                                setLoading(false);
                                soundHandler.playSuccess();
                                return 0;
                            }
                            return c - 1;
                        });
                    }, 1000);
                } else {
                    const errorMsg = finalJobResult?.error || "Job failed or returned no result.";
                    throw new Error(errorMsg);
                }
            } else {
                setResults(prev => ({ ...prev, [activeTab]: { ...data, source: getSourceName(true) } }));
                setEvalResults(prev => ({ ...prev, [activeTab]: null }));
                setSelectedModels(prev => ({ ...prev, [activeTab]: modelNameFinal }));
                setTreeIndex(0);
                await fetchModels(modelNameFinal);
                setLoading(false);
                setTrainingJob(null);
            }
        } catch (e) {
            setError(e.message);
            setLoading(false);
            setTrainingJob(null);
            setCountdown(null);
        }
    };

    const handleEval = async (forceModelName = null) => {
        // Early return if no model provided and nothing selected
        if (!forceModelName && !selectedModelName) {
            setEvalResults(prev => ({ ...prev, [activeTab]: null }));
            return;
        }
        setEvalLoading(true); setError(null);

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
            if (data.training_history?.length) {
                setLastHistory(prev => ({ ...prev, [activeTab]: data.training_history }));
                setSelectedHistoryItems(prev => ({ ...prev, [activeTab]: data.training_history[data.training_history.length - 1] || null }));
            }

            if (data.hyperparameters) {
                const meta = data.hyperparameters || {};
                const selectedHyperparameters = meta.selected_hyperparameters || {};
                setParams(prev => ({
                    ...prev,
                    [activeTab]: {
                        ...prev[activeTab],
                        ...selectedHyperparameters,
                        train_ratio: meta.train_ratio ?? prev[activeTab]?.train_ratio,
                        val_ratio: meta.val_ratio ?? prev[activeTab]?.val_ratio,
                        test_ratio: meta.test_ratio ?? prev[activeTab]?.test_ratio,
                        k_folds: meta.k_folds ?? prev[activeTab]?.k_folds,
                        random_state: meta.random_state ?? prev[activeTab]?.random_state,
                    }
                }));
            }

            // We NO LONGER auto-select a model if it was null.
            // Only update selection if explicitly requested via forceModelName
            if (data.model_name && forceModelName) {
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
                    <div className="col-span-12 lg:col-span-3 row-span-6 flex flex-col gap-5 min-h-0">
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
                                setModelName={(name) => {
                                    setTrainModelNameInput(name);
                                    if (name && name !== '') {
                                        setSelectedModels(prev => ({ ...prev, [activeTab]: null }));
                                        setResults(prev => ({ ...prev, [activeTab]: null }));
                                        setEvalResults(prev => ({ ...prev, [activeTab]: null }));
                                    }
                                }}
                            />
                        </div>

                        {/* 2. ACCURACY - SPLIT PANEL */}
                        <div className="shrink-0 h-[339px]">
                            <SplitAccuracyCard
                                result={activeResult || activeEvalResult}
                                models={models}
                                selectedModelName={selectedModelName}
                                onSelectModel={handleLoadModel}
                                onDeleteModel={handleDeleteModel}
                                params={activeParams}
                                totalSamples={sessionTotalSamples}
                            />
                        </div>

                        <div className="flex-1 flex-grow-4 min-h-0">
                            {activeTab !== 'EEG' ? (
                                <ControlPanelCard
                                    params={activeParams}
                                    setParamsTab={(updates) => setParams(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], ...updates } }))}
                                    job={trainingJob}
                                    activeTab={activeTab}
                                    models={models}
                                    activeModelName={selectedModelName}
                                    onSelectRun={(name) => {
                                        setInsightView('history');
                                        if (name === selectedModelName) {
                                            handleEval(name);
                                            return;
                                        }
                                        handleLoadModel(name);
                                    }}
                                />
                            ) : (
                                <EEGHyperparametersCard
                                    params={activeParams}
                                    onChange={handleParamChange}
                                />
                            )}
                        </div>
                    </div>

                    {/* MAIN BENTO GRID (Span 9) */}
                    {trainingJob ? (
                        <div className="col-span-12 md:col-span-9 row-span-6 min-h-0 flex flex-col overflow-hidden">
                            <TrainingStatusDashboard
                                job={trainingJob}
                                countdown={countdown}
                                params={activeParams}
                                activeTab={activeTab}
                                selectedHistoryItem={selectedHistoryItem}
                                onSelectHistory={(item) => setSelectedHistoryItems(prev => ({ ...prev, [activeTab]: item }))}
                            />
                        </div>
                    ) : (activeResult || (selectedModelName && activeEvalResult)) ? (
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
                                        <FeatureInsightCard
                                            importances={(activeResult || activeEvalResult)?.feature_importances}
                                            featureOrder={(activeResult || activeEvalResult)?.feature_order}
                                            sensor={activeTab}
                                        />
                                    </div>

                                    <div className="col-span-12 md:col-span-6 row-span-2 min-h-0 flex flex-col overflow-hidden relative group">
                                        {insightView === 'matrix' ? (
                                            <div className="h-full flex flex-col relative">
                                                <button
                                                    onClick={() => setInsightView('insight')}
                                                    className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-[var(--bg)]/80 backdrop-blur-sm border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm opacity-0 group-hover:opacity-100"
                                                >
                                                    <Info size={14} /> Insights
                                                </button>
                                                <button
                                                    onClick={() => setInsightView('history')}
                                                    className="absolute top-2 right-24 z-10 p-1.5 rounded-lg bg-[var(--bg)]/80 backdrop-blur-sm border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm opacity-0 group-hover:opacity-100"
                                                >
                                                    <BookOpen size={14} /> Training History
                                                </button>
                                                <ConfusionMatrixCard
                                                    matrix={(activeResult || activeEvalResult).confusion_matrix}
                                                    labels={(activeResult || activeEvalResult).labels || []}
                                                    n_samples={(activeResult || activeEvalResult).n_samples}
                                                    sensor={activeTab}
                                                />
                                            </div>
                                        ) : insightView === 'history' ? (
                                            <TrainingHistoryCard
                                                title={`${activeTab} Training History`}
                                                history={activeHistory}
                                                selectedItem={selectedHistoryItem}
                                                onSelectItem={(item) => setSelectedHistoryItems(prev => ({ ...prev, [activeTab]: item }))}
                                                detailLabel="Saved Fold Detail"
                                            />
                                        ) : (
                                            <InsightCard
                                                result={activeResult || activeEvalResult}
                                                sensor={activeTab}
                                                onMatrixToggle={() => setInsightView('matrix')}
                                                onHistoryToggle={() => setInsightView('history')}
                                            />
                                        )}
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
                                                    isFit={true}
                                                />
                                                <div className="flex-grow min-h-0 flex flex-col overflow-hidden">
                                                    <EEGLDAVisualizationCard result={activeResult || activeEvalResult} />
                                                </div>
                                            </div>

                                            <div className="col-span-12 lg:col-span-4 row-span-2 min-h-0 flex flex-col overflow-hidden">
                                                <FeatureInsightCard
                                                    importances={(activeResult || activeEvalResult)?.feature_importances}
                                                    featureOrder={(activeResult || activeEvalResult)?.feature_order}
                                                    sensor={activeTab}
                                                />
                                            </div>
                                            <div className="col-span-12 lg:col-span-8 row-span-2 min-h-0 flex flex-col overflow-hidden">
                                                {insightView === 'history' ? (
                                                    <TrainingHistoryCard
                                                        title="EEG Training History"
                                                        history={activeHistory}
                                                        selectedItem={selectedHistoryItem}
                                                        onSelectItem={(item) => setSelectedHistoryItems(prev => ({ ...prev, [activeTab]: item }))}
                                                        detailLabel="Saved Fold Detail"
                                                    />
                                                ) : (
                                                    <EEGModelInsightCard
                                                        result={activeResult || activeEvalResult}
                                                        selectedSessionName={selectedSessionName}
                                                        params={activeParams}
                                                        onHistoryToggle={() => setInsightView('history')}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="col-span-12 lg:col-span-9 row-span-6 card border-2 border-dashed border-[var(--border)] rounded-xl flex flex-col items-center justify-center text-[var(--muted)] bg-[var(--surface)]/50">
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

import { buildApiUrl } from '../../utils/runtimeConnection';
