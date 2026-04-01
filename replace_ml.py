import re
import os

filepath = r'e:\WebSite\NeuroTECH-BCI\frontend\src\components\lab\MLTrainingView.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add RangeSlider import
if 'import RangeSlider' not in content:
    content = content.replace("import CustomSlider from '../ui/inputs/CustomSlider';", 
                              "import CustomSlider from '../ui/inputs/CustomSlider';\nimport RangeSlider from '../ui/inputs/RangeSlider';")

# 2. Add pct, card, getVerdict helpers, ControlPanelCard, InsightCard just before export default
helpers = """
const pct = (val) => val === undefined || val === null || isNaN(val) ? '--' : `${(val * 100).toFixed(1)}%`;
const card = "bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm";

const getVerdict = (trainAcc, valAcc, testAcc) => {
    if (!trainAcc || !valAcc) return { text: '--', color: 'text-[var(--muted)]', bg: 'bg-[var(--bg)]/10', desc: 'No data' };
    const gap = trainAcc - valAcc;
    if (trainAcc < 0.65) return { text: 'HIGH BIAS ( UNDERFIT )', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', desc: 'Model lacks capacity' };
    if (trainAcc > 0.98 && valAcc < 0.85) return { text: 'SEVERE OVERFIT', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', desc: 'Memorized training data' };
    if (gap > 0.12) return { text: 'HIGH VARIANCE ( OVERFIT )', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', desc: 'Poor generalization' };
    if (valAcc > 0.80) return { text: 'OPTIMAL FIT', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', desc: 'Model generalized well' };
    return { text: 'MODERATE FIT', color: 'text-[var(--primary)]', bg: 'bg-[var(--primary)]/10 border-[var(--primary)]/30', desc: 'Acceptable performance' };
};

const ControlPanelCard = ({ params, setParams, job, activeTab }) => {
    const [view, setView] = useState('params');
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
                                    <span className="ml-1 text-lg font-black leading-none">{minVal}%</span>
                                    <span className="text-[10px] uppercase ml-1 opacity-70 leading-none">Train</span>
                                </div>
                                <div className="flex items-center gap-1 text-[var(--accent)] text-sm font-bold uppercase">
                                    <span className="ml-1 text-lg font-black leading-none">{Math.round((params.val_ratio || 0.15) * 100)}%</span>
                                    <span className="text-[10px] uppercase ml-1 opacity-70 leading-none">Val</span>
                                </div>
                                <div className="flex items-center gap-1 text-[var(--text)] text-sm font-bold uppercase opacity-80 border-b border-transparent">
                                    <span className="ml-1 text-lg font-black leading-none">{Math.round((params.test_ratio || 0.15) * 100)}%</span>
                                    <span className="text-[10px] uppercase ml-1 opacity-70 leading-none">Test</span>
                                </div>
                            </div>
                            <div className="px-2 pb-2">
                                <RangeSlider
                                    min={5} max={100} step={5}
                                    minValue={minVal} maxValue={maxVal}
                                    leftColor="var(--primary)" middleColor="var(--accent)" rightColor="var(--text)"
                                    hideLabels={true}
                                    onChange={(vals) => setParams({ train_ratio: vals.left / 100, val_ratio: vals.middle / 100, test_ratio: vals.right / 100 })}
                                />
                            </div>
                        </div>
                        <div><div className="flex justify-between text-xs mb-1"><span className="font-bold text-[var(--text)] uppercase tracking-tight">K Folds</span><span className="font-black text-[var(--primary)]">{params.k_folds}</span></div><CustomSlider min={3} max={10} step={1} value={params.k_folds} onChange={(value) => setParams({ k_folds: value })} /></div>
                        <div><div className="flex justify-between text-xs mb-1"><span className="font-bold text-[var(--text)] uppercase tracking-tight">Search Res</span><span className="font-black text-[var(--primary)]">{params.search_resolution}</span></div><CustomSlider min={2} max={10} step={1} value={params.search_resolution} onChange={(value) => setParams({ search_resolution: value })} /></div>
                        
                        {activeTab !== 'EEG' ? (
                            <>
                                <div><div className="flex justify-between text-xs mb-1"><span className="font-bold text-[var(--text)] uppercase tracking-tight">Estimators (Max)</span><span className="font-black text-[var(--primary)]">{params.n_estimators_max}</span></div><CustomSlider min={20} max={500} step={20} value={params.n_estimators_max} onChange={(value) => setParams({ n_estimators_max: value })} /></div>
                                <div><div className="flex justify-between text-xs mb-1"><span className="font-bold text-[var(--text)] uppercase tracking-tight">Estimators (Min)</span><span className="font-black text-[var(--primary)]">{params.n_estimators_min}</span></div><CustomSlider min={10} max={200} step={10} value={params.n_estimators_min} onChange={(value) => setParams({ n_estimators_min: value })} /></div>
                                <div><div className="flex justify-between text-xs mb-1"><span className="font-bold text-[var(--text)] uppercase tracking-tight">Depth (Max)</span><span className="font-black text-[var(--primary)]">{params.max_depth_max}</span></div><CustomSlider min={2} max={30} step={1} value={params.max_depth_max} onChange={(value) => setParams({ max_depth_max: value })} /></div>
                                <div><div className="flex justify-between text-xs mb-1"><span className="font-bold text-[var(--text)] uppercase tracking-tight">Min Impurity Max</span><span className="font-black text-[var(--primary)]">{params.min_impurity_decrease_max}</span></div><CustomSlider min={0} max={0.1} step={0.005} value={params.min_impurity_decrease_max} onChange={(value) => setParams({ min_impurity_decrease_max: value })} /></div>
                            </>
                        ) : null}
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
};

const InsightCard = ({ result, sensor, activeTab, params, onToggle }) => {
    if (!result) return <div className={`p-4 ${card} h-full text-[var(--muted)] flex items-center justify-center italic relative`}><button className="absolute top-2 right-2 hover:text-[var(--primary)] p-1 rounded border border-transparent hover:border-[var(--primary)] transition-all" onClick={onToggle}><RefreshCw size={14}/></button>No insight data available yet.</div>;
    const v = getVerdict(result.train_accuracy, result.validation_accuracy, result.test_accuracy || result.accuracy);
    const mRow = (label, val, p=false, mono=false) => (
        <div className="flex justify-between items-center py-1.5 border-b border-[var(--border)]/50 last:border-0">
            <span className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider">{label}</span>
            <span className={`text-[13px] font-black ${mono ? 'font-mono' : ''} text-[var(--text)]`}>{val === '--' ? val : (p ? pct(val) : val)}</span>
        </div>
    );
    return (
        <div className={`p-4 ${card} h-full overflow-hidden flex flex-col relative`}>
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-3 shrink-0">
                <div className="flex items-center gap-2 text-[15px] font-bold text-[var(--muted)] uppercase tracking-widest"><Info className="w-5 h-5 text-[var(--text)]" /> {sensor} Data Insights</div>
                <button
                    onClick={onToggle}
                    className="p-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider"
                >
                    <Grid3X3 size={14} /> Matrix
                </button>
            </div>
            <div className="flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden space-y-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center shadow-sm overflow-hidden flex flex-col"><div className="text-[10px] uppercase text-[var(--muted)] font-black py-1.5 bg-[var(--bg)]/50 border-b border-[var(--border)]">Train Acc</div><div className="text-2xl font-black text-[var(--text)] flex-1 flex items-center justify-center p-2">{pct(result.train_accuracy)}</div></div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center shadow-sm overflow-hidden flex flex-col transform hover:scale-105 transition-transform border-[var(--accent)]/50"><div className="text-[10px] uppercase text-[var(--text)] font-black py-1.5 bg-[var(--accent)] text-[var(--bg)]">Val Acc</div><div className="text-3xl font-black text-[var(--accent)] flex-1 flex items-center justify-center p-2">{pct(result.validation_accuracy)}</div></div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center shadow-sm overflow-hidden flex flex-col"><div className="text-[10px] uppercase text-[var(--muted)] font-black py-1.5 bg-[var(--bg)]/50 border-b border-[var(--border)]">Test Acc</div><div className="text-2xl font-black text-[var(--text)]/80 flex-1 flex items-center justify-center p-2">{pct(result.test_accuracy ?? result.accuracy)}</div></div>
                </div>
                <div className={`border ${v.bg} rounded-xl p-3 shadow-inner`}>
                    <div className="flex justify-between items-center mb-1"><div className="text-[10px] text-[var(--muted)] uppercase font-black tracking-widest">Model Verdict</div><div className="text-[10px] uppercase tracking-widest text-[var(--primary)] font-bold">{sensor} Pipeline</div></div>
                    <div className={`text-xl font-black tracking-tight ${v.color}`}>{v.text}</div>{v.desc && <div className="text-xs text-[var(--text)] opacity-80 mt-1 font-medium">{v.desc}</div>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm">
                        <div className="text-[11px] uppercase text-[var(--primary)] font-black tracking-widest mb-2 border-b border-[var(--border)]/50 pb-1">Performance</div>
                        {mRow('Mean CV Score', result.mean_accuracy, true, true)}{mRow('Total Avg', result.average_accuracy, true, true)}{mRow('Fold Var', result.fold_std ? result.fold_std.toFixed(4) : '--', false, true)}{mRow('Train-Val Gap', result.train_val_gap ? result.train_val_gap.toFixed(4) : '--', false, true)}
                    </div>
                    <div className="p-3 bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm">
                        <div className="text-[11px] uppercase text-[var(--accent)] font-black tracking-widest mb-2 border-b border-[var(--border)]/50 pb-1">Split</div>
                        {mRow('Train', result.split_summary?.train_samples || (result.n_samples ? Math.round(result.n_samples * (params.train_ratio || 0.7)) : '--'), false, true)}
                        {mRow('Val', result.split_summary?.val_samples || (result.n_samples ? Math.round(result.n_samples * (params.val_ratio || 0.15)) : '--'), false, true)}
                        {mRow('Test', result.split_summary?.test_samples || (result.n_samples ? Math.round(result.n_samples * (params.test_ratio || 0.15)) : '--'), false, true)}
                        {mRow('Groups', result.group_counts ? Object.keys(result.group_counts).length : '--', false, true)}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function MLTrainingView"""

