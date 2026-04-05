import Tree from 'react-d3-tree';
import { useState, useEffect, Fragment, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import { buildApiUrl, getSocketIoConnection } from '../../utils/runtimeConnection';
import {
    Trash2, Rocket, ArrowRight, Save, Target, ListOrdered,
    Database, Hand, Eye, Network, Grid3X3, Brain, PieChart,
    RefreshCw, Sliders, ChevronLeft, ChevronRight, Circle,
    ArrowRightFromLine, Info, BookOpen, BrainCircuit,
    Clock, Activity, Fingerprint, Layers, Timer, Cpu, GitMerge, Search, Zap, GitBranch, MousePointer2
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

const ModelIdBadge = ({ model, size = 'sm', isActive = false }) => {
    const candidateIdx = model.candidate_index ?? model.candidate_idx ?? 0;
    const foldIdx = model.fold_index ?? model.fold_idx ?? 0;
    const displayCandidateIdx = candidateIdx + 1;
    const hasIndices = (model.candidate_index !== undefined || model.candidate_idx !== undefined);
    const preferredId = model.best_fold_id || model.model_id || model.id;

    const mutedColor = 'text-[var(--text)]';
    const primaryColor = 'text-[var(--graph-line-1)]';

    if (!hasIndices && !preferredId) {
        return <span className={`opacity-40 italic ${size === 'sm' ? 'text-[10px]' : 'text-[12px]'}`}>ID UNKNOWN</span>;
    }

    // If we have a formatted model_id but no indices, try to parse it or just show it
    if (!hasIndices && preferredId) {
        const id = preferredId;
        const match = String(id).match(/^([C-Z])([0-9A-F]{2})F([0-9A-F]+)$/i);
        if (match) {
            return (
                <span className={`font-mono font-black ${size === 'sm' ? 'text-[10px]' : 'text-[14px]'}`}>
                    <span className={mutedColor}>{match[1].toUpperCase()}</span>
                    <span className={primaryColor}>{match[2].toUpperCase()}</span>
                    <span className={`${mutedColor} ml-0.5`}>F</span>
                    <span className={primaryColor}>{match[3].toUpperCase()}</span>
                </span>
            );
        }
        return <span className={`font-mono font-black ${size === 'sm' ? 'text-[10px]' : 'text-[14px]'}`}>{id}</span>;
    }

    return (
        <span className={`font-mono font-black ${size === 'sm' ? 'text-[10px]' : 'text-[14px]'}`}>
            <span className={mutedColor}>C</span>
            <span className={primaryColor}>{(displayCandidateIdx).toString(16).toUpperCase().padStart(2, '0')}</span>
            <span className={`${mutedColor} ml-0.5`}>F</span>
            <span className={primaryColor}>{Number(foldIdx).toString(16).toUpperCase()}</span>
        </span>
    );
};

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
                                    <div className="text-[12px] text-[var(--muted)] font-mono uppercase tracking-wider truncate opacity-70">
                                        <ModelIdBadge model={m} size='lg' />
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

const SplitAccuracyCard = ({ result, models, selectedModelName, onSelectModel, onDeleteModel, params, onParamsChange, totalSamples }) => {
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
                                    kFolds={params?.k_folds === '' ? '' : (params?.k_folds || 5)}
                                    onFoldChange={(k) => {
                                        const validK = Math.max(1, k);
                                        const testRatio = params?.test_ratio || 0.15;
                                        const remaining = Math.max(0, 1.0 - testRatio);
                                        const valRatio = parseFloat((remaining / validK).toFixed(3));
                                        const trainRatio = parseFloat((remaining - valRatio).toFixed(3));
                                        onParamsChange({
                                            k_folds: validK,
                                            val_ratio: valRatio,
                                            train_ratio: trainRatio
                                        });
                                    }}
                                    verdict={{
                                        text: params?.k_folds ? `${params.k_folds} FOLDS` : (params?.k_folds === '' ? '' : '5 FOLDS'),
                                        color: 'text-[var(--primary)]',
                                        bg: 'bg-transparent'
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
    const normalizedImportances = (() => {
        const entries = Object.entries(importances || {});
        if (entries.length > 0) return importances || {};
        if (sensor !== 'EEG' || !features.length) return {};
        const fallbackWeight = 1 / features.length;
        return Object.fromEntries(features.map((feature) => [feature, fallbackWeight]));
    })();

    useEffect(() => {
        if (features.length > 0) {
            setSelectedFeature(features[0]);
        }
    }, [sensor, features.length]);

    const sortedImportances = Object.entries(normalizedImportances).sort(([, a], [, b]) => b - a);
    const activeDetail = fullMetadata[selectedFeature] || { full: selectedFeature, short: selectedFeature, detail: 'No detailed metadata available for this feature.' };

    return (
        <div className="h-full flex flex-col px-2 pt-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm relative group/card overflow-hidden">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
                <h3 className="text-[18px] flex items-center font-bold text-[var(--muted)] uppercase tracking-widest">
                    <ListOrdered size={32} className='mr-4 border border-text bg-bg rounded-[4px]' color='var(--text)' />
                    <span className="flex items-center gap-2">
                        {view === 'importance' ? 'Top Features' : 'Feature Set'}
                        <span className="text-[12px] bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 rounded-full text-[var(--text)] font-mono">{view === 'importance' ? sortedImportances.length : features.length}</span>
                    </span>
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
                            <ul className="h-full overflow-y-auto pt-1 pr-2 space-y-1.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {sortedImportances.length > 0 ? sortedImportances.map(([name, imp]) => (
                                    <li
                                        key={name}
                                        onClick={() => {
                                            setSelectedFeature(name);
                                            setView('list');
                                        }}
                                        className="flex items-center text-[var(--text)] group hover:bg-[var(--bg)]/30 rounded-lg px-2 py-1 transition-all border border-transparent hover:border-[var(--border)] cursor-pointer"
                                    >
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
                            <div className="h-full flex flex-row gap-4">
                                {/* Left Side: Master List */}
                                <div className="w-1/3 flex flex-col min-h-0">
                                    <div className="flex-1 overflow-y-auto py-2 space-y-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                        {features.map((feature) => (
                                            <button
                                                key={feature}
                                                onClick={() => setSelectedFeature(feature)}
                                                className={`w-full text-left rounded-lg border px-2 py-1 transition-all flex flex-col gap-0 group/btn ${selectedFeature === feature
                                                    ? 'bg-[var(--primary)]/15 border-[var(--primary)] shadow-[0_0_12px_var(--primary)]/20 shadow-inner'
                                                    : 'bg-[var(--bg)]/30 border-[var(--border)] hover:border-[var(--muted)]'
                                                    }`}
                                            >
                                                <div className={`text-[16px] font-black tracking-widest ${selectedFeature === feature ? 'text-[var(--primary)]' : 'text-[var(--muted)]'}`}>
                                                    {fullMetadata[feature]?.short || feature}
                                                </div>
                                                <div className="text-[12px] text-[var(--text)] opacity-60 truncate group-hover/btn:opacity-100 transition-opacity">
                                                    {fullMetadata[feature]?.full || feature}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Right Side: Detail Card */}
                                <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg)]/40 py-2 ">
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={selectedFeature}
                                            initial={{ opacity: 0, x: 10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            transition={{ duration: 0.2 }}
                                            className="h-full flex flex-col"
                                        >
                                            <div className="text-[14px] uppercase font-bold text-[var(--primary)] tracking-[0.2em] mb-1">Feature Detail</div>
                                            <h4 className="text-[20px] font-black text-[var(--text)] leading-tight border-b border-[var(--border)] pb-1">
                                                {activeDetail.full}
                                            </h4>
                                            <p className="text-[18px] leading-relaxed text-[var(--muted)] font-medium pt-1">
                                                {activeDetail.detail}
                                            </p>

                                            <div className="mt-auto pt-1 flex justify-between items-center text-[12px] font-bold text-[var(--muted)] border-t border-[var(--border)]/50">
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
    const train = Number(trainAcc);
    const val = Number(valAcc);
    const test = Number(testAcc);
    const hasTrain = !Number.isNaN(train);
    const hasVal = !Number.isNaN(val);
    const hasTest = !Number.isNaN(test);

    if (!hasTrain && !hasVal && !hasTest) return { text: '--', color: 'text-[var(--muted)]', bg: 'bg-[var(--bg)]/10', desc: 'No data' };

    const generalization = hasTest ? test : (hasVal ? val : train);
    const validationGap = hasTrain && hasVal ? train - val : 0;
    const testGap = hasTrain && hasTest ? train - test : validationGap;
    const effectiveGap = Math.max(validationGap, testGap);

    if (generalization < 0.6) return { text: 'UNDERFIT', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', desc: 'Model is not learning a stable decision boundary' };
    if (hasTrain && train > 0.98 && generalization < 0.8) return { text: 'SEVERE OVERFIT', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', desc: 'Training score is much stronger than held-out performance' };
    if (effectiveGap > 0.12) return { text: 'OVERFIT', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', desc: 'Generalization gap is too wide across validation/test' };
    if (generalization >= 0.9 && effectiveGap <= 0.08) return { text: 'OPTIMAL FIT', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', desc: 'Train, validation, and test scores are all strong and aligned' };
    if (generalization >= 0.75) return { text: 'MODERATE FIT', color: 'text-[var(--primary)]', bg: 'bg-[var(--primary)]/10 border-[var(--primary)]/30', desc: 'Model performance is usable but still has room to improve' };

    return { text: 'WEAK FIT', color: 'text-yellow-300', bg: 'bg-yellow-500/10 border-yellow-500/30', desc: 'Model is learning something, but held-out performance is still low' };
};

const historyId = (item) => item?.model_id || item?.id || '--';
const historyCandidate = (item) => (item?.candidate_index ?? item?.candidate_idx ?? 0) + 1;
const historyFold = (item) => item?.fold_index || item?.fold_idx || 0;
const historyParams = (item) => item?.hyperparameters || item?.params || {};
const formatCandidateDecimal = (value) => String(Number(value) || 0).padStart(2, '0');
const formatFixedFive = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(5) : '--';
};

const HistoryList = ({ history = [], selectedId, onSelect, emptyText = 'No training history available.', decimalCandidateDisplay = false }) => {
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
                            <div className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[0.18em]">
                                Candidate {decimalCandidateDisplay ? formatCandidateDecimal(cand.idx) : cand.idx}
                            </div>
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
                            const isActive = selectedId === id;
                            return (
                                <button
                                    key={id}
                                    onClick={() => onSelect?.(item)}
                                    className={`px-2 py-1 rounded-md border transition-all ${isActive ? 'bg-[var(--primary)] border-[var(--primary)] shadow-sm' : 'bg-[var(--surface)] border-[var(--border)] hover:border-[var(--primary)]/50'}`}
                                >
                                    <ModelIdBadge model={item} isActive={isActive} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

const HistoryDetailCard = ({ item, decimalCandidateDisplay = false }) => {
    if (!item) {
        return <div className="flex h-full items-center justify-center text-sm italic text-[var(--muted)] opacity-60">Click a model ID like C01F1 to inspect it.</div>;
    }

    const params = historyParams(item);
    return (
        <div className="h-full p-4 rounded-xl bg-[var(--bg)]/40 border border-[var(--border)] space-y-3 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-black">Model ID</div>
                    <div className="text-2xl mt-1">
                        <ModelIdBadge model={item} size="lg" />
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-black">Validation</div>
                    <div className="text-xl font-black text-[var(--text)]">{pct(item.validation_accuracy ?? item.accuracy)}</div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <div className="text-[10px] uppercase text-[var(--muted)] font-black mb-1">Candidate / Fold</div>
                    <div className="text-sm font-mono text-[var(--text)]">
                        {decimalCandidateDisplay ? formatCandidateDecimal(historyCandidate(item)) : historyCandidate(item)} / {historyFold(item)}
                    </div>
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

const TrainingHistoryCard = ({ title = 'Training History', history = [], selectedItem, onSelectItem, detailLabel = 'Model Detail', decimalCandidateDisplay = false }) => (
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
                <HistoryList history={history} selectedId={historyId(selectedItem)} onSelect={onSelectItem} decimalCandidateDisplay={decimalCandidateDisplay} />
            </div>
            <div className="col-span-12 lg:col-span-5 min-h-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-black mb-2">{detailLabel}</div>
                <HistoryDetailCard item={selectedItem} decimalCandidateDisplay={decimalCandidateDisplay} />
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


const HyperparametersCard = ({ params, setParamsTab, activeTab, models = [] }) => {
    const [view] = useState('params'); // 'params' or 'runs'
    const minVal = Math.round((params.train_ratio || 0.7) * 100);
    const maxVal = Math.round(((params.train_ratio || 0.7) + (params.val_ratio || 0.15)) * 100);

    return (
        <div className=" h-full flex flex-col px-2 pt-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm relative group/card overflow-hidden">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
                <h3 className="text-[18px] flex items-center font-bold text-[var(--muted)] uppercase tracking-widest">
                    <Sliders size={32} className='mr-4 border border-text bg-bg rounded-[4px] p-1' color='var(--text)' />
                    <span className="flex items-center text-[var(--graph-text)]  gap-2">
                        Hyperparameters
                        <span className="text-[12px] bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 rounded-full text-[var(--text)] font-mono">
                            {view === 'params' ? (activeTab === 'EEG' ? 5 : 7) : models.length}
                        </span>
                    </span>
                </h3>
            </div>

            <div className="flex-1 min-h-0 relative">
                <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {/* Global Parameters: Split & Search Resolution */}

                    <div className="p-0 border-0 bg-transparent">
                        <div className="flex justify-between items-center mb-1 px-1">
                            <span className="text-[12px] font-black text-[var(--text-tertiary)] uppercase tracking-[0.1em]"> Data Partition </span>
                            <div className="flex items-center gap-2 font-mono font-black text-[18px]">
                                <span className="text-[var(--text)]">{Math.round(params.train_ratio * 100)}%</span>
                                <span className="text-[var(--muted)] opacity-30">/</span>
                                <span className="text-[var(--muted)]">{Math.round(params.val_ratio * 100)}%</span>
                                <span className="text-[var(--muted)] opacity-30">/</span>
                                <span className="text-[var(--accent)]">{Math.round(params.test_ratio * 100)}%</span>
                            </div>
                        </div>
                        <RangeSlider
                            min={0} max={100} step={1}
                            minValue={minVal} maxValue={maxVal}
                            leftColor="var(--text)"
                            middleColor="var(--muted)"
                            rightColor="var(--accent)"
                            hideLabels={true}
                            compact={true}
                            minLimit={1}
                            maxLimit={99}
                            onChange={({ min, max }) => {
                                const trainRatio = parseFloat((min / 100).toFixed(3));
                                const valRatio = parseFloat(((max - min) / 100).toFixed(3));
                                const testRatio = parseFloat(((100 - max) / 100).toFixed(3));
                                const totalNonTest = trainRatio + valRatio;
                                const rawK = Math.round(totalNonTest / (valRatio || 0.001));
                                const k = Math.max(2, Math.min(20, rawK));

                                setParamsTab({
                                    train_ratio: trainRatio,
                                    val_ratio: valRatio,
                                    test_ratio: testRatio,
                                    k_folds: k
                                });
                            }}
                        />
                    </div>

                    <div className="p-0 border-0 bg-transparent">
                        <div className="flex justify-between items-center mb-1 px-1">
                            <span className="text-[12px] font-black text-[var(--text-tertiary)] uppercase tracking-[0.1em]">Search Resolution</span>
                            <span className="text-[18px] text-[var(--header-text)] font-black font-mono leading-none">{params.search_resolution}</span>
                        </div>
                        <CustomSlider min={2} max={10} step={1}
                            backgroundColor="var(--bg)"
                            value={params.search_resolution} onChange={(value) => setParamsTab({ search_resolution: value })} />
                    </div>

                    {activeTab !== 'EEG' ? (
                        <div className="grid grid-cols-2 gap-1 pb-2">
                            <div className="col-span-2 p-0 border-0 bg-transparent">
                                <div className="flex justify-between items-end mb-2 px-1">
                                    <span className="text-[12px] font-black text-[var(--text-tertiary)] uppercase tracking-[0.1em]">Estimators Range</span>
                                    <div className="flex items-center gap-2 text-[18px] font-black font-mono text-[var(--header-text)]">
                                        <span >{params.n_estimators_min || 50}</span>
                                        <span className="text-[var(--muted)]">-</span>
                                        <span >{params.n_estimators_max || 200}</span></div>
                                </div>

                                <RangeSlider min={5} max={500} step={15}
                                    leftColor="var(--muted)" rightColor="var(--muted)"
                                    minValue={params.n_estimators_min || 50} maxValue={params.n_estimators_max || 200} hideLabels={true} compact={true} color="var(--primary)" onChange={(vals) => setParamsTab({ n_estimators_min: vals.min, n_estimators_max: vals.max })} />
                            </div>

                            <div className="p-0 border-0 bg-transparent">
                                <div className="flex justify-between items-end mb-2 px-1">
                                    <span className="text-[12px] font-black text-[var(--text-tertiary)] uppercase tracking-[0.1em]">Max Depth</span>
                                    <div className="flex items-center gap-1 font-mono text-[16px] text-[var(--header-text)] font-black">{params.max_depth_min || 5} - {params.max_depth_max || 15}</div>
                                </div>

                                <RangeSlider min={2} max={30} step={1}
                                    leftColor="var(--muted)" rightColor="var(--muted)" minValue={params.max_depth_min || 5} maxValue={params.max_depth_max || 15} hideLabels={true} compact={true} color="var(--primary)" onChange={(vals) => setParamsTab({ max_depth_min: vals.min, max_depth_max: vals.max })} />
                            </div>

                            <div className="p-0 border-0 bg-transparent">
                                <div className="flex justify-between items-end mb-2 px-1">
                                    <span className="text-[12px] font-black text-[var(--text-tertiary)] uppercase tracking-[0.1em]">Impurity</span>
                                    <div className="text-[16px] font-mono text-[var(--header-text)] font-black truncate">{params.min_impurity_decrease_min || 0} - {params.min_impurity_decrease_max || 0.05}</div>
                                </div>
                                <RangeSlider min={0} max={0.1} step={0.005}
                                    leftColor="var(--muted)" rightColor="var(--muted)" minValue={params.min_impurity_decrease_min || 0} maxValue={params.min_impurity_decrease_max || 0.05} hideLabels={true} compact={true} color="var(--primary)" onChange={(vals) => setParamsTab({ min_impurity_decrease_min: vals.min, min_impurity_decrease_max: vals.max })} />
                            </div>

                            <div className="p-0 border-0 bg-transparent">
                                <div className="text-[12px] font-black text-[var(--text-tertiary)] uppercase tracking-[0.1em] mb-1.5 px-1">Criterion</div>
                                <CustomSelect className='font-bold text-[var(--header-text)]' direction="up" value={params.criterion || 'gini'} onChange={(value) => setParamsTab({ criterion: value })} options={[{ value: 'gini', label: 'Gini' }, { value: 'entropy', label: 'Entropy' }, { value: 'gini,entropy', label: 'Both' }]} />
                            </div>

                            <div className="p-0 border-0 bg-transparent">
                                <div className="text-[12px] font-black text-[var(--text-tertiary)] uppercase tracking-[0.1em] mb-1.5 px-1">Features</div>
                                <CustomSelect className='font-bold text-[var(--header-text)]' direction="up" value={params.max_features || 'sqrt'} onChange={(value) => setParamsTab({ max_features: value })} options={[{ value: 'sqrt', label: 'Sqrt' }, { value: 'log2', label: 'Log2' }, { value: 'None', label: 'None' }, { value: 'sqrt,log2', label: 'Both' }]} />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-[10px]">
                            <div className="p-0 border-0 bg-transparent">
                                <div className="flex justify-between items-end px-1 mb-2">
                                    <span className="text-[12px] font-black text-[var(--text-tertiary)] uppercase tracking-[0.1em]">LDA Tolerance Range</span>
                                    <div className="flex items-center gap-1 text-[18px] font-black font-mono text-[var(--header-text)]">
                                        {params.tol_min || 0.0001} - {params.tol_max || 0.01}
                                    </div>
                                </div>
                                <RangeSlider min={0.0001} max={0.1} step={0.001}
                                    leftColor="var(--muted)" rightColor="var(--muted)" minValue={params.tol_min || 0.0001} maxValue={params.tol_max || 0.01} hideLabels={true} compact={true} color="var(--primary)" onChange={(vals) => setParamsTab({ tol_min: vals.min, tol_max: vals.max })} />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-0 border-0 bg-transparent">
                                    <div className="text-[12px] font-black text-[var(--text-tertiary)] uppercase tracking-[0.1em] mb-1.5 px-1">Solver</div>
                                    <CustomSelect className='font-bold text-[var(--header-text)]' direction="up" value={params.solver || 'svd'} onChange={(value) => setParamsTab({ solver: value })} options={[{ value: 'svd', label: 'SVD' }, { value: 'lsqr', label: 'LSQR' }, { value: 'eigen', label: 'Eigen' }, { value: 'svd,lsqr,eigen', label: 'All' }]} />
                                </div>
                                <div className="p-0 border-0 bg-transparent">
                                    <div className="text-[12px] font-black text-[var(--text-tertiary)] uppercase tracking-[0.1em] mb-1.5 px-1">Shrinkage</div>
                                    <CustomSelect className='font-bold text-[var(--header-text)]' direction="up" value={params.shrinkage || 'auto'} onChange={(value) => setParamsTab({ shrinkage: value })} options={[{ value: 'auto', label: 'Auto' }, { value: 'none', label: 'None' }, { value: 'auto,none', label: 'Both' }]} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
};

const TrainingStatusDashboard = ({ job, countdown, params, selectedHistoryItem, onSelectHistory }) => {
    const latestFold = job?.history?.[job.history.length - 1];

    // Map parameters to icons
    const getParamIcon = (key) => {
        const iconClass = "w-3.5 h-3.5 opacity-60";
        if (key.includes('estimators')) return <Cpu className={iconClass} />;
        if (key.includes('depth')) return <GitMerge className={iconClass} />;
        if (key.includes('impurity')) return <Zap className={iconClass} />;
        if (key.includes('criterion')) return <GitBranch className={iconClass} />;
        if (key.includes('features')) return <MousePointer2 className={iconClass} />;
        if (key.includes('resolution')) return <Search className={iconClass} />;
        if (key.includes('tol')) return <Activity className={iconClass} />;
        if (key.includes('solver') || key.includes('shrinkage')) return <Cpu className={iconClass} />;
        return <Info className={iconClass} />;
    };

    return (
        <div className="flex flex-col h-full gap-4 overflow-hidden animate-in fade-in duration-500">
            {/* Top Row: Progress Arc (8) and Active Parameters (4) */}
            <div className="grid grid-cols-12 gap-4 h-1/2">
                {/* Progress Arc Panel (8) */}
                <div className={`col-span-12 lg:col-span-8 ${card} flex flex-col items-center justify-center relative overflow-hidden group`}>
                    {/* Background Detail */}
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)]/5 via-transparent to-[var(--primary)]/5 opacity-50" />

                    {/* Corner Stats: Top Left - Time Consumed */}
                    <div className="absolute top-4 left-6 flex flex-col">
                        <div className="text-[16px] uppercase font-black text-[var(--muted)] tracking-[0.2em] mb-1.5 opacity-80">
                            Time Consumed
                        </div>
                        <div className="flex items-center gap-3">
                            <Clock size={24} className="text-[var(--primary)]" />
                            <div className="text-3xl font-black text-[var(--text)] font-mono leading-none">
                                {formatDuration(job?.elapsed_seconds)}
                            </div>
                        </div>
                    </div>

                    {/* Corner Stats: Top Right - Current Accuracy */}
                    <div className="absolute top-4 right-6 flex flex-col items-end">
                        <div className="text-[16px] uppercase font-black text-[var(--muted)] tracking-[0.2em] mb-1.5 opacity-80">
                            Current Accuracy
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-[24px] font-black text-[var(--text-success)] font-mono leading-none">
                                {latestFold ? pct(latestFold.accuracy) : '--'}
                            </div>
                            <Target size={24} className=" text-[var(--primary)]" />
                        </div>
                    </div>

                    {/* Main Progress Visualization */}
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="scale-90 lg:scale-105">
                            <HalfCircleProgress
                                progress={job?.progress || 0}
                                size={720}
                                strokeWidth={24}
                                hideLabels={true}
                                primaryColor="var(--text)"
                                secondaryColor='var(--text-error)'
                            />
                        </div>

                        {/* Central Stats: Progress Percentage and Model Details */}
                        <div className="absolute bottom-[36px] flex flex-col items-center justify-center">
                            {/* Big Progress Percentage */}
                            <div className="relative flex items-center justify-center mb-20">
                                <Activity size={32} className="absolute left-[-40px] text-[var(--primary)] animate-pulse" />
                                <span className="text-[90px] font-black text-[var(--graph-line-1)] font-mono leading-none tracking-tighter">
                                    {job?.progress ? (
                                        (job.progress * 100 < 1 && job.progress > 0)
                                            ? (job.progress * 100).toFixed(1)
                                            : Math.round(job.progress * 100)
                                    ) : '--'}
                                    <span className="text-3xl opacity-80 ml-[10px] text-[var(--label)]">
                                        {job?.progress ? '%' : ''}
                                    </span>
                                </span>
                            </div>

                            {/* Small Detail Row - No status bar, just integrated arrangement */}
                            <div className="flex items-center gap-12">
                                <div className="flex flex-col items-center">
                                    <div className="flex items-center gap-1.5 text-[14px] uppercase font-bold text-[var(--muted)] tracking-widest mb-2">
                                        <Fingerprint size={18} color='var(--text)' /> <span>Model ID</span>
                                    </div>
                                    <span className='text-[24px] font-black font-mono leading-none'>
                                        {latestFold ? (
                                            <span className='text-[24px] font-black font-mono leading-none'>
                                                <span className="text-[var(--muted)]">C</span>
                                                <span className="text-[var(--primary)]">{((latestFold.candidate_index ?? latestFold.candidate_idx ?? 0) + 1).toString(16).toUpperCase().padStart(2, '0')}</span>
                                                <span className="text-[var(--muted)]">F</span>
                                                <span className="text-[var(--primary)]">{Number(latestFold.fold_index ?? latestFold.fold_idx ?? 0).toString(16).toUpperCase()}</span>
                                            </span>
                                        ) : '--'}
                                    </span>
                                </div>
                                <div className="flex flex-col items-center px-10 border-x-2 border-[var(--border)]/80">
                                    <div className="flex items-center gap-1.5 text-[14px] uppercase font-bold text-[var(--muted)] tracking-widest mb-2">
                                        <Layers size={18} color='var(--text)' /> <span>Candidates</span>
                                    </div>
                                    <span className="text-[24px] font-black font-mono leading-none">
                                        <span className="text-[var(--primary)]">{formatCandidateDecimal((job?.candidate_index ?? 0) + 1)}</span>
                                        <span className="opacity-30 mx-1.5 text-[var(--muted)]">/</span>
                                        <span className="text-[var(--muted)]">{formatCandidateDecimal(job?.total_candidates || 0)}</span>
                                    </span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <div className="flex items-center gap-1.5 text-[14px] uppercase font-bold text-[var(--muted)] tracking-widest mb-2">
                                        <Timer size={18} color='var(--text)' /> <span>Time LEFT</span>
                                    </div>
                                    <span className="text-[24px] font-black font-mono text-[var(--primary)] leading-none">{formatDuration(job?.eta_seconds)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Cooldown Timer */}
                    {countdown !== null && (
                        <div className="absolute bottom-2 -translate-y-1/2 flex items-center gap-3 px-6 py-3 rounded-2xl bg-[var(--primary)]/20 border border-[var(--primary)] text-[var(--primary)] font-bold animate-bounce shadow-[0_0_30px_rgba(var(--primary-rgb),0.4)] backdrop-blur-md">
                            <RefreshCw className="w-5 h-5 animate-spin" />
                            <span className="text-sm uppercase tracking-widest">Finalizing... {countdown}s</span>
                        </div>
                    )}
                </div>

                {/* Active Parameters Panel (4) */}
                <div className={`col-span-12 lg:col-span-4 ${card} flex flex-col overflow-hidden group/params`}>
                    <div className="p-4 border-b border-[var(--border)] flex items-center gap-2 bg-[var(--surface)]/50 shrink-0">
                        <Sliders className="w-4 h-4 text-[var(--primary)]" />
                        <span className="text-xs font-black text-[var(--muted)] uppercase tracking-[0.2em]">Active Configuration</span>
                    </div>
                    <div className="flex-1 p-4 grid grid-cols-2 gap-2.5 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {Object.entries(params)
                            .filter(([k]) => !['table_name', 'model_name', 'train_ratio', 'val_ratio', 'test_ratio', 'random_state', 'n_estimators_min', 'n_estimators_max', 'max_depth_min', 'max_depth_max', 'min_impurity_decrease_min', 'min_impurity_decrease_max', 'tol_min', 'tol_max'].includes(k))
                            .map(([key, val]) => (
                                <div key={key} className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] group-hover/params:border-[var(--primary)]/30 transition-colors flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--muted)]">
                                            {getParamIcon(key)}
                                        </div>
                                        <span className="text-[10px] font-black text-[var(--muted)] uppercase tracking-wider">{key.replace(/_/g, ' ')}</span>
                                    </div>
                                    <span className="text-sm font-black text-[var(--text)] font-mono">{val?.toString() || '--'}</span>
                                </div>
                            ))}
                    </div>
                </div>
            </div>

            {/* Bottom Row: Full Width History */}
            <div className="flex-1 min-h-0">
                <TrainingHistoryCard
                    title="Grid Search Activity Log"
                    history={job?.history || []}
                    selectedItem={selectedHistoryItem}
                    onSelectItem={onSelectHistory}
                    detailLabel="Model Performance Analysis"
                    decimalCandidateDisplay={true}
                />
            </div>
        </div >
    );
};

const DataInsightCard = ({ result, sensor, params, selectedSessionName, embedded = false, onMatrixToggle }) => {
    if (!result) return <div className={`p-4 ${card} h-full text-[var(--muted)] flex items-center justify-center italic relative`}>No insight data available yet.</div>;

    const v = getVerdict(result.train_accuracy, result.validation_accuracy, result.test_accuracy || result.accuracy);
    const cleanedSessionName = (name) => String(name || '').replace(/^[a-z]+_session_/i, '');
    const trainedSessionNames = Array.isArray(result?.session_names) && result.session_names.length
        ? result.session_names
        : (result?.session_name ? [result.session_name] : []);
    const trainedSessionLabel = trainedSessionNames.length
        ? trainedSessionNames.map(cleanedSessionName).join(', ')
        : cleanedSessionName(selectedSessionName || '--');
    const trainedSampleCount = result?.n_samples ?? result?.split_summary?.total_samples ?? '--';
    const groupCount = result?.group_counts ? Object.keys(result.group_counts).length : '--';
    const classLabelSummary = Array.isArray(result?.labels) && result.labels.length ? result.labels.join(', ') : '--';
    const mRow = (label, val, perc = false, mono = false) => (
        <div className="flex justify-between items-center py-1 border-b border-[var(--border)]/30 last:border-0 hover:bg-white/5 px-1 rounded transition-colors">
            <span className="text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider">{label}</span>
            <span className={`text-[14px] font-black ${mono ? 'font-mono' : ''} text-[var(--text)]`}>{val === '--' ? val : (perc ? pct(val) : val)}</span>
        </div>
    );

    // Calculate split ratios
    const trainPct = Math.round((params?.train_ratio || 0.7) * 100);
    const valPct = Math.round((params?.val_ratio || 0.15) * 100);
    const testPct = Math.round((params?.test_ratio || 0.15) * 100);

    return (
        <div className={`${embedded ? 'h-full' : 'pt-2 px-2 pb-0 card'} overflow-hidden flex flex-col relative group/insight`}>
            {!embedded && (
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 shrink-0">
                    <div className="flex items-center text-[18px] font-bold text-[var(--muted)] uppercase tracking-widest">
                        {sensor === 'EEG'
                            ? <Brain size={32} className='mr-4 border border-text bg-bg rounded-lg' color='var(--text)' />
                            : sensor === 'EMG'
                                ? <Hand size={32} className='mr-4 border border-text bg-bg rounded-lg' color='var(--text)' />
                                : <Eye size={32} className='mr-4 border border-text bg-bg rounded-lg' color='var(--text)' />}
                        <span className="flex items-center gap-2">
                            {sensor} Data Insight
                            {onMatrixToggle && (
                                <button
                                    onClick={onMatrixToggle}
                                    className="transition-all group flex items-center ml-4 gap-3"
                                    title="Switch to Confusion Matrix"
                                >
                                    <ArrowRightFromLine size={18} className="text-muted group-hover:text-primary transition-all group-hover:translate-x-0.5" />
                                    <Grid3X3 size={24} className="text-muted group-hover:text-primary transition-colors" />
                                </button>
                            )}
                        </span>
                    </div>
                </div>
            )}
            <div className={`flex-1 grid grid-cols-3 min-h-0 overflow-hidden ${embedded ? '' : 'pt-2'}`}>

                {/* Column 1: Identity & Suitability */}
                <div className="flex flex-col justify-between pb-2">
                    <div className="space-y-4">
                        <div className='flex flex-col items-start justify-between mt-0.5'>
                            <div className='flex flex-row justify-between w-full'>
                                <div className="text-[14px] uppercase tracking-[0.2em] text-[var(--muted)] mb-0.5 font-black">
                                    Model Identity</div>
                                <div className="text-[12px] uppercase tracking-[0.2em] text-[var(--muted)] mb-0.5 font-black">
                                    Classifier</div>
                            </div>

                            <div className="flex flex-row justify-between w-full">
                                <div className="text-[24px] font-black text-[var(--primary)] truncate leading-tight" title={result?.model_name || 'Neuro'}>
                                    {result?.model_name || 'Neuro'}
                                </div>
                                <div className="font-mono text-[18px] font-bold text-center flex items-center justify-center truncate leading-tight text-[var(--primary)] bg-[var(--bg)] rounded border border-[var(--border)] px-1 shadow-sm min-w-[120px]">{result?.classifier || (sensor === 'EEG' ? 'LDA' : 'Random Forest')}</div>
                            </div>
                        </div>

                        <div className="space-y-2 py-2">
                            <div className="flex flex-row justify-between w-full">
                                <span className="text-[18px] font-black text-[var(--text)] truncate opacity-90" title={trainedSessionLabel}>{trainedSessionLabel}</span>

                                <span className="font-mono text-[18px] font-bold text-center flex items-center justify-center truncate leading-tight text-[var(--primary)] bg-[var(--bg)] rounded border border-[var(--border)] shadow-sm min-w-[56px]">{trainedSampleCount}</span>
                            </div>
                        </div>
                    </div>

                    {/* Verdict Box */}
                    <div className={`mt-auto border-t ${v.bg} rounded-xl p-3 shadow-inner relative overflow-hidden group`}>
                        <div className="absolute top-2 right-6 opacity-5 blur-[1px] group-hover:opacity-10 transition-opacity">
                            <Target size={80} color='var(--primary)' />
                        </div>
                        <div className="absolute bottom-[-18px] left-[-14px] opacity-5 blur-[1px] group-hover:opacity-15 transition-opacity">
                            <Target size={90} color='var(--primary)' />
                        </div>
                        <div className="text-[12px] text-[var(--muted)] uppercase font-black tracking-widest mb-1">Model Suitability</div>
                        <div className={`text-[24px] font-black tracking-tight ${v.color}`}>{v.text}</div>
                        {v.desc && <div className="text-[12px] text-[var(--text)] opacity-80 mt-1 font-medium leading-tight">{v.desc}</div>}
                    </div>
                </div>

                {/* Column 2: Performance Analyzer */}
                <div className='border-x border-[var(--border)] px-4'>
                    <div className="flex-1 space-y-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        <div className="text-[14px] uppercase text-[var(--primary)] font-black tracking-widest border-b border-[var(--border)] pb-2">Performance Metrics</div>
                        {mRow('Mean CV Score', result.mean_accuracy || result.cv_mean, true, true)}
                        {mRow('Validation Acc', result.validation_accuracy, true, true)}
                        {mRow('Training Acc', result.train_accuracy, true, true)}
                        {mRow('Fold Variance', formatFixedFive(result.fold_std ?? result.cv_std), false, true)}
                        {mRow('Accuracy Gap', (result.train_accuracy && result.validation_accuracy) ? (result.train_accuracy - result.validation_accuracy).toFixed(3) : '--', false, true)}
                        {mRow('Worst Fold', result.fold_min || result.cv_min, true, true)}
                    </div>
                </div>

                {/* Column 3: Data Pipeline & Configuration */}
                <div className="flex flex-col min-h-0">
                    <div className="space-y-0.5 ">
                        <div className="text-[14px] uppercase text-[var(--text)] font-black border-b border-[var(--border)] pb-2">Data Split Ratio</div>
                        <div className="text-[20px] font-black text-[var(--text)] tracking-tighter border-b border-[var(--border)] pb-2 border-dashed">
                            <span className="text-[var(--primary)]">{trainPct}</span>
                            <span className="mx-1 text-[var(--muted)] opacity-30">/</span>
                            <span className="text-[var(--accent)]">{valPct}</span>
                            <span className="mx-1 text-[var(--muted)] opacity-30">/</span>
                            <span className="text-[var(--text)]">{testPct}</span>
                        </div>

                        <div className="text-[14px] uppercase tracking-[0.2em] text-[var(--text)] mb-1 font-black border-b border-[var(--border)] pb-2">Split Distribution</div>
                        {mRow('Train Samples', result.split_summary?.train_samples || '--', false, true)}
                        {mRow('Val Samples', result.split_summary?.val_samples || '--', false, true)}
                        {mRow('Test Samples', result.split_summary?.test_samples ?? '--', false, true)}
                        {mRow('Class Groups', groupCount, false, true)}
                        {mRow('Classes', classLabelSummary, false, false)}
                    </div>
                </div>
            </div>
        </div>
    );
};


const EEGLDAVisualizationCard = ({ result, history = [], selectedItem, onSelectItem, showHistory = false }) => {
    const [view, setView] = useState(showHistory ? 'history' : 'data'); // 'data' or 'guide' or 'history'

    useEffect(() => {
        if (showHistory) {
            setView('history');
        } else if (view === 'history') {
            setView('data');
        }
    }, [showHistory]);

    const centroids = result?.visualization?.class_centroids || [];
    const signatures = result?.visualization?.class_signatures || [];

    return (
        <div className="card h-full flex flex-col px-4 pb-4 pt-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm relative group/lda">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
                <h3 className="text-[18px] flex items-center font-bold text-[var(--muted)] uppercase tracking-widest">
                    {view === 'history'
                        ? <BookOpen size={32} className='mr-2 border border-text bg-bg rounded-[4px]' color='var(--text)' />
                        : <PieChart size={32} className='mr-2 border border-text bg-bg rounded-[4px]' color='var(--text)' />}
                    {view === 'history' ? 'Training History' : 'LDA Signature View'}
                    <button
                        onClick={() => setView(view === 'history' ? 'data' : 'history')}
                        className="transition-all group flex items-center ml-4 gap-3"
                        title={view === 'history' ? "Back to Signature View" : "View Training History"}
                    >
                        < ArrowRightFromLine size={18} className="text-muted group-hover:text-primary transition-all group-hover:translate-x-0.5" />
                        {view === 'history'
                            ? <PieChart size={32} className="text-muted group-hover:text-primary transition-colors" />
                            : <BookOpen size={32} className="text-muted group-hover:text-primary transition-colors" />}
                    </button>
                </h3>

                <div className="flex items-center gap-2">
                    {view !== 'history' && (
                        <button
                            onClick={() => setView(view === 'data' ? 'guide' : 'data')}
                            className="p-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider"
                            title={view === 'data' ? "View Technical Details / Guide" : "Return to Data View"}
                        >
                            {view === 'data' ? <Info size={14} /> : <BookOpen size={14} />}
                            {view === 'data' ? 'Details' : 'Data'}
                        </button>
                    )}
                </div>
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
                        {view === 'history' ? (
                            <div className="h-full grid grid-cols-12 gap-3 p-2 pt-4">
                                <div className="col-span-12 lg:col-span-7 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                    <HistoryList history={history} selectedId={historyId(selectedItem)} onSelect={onSelectItem} />
                                </div>
                                <div className="col-span-12 lg:col-span-5 min-h-0">
                                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-black mb-2">Saved Fold Detail</div>
                                    <HistoryDetailCard item={selectedItem} />
                                </div>
                            </div>
                        ) : view === 'data' ? (
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
        // If the label is T1-T6, just show it
        if (/^T[1-6]$/i.test(val)) return <span>{val.toUpperCase()}</span>;
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

const ConfusionMatrixCard = ({ matrix, labels, n_samples, sensor, embedded = false }) => {
    // ADJUST THIS SCALE TO CHANGE SIZE (e.g. 0.8 to shrink, 1.2 to enlarge)
    const scale = 1.125;
    const cellSize = Math.floor(64 * scale);
    const labelWidth = Math.max(cellSize, 70); // Tighter label column

    // Precisely calculate the total width of the matrix to eliminate right-side space
    const totalTableWidth = (labels?.length || 0) * cellSize + labelWidth;
    const cardWidth = sensor === 'EEG' ? totalTableWidth + 32 : null; // 32 for px-4 padding

    return (
        <div
            className={`${embedded ? '' : 'card bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm'} ${sensor === 'EEG' ? 'h-fit ml-0' : 'h-full flex flex-col'} pb-3`}
            style={sensor === 'EEG' ? { width: cardWidth, minWidth: cardWidth } : {}}
        >
            {!embedded && (
                <div className="flex justify-between items-center border-b border-[var(--border)] pb-2 pt-2 gap-2 overflow-hidden">
                    <h3 className="text-[18px] flex items-center font-bold text-[var(--muted)] uppercase tracking-widest truncate">
                        <Grid3X3 size={28} className='mr-2 border border-text bg-bg rounded-[4px] shrink-0' color='var(--bg)' fill='var(--text)' />
                        <span className="truncate">Confusion Matrix</span>
                    </h3>
                    <div className="flex flex-row gap-2 items-center bg-[var(--bg)] px-[6px]">
                        <span className="items-center text-[14px] normal-case shrink-0 text-[var(--text)]">({n_samples}) Samples </span>

                        <div className="flex flex-row items-center gap-1.5 text-[14px] bg-[var(--bg)] py-[2px] border-l border-[var(--border)] pl-2 shrink-0">
                            <span className="font-bold text-[var(--text)]">Actual</span>
                            <span className="text-[var(--muted)]"><ArrowRight size={12} /></span>
                            <span className="font-bold text-[var(--primary)]">Predicted</span>
                        </div>
                    </div>
                </div>
            )}
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

const InsightWorkspaceCard = ({ view, result, sensor, params, selectedSessionName, onSwitchView }) => {
    const nSamples = result?.n_samples;
    const headerIcon = view === 'matrix'
        ? <Grid3X3 size={32} className='mr-4 border border-text bg-bg rounded-[4px] shrink-0' color='var(--bg)' fill='var(--text)' />
        : sensor === 'EEG'
            ? <Brain size={32} className='mr-4 border border-text bg-bg rounded-lg shrink-0' color='var(--text)' />
            : sensor === 'EMG'
                ? <Hand size={32} className='mr-4 border border-text bg-bg rounded-lg shrink-0' color='var(--text)' />
                : <Eye size={32} className='mr-4 border border-text bg-bg rounded-lg shrink-0' color='var(--text)' />;

    return (
        <div className="card pb-0 h-full flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-2 shrink-0">
                <span className="flex items-center min-w-0">
                    {headerIcon}
                    <h3 className="text-[18px] flex items-center font-bold text-[var(--muted)] uppercase tracking-widest truncate">
                        <span className="truncate">{view === 'matrix' ? 'Confusion Matrix' : `${sensor} Data Insight`}</span>

                    </h3>
                    <button
                        onClick={() => onSwitchView(view === 'matrix' ? 'insight' : 'matrix')}
                        className="transition-all flex items-center ml-2 gap-3"
                        title={view === 'matrix' ? 'Switch to Data Insight' : 'Switch to Confusion Matrix'}
                    >
                        <ArrowRightFromLine size={22} className="text-[var(--text)] group-hover:text-primary transition-all group-hover:translate-x-1.5" />
                        {view === 'matrix'
                            ? <Info size={28} className="text-muted group-hover:text-primary transition-colors" />
                            : <Grid3X3 size={28} className="text-muted group-hover:text-primary transition-colors" />}
                    </button>
                </span>

                <div className="flex flex-row items-center shrink-0">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`insight-body-${view}`}
                            initial={{ opacity: 0, filter: 'blur(8px)' }}
                            animate={{ opacity: 1, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, filter: 'blur(8px)' }}
                            transition={{ duration: 0.3 }}
                            className="h-full pt-2"
                        >
                            {view === 'matrix' && (
                                <div className="flex flex-row gap-2 items-center bg-[var(--bg)] px-[6px]">
                                    <span className="items-center text-[14px] normal-case shrink-0 text-[var(--text)]">({nSamples}) Samples </span>

                                    <div className="flex flex-row items-center gap-1.5 text-[14px] bg-[var(--bg)] py-[2px] border-l border-[var(--border)] pl-2 shrink-0">
                                        <span className="font-bold text-[var(--text)]">Actual</span>
                                        <span className="text-[var(--muted)]"><ArrowRight size={12} /></span>
                                        <span className="font-bold text-[var(--primary)]">Predicted</span>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            <div className="flex-1 min-h-0 relative overflow-hidden">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`insight-body-${view}`}
                        initial={{ opacity: 0, filter: 'blur(8px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, filter: 'blur(8px)' }}
                        transition={{ duration: 0.3 }}
                        className="h-full"
                    >
                        {view === 'matrix' ? (
                            <ConfusionMatrixCard
                                matrix={result?.confusion_matrix}
                                labels={result?.labels || []}
                                n_samples={nSamples}
                                sensor={sensor}
                                embedded={true}
                            />
                        ) : (
                            <DataInsightCard
                                result={result}
                                sensor={sensor}
                                params={params}
                                selectedSessionName={selectedSessionName}
                                embedded={true}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};

const getDepth = (node) => {
    if (!node) return 0;
    if (!node.children || node.children.length === 0) return 1;
    return 1 + Math.max(...node.children.map(getDepth));
};

const DecisionTreeCard = ({ structure, treeIndex, totalTrees, onTreeChange, loading, history = [], selectedItem, onSelectItem, showHistory: showHistoryProp = false }) => {
    const [localShowHistory, setLocalShowHistory] = useState(showHistoryProp);
    const depth = getDepth(structure);

    useEffect(() => {
        setLocalShowHistory(showHistoryProp);
    }, [showHistoryProp]);

    const showHistory = localShowHistory;
    const setShowHistory = setLocalShowHistory;
    return (
        <div className="card h-full flex flex-col p-0 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden relative group">
            <div className="absolute top-4 left-4 z-10 bg-[var(--bg)]/90 backdrop-blur px-3 py-2 rounded border border-[var(--border)] shadow-sm flex flex-col gap-2">
                <div className="flex justify-between items-center gap-4">
                    <h3 className="text-sm flex items-center font-bold text-[var(--text)]">
                        <Network size={28} className='mr-2 border border-text bg-bg rounded-[4px]' color='var(--text)' />
                        {showHistory ? 'Training History' : 'Decision Tree Visualization'}
                    </h3>

                    <div className="flex items-center gap-2">
                        {!showHistory && <span className="text-xs font-mono text-[var(--primary)] mr-2">Tree {treeIndex + 1} / {totalTrees}</span>}
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className="p-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm"
                            title={showHistory ? "Back to Tree View" : "View Training History"}
                        >
                            {showHistory ? <Network size={14} /> : <BookOpen size={14} />}
                            {showHistory ? 'Tree' : 'History'}
                        </button>
                    </div>
                </div>

                {!showHistory && totalTrees > 1 && (
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

            <div className={`w-full h-full bg-[var(--bg)] relative overflow-hidden`} style={{ minHeight: '400px' }}>
                <AnimatePresence mode="wait">
                    {showHistory ? (
                        <motion.div
                            key="history"
                            initial={{ opacity: 0, filter: 'blur(10px)' }}
                            animate={{ opacity: 1, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, filter: 'blur(10px)' }}
                            transition={{ duration: 0.3 }}
                            className="h-full grid grid-cols-12 gap-3 p-4 pt-16"
                        >
                            <div className="col-span-12 lg:col-span-7 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                <HistoryList history={history} selectedId={historyId(selectedItem)} onSelect={onSelectItem} />
                            </div>
                            <div className="col-span-12 lg:col-span-5 min-h-0">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-black mb-2">Model Detail</div>
                                <HistoryDetailCard item={selectedItem} />
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="tree"
                            initial={{ opacity: 0, filter: 'blur(10px)' }}
                            animate={{ opacity: 1, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, filter: 'blur(10px)' }}
                            transition={{ duration: 0.3 }}
                            className={`w-full h-full transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}
                        >
                            {structure ? (
                                <Tree
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
                        </motion.div>
                    )}
                </AnimatePresence>
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
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] font-mono text-muted group-focus-within:text-primary">.joblib</div>
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
    const [activeTab, setActiveTab] = useState('EMG');

    // --- SESSIONS ---
    const [availableSessions, setAvailableSessions] = useState([]);
    const [selectedSession, setSelectedSession] = useState(null);
    const [sessionTotalSamples, setSessionTotalSamples] = useState(0);

    // Fetch total samples for selected session to display in Split UI
    useEffect(() => {
        if (!selectedSession) {
            fetch(buildApiUrl(`/api/dataset-size/${activeTab}`))
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
        fetch(buildApiUrl(`/api/sessions/${activeTab}/${selectedSession}?limit=1`))
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
            const res = await fetch(buildApiUrl(`/api/sessions/${sensor}`));
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
        EMG: { n_estimators_min: 50, n_estimators_max: 200, max_depth_min: 5, max_depth_max: 15, test_ratio: 0.15, val_ratio: 0.17, train_ratio: 0.68, k_folds: 5, search_resolution: 3, min_impurity_decrease_min: 0.001, min_impurity_decrease_max: 0.005 },
        EOG: { n_estimators_min: 50, n_estimators_max: 200, max_depth_min: 5, max_depth_max: 15, test_ratio: 0.15, val_ratio: 0.17, train_ratio: 0.68, k_folds: 5, search_resolution: 3, min_impurity_decrease_min: 0.001, min_impurity_decrease_max: 0.005 },
        EEG: { tol_min: 0.0001, tol_max: 0.01, solver: 'svd', shrinkage: 'auto', test_ratio: 0.15, val_ratio: 0.17, train_ratio: 0.68, k_folds: 5, search_resolution: 3 }
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
            const res = await fetch(buildApiUrl(`/api/models/${activeTab}`));
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
            const res = await fetch(buildApiUrl(`/api/models/${activeTab}/${name}`), { method: 'DELETE' });
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
            const res = await fetch(buildApiUrl(`/api/models/${activeTab}/load`), {
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

    // --- ROCKY TRAINING SOUND ---
    useEffect(() => {
        // Play sound while training job is active and NOT in the finalizing countdown
        if (trainingJob && countdown === null) {
            soundHandler.startRockySliding();
        } else {
            soundHandler.stopRockySliding();
        }
        return () => soundHandler.stopRockySliding();
    }, [trainingJob, countdown]);

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
    const socketRef = useRef(null);
    const finalizedJobRef = useRef(null);

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
            const res = await fetch(buildApiUrl('/api/model/tree'), {
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

    const fetchJobSnapshot = async (jobId) => {
        const res = await fetch(buildApiUrl(`/api/train-jobs/${jobId}`));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch training job');
        return data;
    };

    const clearTrainingJobState = useCallback(() => {
        setTrainingJob(null);
        setCountdown(null);
        setLoading(false);
    }, []);

    useEffect(() => {
        if (socketRef.current) return;

        const { endpoint, options } = getSocketIoConnection();
        const socket = io(endpoint, {
            timeout: 30000,
            ...options,
        });

        socket.on('training_job_update', (job) => {
            setTrainingJob(prev => {
                if (!job?.job_id) return prev;
                if (prev?.job_id && prev.job_id !== job.job_id) return prev;
                return job;
            });
        });

        socketRef.current = socket;
        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!trainingJob?.job_id) return undefined;
        if (trainingJob.status === 'completed' || trainingJob.status === 'failed' || trainingJob.status === 'error') return undefined;

        let cancelled = false;
        const interval = setInterval(async () => {
            try {
                const snapshot = await fetchJobSnapshot(trainingJob.job_id);
                if (!cancelled) {
                    setTrainingJob(prev => (prev?.job_id === snapshot.job_id || !prev?.job_id ? snapshot : prev));
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        }, 300);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [trainingJob?.job_id, trainingJob?.status]);

    useEffect(() => {
        if (!trainingJob?.job_id) {
            finalizedJobRef.current = null;
            return;
        }
        if (finalizedJobRef.current === trainingJob.job_id) return;

        const isCompleted = trainingJob.status === 'completed' || (trainingJob.result && trainingJob.progress >= 1);
        if (isCompleted) {
            finalizedJobRef.current = trainingJob.job_id;
            const resObj = trainingJob.result || trainingJob;
            const history = trainingJob.history || resObj.training_history || [];
            const sensorKey = trainingJob.sensor || activeTab;
            setResults(prev => ({ ...prev, [sensorKey]: { ...resObj, source: getSourceName(true) } }));
            setEvalResults(prev => ({ ...prev, [sensorKey]: null }));
            setSelectedModels(prev => ({ ...prev, [sensorKey]: trainingJob.model_name || resObj.model_name || prev[sensorKey] }));
            setLastHistory(prev => ({ ...prev, [sensorKey]: history }));
            setSelectedHistoryItems(prev => ({ ...prev, [sensorKey]: history[history.length - 1] || null }));
            setTreeIndex(0);
            fetchModels(trainingJob.model_name || resObj.model_name);
            setLoading(false);
            soundHandler.playSuccess();
            setCountdown(5);
            const timer = setInterval(() => {
                setCountdown(c => {
                    const next = (typeof c === 'number' ? c : 5) - 1;
                    if (next <= 0) {
                        clearInterval(timer);
                        clearTrainingJobState();
                        return 0;
                    }
                    return next;
                });
            }, 1000);
            return () => clearInterval(timer);
        }

        if (trainingJob.status === 'failed' || trainingJob.status === 'error') {
            finalizedJobRef.current = trainingJob.job_id;
            setError(trainingJob.error || 'Training failed');
            clearTrainingJobState();
        }
    }, [trainingJob, activeTab, clearTrainingJobState]);

    const handleTrain = async () => {
        soundHandler.playMLTrain();
        if (!trainModelNameInput.trim()) {
            setError("Please name your model");
            return;
        }
        setLoading(true); setError(null);

        try {
            const endpointMap = {
                'EMG': buildApiUrl('/api/train-emg-rf'),
                'EOG': buildApiUrl('/api/train-eog-rf'),
                'EEG': buildApiUrl('/api/train-eeg-lda')
            };

            const modelNameFinal = trainModelNameInput.trim();

            const validKForBackend = parseInt(activeParams.k_folds);
            const enforcedKForBackend = isNaN(validKForBackend) ? 2 : Math.max(2, Math.min(20, validKForBackend));

            // Force the UI state to snap to the valid k_folds so the input field updates correctly
            setParams(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], k_folds: enforcedKForBackend } }));

            const res = await fetch(endpointMap[activeTab], {
                method: 'POST',
                body: JSON.stringify({
                    // Hyperparameters
                    ...activeParams,

                    // Rename for backend compatibility
                    n_folds: enforcedKForBackend,
                    train_split: activeParams.train_ratio,
                    val_split: activeParams.val_ratio,
                    test_split: activeParams.test_ratio,

                    table_name: selectedSession || 'ALL',
                    model_name: modelNameFinal,
                    sensor: activeTab
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Training failed');

            if (data.job_id) {
                finalizedJobRef.current = null;
                setCountdown(null);
                setTrainingJob({
                    job_id: data.job_id,
                    status: data.status || 'queued',
                    sensor: data.sensor || activeTab,
                    model_name: modelNameFinal,
                    progress: 0,
                    history: [],
                });
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
                'EMG': buildApiUrl('/api/model/evaluate'),
                'EOG': buildApiUrl('/api/model/evaluate/eog'),
                'EEG': buildApiUrl('/api/model/evaluate/eeg')
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
                                onParamsChange={(updates) => setParams(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], ...updates } }))}
                                totalSamples={sessionTotalSamples}
                            />
                        </div>

                        <div className="flex-1 flex-grow-4 min-h-0">
                            <HyperparametersCard
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
                                            history={activeHistory}
                                            selectedItem={selectedHistoryItem}
                                            onSelectItem={(item) => setSelectedHistoryItems(prev => ({ ...prev, [activeTab]: item }))}
                                            showHistory={insightView === 'history'}
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
                                        <InsightWorkspaceCard
                                            view={insightView === 'history' ? 'matrix' : insightView}
                                            result={activeResult || activeEvalResult}
                                            sensor={activeTab}
                                            params={activeParams}
                                            selectedSessionName={selectedSessionName}
                                            onSwitchView={setInsightView}
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
                                                    isFit={true}
                                                />
                                                <div className="flex-grow min-h-0 flex flex-col overflow-hidden">
                                                    <EEGLDAVisualizationCard
                                                        result={activeResult || activeEvalResult}
                                                        history={activeHistory}
                                                        selectedItem={selectedHistoryItem}
                                                        onSelectItem={(item) => setSelectedHistoryItems(prev => ({ ...prev, [activeTab]: item }))}
                                                        onSwitchLab={onSwitchLab}
                                                        showHistory={insightView === 'history'}
                                                    />
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
                                                <DataInsightCard
                                                    result={activeResult || activeEvalResult}
                                                    sensor={activeTab}
                                                    params={activeParams}
                                                    selectedSessionName={selectedSessionName}
                                                />
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
