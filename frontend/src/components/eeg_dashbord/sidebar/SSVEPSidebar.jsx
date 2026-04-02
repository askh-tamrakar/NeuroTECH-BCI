import React from 'react';
import {
    Settings, Play, Square, Activity, MousePointer2, Keyboard,
    Sun, Monitor, Power, Zap, Trash2, History, Target, Menu,
    ChevronLeft, Brain, Eye, Radio, Wind, ChevronRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import CustomNumberInput from '../../ui/inputs/CustomNumberInput';
import CustomSelect from '../../ui/inputs/CustomSelect';
import CustomSlider from '../../ui/inputs/CustomSlider';

const COMMON_KEYS = ['None', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape', 'P', 'Q', '0', '1', '2', '3'];
const MOUSE_ACTIONS = ['None', 'Left Click', 'Right Click', 'Double Click', 'Scroll Up', 'Scroll Down'];

/**
 * SSVEPSidebar — page-specific controls sidebar for SSVEPView.
 * All state is owned by SSVEPView; props are passed down.
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
}) => {
    return (
        <div className="flex-grow flex flex-col overflow-hidden p-4 gap-3 font-mono transition-opacity duration-300 w-full shrink-0">

            {/* Header */}
            <div className="flex items-center justify-between shrink-0 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-[var(--text)] mb-1 flex items-center gap-3">
                        <Settings size={28} className="text-[var(--primary)] animate-pulse" />
                        <span style={{ letterSpacing: '2.3px' }}>SSVEP CONTROLS</span>
                    </h2>
                    <p className="text-xs text-[var(--muted)]">Neurofeedback Stimulation</p>
                </div>
            </div>

            {/* ML Pipeline Toggle */}
            <div className="flex items-center justify-between shrink-0 bg-[var(--primary)]/10 p-3 rounded-xl border border-[var(--primary)]/30 shadow-glow mx-0.5">
                <div className="flex items-center gap-2">
                    <Brain size={22} className={useML ? 'text-[var(--primary)] animate-pulse' : 'text-[var(--muted)]'} />
                    <div className="flex flex-col">
                        <span className={`text-[12px] font-black uppercase tracking-widest ${useML ? 'text-[var(--primary)]' : 'text-[var(--muted)]'}`}>Include ML Pipeline</span>
                        <span className="text-[9px] text-[var(--muted)]/60 font-bold uppercase tracking-tighter">LDA Enhancement</span>
                    </div>
                </div>
                <button
                    onClick={() => { const v = !useML; setUseML(v); addLog(`ML Pipeline ${v ? 'Enabled' : 'Disabled'}`, 'SETTINGS'); }}
                    className={`w-[48px] h-[24px] rounded-full p-1 transition-all duration-300 border-2 ${useML ? 'bg-[var(--primary)]/20 border-[var(--primary)] shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)]' : 'bg-[var(--bg)] border-[var(--border)]'}`}
                >
                    <div className={`w-[14px] h-[14px] rounded-full transition-all duration-300 ${useML ? 'bg-[var(--primary)] translate-x-[22px] shadow-[0_0_8px_var(--primary)]' : 'bg-muted translate-x-0'}`} />
                </button>
            </div>

            {/* EEG Model */}
            <div className="shrink-0 bg-[var(--bg)]/40 border border-[var(--primary)]/20 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-widest text-[var(--muted)]/80">EEG Model</span>
                    <span className="text-[10px] font-mono text-[var(--primary)]/80">{useML ? 'ACTIVE IN PIPELINE' : 'STANDBY'}</span>
                </div>
                <CustomSelect
                    options={availableModels.map(m => ({ value: m.name, label: m.name }))}
                    value={selectedModel}
                    onChange={(value) => { setSelectedModel(value); addLog(`EEG model selected: ${value}`, 'SETTINGS'); }}
                    placeholder={availableModels.length ? 'Select EEG model...' : 'No EEG models'}
                    disabled={!availableModels.length}
                    triggerClassName="!px-3 !py-2 !h-[2.25rem] !text-xs !font-bold !rounded-[8px]"
                />
            </div>

            {/* Detection Analysis */}
            <div className="bg-[var(--bg)]/60 border border-[var(--primary)]/40 rounded-xl p-3 shrink-0 backdrop-blur-md shadow-xl border-l-[4px] border-l-primary/60">
                <h4 className="text-[11px] font-black text-[var(--muted)]/90 uppercase tracking-widest flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2"><Activity size={16} className="text-[var(--primary)]" /> Identification Matrix</div>
                    <span className="text-[10px] text-[var(--primary)]/80 font-mono bg-[var(--primary)]/10 px-1.5 rounded">LIVE</span>
                </h4>
                <div className="flex items-end justify-between h-[90px] gap-2 px-1">
                    {configs.filter(c => c.enabled).map((cfg, idx) => {
                        const score = scoreVector[idx] || 0;
                        const height = Math.min(100, score * 100);
                        return (
                            <div key={cfg.id} className="flex-1 flex flex-col items-center gap-2 group relative h-full">
                                <div className="w-full bg-[var(--primary)]/5 rounded-t-lg relative flex-grow overflow-hidden border-x border-t border-[var(--primary)]/10">
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: `${height}%` }}
                                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                        className={`absolute bottom-0 left-0 right-0 ${height > 40 ? 'bg-[var(--primary)]/70 shadow-[0_0_20px_rgba(var(--primary-rgb),0.5)]' : 'bg-[var(--primary)]/40'}`}
                                    />
                                </div>
                                <span className="text-[11px] font-black text-[var(--text)]/70 group-hover:text-[var(--primary)] transition-colors transform group-hover:scale-110">{cfg.freq}</span>
                                <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 bg-[var(--surface)] border border-[var(--primary)]/40 px-2 py-1.5 rounded-lg text-[10px] font-black text-[var(--primary)] opacity-0 group-hover:opacity-100 pointer-events-none z-50 whitespace-nowrap">
                                    {cfg.label.toUpperCase()}: {(score * 100).toFixed(1)}%
                                </div>
                            </div>
                        );
                    })}
                    {configs.filter(c => c.enabled).length === 0 && (
                        <div className="w-full h-full flex items-center justify-center text-[11px] text-[var(--muted)] italic font-bold">No Active Targets</div>
                    )}
                </div>
            </div>

            {/* Global Actions */}
            <div className="grid grid-cols-2 gap-2 shrink-0 mt-2">
                <button
                    onClick={globalRunning ? stopFlicker : startFlicker}
                    className={`w-full py-2.5 rounded-xl text-base font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2 ${globalRunning ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20' : 'bg-green-500/10 border-green-500/50 text-green-500 hover:bg-green-500/20 shadow-glow'}`}
                >
                    {globalRunning ? <><Square size={18} /> Stop</> : <><Play size={18} /> Start</>}
                </button>
                {!globalRunning && (
                    <button onClick={runProtocol} className="w-full py-2.5 bg-[var(--primary)]/10 border-2 border-[var(--primary)]/50 text-[var(--primary)] rounded-xl text-base font-bold uppercase tracking-widest hover:bg-[var(--primary)]/20 transition-all flex items-center justify-center gap-2 shadow-glow">
                        <Zap size={18} /> Protocol
                    </button>
                )}
            </div>

            {/* Global Settings */}
            <div className="flex flex-col gap-4 shrink-0 bg-[var(--bg)]/30 p-3 rounded-xl border border-[var(--border)]/50">
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-base font-bold text-[var(--muted)] uppercase tracking-widest">
                        <span className="flex items-center gap-2"><Sun size={20} /> Brightness</span>
                        <span className="text-[var(--primary)] text-xl">{Math.round(brightness * 100)}%</span>
                    </div>
                    <CustomSlider min={0.1} max={1.0} step={0.05} value={brightness} onChange={setBrightness} accentColor="primary" />
                </div>
                <div className="flex items-center justify-between border-t border-[var(--border)]/30 pt-3">
                    <label className="text-base font-bold text-[var(--muted)] uppercase tracking-widest flex items-center gap-2">
                        <Monitor size={20} /> Refresh Rate
                    </label>
                    <CustomNumberInput value={refreshRate} onChange={setRefreshRate} min={1} max={500} step={1} className="w-[6.5rem] !h-[2.25rem] !text-lg" unit="FPS" />
                </div>
            </div>

            {/* Real-time Meter */}
            <div className="bg-[var(--bg)]/50 border border-[var(--primary)]/20 rounded-xl p-3 flex items-center justify-between shrink-0">
                <div className="flex flex-col">
                    <span className="text-base font-bold text-[var(--muted)] uppercase tracking-widest flex items-center gap-2 mb-1">
                        <Activity size={20} className="text-[var(--primary)]" /> Signal
                    </span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-black text-[var(--primary)] tabular-nums">{realTimeFreq ? realTimeFreq.toFixed(2) : '0.00'}</span>
                        <span className="text-lg font-bold text-[var(--muted)]">Hz</span>
                    </div>
                    <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]/70 mt-1">
                        Pred {predictedFreq ? predictedFreq.toFixed(2) : '0.00'} Hz
                    </div>
                </div>
                <div className="w-1/2 flex flex-col justify-between items-end gap-1">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[var(--primary)] animate-pulse shadow-[0_0_8px_var(--primary)]" />
                        <span className="text-[18px] font-bold text-[var(--primary)]/80">LIVE</span>
                    </div>
                    <div className="w-full mt-2 h-[6px] bg-text/25 overflow-hidden">
                        <div className="h-full bg-[var(--primary)] transition-all duration-300 shadow-[0_0_8px_var(--primary)]" style={{ width: `${Math.min((realTimeFreq || 0) * 4, 100)}%` }} />
                    </div>
                </div>
            </div>

            {/* Targets List */}
            <div className="flex flex-col shrink-0 overflow-hidden border border-[var(--primary)]/40 rounded-xl bg-[var(--bg)]/20 backdrop-blur-sm">
                <div className="p-3 border-b border-[var(--primary)]/20 bg-[var(--bg)]/40 shrink-0 flex items-center justify-between cursor-pointer hover:bg-[var(--bg)]/60 transition-colors" onClick={() => setShowTargets(!showTargets)}>
                    <h4 className="text-base font-black text-[var(--primary)]/80 uppercase tracking-widest">Targets</h4>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-black tracking-wider text-[var(--primary)]">{configs.filter(c => c.enabled).length} ACTIVE</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-[var(--primary)] transition-transform duration-300 ${!showTargets ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
                    </div>
                </div>
                <div className="flex flex-col p-2 gap-2">
                    {!showTargets ? (
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
                    ) : (
                        configs.map((cfg, index) => {
                            const isMouse = cfg.controlType === 'Mouse';
                            return (
                                <div key={cfg.id} className={`p-3 rounded-xl border transition-all space-y-2 shrink-0 relative transform-gpu ${cfg.enabled ? 'bg-[var(--bg)]/50 border-[var(--border)]' : 'bg-[var(--bg)]/20 border-[var(--border)]/30 grayscale opacity-60'}`} style={{ zIndex: openDropdownId === cfg.id ? 100 : 50 - index }}>
                                    <div className="flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-2 overflow-hidden flex-grow">
                                            <button onClick={() => updateConfig(cfg.id, { enabled: !cfg.enabled })} className={`p-1.5 rounded-[6px] transition-all shrink-0 ${cfg.enabled ? 'bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/30' : 'bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:border-[var(--primary)]/50'}`} title={cfg.enabled ? 'Disable Target' : 'Enable Target'}>
                                                <Power size={14} />
                                            </button>
                                            <input className="bg-transparent font-bold text-base outline-none focus:text-[var(--primary)] transition-colors w-full" value={cfg.label} onChange={e => updateConfig(cfg.id, { label: e.target.value })} />
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-2 py-1">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]/70" title="Divisor">{refreshRate}/{cfg.divisor}</span>
                                            <input type="number" step="0.01" className="w-[3.5rem] bg-transparent text-sm font-black text-[var(--primary)] text-right outline-none focus:ring-1 focus:ring-primary rounded transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={cfg.freq} onChange={e => updateConfig(cfg.id, { freq: parseFloat(e.target.value) || 0, isManual: true })} />
                                            <span className="text-sm font-black text-[var(--primary)]">Hz</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]/10">
                                        <div className="flex items-center gap-2 flex-grow">
                                            <span className={`text-[10px] font-bold uppercase tracking-tight ${!isMouse ? 'text-[var(--primary)]' : 'text-[var(--muted)]'}`}>Key</span>
                                            <button onClick={() => updateConfig(cfg.id, { controlType: isMouse ? 'Keyboard' : 'Mouse' })} className={`w-8 h-4 shrink-0 rounded-full flex items-center transition-colors border-2 border-[var(--border)] ${isMouse ? 'bg-[var(--primary)]' : 'bg-[var(--bg)]'}`} disabled={!cfg.enabled}>
                                                <div className={`h-2.5 w-2.5 rounded-full bg-text shadow transition-transform duration-200 ${isMouse ? 'translate-x-[16px]' : 'translate-x-[2px]'}`} />
                                            </button>
                                            <span className={`text-[10px] font-bold uppercase tracking-tight ${isMouse ? 'text-[var(--primary)]' : 'text-[var(--muted)]'}`}>Mouse</span>
                                        </div>
                                        <div className="w-7/12">
                                            {!isMouse ? (
                                                <CustomSelect options={COMMON_KEYS} value={cfg.mappedKey || 'None'} onChange={val => updateConfig(cfg.id, { mappedKey: val })} disabled={!cfg.enabled} triggerClassName="!px-2 !py-0.5 !h-[1.75rem] !text-xs !font-bold !rounded-[6px]" direction={index >= 4 ? 'up' : 'down'} onOpenChange={isOpen => setOpenDropdownId(isOpen ? cfg.id : null)} />
                                            ) : (
                                                <CustomSelect options={MOUSE_ACTIONS} value={cfg.mappedMouse || 'None'} onChange={val => updateConfig(cfg.id, { mappedMouse: val })} disabled={!cfg.enabled} triggerClassName="!px-2 !py-0.5 !h-[1.75rem] !text-xs !font-bold !rounded-[6px]" direction={index >= 4 ? 'up' : 'down'} onOpenChange={isOpen => setOpenDropdownId(isOpen ? cfg.id : null)} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Debug Event Log */}
            <div className="flex flex-col h-[400px] shrink-0 overflow-hidden border border-[var(--border)]/50 rounded-xl bg-[var(--bg)]/20 p-3">
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-[var(--border)]/30 shrink-0">
                    <h4 className="text-base font-bold text-[var(--muted)] uppercase tracking-widest flex items-center gap-2">
                        <History size={20} /> System Activity
                    </h4>
                    <button onClick={() => setLogs([])} className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded text-[var(--muted)] transition-colors" title="Clear Logs">
                        <Trash2 size={20} />
                    </button>
                </div>
                <div className="flex-grow overflow-y-auto space-y-1.5 pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[var(--primary)]/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[var(--primary)]/40">
                    {logs.length === 0 ? (
                        <div className="text-base text-[var(--muted)] italic text-center py-2">No activity...</div>
                    ) : (
                        logs.slice().reverse().map(log => (
                            <div key={log.id} className="p-2.5 rounded-xl border border-[var(--border)]/40 bg-[var(--bg)]/40 flex items-center gap-3 transition-colors hover:bg-[var(--bg)]/60 group">
                                <div className="flex flex-col items-center justify-center shrink-0 w-12 border-r border-[var(--border)]/30 pr-2">
                                    {log.type === 'DETECTION' ? <Zap size={18} className="text-[var(--primary)] mb-1" /> : (log.type === 'ERROR' ? <Power size={18} className="text-red-500 mb-1" /> : <Activity size={18} className="text-[var(--muted)]/70 mb-1" />)}
                                    <span className="text-[10px] font-mono text-[var(--muted)]/50 font-bold uppercase tracking-tighter truncate w-full text-center">{log.time}</span>
                                </div>
                                <div className="flex-grow flex items-center">
                                    <span className={`text-[15px] ${log.type === 'ERROR' ? 'text-red-400 font-bold' : (log.type === 'DETECTION' ? 'text-[var(--primary)] font-bold' : 'text-[var(--text)]/80 font-medium')}`}>{log.message}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Sensor Status Indicator at Bottom */}
            <div className="flex items-center justify-between mt-auto pt-4 border-t border-[var(--border)]/30">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">Sensor Integrity</span>
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${isConnected ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}`}>
                   <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                   <span className="text-[9px] font-black tracking-tighter">{isConnected ? 'SECURE' : 'OFFLINE'}</span>
                </div>
            </div>

        </div>
    );
};

export default SSVEPSidebar;