if 'const pct = ' not in content:
    content = content.replace('export default function MLTrainingView', helpers)

# 3. Inject state for training jobs
if 'const [trainingJob, setTrainingJob] = useState(null);' not in content:
    state_injection = """    const [evalResults, setEvalResults] = useState({ EMG: null, EOG: null, EEG: null });
    const [trainingJob, setTrainingJob] = useState(null);
    const [insightView, setInsightView] = useState('matrix'); // 'matrix' or 'insight'
"""
    content = content.replace("const [evalResults, setEvalResults] = useState({ EMG: null, EOG: null, EEG: null });", state_injection)

# 4. Modify commonParams
if 'search_resolution: 3' not in content:
    content = content.replace("test_size: 0.15", "test_ratio: 0.15,\n        val_ratio: 0.15,\n        train_ratio: 0.7,\n        k_folds: 5,\n        search_resolution: 3,\n        n_estimators_min: 50,\n        n_estimators_max: 200,\n        max_depth_min: 5,\n        max_depth_max: 15,\n        min_impurity_decrease_max: 0.05")

# 5. Add pollJob logic & modify handleTrain
poll_logic = """
    const pollJob = async (jobId) => {
        try {
            const res = await fetch(`${API}/api/train-jobs/${jobId}`);
            const data = await res.json();
            setTrainingJob(data);
            if (data.status === 'completed' || data.status === 'failed') {
                return data; // Done
            }
            // Poll again very quickly
            await new Promise(r => setTimeout(r, 150));
            return pollJob(jobId);
        } catch (e) {
            console.error("Polling error", e);
            setTrainingJob(prev => ({ ...prev, status: 'failed' }));
            return null;
        }
    };

    const handleTrain = async () =>"""

