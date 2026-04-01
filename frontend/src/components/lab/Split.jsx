import Tree from 'react-d3-tree';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRightFromLine, Brain, Eye, Grid3X3, Hand, Info, ListOrdered, Network, PieChart, RefreshCw, Rocket, Save, Sliders, Target, Trash2 } from 'lucide-react';
import { soundHandler } from '../../handlers/SoundHandler';
import { useTheme } from '../../contexts/ThemeContext';
import CustomSelect from '../ui/inputs/CustomSelect';
import CustomSlider from '../ui/inputs/CustomSlider';
import RangeSlider from '../ui/inputs/RangeSlider';

const card = 'bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm';
const defaults = {
    EMG: { train_ratio: 0.7, val_ratio: 0.15, test_ratio: 0.15, k_folds: 5, n_estimators_min: 80, n_estimators_max: 240, max_depth_min: 4, max_depth_max: 18, min_impurity_decrease_max: 0.02 },
    EOG: { train_ratio: 0.7, val_ratio: 0.15, test_ratio: 0.15, k_folds: 5, n_estimators_min: 40, n_estimators_max: 180, max_depth_min: 3, max_depth_max: 14, min_impurity_decrease_max: 0.02 },
    EEG: { train_ratio: 0.7, val_ratio: 0.15, test_ratio: 0.15, k_folds: 5, solver: 'eigen', shrinkage: 'auto' },
};

const renderNode = ({ nodeDatum, toggleNode }) => (
    <g>
        <circle r="15" fill="var(--primary)" stroke="var(--border)" onClick={toggleNode} />
        <text fill="var(--text)" x="20" dy="5" strokeWidth="0">{nodeDatum.name}</text>
        {nodeDatum.attributes && <text fill="var(--muted)" x="20" dy="24" strokeWidth="0" fontSize="10">{Object.entries(nodeDatum.attributes).map(([k, v]) => `${k}: ${v}`).join(', ')}</text>}
    </g>
);

const pct = (value) => value === undefined || value === null ? '--' : `${(value * 100).toFixed(1)}%`;
const tile = (label, value, percent = false) => (
    <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/25 px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">{label}</div>
        <div className="text-lg font-black text-[var(--primary)]">{percent ? pct(value) : (value ?? '--')}</div>
    </div>
);

function rebalanceSplits(params, name, value) {
    const next = { ...params, [name]: Math.min(0.8, Math.max(0.05, Number(value))) };
    const others = ['train_ratio', 'val_ratio', 'test_ratio'].filter((field) => field !== name);
    const remaining = 1 - next[name];
    const total = others.reduce((sum, field) => sum + params[field], 0) || 1;
    others.forEach((field) => { next[field] = (params[field] / total) * remaining; });
    next.train_ratio = Math.max(0.05, 1 - next.val_ratio - next.test_ratio);
    const normalized = next.train_ratio + next.val_ratio + next.test_ratio;
    next.train_ratio /= normalized;
    next.val_ratio /= normalized;
    next.test_ratio /= normalized;
    return next;
}

function MatrixCard({ result, sensor }) {
    if (!result?.confusion_matrix) return <div className={`p-4 ${card} h-full text-[var(--muted)]`}>No confusion matrix available.</div>;
    const labels = result.labels || [];
    return (
        <div className={`p-4 ${card} h-full overflow-auto`}>
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--muted)] uppercase tracking-widest border-b border-[var(--border)] pb-2"><Grid3X3 className="w-5 h-5 text-[var(--text)]" /> Confusion Matrix</div>
            <table className="w-full mt-4 text-center border-collapse">
                <thead><tr><th className="p-2 text-left text-[var(--muted)]">Actual</th>{labels.map((label, i) => <th key={i} className="p-2 text-[var(--primary)]">{label}</th>)}</tr></thead>
                <tbody>{result.confusion_matrix.map((row, i) => <tr key={i}><td className="p-2 text-left font-bold text-[var(--text)]">{labels[i] || `${sensor}-${i}`}</td>{row.map((cell, j) => <td key={j} className={`p-2 border border-[var(--border)] ${i === j ? 'bg-[var(--primary)]/20 text-[var(--primary)] font-black' : 'bg-[var(--bg)]/25'}`}>{cell}</td>)}</tr>)}</tbody>
            </table>
        </div>
    );
}

