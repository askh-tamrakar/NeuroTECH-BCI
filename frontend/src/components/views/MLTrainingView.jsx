import Tree from 'react-d3-tree';
import { useState, useEffect } from 'react';
import {
    Trash2, Rocket, ArrowRight, Save, Target, ListOrdered, Database, Hand, Eye, Network, Grid3X3, Brain, PieChart, RefreshCw, Sliders, ChevronLeft, ChevronRight, Circle,
    Cpu, Activity, Download, Layers, Clock, Settings, Play, GitBranch, BarChart2, Info
} from 'lucide-react';
import { soundHandler } from '../../handlers/SoundHandler';
import CustomSelect from '../ui/CustomSelect';

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
                <Save className="mr-2 w-5 h-5" /> Saved Models
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
                            <Target className="mr-2 w-5 h-5" /> Accuracy
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

const FeatureImportanceCard = ({ importances }) => (
    <div className="card h-full flex flex-col p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm scrollbar-thin">
        <h3 className="text-base flex items-center font-bold text-[var(--muted)] uppercase tracking-widest mb-4 border-b border-[var(--border)] pb-2">
            <ListOrdered className="mr-2 w-4 h-4" /> Top Features
        </h3>
        <ul className="h-full overflow-y-auto flex-grow flex flex-col pr-2 pb-1 space-y-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {Object.entries(importances).sort(([, a], [, b]) => b - a).map(([name, imp]) => (
                <li key={name} className="flex items-center text-[var(--text)] group hover:bg-[var(--bg)]/30 rounded px-1 py-0.5">
                    <span className="w-20 font-mono text-[13px] text-[var(--muted)] truncate" title={name}>{name}</span>
                    <div className="flex-1 h-2 bg-[var(--bg)] rounded-full ml-2 overflow-hidden border border-[var(--border)]">
                        <div className="h-full bg-[var(--primary)] group-hover:bg-[var(--accent)] transition-colors" style={{ width: `${imp * 100}%` }}></div>
                    </div>
                    <span className="ml-2 text-[13px] w-8 text-right font-mono">{(imp * 100).toFixed(0)}%</span>
                </li>
            ))}
        </ul>
    </div>
);

// New Component for Hyperparameters
const HyperparametersCard = ({ params, onChange }) => (
    <div className="card h-full flex flex-col p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm">
        <h3 className="text-base flex items-center font-bold text-[var(--muted)] uppercase tracking-widest border-b border-[var(--border)] pb-2">
            <Sliders className="mr-2 w-4 h-4" /> Hyperparameters
        </h3>
        <div className="py-4 space-y-4 flex-grow flex flex-col justify-between">
            <div>
                <div className="flex justify-between mb-1">
                    <span className="text-xs text-[var(--text)]">Trees</span>
                    <span className="text-xs font-mono text-[var(--primary)]">{params.n_estimators}</span>
                </div>
                <input type="range" min="5" max="500" step="5" name="n_estimators" value={params.n_estimators} onChange={onChange} className="w-full accent-[var(--primary)]" />
            </div>
            <div>
                <div className="flex justify-between mb-1">
                    <span className="text-xs text-[var(--text)]">Max Depth</span>
                    <span className="text-xs font-mono text-[var(--primary)]">{params.max_depth}</span>
                </div>
                <input type="range" min="1" max="20" step="1" name="max_depth" value={params.max_depth} onChange={onChange} className="w-full accent-[var(--primary)]" />
            </div>
            <div>
                <div className="flex justify-between mb-1">
                    <span className="text-xs text-[var(--text)]">Test Size</span>
                    <span className="text-xs font-mono text-[var(--primary)]">{params.test_size}</span>
                </div>
                <input type="range" min="0.1" max="0.9" step="0.05" name="test_size" value={params.test_size} onChange={onChange} className="w-full accent-[var(--primary)]" />
            </div>
            <div>
                <div className="flex justify-between mb-1">
                    <span className="text-xs text-[var(--text)]">Pruning (Min Impurity Decr)</span>
                    <span className="text-xs font-mono text-[var(--primary)]">{params.min_impurity_decrease}</span>
                </div>
                <input type="range" min="0" max="0.2" step="0.005" name="min_impurity_decrease" value={params.min_impurity_decrease} onChange={onChange} className="w-full accent-[var(--primary)]" />
            </div>
        </div>
    </div>
);