if 'const pollJob = async' not in content:
    content = content.replace('const handleTrain = async () =>', poll_logic)

# 6. Inside handleTrain, poll logic
if 'const data = await res.json();' in content and 'pollJob(data.job_id)' not in content:
    train_logic = """
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

            if (data.job_id) {
                const finalJobResult = await pollJob(data.job_id);
                if (finalJobResult && finalJobResult.result) {
                    setResults(prev => ({ ...prev, [activeTab]: { ...finalJobResult.result, source: getSourceName(true) } }));
                } else {
                    throw new Error("Job failed or returned no result.");
                }
            } else {
                setResults(prev => ({ ...prev, [activeTab]: { ...data, source: getSourceName(true) } }));
            }

            // Clear previous evaluation result so training result shows instead
            setEvalResults(prev => ({ ...prev, [activeTab]: null }));
            setSelectedModels(prev => ({ ...prev, [activeTab]: modelNameFinal }));
            setTreeIndex(0);

            // Refresh list but without triggering it to override our selection
            await fetchModels(modelNameFinal);
        } catch (e) { setError(e.message); } finally { setLoading(false); setTrainingJob(null); }
    };
"""
    # Use re.sub to carefully replace
    content = re.sub(
        r"const res = await fetch\(endpointMap\[activeTab\].*?catch \(e\) \{ setError\(e\.message\); \} finally \{ setLoading\(false\); \}\n    \};", 
        train_logic.strip(), 
        content, 
        flags=re.DOTALL
    )

# 7. Replace <HyperparametersCard> with <ControlPanelCard>
if '<HyperparametersCard' in content:
    content = re.sub(
        r"<HyperparametersCard\s+params=\{activeParams\}\s+onChange=\{handleParamChange\}\s+/>",
        r"<ControlPanelCard\n                                        params={activeParams}\n                                        setParams={(updates) => setParams(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], ...updates } }))}\n                                        job={trainingJob}\n                                        activeTab={activeTab}\n                                    />",
        content
    )

# 8. Render InsightCard logic next to ConfusionMatrixCard
if 'insightView ===' not in content and '<ConfusionMatrixCard' in content:
    matrix_pattern = r"(<ConfusionMatrixCard\s+confusionMatrix=\{activeData\.confusion_matrix\}\s+labels=\{activeData\.labels\}\s+accuracy=\{activeData\.accuracy\}\s+n_samples=\{activeData\.n_samples\}\s+/>)"
    
    insight_injection = r"""{insightView === 'matrix' ? (
                                        <div className="relative h-full">
                                            <button className="absolute top-6 right-6 z-10 p-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm" onClick={() => setInsightView('insight')}>
                                                <Info size={14}/> Insight
                                            </button>
                                            \1
                                        </div>
                                    ) : (
                                        <InsightCard result={activeData} sensor={activeTab} activeTab={activeTab} params={activeParams} onToggle={() => setInsightView('matrix')} />
                                    )}"""
                                    
    content = re.sub(matrix_pattern, insight_injection, content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