const getVerdict = (trainAcc, valAcc, testAcc) => {
    if (!trainAcc || !valAcc) return { text: '--', color: 'text-[var(--muted)]', bg: 'bg-[var(--bg)]/10', desc: 'No data' };
    const gap = trainAcc - valAcc;
    
    if (trainAcc < 0.65) return { text: 'HIGH BIAS ( UNDERFIT )', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', desc: 'Model lacks capacity or features' };
    if (trainAcc > 0.98 && valAcc < 0.85) return { text: 'SEVERE OVERFIT', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', desc: 'Memorized training data' };
    if (gap > 0.12) return { text: 'HIGH VARIANCE ( OVERFIT )', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', desc: 'Poor generalization / wide gap' };
    if (valAcc > 0.80) return { text: 'OPTIMAL FIT', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', desc: 'Model generalized well' };
    
    return { text: 'MODERATE FIT', color: 'text-[var(--primary)]', bg: 'bg-[var(--primary)]/10 border-[var(--primary)]/30', desc: 'Acceptable performance' };
};

function InsightCard({ result, sensor }) {
    if (!result) return <div className={`p-4 ${card} h-full text-[var(--muted)] flex items-center justify-center italic`}>No insight data available yet.</div>;

    const v = getVerdict(result.train_accuracy, result.validation_accuracy, result.test_accuracy || result.accuracy);
    const mRow = (label, val, perc=false, mono=false) => (
        <div className="flex justify-between items-center py-1.5 border-b border-[var(--border)]/50 last:border-0">
            <span className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider">{label}</span>
            <span className={`text-[13px] font-black ${mono ? 'font-mono' : ''} text-[var(--text)]`}>{val === '--' ? val : (perc ? pct(val) : val)}</span>
        </div>
    );

    return (
        <div className={`p-4 ${card} h-full overflow-auto flex flex-col [&::-webkit-scrollbar]:hidden`} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <div className="flex items-center gap-2 text-[15px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-[var(--border)] pb-2 mb-3 shrink-0"><Info className="w-5 h-5 text-[var(--text)]" /> {sensor} Data Insights</div>
            
            <div className="flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden space-y-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center shadow-sm overflow-hidden flex flex-col">
                        <div className="text-[10px] uppercase text-[var(--muted)] font-black py-1.5 bg-[var(--bg)]/50 border-b border-[var(--border)]">Train Acc</div>
                        <div className="text-2xl font-black text-[var(--text)] flex-1 flex items-center justify-center p-2">{pct(result.train_accuracy)}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center shadow-sm overflow-hidden flex flex-col transform hover:scale-105 transition-transform border-[var(--accent)]/50">
                        <div className="text-[10px] uppercase text-[var(--text)] font-black py-1.5 bg-[var(--accent)] text-[var(--bg)]">Val Acc</div>
                        <div className="text-3xl font-black text-[var(--accent)] flex-1 flex items-center justify-center p-2">{pct(result.validation_accuracy)}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center shadow-sm overflow-hidden flex flex-col">
                        <div className="text-[10px] uppercase text-[var(--muted)] font-black py-1.5 bg-[var(--bg)]/50 border-b border-[var(--border)]">Test Acc</div>
                        <div className="text-2xl font-black text-[var(--text)]/80 flex-1 flex items-center justify-center p-2">{pct(result.test_accuracy ?? result.accuracy)}</div>
                    </div>
                </div>

                <div className={`border ${v.bg} rounded-xl p-3 shadow-inner`}>
                    <div className="flex justify-between items-center mb-1">
                        <div className="text-[10px] text-[var(--muted)] uppercase font-black tracking-widest">Model Verdict</div>
                        <div className="text-[10px] uppercase tracking-widest text-[var(--primary)] font-bold">{sensor} Pipeline</div>
                    </div>
                    <div className={`text-xl font-black tracking-tight ${v.color}`}>{v.text}</div>
                    {v.desc && <div className="text-xs text-[var(--text)] opacity-80 mt-1 font-medium">{v.desc}</div>}
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
                        {mRow('Train Samples', result.split_summary?.train_val_samples ? Math.round(result.split_summary.train_val_samples * 0.8) : '--', false, true)}
                        {mRow('Val Samples', result.split_summary?.train_val_samples ? Math.round(result.split_summary.train_val_samples * 0.2) : '--', false, true)}
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
}

function FeatureCard({ result }) {
    const features = Object.entries(result?.feature_importances || {}).sort(([, a], [, b]) => b - a).slice(0, 8);
    return (
        <div className={`p-4 ${card} h-full`}>
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--muted)] uppercase tracking-widest border-b border-[var(--border)] pb-2"><ListOrdered className="w-5 h-5 text-[var(--text)]" /> Feature Importance</div>
            <div className="mt-4 space-y-3 max-h-72 overflow-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {features.length === 0 ? <div className="text-sm text-[var(--muted)]">No feature importance data yet.</div> : features.map(([name, value]) => <div key={name}><div className="flex justify-between text-sm"><span className="text-[var(--text)] font-bold">{name}</span><span className="text-[var(--primary)] font-mono">{(value * 100).toFixed(1)}%</span></div><div className="w-full h-2 rounded-full bg-[var(--bg)] border border-[var(--border)] mt-1 overflow-hidden"><div className="h-full bg-[var(--primary)]" style={{ width: `${Math.max(4, value * 100)}%` }} /></div></div>)}
            </div>
        </div>
    );
}

function ControlPanelCard({ params, setParamsTab, job, activeTab }) {
    const [view, setView] = useState('params'); // 'params' or 'progress'

    const minVal = Math.round((params.train_ratio || 0.7) * 100);
    const maxVal = Math.round(((params.train_ratio || 0.7) + (params.val_ratio || 0.15)) * 100);

    const getDashes = (pct) => Array.from({length: Math.max(1, Math.round(pct/10))}).map(()=>'-').join('');

    return (
        <div className={`p-4 ${card} h-full flex flex-col relative`}>
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2 mb-4 shrink-0">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--muted)] uppercase tracking-widest">
                    {view === 'params' ? <Sliders className="w-5 h-5 text-[var(--text)]" /> : <Rocket className="w-5 h-5 text-[var(--text)]" />}
                    {view === 'params' ? 'Hyperparameters' : 'Tuning Progress'}
                </div>
                <button
                    onClick={() => setView(view === 'params' ? 'progress' : 'params')}
                    className="p-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider"
                >
                    {view === 'params' ? <Rocket size={14} /> : <Sliders size={14} />}
                    {view === 'params' ? 'Progress' : 'Params'}
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {view === 'params' ? (
                    <div className="space-y-4">
                        <div className="mb-2">
                            <div className="flex justify-between items-end mb-2">
                                <div className="flex items-center gap-1 text-[var(--primary)] text-sm font-bold uppercase">
                                    <span className="font-mono tracking-widest leading-none mt-1">{getDashes(minVal)}&gt;</span>
                                    <span className="ml-1 text-lg font-black leading-none">{minVal}%</span>
                                    <span className="text-[10px] uppercase ml-1 opacity-70 leading-none">Train</span>
                                </div>
                                <div className="flex items-center gap-1 text-[var(--accent)] text-sm font-bold uppercase">
                                    <span className="font-mono tracking-widest leading-none mt-1">{getDashes(maxVal - minVal)}&gt;</span>
                                    <span className="ml-1 text-lg font-black leading-none">{Math.round((params.val_ratio || 0.15) * 100)}%</span>
                                    <span className="text-[10px] uppercase ml-1 opacity-70 leading-none">Val</span>
                                </div>
                                <div className="flex items-center gap-1 text-[var(--text)] text-sm font-bold uppercase opacity-80 border-b border-transparent">
                                    <span className="font-mono tracking-widest leading-none mt-1">{getDashes(100 - maxVal)}</span>
                                    <span className="ml-1 text-lg font-black leading-none">{Math.round((params.test_ratio || 0.15) * 100)}%</span>
                                    <span className="text-[10px] uppercase ml-1 opacity-70 leading-none">Test</span>
                                </div>
                            </div>
                            <div className="px-2 pb-2">
                                <RangeSlider
                                    min={5} max={100} step={5}
                                    minValue={minVal} maxValue={maxVal}
                                    leftColor="var(--primary)"
                                    middleColor="var(--accent)"
                                    rightColor="var(--text)"
                                    hideLabels={true}
                                    onChange={(vals) => {
                                        setParamsTab({
                                            train_ratio: vals.left / 100,
                                            val_ratio: vals.middle / 100,
                                            test_ratio: vals.right / 100
                                        });
                                    }}
                                />
                            </div>
                        </div>

                        <div><div className="flex justify-between text-sm mb-1"><span className="font-bold text-[var(--text)] uppercase tracking-tight">K Folds</span><span className="font-black text-[var(--primary)]">{params.k_folds}</span></div><CustomSlider min={3} max={10} step={1} value={params.k_folds} onChange={(value) => setParamsTab({ k_folds: value })} /></div>
                        
                        {activeTab !== 'EEG' ? (
                            <>
                                <div><div className="flex justify-between text-sm mb-1"><span className="font-bold text-[var(--text)] uppercase tracking-tight">Estimators (Max)</span><span className="font-black text-[var(--primary)]">{params.n_estimators_max}</span></div><CustomSlider min={20} max={500} step={20} value={params.n_estimators_max} onChange={(value) => setParamsTab({ n_estimators_max: value })} /></div>
                                <div><div className="flex justify-between text-sm mb-1"><span className="font-bold text-[var(--text)] uppercase tracking-tight">Estimators (Min)</span><span className="font-black text-[var(--primary)]">{params.n_estimators_min}</span></div><CustomSlider min={10} max={200} step={10} value={params.n_estimators_min} onChange={(value) => setParamsTab({ n_estimators_min: value })} /></div>
                                <div><div className="flex justify-between text-sm mb-1"><span className="font-bold text-[var(--text)] uppercase tracking-tight">Depth (Max)</span><span className="font-black text-[var(--primary)]">{params.max_depth_max}</span></div><CustomSlider min={2} max={30} step={1} value={params.max_depth_max} onChange={(value) => setParamsTab({ max_depth_max: value })} /></div>
                                <div><div className="flex justify-between text-sm mb-1"><span className="font-bold text-[var(--text)] uppercase tracking-tight">Min Impurity Dec.</span><span className="font-black text-[var(--primary)]">{params.min_impurity_decrease_max}</span></div><CustomSlider min={0} max={0.1} step={0.005} value={params.min_impurity_decrease_max} onChange={(value) => setParamsTab({ min_impurity_decrease_max: value })} /></div>
                            </>
                        ) : (
                            <>
                                <div><div className="text-sm font-bold text-[var(--text)] uppercase tracking-tight mb-2 mt-4">Solver</div><CustomSelect value={params.solver} onChange={(value) => setParamsTab({ solver: value })} options={[{ value: 'svd', label: 'SVD' }, { value: 'lsqr', label: 'LSQR' }, { value: 'eigen', label: 'Eigen' }]} /></div>
                                <div className="mt-4"><div className="text-sm font-bold text-[var(--text)] uppercase tracking-tight mb-2">Shrinkage</div><CustomSelect value={params.shrinkage} onChange={(value) => setParamsTab({ shrinkage: value })} options={[{ value: 'auto', label: 'Auto' }, { value: 'none', label: 'None' }]} /></div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="h-full flex flex-col justify-center">
                        {!job ? <div className="text-sm text-[var(--muted)] flex items-center justify-center h-full italic opacity-50 text-center">Start a training job to see pipeline progression.</div> : <>
                            <div className="space-y-4 text-sm mt-2">
                                <div className="flex justify-between items-center"><span className="text-[var(--muted)] uppercase font-bold tracking-wider">Status</span><span className="font-black text-[var(--primary)] uppercase border border-[var(--primary)] bg-[var(--primary)]/10 px-2 py-0.5 rounded">{job.status}</span></div>
                                <div className="flex justify-between"><span className="text-[var(--muted)] font-medium">Candidate Build</span><span className="font-bold text-[var(--text)] font-mono">{job.candidate_index || 0} / {job.total_candidates || 0}</span></div>
                                <div className="flex justify-between"><span className="text-[var(--muted)] font-medium">Cross-Val Fold</span><span className="font-bold text-[var(--text)] font-mono">{job.fold_index || 0} / {job.total_folds || 0}</span></div>
                                <div className="flex justify-between"><span className="text-[var(--muted)] font-medium">Est. Time Rem.</span><span className="font-black text-[var(--accent)] text-lg">{(job.eta_seconds === undefined || job.eta_seconds === null ? '--' : `${Math.round(job.eta_seconds)}s`)}</span></div>
                            </div>
                            <div className="mt-10 pb-4">
                                <div className="flex justify-between text-xs mb-1 font-bold text-[var(--muted)]"><span>Overall Progress</span><span>{Math.round((job?.progress || 0) * 100)}%</span></div>
                                <div className="w-full h-4 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden shadow-inner"><div className="h-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary)] transition-all duration-300" style={{ width: `${Math.round((job?.progress || 0) * 100)}%` }} /></div>
                            </div>
                        </>}
                    </div>
                )}
            </div>
        </div>
    );
}

function ModelList({ models, selected, onSelect, onDelete }) {
    return <div className={`p-4 ${card}`}><div className="flex items-center gap-2 text-sm font-bold text-[var(--muted)] uppercase tracking-widest border-b border-[var(--border)] pb-2"><Save className="w-5 h-5 text-[var(--text)]" /> Saved Models</div><div className="mt-3 space-y-2 max-h-56 overflow-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>{models.length === 0 ? <div className="text-sm text-[var(--muted)]">No saved models yet.</div> : models.map((model) => <div key={model.name} className={`flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer ${selected === model.name ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] bg-[var(--bg)]/20'}`} onClick={() => onSelect(model.name)}><div className="min-w-0"><div className="truncate font-bold text-[var(--text)]">{model.name}</div><div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">{model.accuracy !== undefined && model.accuracy !== null ? `Test ${(model.accuracy * 100).toFixed(1)}%` : 'No metrics'}</div></div><button className="p-1 text-[var(--muted)] hover:text-red-400" onClick={(event) => { event.stopPropagation(); onDelete(model.name); }}><Trash2 className="w-4 h-4" /></button></div>)}</div></div>;
}

export default function MLTrainingView({ onSwitchLab }) {
    const { currentThemeId } = useTheme();
    const API = import.meta.env.VITE_API_URL || '';
    const [activeTab, setActiveTab] = useState('EMG');
    const [availableSessions, setAvailableSessions] = useState([]);
    const [selectedSession, setSelectedSession] = useState(null);
    const [models, setModels] = useState([]);
    const [selectedModels, setSelectedModels] = useState({ EMG: null, EOG: null, EEG: null });
    const [trainModelNameInput, setTrainModelNameInput] = useState('');
    const [results, setResults] = useState({ EMG: null, EOG: null, EEG: null });
    const [evalResults, setEvalResults] = useState({ EMG: null, EOG: null, EEG: null });
    const [params, setParams] = useState(defaults);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [trainingJob, setTrainingJob] = useState(null);
    const [viewMode, setViewMode] = useState({ EMG: 'matrix', EOG: 'matrix' });
    const [treeIndex, setTreeIndex] = useState(0);

    const selectedModelName = selectedModels[activeTab];
    const activeParams = params[activeTab];
    const activeResult = results[activeTab] || evalResults[activeTab];
    const totalTrees = activeResult?.selected_hyperparameters?.n_estimators || activeParams.n_estimators_max || 1;

    const fetchSessions = async () => {
        try {
            const res = await fetch(`${API}/api/sessions/${activeTab}`);
            if (!res.ok) return;
            const data = await res.json();
            const tables = Array.isArray(data.tables) ? data.tables : [];
            setAvailableSessions(tables.map((table) => ({ table, name: table.replace(`${activeTab.toLowerCase()}_session_`, '') })).reverse());
        } catch (e) { console.error(e); }
    };

    const fetchModels = async (forced = null) => {
        try {
            const res = await fetch(`${API}/api/models/${activeTab}`);
            if (!res.ok) return;
            const data = await res.json();
            setModels(data);
            if (!selectedModels[activeTab] && data.length > 0) setSelectedModels((prev) => ({ ...prev, [activeTab]: forced || (data.find((item) => item.active)?.name || data[0].name) }));
        } catch (e) { console.error(e); }
    };

    const evaluate = async (forceModel = null) => {
        try {
            const endpoint = { EMG: '/api/model/evaluate', EOG: '/api/model/evaluate/eog', EEG: '/api/model/evaluate/eeg' }[activeTab];
            const res = await fetch(`${API}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model_name: forceModel || selectedModels[activeTab] || undefined, table_name: selectedSession || undefined, sensor: activeTab }) });
            if (!res.ok) return;
            const data = await res.json();
            setEvalResults((prev) => ({ ...prev, [activeTab]: data }));
        } catch (e) { console.error(e); }
    };

    const loadModel = async (name) => {
        try {
            setSelectedModels((prev) => ({ ...prev, [activeTab]: name }));
            const res = await fetch(`${API}/api/models/${activeTab}/load`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model_name: name }) });
            if (!res.ok) throw new Error('Failed to load model');
            soundHandler.playMLSwitch();
            setResults((prev) => ({ ...prev, [activeTab]: null }));
            evaluate(name);
        } catch (e) { setError(e.message); }
    };

    const deleteModel = async (name) => {
        try {
            const res = await fetch(`${API}/api/models/${activeTab}/${name}`, { method: 'DELETE' });
            if (res.ok) fetchModels();
        } catch (e) { console.error(e); }
    };

    const pollJob = async (jobId, sensor, modelName) => {
        const interval = window.setInterval(async () => {
            try {
                const res = await fetch(`${API}/api/train-jobs/${jobId}`);
                if (!res.ok) return;
                const data = await res.json();
                setTrainingJob(data);
                if (data.status === 'completed') {
                    window.clearInterval(interval);
                    setLoading(false);
                    setTrainingJob(null);
                    setSelectedModels((prev) => ({ ...prev, [sensor]: modelName }));
                    setResults((prev) => ({ ...prev, [sensor]: data.result }));
                    setEvalResults((prev) => ({ ...prev, [sensor]: null }));
                    fetchModels(modelName);
                } else if (data.status === 'error') {
                    window.clearInterval(interval);
                    setLoading(false);
                    setError(data.error || 'Training failed');
                }
            } catch (e) {
                window.clearInterval(interval);
                setLoading(false);
                setError(e.message);
            }
        }, 1000);
    };

    const train = async () => {
        if (!trainModelNameInput.trim()) return setError('Please enter a model name.');
        setLoading(true);
        setError(null);
        try {
            const endpoint = { EMG: '/api/train-emg-rf', EOG: '/api/train-eog-rf', EEG: '/api/train-eeg-lda' }[activeTab];
            const res = await fetch(`${API}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...activeParams, model_name: trainModelNameInput.trim(), table_name: selectedSession || 'ALL', sensor: activeTab }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to start training');
            setTrainingJob({ ...data, progress: 0 });
            pollJob(data.job_id, activeTab, trainModelNameInput.trim());
        } catch (e) { setLoading(false); setError(e.message); }
    };

    const fetchTree = async (index) => {
        if (activeTab === 'EEG' || !selectedModelName) return;
        setTreeIndex(index);
        try {
            const res = await fetch(`${API}/api/model/tree`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sensor: activeTab, model_name: selectedModelName, tree_index: index }) });
            if (!res.ok) return;
            const data = await res.json();
            setResults((prev) => ({ ...prev, [activeTab]: { ...(prev[activeTab] || evalResults[activeTab] || {}), tree_structure: data.tree_structure } }));
        } catch (e) { console.error(e); }
    };

    const setParamsTab = (newParams) => {
        setParams(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab],
                ...newParams
            }
        }));
    };

    useEffect(() => { fetchSessions(); fetchModels(); evaluate(); }, [activeTab]);
    useEffect(() => { evaluate(); }, [selectedSession]);

    const mainView = useMemo(() => {
        if (!activeResult) return <div className={`${card} border-2 border-dashed h-full flex flex-col items-center justify-center text-[var(--muted)]`}><PieChart className="w-16 h-16 opacity-30 mb-4" /><div className="text-lg font-bold">Model workspace empty</div><div className="text-sm opacity-70">Train or load a model to inspect metrics.</div></div>;
        if (activeTab === 'EEG') return <div className="grid grid-cols-12 grid-rows-6 gap-4 h-full"><div className="col-span-12 row-span-3 flex gap-4 min-h-0"><div className="w-[24rem] shrink-0"><MatrixCard result={activeResult} sensor="EEG" /></div><div className="flex-1 min-h-0"><InsightCard result={activeResult} sensor="EEG" /></div></div><div className="col-span-12 lg:col-span-4 row-span-3 min-h-0"><ControlPanelCard params={activeParams} setParamsTab={setParamsTab} activeTab="EEG" job={trainingJob} /></div><div className="col-span-12 lg:col-span-8 row-span-3 min-h-0"><FeatureCard result={activeResult} /></div></div>;
        
        return <div className="grid grid-cols-12 grid-rows-6 gap-4 h-full">
            <div className="col-span-12 row-span-4 min-h-0">
                <div className={`${card} h-full overflow-hidden relative`}>
                    <div className="absolute top-4 left-4 z-10 bg-[var(--bg)]/90 px-3 py-2 rounded-lg border border-[var(--border)] shadow-sm">
                        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><Network className="w-5 h-5 text-[var(--primary)]" />Decision Tree Analyzer</div>
                        <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)] font-mono">Tree {treeIndex + 1} / {Math.max(1, totalTrees)}</div>
                        {totalTrees > 1 && <input className="mt-2 w-full accent-[var(--primary)] h-1" type="range" min="0" max={Math.max(0, totalTrees - 1)} value={treeIndex} onChange={(e) => fetchTree(Number(e.target.value))} />}
                    </div>
                    <div className="w-full h-full bg-[var(--surface-lighter)] min-h-[24rem]">
                        {activeResult.tree_structure ? <Tree data={activeResult.tree_structure} orientation="vertical" translate={{ x: 420, y: 70 }} pathFunc="step" depthFactor={100} separation={{ siblings: 1.5, nonSiblings: 2 }} zoomable renderCustomNodeElement={renderNode} /> : <div className="h-full flex items-center justify-center text-[var(--muted)] italic opacity-50">No tree structure available.</div>}
                    </div>
                </div>
            </div>
            <div className="col-span-12 lg:col-span-5 row-span-2 min-h-0">
                <ControlPanelCard params={activeParams} setParamsTab={setParamsTab} job={trainingJob} activeTab={activeTab} />
            </div>
            <div className="col-span-12 lg:col-span-7 row-span-2 min-h-0">
                <InsightCard result={activeResult} sensor={activeTab} />
            </div>
        </div>;
    }, [activeResult, activeTab, activeParams, evalResults, selectedModelName, totalTrees, treeIndex, viewMode, trainingJob]);

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden p-4" key={currentThemeId}>
            {error && <div className="w-full bg-red-900/20 border border-red-500 text-red-200 py-2 rounded mb-4 flex justify-between items-center shrink-0 text-sm px-4"><span><strong>Error:</strong> {error}</span><button onClick={() => setError(null)} className="underline">Dismiss</button></div>}
            <div className="flex-1 overflow-hidden">
                <div className="h-full grid grid-cols-12 grid-rows-6 gap-4 overflow-visible">
                    <div className="col-span-12 lg:col-span-3 row-span-6 flex flex-col gap-4 min-h-0">
                        <div className={`p-4 ${card}`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xl font-black text-[var(--text)]"><Brain className="w-6 h-6 text-[var(--primary)]" />ML Training<button title="Switch to data collection" onClick={onSwitchLab} className="ml-2 text-[var(--muted)] hover:text-[var(--primary)]"><ArrowRightFromLine className="w-5 h-5 inline" /></button></div><div className="flex rounded-lg border border-[var(--border)] p-1 bg-[var(--bg)]/25">{[['EMG', <Hand key="emg" className="w-4 h-4" />], ['EOG', <Eye key="eog" className="w-4 h-4" />], ['EEG', <Brain key="eeg" className="w-4 h-4" />]].map(([sensor, icon]) => <button key={sensor} className={`px-3 py-2 rounded-md text-sm font-bold ${activeTab === sensor ? 'bg-[var(--primary)] text-[var(--bg)]' : 'text-[var(--text)]'}`} onClick={() => { setActiveTab(sensor); setSelectedSession(null); }}>{icon}<span className="ml-1">{sensor}</span></button>)}</div></div><div className="mt-4 space-y-3"><div className="relative"><input type="text" value={trainModelNameInput} onChange={(e) => setTrainModelNameInput(e.target.value)} placeholder={`Name for new ${activeTab} model`} className="w-full bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] rounded-lg px-4 py-3 outline-none focus:border-[var(--primary)]" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[var(--muted)]">.joblib</span></div><div className="flex gap-2"><div className="flex-1"><CustomSelect value={selectedSession || ''} onChange={(value) => setSelectedSession(value)} options={[{ value: '', label: 'All Available Data' }, ...availableSessions.map((session) => ({ value: session.table, label: session.name }))]} /></div><button className="p-3 rounded-lg border border-[var(--border)]" onClick={fetchSessions}><RefreshCw className="w-5 h-5 text-[var(--text)]" /></button></div><button className="w-full rounded-xl bg-[var(--primary)] text-[var(--bg)] py-3 font-black text-lg disabled:opacity-50" onClick={train} disabled={loading}>{loading ? 'Training...' : 'Train Model'}</button></div></div>
                        <div className={`p-4 ${card}`}><div className="flex items-center gap-2 text-sm font-bold text-[var(--muted)] uppercase tracking-widest border-b border-[var(--border)] pb-2"><Target className="w-5 h-5 text-[var(--text)]" /> Accuracy Breakdown</div><div className="grid grid-cols-2 gap-3 mt-4">{[['Train', activeResult?.train_accuracy], ['Validation', activeResult?.validation_accuracy], ['Test', activeResult?.test_accuracy ?? activeResult?.accuracy], ['Avg Fold', activeResult?.average_accuracy]].map(([label, value]) => tile(label, value, true))}</div></div>
                        <ModelList models={models} selected={selectedModelName} onSelect={loadModel} onDelete={deleteModel} />
                        <div className="flex-1 min-h-0"><FeatureCard result={activeResult} /></div>

                    </div>
                    <div className="col-span-12 lg:col-span-9 row-span-6 min-h-0">{mainView}</div>
                </div>
            </div>
        </div>
    );
}