const RenderClassLabel = ({ label, sensor }) => {
    // EOG Special Icons
    if (sensor === 'EOG') {
        const val = String(label);
        if (val === '0') return <span className="flex items-center justify-center" title="Rest (0)"><Circle className="w-4 h-4 opacity-40" /></span>;
        if (val === '1') return <span className="flex items-center justify-center" title="Single Blink (1)"><Eye className="w-4 h-4 text-[var(--primary)]" /></span>;
        if (val === '2') return (
            <span className="flex items-center justify-center gap-0.5" title="Double Blink (2)">
                <Eye className="w-4 h-4 text-[var(--primary)]" />
                <Eye className="w-4 h-4 text-[var(--primary)] -ml-1.5" />
            </span>
        );
    }
    // Default fallback
    return <span>{label}</span>;
}

const ConfusionMatrixCard = ({ matrix, labels, n_samples, sensor }) => (
    <div className="card h-full flex flex-col p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm">
        <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
            <h3 className="text-sm flex items-center font-bold text-[var(--muted)] uppercase tracking-widest">
                <Grid3X3 className="mr-2 w-4 h-4" /> Confusion Matrix
                {n_samples !== undefined && <span className="ml-2 text-xs normal-case opacity-70">({n_samples} samples)</span>}
            </h3>
            <div className="flex items-center gap-2 text-[10px] bg-[var(--bg)] px-2 py-0.5 rounded border border-[var(--border)]">
                <span className="font-bold text-[var(--text)]">Actual</span>
                <span className="text-[var(--muted)]"><ArrowRight size={14} /></span>
                <span className="font-bold text-[var(--primary)]">Pred</span>
            </div>
        </div>
        <div className="flex-grow overflow-hidden flex flex-col h-full py-4 relative">
            {matrix ? (
                <table className="w-full h-full text-[16px] text-center text-[var(--text)] border-collapse table-fixed">
                    <thead>
                        <tr>
                            <th className="p-2 w-24 text-left text-[var(--muted)] font-normal italic border-b border-[var(--border)] bg-[var(--bg)]/30">Class</th>
                            {labels.map((l, i) => (
                                <th key={i} className="p-2 font-bold text-[var(--primary)] border-b border-[var(--border)] bg-[var(--bg)]/10 truncate">
                                    <RenderClassLabel label={l} sensor={sensor} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.map((row, i) => (
                            <tr key={i} className="hover:bg-[var(--surface)]/50 transition-colors group">
                                <td className="p-2 font-bold text-[var(--text)] text-left border-r border-[var(--border)] bg-[var(--bg)]/20 truncate">
                                    <RenderClassLabel label={labels[i]} sensor={sensor} />
                                </td>
                                {row.map((cell, j) => (
                                    <td key={j} className={`p-2 border border-[var(--border)] transition-all ${i === j
                                        ? 'bg-[var(--primary)]/20 font-black text-[var(--primary)]'
                                        : cell > 0 ? 'bg-red-500/10 text-red-400 font-medium' : 'text-[var(--muted)] opacity-20'
                                        }`}>
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
                        <Network className="mr-2 w-4 h-4" /> Decision Tree Visualization
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

// Updated ControlPanel (Added Model Name Input)
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
    setModelName
}) => (
    <div className="space-y-4">
        {/* Session Select */}
        <div className="card p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex flex-col gap-2">
            <span className="flex flex-row justify-between">
                <label className="text-xl flex items-center font-bold text-[var(--muted)] uppercase tracking-wide mb-2">
                    <Database className="mr-2 w-6 h-6" /> Training Data
                </label>
                {/* TABS */}
                <span className="flex bg-[var(--surface)] rounded-lg p-1 border border-[var(--border)]">
                    <button
                        onClick={() => { setActiveTab('EMG'); onSessionSelect(null); }}
                        className={`px-2 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'EMG' ? 'bg-[var(--primary)] text-white shadow' : 'text-[var(--text)] hover:text-[var(--primary)]'} `}
                    >
                        <Hand className="inline mr-1 w-4 h-4" /> EMG
                    </button>
                    <button
                        onClick={() => { setActiveTab('EOG'); onSessionSelect(null); }}
                        className={`px-2 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'EOG' ? 'bg-[var(--primary)] text-white shadow' : 'text-[var(--text)] hover:text-[var(--primary)]'} `}
                    >
                        <Eye className="inline mr-1 w-4 h-4" /> EOG
                    </button>
                </span>
            </span>

            {/* Model Name Input (Generic) */}
            <div>
                <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder={`Name for new ${activeTab} model...`}
                    className="w-full bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] rounded p-2 focus:border-[var(--primary)] outline-none mb-2"
                />
            </div>

            <div className="flex gap-2">
                <CustomSelect
                    className="flex-1"
                    value={selectedSession || ''}
                    onChange={(val) => onSessionSelect(val)}
                    options={[
                        { value: "", label: "All Available Data" },
                        ...sessions.map(s => ({ value: s.table, label: s.name }))
                    ]}
                    placeholder="Select Session..."
                />
                <button onClick={onRefreshSessions} className="p-2.5 border border-[var(--border)] rounded hover:bg-[var(--bg)] text-[var(--text)]" title="Refresh Sessions"><RefreshCw className="w-5 h-5" /></button>
            </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 gap-3">
            <button
                onClick={onTrain}
                disabled={loading}
                className="btn py-3 bg-[var(--primary)] text-white hover:opacity-90 font-bold rounded-xl shadow-lg hover:translate-y-[-1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'Training...' : <><Rocket className="inline mr-2 w-5 h-5" /> Train New Model</>}
            </button>
        </div>
    </div>
);

export default function MLTrainingView() {
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
    const [selectedModelName, setSelectedModelName] = useState(null);
    const [trainModelNameInput, setTrainModelNameInput] = useState('');

    // Result States per sensor to persist when switching tabs? 
    // Or just one activeResult? One activeResult is simpler but clears on switch.
    // Let's use a ref or object to cache if we wanted, but state is fine.
    const [results, setResults] = useState({ EMG: null, EOG: null });
    const [evalResults, setEvalResults] = useState({ EMG: null, EOG: null });

    // Params per sensor
    const [params, setParams] = useState({
        EMG: { n_estimators: 100, max_depth: 8, test_size: 0.2, min_impurity_decrease: 0.0 },
        EOG: { n_estimators: 50, max_depth: 5, test_size: 0.2, min_impurity_decrease: 0.0 }
    });

    const activeResult = results[activeTab];
    const activeEvalResult = evalResults[activeTab];
    const activeParams = params[activeTab];

    const fetchModels = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/models/${activeTab}`);
            if (res.ok) {
                const data = await res.json();
                setModels(data);
                
                // Auto-load first model if none is active
                if (data.length > 0) {
                    const activeModel = data.find(m => m.active);
                    if (activeModel) {
                        if (!selectedModelName || selectedModelName !== activeModel.name) {
                            setSelectedModelName(activeModel.name);
                        }
                    } else if (!selectedModelName) {
                        const firstModel = data[0].name;
                        // Avoid infinite loops by checking if we already selected it
                        setSelectedModelName(firstModel);
                        handleLoadModel(firstModel);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to list models", e);
        }
    };

    const handleDeleteModel = async (name) => {
        // Removed confirmation as requested
        try {
            // Ensure sensor path is lowercase (e.g., 'emg', 'eog') to match backend routes
            const res = await fetch(`${API_BASE_URL}/api/models/${activeTab.toLowerCase()}/${name}`, { method: 'DELETE' });
            if (res.ok) {
                fetchModels();
                if (selectedModelName === name) setSelectedModelName(null);
            }
        } catch (e) {
            console.error("Delete failed: ", e);
        }
    };

    const handleLoadModel = async (name) => {
        setSelectedModelName(name);
        // Clear previous training result so evaluation shows
        // setResults(prev => ({ ...prev, [activeTab]: null }));

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
        // Clear selection on tab switch or try to restore?
        setSelectedModelName(null);
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
        setParams(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab],
                [name]: (name === 'test_size' || name === 'min_impurity_decrease') ? parseFloat(value) : parseInt(value)
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
            // Determine endpoint based on tab
            // We could have a generic endpoint, but we have specific ones.
            // Let's use specific ones or update backend to have generic.
            // Creating a map for now.
            const endpointMap = {
                'EMG': `${API_BASE_URL}/api/train-emg-rf`,
                'EOG': `${API_BASE_URL}/api/train-eog-rf`
            };

            const res = await fetch(endpointMap[activeTab], {
                method: 'POST',
                body: JSON.stringify({
                    ...activeParams,
                    table_name: selectedSession || 'ALL',
                    model_name: trainModelNameInput.trim(),
                    sensor: activeTab // Just in case generic
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Training failed');

            setResults(prev => ({ ...prev, [activeTab]: { ...data, source: getSourceName(true) } }));
            fetchModels();
            setSelectedModelName(trainModelNameInput.trim());
            setTreeIndex(0);
        } catch (e) { setError(e.message); } finally { setLoading(false); }
    };

    const handleEval = async (forceModelName = null) => {
        setEvalLoading(true); setError(null);
        // setEvalResults(prev => ({ ...prev, [activeTab]: null }));

        try {
            const endpointMap = {
                'EMG': `${API_BASE_URL}/api/model/evaluate`, // legacy endpoint
                'EOG': `${API_BASE_URL}/api/model/evaluate/eog`
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
                // Silent fail or low priority error
                // throw new Error(data.error);
                return;
            }

            setEvalResults(prev => ({ ...prev, [activeTab]: { ...data, source: getSourceName(false) } }));

            if (data.hyperparameters) {
                setParams(prev => ({
                    ...prev,
                    [activeTab]: { ...prev[activeTab], ...data.hyperparameters }
                }));
            }
            if (data.model_name) setSelectedModelName(data.model_name);
        } catch (e) {
            console.log("Eval check info (ignore if just checking):", e);
        } finally { setEvalLoading(false); }
    };



    return (
        <div className="font-sans w-full h-[calc(100vh-120px)] p-4 flex flex-col items-stretch overflow-hidden">
            {/* ERROR DISPLAY */}
            {error && <div className="w-full bg-red-900/20 border border-red-500 text-red-200 py-2 rounded mb-4 flex justify-between items-center shrink-0 text-sm px-4">
                <span><strong>Error:</strong> {error}</span>
                <button onClick={() => setError(null)} className="underline">Dismiss</button>
            </div>}

            {/* CONTENT scrollable container */}
            <div className="flex-1 w-full min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                <div className="h-full min-h-[800px] grid grid-cols-12 grid-rows-6 gap-4 pb-2">
                    {/* LEFT SIDEBAR CONTROLS (Span 3) - NOW CONTAINS ACCURACY & FEATURES TOO */}
                    <div className="col-span-12 lg:col-span-3 row-span-6 flex flex-col gap-4">
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

                        {/* 3. TOP FEATURES */}
                        {(activeResult || activeEvalResult)?.feature_importances && (
                            <div className="flex-1 flex-grow-4 min-h-0">
                                <FeatureImportanceCard importances={(activeResult || activeEvalResult).feature_importances} />
                            </div>
                        )}
                    </div>

                    {/* MAIN BENTO GRID (Span 9) */}
                    {(activeResult || activeEvalResult) ? (
                        <>
                            {/* TOP ROW: Hyperparams + Confusion Matrix */}

                            {/* BOTTOM ROW: Tree Viz */}
                            {/* Tree Viz (Span 9, Row 4) - Extended full width */}
                            <div className="col-span-12 md:col-span-9 row-span-4">
                                <DecisionTreeCard
                                    structure={(activeResult || activeEvalResult).tree_structure}
                                    treeIndex={treeIndex}
                                    totalTrees={activeParams.n_estimators}
                                    onTreeChange={fetchTree}
                                    loading={loading || treeLoading}
                                />
                            </div>
                            {/* Hyperparameters (Span 3, Row 2) - Replaces old Accuracy spot */}
                            <div className="col-span-12 md:col-span-3 row-span-2">
                                <HyperparametersCard
                                    params={activeParams}
                                    onChange={handleParamChange}
                                />
                            </div>

                            {/* Confusion Matrix (Span 6, Row 2) - Replaces old Features spot */}
                            <div className="col-span-12 md:col-span-6 row-span-2">
                                <ConfusionMatrixCard
                                    matrix={(activeResult || activeEvalResult).confusion_matrix}
                                    labels={(activeResult || activeEvalResult).labels || []}
                                    n_samples={(activeResult || activeEvalResult).n_samples}
                                    sensor={activeTab}
                                />
                            </div>
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
        </div>
    );
}

// Keep old AccuracyCard for EOG fallback
const AccuracyCard = ({ accuracy, n_samples, source }) => (
    <div className="card h-full flex flex-col justify-center items-center p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm hover:shadow-md transition-shadow">
        <h3 className="text-xl font-bold text-[var(--muted)] uppercase tracking-widest mb-2">Model Accuracy</h3>
        {accuracy !== null && accuracy !== undefined ? (
            <>
                <div className="text-5xl font-black text-[var(--primary)] mb-2">{(accuracy * 100).toFixed(1)}%</div>
                <p className="text-base text-[var(--text)] opacity-70">on {n_samples} test samples</p>
                {source && <p className="text-xs text-[var(--muted)] mt-2 font-mono bg-[var(--bg)] px-2 py-1 rounded border border-[var(--border)]">{source}</p>}
            </>
        ) : (
            <div className="text-center">
                <div className="text-3xl text-[var(--muted)] mb-1">N/A</div>
                <p className="text-sm text-[var(--muted)] opacity-60">No data to evaluate</p>
                <p className="text-xs text-[var(--muted)] opacity-40 mt-1">Select a valid session</p>
            </div>
        )}
    </div>
);
