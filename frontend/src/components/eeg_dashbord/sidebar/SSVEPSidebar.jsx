import React from 'react';
import {
    Settings, Play, Square, Activity, MousePointer2, Keyboard,
    Sun, Monitor, Power, Zap, Trash2, History, Target, Menu,
    ChevronLeft, Brain, Eye, Radio, Wind, ChevronRight, Layers,
    Edit2, Save, X, RotateCcw
} from 'lucide-react';
import { motion } from 'framer-motion';
import CustomNumberInput from '../../ui/inputs/CustomNumberInput';
import CustomSelect from '../../ui/inputs/CustomSelect';
import CustomSlider from '../../ui/inputs/CustomSlider';

const COMMON_KEYS = ['None', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape', 'P', 'Q', '0', '1', '2', '3'];
const MOUSE_ACTIONS = ['None', 'Left Click', 'Right Click', 'Double Click', 'Scroll Up', 'Scroll Down'];
const SSVEP_FREQUENCIES = [6.0, 6.66, 7.5, 8.57, 10.0, 12.0, 15.0];

/**
 * SSVEPSidebar — page-specific controls sidebar for SSVEPView.
 */
const SSVEPSidebar = ({
    onBackToMenu,
    useML, setUseML,
    availableModels, selectedModel, setSelectedModel,
    addLog,
    realTimeFreq, predictedFreq,
    scoreVector,
    configs, updateConfig,
    isSyncing, lastModifiedTargetId,
    globalRunning, protocolMode,
    startFlicker, stopFlicker, runProtocol,
    brightness, setBrightness,
    refreshRate, setRefreshRate,
    logs, setLogs,
    showTargets, setShowTargets,
    openDropdownId, setOpenDropdownId,
    isConnected,
    sidebarMode,
    setSidebarMode,
    isCollapsed
}) => {
    const [isEditingTargets, setIsEditingTargets] = React.useState(false);
    const [editingConfigs, setEditingConfigs] = React.useState([]);

    // Initialize/Sync editing copy
    React.useEffect(() => {
        if (isEditingTargets && editingConfigs.length === 0) {
            setEditingConfigs(JSON.parse(JSON.stringify(configs)));
        }
    }, [isEditingTargets, configs]);

    const handleApplyEdits = () => {
        editingConfigs.forEach(cfg => {
            updateConfig(cfg.id, cfg);
        });
        setIsEditingTargets(false);
        setEditingConfigs([]);
        addLog('SSVEP Targets Updated', 'SETTINGS');
    };

    const handleCancelEdits = () => {
        setIsEditingTargets(false);
        setEditingConfigs([]);
    };

    const updateEditingConfig = (id, field, value) => {
        setEditingConfigs(prev => prev.map(c => 
            c.id === id ? { ...c, [field]: value } : c
        ));
    };

    return (
        <div className="flex-grow flex flex-col overflow-hidden p-4 gap-3 font-mono transition-all duration-300 w-full shrink-0 overflow-y-auto overflow-x-hidden">

            {/* Header */}
            <div className={`flex items-center justify-between mb-6 ${isCollapsed ? 'flex-col gap-4' : 'px-2'}`}>
                <div className={`flex items-center gap-3 min-w-0 ${isCollapsed ? 'flex-col' : ''}`}>
                    <div 
                        className="w-10 h-10 rounded-xl bg-[var(--primary)]/15 flex items-center justify-center border border-[var(--primary)]/30 shadow-glow shrink-0"
                        title={isCollapsed ? 'SSVEP Controls' : ''}
                    >
                        <Settings size={20} className="text-[var(--primary)]" />
                    </div>
                    {!isCollapsed && (
                        <div className="overflow-hidden">
                            <h2 className="text-[16px] font-black text-[var(--primary)] tracking-widest leading-none truncate">
                                SSVEP CONTROL
                            </h2>
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setSidebarMode(sidebarMode === 'main' ? 'page' : 'main')}
                    className={`nav-controls-toggle ${isCollapsed ? 'w-10 h-10 p-0 flex items-center justify-center rounded-xl' : 'shrink-0 ml-2'}`}
                    title={isCollapsed ? "Switch to Navigation" : ""}
                >
                    <Layers size={14} />
                    {!isCollapsed && "NAV"}
                </button>
            </div>

            {/* ML Pipeline Toggle Rail */}
            <div className={`flex items-center transition-all ${isCollapsed ? 'flex-col gap-4 py-4' : 'justify-between bg-[var(--primary)]/10 p-3 rounded-xl border border-[var(--primary)]/30 shadow-glow mx-0.5'}`}>
                <div className={`flex items-center gap-2 ${isCollapsed ? 'flex-col' : ''}`}>
                    <Brain 
                        size={isCollapsed ? 32 : 22} 
                        className={useML ? 'text-[var(--primary)] animate-pulse' : 'text-[var(--muted)]'} 
                        title={isCollapsed ? `ML: ${useML ? 'ON' : 'OFF'}` : ''}
                    />
                    {!isCollapsed && (
                        <div className="flex flex-col">
                            <span className={`text-[12px] font-black uppercase tracking-widest ${useML ? 'text-[var(--primary)]' : 'text-[var(--muted)]'}`}>ML Pipeline</span>
                            <span className="text-[9px] text-[var(--muted)]/60 font-bold uppercase tracking-tighter">LDA Enhancement</span>
                        </div>
                    )}
                </div>
                <button
                    onClick={() => { const v = !useML; setUseML(v); addLog(`ML Pipeline ${v ? 'Enabled' : 'Disabled'}`, 'SETTINGS'); }}
                    className={`rounded-full p-1 transition-all duration-300 border-2 ${
                        isCollapsed ? 'w-8 h-12 flex flex-col items-center justify-between' : 'w-[48px] h-[24px]'
                    } ${useML ? 'bg-[var(--primary)]/20 border-[var(--primary)] shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)]' : 'bg-[var(--bg)] border-[var(--border)]'}`}
                >
                    <div className={`rounded-full transition-all duration-300 ${isCollapsed ? 'w-[14px] h-[14px]' : 'w-[14px] h-[14px]'} ${useML ? 'bg-[var(--primary)] shadow-[0_0_8px_var(--primary)]' : 'bg-muted'} ${isCollapsed ? (useML ? 'translate-y-[20px]' : 'translate-y-0') : (useML ? 'translate-x-[22px]' : 'translate-x-0')}`} />
                </button>
            </div>

            {!isCollapsed && (
                <div className="shrink-0 bg-[var(--bg)]/40 border border-[var(--primary)]/20 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-black uppercase tracking-widest text-[var(--muted)]/80">EEG Model</span>
                        <span className="text-[10px] font-mono text-[var(--primary)]/80">{useML ? 'ACTIVE' : 'STANDBY'}</span>
                    </div>
                    <CustomSelect
                        options={availableModels.map(m => ({ value: m.name, label: m.name }))}
                        value={selectedModel}
                        onChange={(value) => { setSelectedModel(value); addLog(`EEG model selected: ${value}`, 'SETTINGS'); }}
                        placeholder={availableModels.length ? 'Select model...' : 'No models'}
                        disabled={!availableModels.length}
                        triggerClassName="!px-3 !py-2 !h-[2.25rem] !text-xs !font-bold !rounded-[8px]"
                    />
                </div>
            )}

            {/* Detection Analysis Rail */}
            <div className={`bg-[var(--bg)]/60 border border-[var(--primary)]/40 rounded-xl shrink-0 backdrop-blur-md shadow-xl transition-all ${isCollapsed ? 'p-2 py-4 flex flex-col items-center' : 'p-3 border-l-[4px] border-l-primary/60'}`}>
                {!isCollapsed && (
                    <h4 className="text-[11px] font-black text-[var(--muted)]/90 uppercase tracking-widest flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2"><Activity size={16} className="text-[var(--primary)]" /> Identified</div>
                        <span className="text-[10px] text-[var(--primary)]/80 font-mono bg-[var(--primary)]/10 px-1.5 rounded">LIVE</span>
                    </h4>
                )}
                <div className={`flex items-end transition-all ${isCollapsed ? 'flex-col gap-4' : 'justify-between h-[90px] gap-2 px-1'}`}>
                    {configs.filter(c => c.enabled).slice(0, isCollapsed ? 4 : undefined).map((cfg, idx) => {
                        const score = scoreVector[idx] || 0;
                        const height = Math.min(100, score * 100);
                        return (
                            <div key={cfg.id} className={`flex items-center gap-2 group relative ${isCollapsed ? 'w-full px-1' : 'flex-1 flex-col h-full'}`} title={isCollapsed ? `${cfg.freq}Hz: ${(score * 100).toFixed(1)}%` : ''}>
                                {!isCollapsed ? (
                                    <div className="w-full bg-[var(--primary)]/5 rounded-t-lg relative flex-grow overflow-hidden border-x border-t border-[var(--primary)]/10">
                                        <motion.div animate={{ height: `${height}%` }} className={`absolute bottom-0 left-0 right-0 ${height > 40 ? 'bg-[var(--primary)]/70' : 'bg-[var(--primary)]/40'}`} />
                                    </div>
                                ) : (
                                    <div className="w-full bg-[var(--primary)]/5 rounded-full overflow-hidden h-1 shadow-inner">
                                        <div className="h-full bg-[var(--primary)]/80" style={{ width: `${height}%` }} />
                                    </div>
                                )}
                                <span className={`font-black transition-colors ${isCollapsed ? 'text-[10px] text-[var(--primary)]' : 'text-[11px] text-[var(--text)]/70'}`}>{cfg.freq}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Global Actions Rail */}
            <div className={`grid gap-2 shrink-0 ${isCollapsed ? 'grid-cols-1 mt-4' : 'grid-cols-2 mt-2'}`}>
                <button
                    onClick={globalRunning ? stopFlicker : startFlicker}
                    className={`w-full py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 border-2 ${
                        globalRunning 
                        ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20' 
                        : 'bg-green-500/10 border-green-500/50 text-green-500 hover:bg-green-500/20 shadow-glow'
                    } ${isCollapsed ? 'p-0 px-0 h-12' : ''}`}
                    title={isCollapsed ? (globalRunning ? 'Stop' : 'Start') : ''}
                >
                    {globalRunning ? <Square size={20} /> : <Play size={20} />}
                    {!isCollapsed && (globalRunning ? 'Stop' : 'Start')}
                </button>
                {!isCollapsed && !globalRunning && (
                    <button onClick={runProtocol} className="w-full py-2.5 bg-[var(--primary)]/10 border-2 border-[var(--primary)]/50 text-[var(--primary)] rounded-xl text-base font-bold uppercase tracking-widest hover:bg-[var(--primary)]/20 transition-all flex items-center justify-center gap-2 shadow-glow">
                        <Zap size={18} /> Protocol
                    </button>
                )}
            </div>

            {/* Real-time Meter Rail */}
            <div className={`bg-[var(--bg)]/50 border border-[var(--primary)]/20 rounded-xl transition-all ${isCollapsed ? 'py-4 flex flex-col items-center gap-3' : 'p-3 flex items-center justify-between'}`}>
                <div className={`flex flex-col ${isCollapsed ? 'items-center' : ''}`}>
                    {!isCollapsed && (
                        <span className="text-base font-bold text-[var(--muted)] uppercase tracking-widest flex items-center gap-2 mb-1">
                            <Activity size={20} className="text-[var(--primary)]" /> Signal
                        </span>
                    )}
                    <div className="flex items-baseline gap-1" title={isCollapsed ? 'Real-time Frequency' : ''}>
                        <span className={`font-black text-[var(--primary)] tabular-nums ${isCollapsed ? 'text-2xl' : 'text-4xl'}`}>{realTimeFreq ? realTimeFreq.toFixed(1) : '0.0'}</span>
                        <span className={`font-bold text-[var(--muted)] ${isCollapsed ? 'text-xs' : 'text-lg'}`}>Hz</span>
                    </div>
                </div>
                {!isCollapsed && (
                    <div className="w-1/2 flex flex-col justify-between items-end gap-1">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-[var(--primary)] animate-pulse shadow-[0_0_8px_var(--primary)]" />
                            <span className="text-[18px] font-bold text-[var(--primary)]/80">LIVE</span>
                        </div>
                        <div className="w-full mt-2 h-[6px] bg-text/25 overflow-hidden">
                            <div className="h-full bg-[var(--primary)] transition-all duration-300 shadow-[0_0_8px_var(--primary)]" style={{ width: `${Math.min((realTimeFreq || 0) * 4, 100)}%` }} />
                        </div>
                    </div>
                )}
                {isCollapsed && (
                    <div className="w-1.5 h-10 bg-white/5 rounded-full overflow-hidden flex flex-col justify-end">
                         <div className="w-full bg-[var(--primary)] shadow-glow" style={{ height: `${Math.min((realTimeFreq || 0) * 4, 100)}%` }} />
                    </div>
                )}
            </div>

            {/* Target Settings Summary Rail */}
            {isCollapsed && (
                <div className="flex flex-col items-center gap-3 mt-4 opacity-60">
                    <Target size={22} className="text-[var(--primary)]" title="Target System Active" />
                    <span className="text-[10px] font-black text-[var(--primary)]">{configs.filter(c => c.enabled).length}T</span>
                </div>
            )}

            {!isCollapsed && (
                <div className="flex flex-col shrink-0 overflow-hidden border border-[var(--primary)]/40 rounded-xl bg-[var(--bg)]/20 backdrop-blur-sm">
                    <div className="p-3 border-b border-[var(--primary)]/20 bg-[var(--bg)]/40 shrink-0 flex items-center justify-between cursor-pointer hover:bg-[var(--bg)]/60 transition-colors" onClick={() => !isEditingTargets && setShowTargets(!showTargets)}>
                        <div className="flex items-center gap-2">
                             {!isCollapsed && !isEditingTargets && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setIsEditingTargets(true); }}
                                    className="p-1 px-1.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-all flex items-center justify-center border border-[var(--primary)]/20"
                                    title="Edit Targets"
                                >
                                    <Edit2 size={13} />
                                </button>
                             )}
                             <h4 className="text-[15px] font-black text-[var(--primary)]/80 uppercase tracking-widest whitespace-nowrap">Targets</h4>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[11px] font-black tracking-wider text-[var(--primary)] whitespace-nowrap bg-[var(--primary)]/10 px-1.5 py-0.5 rounded-full">{configs.filter(c => c.enabled).length} ACTIVE</span>
                            {!isEditingTargets && (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-[var(--primary)] transition-transform duration-300 shrink-0 ${!showTargets ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col p-2 gap-2">
                        {isEditingTargets ? (
                            <div className="space-y-3 p-1">
                                {editingConfigs.map(cfg => (
                                    <div key={cfg.id} className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-3">
                                        {/* Label & Frequency Row */}
                                        <div className="flex items-center gap-2">
                                            <div className="flex-grow">
                                                <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-1">Label</label>
                                                <input 
                                                    type="text" 
                                                    value={cfg.label}
                                                    onChange={(e) => updateEditingConfig(cfg.id, 'label', e.target.value)}
                                                    className="w-full bg-[var(--bg)]/80 border border-[var(--primary)]/30 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white focus:border-[var(--primary)] outline-none transition-all"
                                                />
                                            </div>
                                            <div className="w-[85px]">
                                                <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-1">Freq (Hz)</label>
                                                <CustomSelect
                                                    options={SSVEP_FREQUENCIES.map(f => ({ value: f, label: `${f.toFixed(1)}Hz` }))}
                                                    value={cfg.freq}
                                                    onChange={(val) => updateEditingConfig(cfg.id, 'freq', parseFloat(val))}
                                                    triggerClassName="!px-2 !py-1.5 !h-[2.1rem] !text-[11px] !font-black"
                                                />
                                            </div>
                                        </div>

                                        {/* Interaction & Key Row */}
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 min-w-0">
                                                <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-1 truncate">Action</label>
                                                <CustomSelect
                                                    options={[
                                                        { value: 'Keyboard', label: 'KEYBOARD' },
                                                        { value: 'Mouse', label: 'MOUSE' }
                                                    ]}
                                                    value={cfg.controlType}
                                                    onChange={(val) => updateEditingConfig(cfg.id, 'controlType', val)}
                                                    triggerClassName="!px-2 !py-1.5 !h-[2.1rem] !text-[11px] !font-black"
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-1 truncate">Trigger</label>
                                                <CustomSelect
                                                    options={cfg.controlType === 'Keyboard' 
                                                        ? COMMON_KEYS.map(k => ({ value: k, label: k })) 
                                                        : MOUSE_ACTIONS.map(m => ({ value: m, label: m }))
                                                    }
                                                    value={cfg.controlType === 'Keyboard' ? cfg.mappedKey : cfg.mappedMouse}
                                                    onChange={(val) => updateEditingConfig(cfg.id, cfg.controlType === 'Keyboard' ? 'mappedKey' : 'mappedMouse', val)}
                                                    triggerClassName="!px-2 !py-1.5 !h-[2.1rem] !text-[11px] !font-black"
                                                />
                                            </div>
                                            <div className="pt-4 flex-shrink-0">
                                                 <button 
                                                    onClick={() => updateEditingConfig(cfg.id, 'enabled', !cfg.enabled)}
                                                    className={`p-2 rounded-lg border transition-all ${cfg.enabled ? 'bg-[var(--primary)]/20 border-[var(--primary)] text-[var(--primary)]' : 'bg-red-500/10 border-red-500/40 text-red-500'}`}
                                                    title={cfg.enabled ? 'Disable flicker' : 'Enable flicker'}
                                                >
                                                    <Power size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                
                                <div className="grid grid-cols-2 gap-2 pt-2">
                                    <button 
                                        onClick={handleCancelEdits}
                                        className="py-2.5 rounded-xl border border-white/10 text-[var(--muted)] font-black uppercase text-[10px] tracking-widest hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                                    >
                                        <X size={14} /> Cancel
                                    </button>
                                    <button 
                                        onClick={handleApplyEdits}
                                        className="py-2.5 rounded-xl bg-[var(--primary)] text-bg font-black uppercase text-[10px] tracking-widest hover:brightness-110 shadow-glow flex items-center justify-center gap-2"
                                    >
                                        <Save size={14} /> Apply Changes
                                    </button>
                                </div>
                            </div>
                        ) : (
                            !showTargets ? (
                                <div className="space-y-1">
                                    {configs.map(cfg => (
                                        <div key={cfg.id} className={`flex items-center justify-between px-3 py-3 relative hover:bg-white/5 rounded-lg transition-colors group ${!cfg.enabled && 'grayscale opacity-50'}`}>
                                            <div className="flex items-center gap-3 w-5/12 overflow-hidden">
                                                <Target size={16} strokeWidth={2.5} className={cfg.enabled ? 'text-[var(--primary)]' : 'text-[var(--muted)]/50'} />
                                                <span className="text-[13px] font-bold truncate text-[var(--text)]/80 group-hover:text-[var(--text)] transition-colors">{cfg.label}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 justify-center w-3/12 relative">
                                                <Activity size={14} className="text-[var(--primary)]/80" />
                                                <span className="text-[13px] font-black text-[var(--primary)] font-mono tracking-tight">{cfg.freq}Hz</span>
                                            </div>
                                            <div className="flex items-center gap-2 justify-end w-4/12">
                                                {!cfg.enabled ? <Power size={14} className="text-[var(--muted)]/50" /> : (cfg.controlType === 'Keyboard' ? <Keyboard size={14} className="text-[var(--muted)]/60" /> : <MousePointer2 size={14} className="text-[var(--muted)]/60" />)}
                                                <span className={`text-[13px] font-bold uppercase tracking-widest truncate ${cfg.enabled ? 'text-[var(--text)]' : 'text-[var(--muted)]/50'}`}>
                                                    {!cfg.enabled ? 'OFF' : (cfg.controlType === 'Keyboard' ? cfg.mappedKey : cfg.mappedMouse)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : "..."
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SSVEPSidebar;
