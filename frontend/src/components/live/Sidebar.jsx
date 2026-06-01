import React, { useState, useRef, useEffect } from 'react';
import {
    ChevronDown, ChevronUp, Minus, Plus, Filter, Zap,
    Waves, Sliders, Cpu, Power, ArrowRightLeft, Check, Play,
    Pause, ListOrdered, Timer, Activity, CheckCircle, Network,
    Radio, Square, Save, Trash2, Brain, Menu, X
} from 'lucide-react';
import ElectricBorder from '../ui/overlays/ElectricBorder';
import CustomSelect from '../ui/inputs/CustomSelect';
import CustomSlider from '../ui/inputs/CustomSlider';
import CustomNumberInput from '../ui/inputs/CustomNumberInput';
import RangeSlider from '../ui/inputs/RangeSlider';
import { soundHandler } from '../../handlers/SoundHandler';

export default function Sidebar({
    config,
    setConfig,
    isPaused,
    setIsPaused,
    onSave,
    mobileMainView,
    setMobileMainView,
    recordState,
    recordHandlers,
    connectionProps,
    className = ''
}) {
    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem('liveSidebarExpanded');
        return saved !== null ? JSON.parse(saved) : true;
    });

    useEffect(() => {
        localStorage.setItem('liveSidebarExpanded', JSON.stringify(isExpanded));
    }, [isExpanded]);

    // Force expanded on mobile settings view
    const effectivelyExpanded = mobileMainView === 'settings' ? true : isExpanded;

    if (!config) return null;

    const handleSensorFilterChange = (sensorType, field, value) => {
        setConfig(prev => ({
            ...prev,
            filters: { ...prev.filters, [sensorType]: { ...prev.filters?.[sensorType], [field]: value } }
        }))
    }

    const handleChannelMapping = (chKey, sensorType) => {
        setConfig(prev => ({
            ...prev,
            channel_mapping: { ...prev.channel_mapping, [chKey]: { ...prev.channel_mapping?.[chKey], sensor: sensorType } }
        }))
    }

    const getSensorTypeForChannel = (chKey) => config.channel_mapping?.[chKey]?.sensor || 'EMG'
    const getFilterConfig = (sensorType) => config.filters?.[sensorType] || {}

    const handleChannelToggle = (chKey, enabled) => {
        const newConfig = {
            ...config,
            channel_mapping: {
                ...config.channel_mapping,
                [chKey]: {
                    ...config.channel_mapping?.[chKey],
                    sensor: config.channel_mapping?.[chKey]?.sensor || 'EMG',
                    enabled: enabled
                }
            }
        }
        setConfig(newConfig)
        if (onSave) onSave(newConfig)
    }

    // --- Condensed Icons View ---
    if (!effectivelyExpanded) {
        return (
            <aside className={`w-[5rem] bg-surface/80 gap-4 pt-5 backdrop-blur-md border-r border-border h-full flex flex-col items-center justify-start transition-all duration-300 z-10 overflow-visible relative ${className}`}>
                <div className="h-[72px] shrink-0 z-10" />

                <button onClick={() => setIsExpanded(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors z-10" title="Expand Sidebar">
                    <Menu size={34} className="text-primary" />
                </button>

                <div className="w-full h-px bg-border/80 mt-2 shrink-0 z-10" />

                <button
                    onClick={() => { soundHandler.playToggle(!isPaused); setIsPaused(!isPaused); }}
                    className={`flex flex-col items-center z-10 hover:bg-white/5 py-1 rounded-xl transition-colors group relative w-[90%] ${isPaused ? 'text-red-500 hover:text-red-600' : 'text-emerald-500 hover:text-emerald-600'}`}
                    title={isPaused ? "Resume Stream" : "Pause Stream"}
                >
                    {isPaused ? <Play size={28} /> : <Pause size={28} />}
                    <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Stream Power</div>
                </button>

                <button
                    onClick={() => setIsExpanded(true)}
                    title="Channel Mapping"
                    className="flex flex-col items-center justify-center w-[90%] py-1 z-10 hover:bg-white/5 hover:text-primary rounded-xl transition-colors group relative text-primary mt-2"
                >
                    <Network size={28} className="mb-0.5" />
                    <span className="text-[12px] font-black tracking-wider opacity-80 group-hover:opacity-100 text-text group-hover:text-primary">
                        {(() => {
                            const c0 = config.channel_mapping?.['ch0']?.enabled !== false;
                            const c1 = config.channel_mapping?.['ch1']?.enabled !== false;
                            if (c0 && c1) return '2CH ON';
                            if (c0) return 'CH0 ON';
                            if (c1) return 'CH1 ON';
                            return 'OFF';
                        })()}
                    </span>
                    <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Manage Channels</div>
                </button>

                <button
                    onClick={() => setIsExpanded(true)}
                    title="Map Sensor"
                    className="flex flex-col items-center justify-center w-[90%] py-1 z-10 hover:bg-white/5 hover:text-primary rounded-xl transition-colors group relative text-primary mt-1"
                >
                    <Radio size={28} className="mb-0.5 mt-1" />
                    <span className="text-[12px] font-black tracking-wider opacity-80 group-hover:opacity-100 text-text group-hover:text-primary">
                        {(() => {
                            const c0 = config.channel_mapping?.['ch0']?.enabled !== false;
                            const c1 = config.channel_mapping?.['ch1']?.enabled !== false;
                            const s0 = config.channel_mapping?.['ch0']?.sensor || 'EMG';
                            const s1 = config.channel_mapping?.['ch1']?.sensor || 'EMG';
                            if (c0 && c1 && s0 !== s1) return 'MIXED';
                            if (c0) return s0;
                            if (c1) return s1;
                            return 'NONE';
                        })()}
                    </span>
                    <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Map Sensors</div>
                </button>

                <div className="w-full h-px bg-border/80 my-1 shrink-0" />

                <div
                    className="flex flex-col items-center justify-center w-[90%] py-1 z-10 hover:bg-white/5 hover:text-primary rounded-xl transition-colors group relative text-primary mt-1 cursor-help"
                >
                    <Filter size={28} className="mb-0.5" />
                    <span className="text-[12px] font-black tracking-wider opacity-80 group-hover:opacity-100 text-text group-hover:text-primary">
                        INFO
                    </span>
                    {/* Unique Info Popup */}
                    <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-surface/95 backdrop-blur-md border border-border p-3 rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)] opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 min-w-[140px] pointer-events-none scale-95 group-hover:scale-100 flex flex-col items-start text-left">
                        <div className="text-[11px] font-black text-text uppercase tracking-widest mb-2 border-b border-border/50 pb-1 w-full flex items-center gap-1.5"><Filter size={12} /> ACTIVE FILTERS</div>
                        {['EMG', 'EEG', 'EOG', 'ECG'].map(sensor => {
                            const f = config.filters?.[sensor];
                            if (!f) return null;
                            const actCh = [0, 1].filter(i => config.channel_mapping?.[`ch${i}`]?.sensor === sensor && config.channel_mapping?.[`ch${i}`]?.enabled !== false);
                            if (actCh.length === 0) return null;
                            return (
                                <div key={sensor} className="mb-2 last:mb-0 w-full">
                                    <div className="text-[10px] font-bold text-primary mb-0.5">{sensor} (CH{actCh.join(', ')})</div>
                                    <div className="flex justify-between gap-3 text-[10px] text-muted w-full"><span>Notch:</span> <span className="font-mono text-text">{f.notch || 'None'}</span></div>
                                    <div className="flex justify-between gap-3 text-[10px] text-muted w-full"><span>Band:</span> <span className="font-mono text-text">{f.bandpass || 'None'}</span></div>
                                </div>
                            )
                        })}
                        <div className="text-[9px] text-muted/50 mt-2 font-black uppercase text-center w-full">Click Menu to Config</div>
                    </div>
                </div>
            </aside>
        )
    }

    // --- Expanded View ---
    return (
        <aside className={`w-80 bg-surface/80 backdrop-blur-md border-r border-border h-full flex flex-col overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] transition-all duration-300 z-10 ${className}`}>
            <div className="h-[94px] shrink-0 hidden md:block" />

            {/* Mobile View Toggle (Close Settings) */}
            {mobileMainView === 'settings' && (
                <div className="p-4 border-b border-border flex justify-between items-center bg-bg sticky top-0 z-10 md:hidden">
                    <h2 className="text-xl font-bold text-text">Settings</h2>
                    <button onClick={() => setMobileMainView('graphs')} className="p-2 border border-border rounded-lg bg-surface text-muted hover:text-text active:scale-95 transition-all">
                        <X size={20} />
                    </button>
                </div>
            )}

            <div className="p-4 border-b border-border flex justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold text-text mb-1 flex items-center gap-3">
                        <Cpu size={32} className="text-primary animate-pulse" />
                        <span style={{ letterSpacing: '2.3px' }}>Controls</span>
                    </h2>
                    <p className="text-base text-muted"> LSL Stream Configuration </p>
                </div>
                {mobileMainView !== 'settings' && (
                    <button onClick={() => setIsExpanded(false)} className="p-2 text-muted hover:text-text transition-colors">
                        <Menu size={24} />
                    </button>
                )}
            </div>

            <div className="p-4 space-y-8">

                {/* UI View Toggles (Mobile Only) */}
                <section className="flex gap-2 lg:hidden">
                    {setMobileMainView && (
                        <button
                            onClick={() => { setMobileMainView(mobileMainView === '3dbrain' ? 'graphs' : '3dbrain'); if (mobileMainView === 'settings') setMobileMainView('3dbrain'); }}
                            className={`flex-1 py-2 rounded-lg font-bold text-sm border flex items-center justify-center gap-2 transition-all ${mobileMainView === '3dbrain' ? 'bg-primary/20 border-primary text-primary' : 'bg-surface border-border text-muted hover:text-text'}`}
                        >
                            <Brain size={16} />
                            3D Brain View
                        </button>
                    )}
                    <button
                        onClick={() => recordHandlers?.setIsFirmwareModalOpen(true)}
                        className="flex-1 py-2 rounded-lg font-bold text-sm border border-border bg-surface text-muted hover:text-text hover:border-primary/50 flex items-center justify-center gap-2 transition-all"
                    >
                        <Cpu size={16} />
                        Firmware
                    </button>
                </section>

                {/* Recording Controls (Mobile Only) */}
                <section className="bg-bg/50 border border-border p-4 rounded-xl space-y-4 lg:hidden">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-bold text-text flex items-center gap-2 uppercase tracking-wider"><Activity size={16} className="text-red-500" /> Recording</h3>
                        {recordState?.isRecording && <span className="text-xs font-mono font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded animate-pulse">{recordState.recordingTime}s</span>}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        {!recordState?.isRecording && !recordState?.isConfirmationPending && (
                            <button
                                onClick={recordHandlers?.startRecording}
                                disabled={recordState?.isSaving || recordState?.recordingChannels?.length === 0}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                            >
                                <Radio size={16} /> REC SESSION
                            </button>
                        )}

                        {recordState?.isRecording && (
                            <>
                                <button
                                    onClick={recordHandlers?.stopRecording}
                                    className="flex-1 py-2.5 bg-surface border border-border hover:border-red-500/50 text-red-400 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all"
                                >
                                    <Square size={16} fill="currentColor" /> STOP
                                </button>
                                <button
                                    onClick={recordHandlers?.togglePauseRecording}
                                    className={`flex-1 py-2.5 bg-surface border rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${recordState.isPausedRecording ? 'border-amber-500/50 text-amber-500' : 'border-border hover:border-amber-500/50 text-muted hover:text-amber-500'}`}
                                >
                                    {recordState.isPausedRecording ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
                                    {recordState.isPausedRecording ? 'RESUME' : 'PAUSE'}
                                </button>
                            </>
                        )}

                        {recordState?.isConfirmationPending && (
                            <div className="w-full flex gap-2">
                                <button
                                    onClick={recordHandlers?.saveRecording}
                                    disabled={recordState?.isSaving}
                                    className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all"
                                >
                                    <Save size={16} /> SAVE
                                </button>
                                <button
                                    onClick={recordHandlers?.discardRecording}
                                    disabled={recordState?.isSaving}
                                    className="flex-1 py-2 bg-surface text-muted hover:text-red-400 hover:bg-red-500/10 border border-border hover:border-red-500/30 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all"
                                >
                                    <Trash2 size={16} /> DISCARD
                                </button>
                            </div>
                        )}
                        {recordState?.isSaving && <div className="w-full text-center text-xs font-bold text-primary mt-2">SAVING SESSION...</div>}
                    </div>

                    {/* Channel Selector for Recording */}
                    <div className="pt-3 border-t border-border/50">
                        <label className="text-xs font-bold text-muted uppercase tracking-wider mb-2 block">Record Channels</label>
                        <div className="flex gap-2">
                            {[0, 1].map(chNum => {
                                const chKey = `ch${chNum}`;
                                const isSelected = recordState?.recordingChannels?.includes(chNum);
                                const sensor = config.channel_mapping?.[chKey]?.sensor || '??';
                                return (
                                    <button
                                        key={chKey}
                                        onClick={() => {
                                            recordHandlers?.setRecordingChannels(prev =>
                                                prev.includes(chNum) ? prev.filter(c => c !== chNum) : [...prev, chNum].sort()
                                            )
                                        }}
                                        className={`flex-1 py-1 rounded text-xs font-bold transition-all border ${isSelected ? 'bg-primary/20 text-primary border-primary/50' : 'bg-bg text-muted border-border hover:border-primary/30 hover:text-text'}`}
                                    >
                                        CH{chNum} ({sensor})
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </section>


                {/* Stream Control */}
                <ElectricBorder
                    color={isPaused ? "#ef4444" : "#10b981"}
                    speed={isPaused ? .5 : 1.1}
                    chaos={isPaused ? .025 : .035}
                    thickness={2}
                    borderRadius={12}
                >
                    <button
                        onClick={() => {
                            soundHandler.playToggle(!isPaused);
                            setIsPaused(!isPaused);
                        }}
                        className={`w-full py-3 font-bold transition-all gap-2 ${isPaused
                            ? 'bg-red-400/5 text-red-400 hover:bg-red-400/10'
                            : 'bg-emerald-400/5 text-emerald-400 hover:bg-emerald-400/10'
                            }`}
                    >
                        <span className='flex flex-row justify-evenly items-center'>
                            {isPaused ? <Play size={20} className="fill-current pulse" style={{ color: "#ef4444" }} /> : <Pause size={20} className="fill-current pulse" style={{ color: "#10b981" }} />}
                            {isPaused
                                ? <span className="text-red-400 hover:text-red-500">STREAM PAUSED</span>
                                : <span className="text-emerald-400 hover:text-emerald-500">STREAMING</span>}
                        </span>
                    </button>
                </ElectricBorder>

                {/* Channel Mapping */}
                <section>
                    <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2"><Network size={16} /> Channel Mapping</h3>

                    {/* Channel 0 */}
                    <div className="mb-3">
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-medium text-text flex items-center gap-1"><Activity size={14} className="text-primary" /> Graph 1</label>
                            <label className={`text-[10px] flex items-center gap-1 cursor-pointer ${config.channel_mapping?.ch0?.enabled !== false ? 'text-primary' : 'text-red-500'}`}>
                                <input
                                    type="checkbox"
                                    checked={config.channel_mapping?.ch0?.enabled !== false}
                                    onChange={(e) => handleChannelToggle('ch0', e.target.checked)}
                                    className="accent-primary hidden"
                                />
                                <Power size={14} className={config.channel_mapping?.ch0?.enabled !== false ? "stroke-2" : ""} />
                                {config.channel_mapping?.ch0?.enabled !== false ? 'ON' : 'OFF'}
                            </label>
                        </div>
                        <SensorSelector
                            value={getSensorTypeForChannel('ch0')}
                            onChange={(val) => handleChannelMapping('ch0', val)}
                            disabled={config.channel_mapping?.ch0?.enabled === false}
                        />
                    </div>

                    {/* Channel 1 */}
                    <div className="mb-4">
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-medium text-text flex items-center gap-1"><Activity size={14} className="text-emerald-500" /> Graph 2</label>
                            <label className={`text-[10px] flex items-center gap-1 cursor-pointer ${config.channel_mapping?.ch1?.enabled !== false ? 'text-primary' : 'text-red-500'}`}>
                                <input
                                    type="checkbox"
                                    checked={config.channel_mapping?.ch1?.enabled !== false}
                                    onChange={(e) => handleChannelToggle('ch1', e.target.checked)}
                                    className="accent-primary hidden"
                                />
                                <Power size={14} className={config.channel_mapping?.ch1?.enabled !== false ? "stroke-2" : ""} />
                                {config.channel_mapping?.ch1?.enabled !== false ? 'ON' : 'OFF'}
                            </label>
                        </div>
                        <SensorSelector
                            value={getSensorTypeForChannel('ch1')}
                            onChange={(val) => handleChannelMapping('ch1', val)}
                            disabled={config.channel_mapping?.ch1?.enabled === false}
                        />
                    </div>

                    <MapButton onSave={onSave} />
                </section>

                {/* SENSOR-BASED FILTERS */}
                <section className="space-y-6">
                    <h3 className="text-sm font-bold text-muted uppercase tracking-wider flex items-center gap-2"><Filter size={16} /> Signal Filters</h3>

                    {/* EMG FILTER */}
                    <FilterSection
                        sensorType="EMG"
                        config={config}
                        filterConfig={getFilterConfig('EMG')}
                        onFilterChange={handleSensorFilterChange}
                        colorClass="text-primary"
                        accentColor="primary"
                        channelsUsingThis={
                            (getSensorTypeForChannel('ch0') === 'EMG' ? ['ch0'] : [])
                                .concat(getSensorTypeForChannel('ch1') === 'EMG' ? ['ch1'] : [])
                        }
                        onSave={onSave}
                    />

                    {/* EOG FILTER */}
                    <FilterSection
                        sensorType="EOG"
                        config={config}
                        filterConfig={getFilterConfig('EOG')}
                        onFilterChange={handleSensorFilterChange}
                        colorClass="text-emerald-500"
                        accentColor="emerald"
                        channelsUsingThis={
                            (getSensorTypeForChannel('ch0') === 'EOG' ? ['ch0'] : [])
                                .concat(getSensorTypeForChannel('ch1') === 'EOG' ? ['ch1'] : [])
                        }
                        onSave={onSave}
                    />

                    {/* EEG FILTER */}
                    <FilterSection
                        sensorType="EEG"
                        config={config}
                        filterConfig={getFilterConfig('EEG')}
                        onFilterChange={handleSensorFilterChange}
                        colorClass="text-orange-500"
                        accentColor="orange"
                        channelsUsingThis={
                            (getSensorTypeForChannel('ch0') === 'EEG' ? ['ch0'] : [])
                                .concat(getSensorTypeForChannel('ch1') === 'EEG' ? ['ch1'] : [])
                        }
                        onSave={onSave}
                    />

                    {/* ECG FILTER */}
                    <FilterSection
                        sensorType="ECG"
                        config={config}
                        filterConfig={getFilterConfig('ECG')}
                        onFilterChange={handleSensorFilterChange}
                        colorClass="text-red-400"
                        accentColor="red"
                        channelsUsingThis={
                            (getSensorTypeForChannel('ch0') === 'ECG' ? ['ch0'] : [])
                                .concat(getSensorTypeForChannel('ch1') === 'ECG' ? ['ch1'] : [])
                        }
                        onSave={onSave}
                    />
                </section>
            </div>

            <div className="h-[30px] shrink-0" />
        </aside>
    )
}

function SensorSelector({ value, onChange, disabled }) {
    return (
        <CustomSelect
            value={value}
            onChange={onChange}
            disabled={disabled}
            options={['EMG', 'EOG', 'EEG', 'ECG']}
            placeholder="Select Sensor"
        />
    );
}

function MapButton({ onSave }) {
    const [status, setStatus] = useState("Map Sensors");

    const handleClick = () => {
        soundHandler.playClick();
        setStatus("Mapping...");
        setTimeout(() => {
            if (onSave) onSave();
            setStatus("Mapped!");
            setTimeout(() => setStatus("Map Sensors"), 2000);
        }, 500);
    };

    return (
        <button
            onClick={handleClick}
            className="w-full py-2 bg-primary text-primary-contrast rounded-lg font-bold text-sm shadow-glow hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
            {status === "Map Sensors" && <ArrowRightLeft size={16} />}
            {status === "Mapping..." && <ArrowRightLeft size={16} className="animate-spin" />}
            {status === "Mapped!" && <CheckCircle size={16} />}
            {status}
        </button>
    )
}

function FilterSection({
    sensorType,
    config,
    filterConfig,
    onFilterChange,
    colorClass,
    accentColor,
    channelsUsingThis,
    onSave
}) {
    if (channelsUsingThis.length === 0) {
        return (
            <div className="space-y-3 p-3 rounded-lg border border-border/30 bg-surface/30 opacity-50">
                <div className="text-xs text-muted italic">
                    No channels using {sensorType}
                </div>
            </div>
        )
    }

    const bgColors = {
        primary: 'bg-primary',
        emerald: 'bg-emerald-500',
        orange: 'bg-orange-500',
        red: 'bg-red-400'
    };
    const buttonBg = bgColors[accentColor] || 'bg-primary';
    const buildUpdatedConfig = (field, value) => ({
        ...config,
        filters: {
            ...config.filters,
            [sensorType]: { ...config.filters?.[sensorType], [field]: value }
        }
    });

    return (
        <div className="space-y-3 p-3 rounded-lg border border-border bg-surface/50">
            <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-3">
                <div>
                    <h4 className={`text-sm font-bold ${colorClass}`}>
                        {sensorType} Filter
                    </h4>
                    <p className="text-xs text-muted mt-0.5">
                        Used by: {channelsUsingThis.map(ch => ch.toUpperCase()).join(', ')}
                    </p>
                </div>
                <button
                    onClick={() => onSave?.()}
                    className={`px-3 py-1 text-xs ${buttonBg} text-white rounded font-bold hover:opacity-90 flex items-center gap-1 shadow-glow active:scale-95 transition-all`}
                >
                    <Check size={12} /> APPLY
                </button>
            </div>

            {filterConfig.type && (
                <div className="text-xs text-muted bg-bg rounded px-2 py-1 inline-block mb-3">
                    Type: <span className="font-bold text-text">{filterConfig.type}</span>
                </div>
            )}

            <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium flex items-center gap-2 cursor-pointer text-text hover:text-text/80 transition-colors">
                    <input
                        type="checkbox"
                        checked={filterConfig.notch_enabled || false}
                        onChange={(e) => {
                            onFilterChange(sensorType, 'notch_enabled', e.target.checked);
                            onSave?.(buildUpdatedConfig('notch_enabled', e.target.checked));
                        }}
                        className="accent-primary hidden"
                    />
                    <Power size={14} className={filterConfig.notch_enabled ? `text-${accentColor}-500` : "text-red-500"} />
                    <Zap size={14} className={filterConfig.notch_enabled ? `text-${accentColor}-500` : "text-muted"} />
                    Notch Filter (Mains)
                </label>
                {filterConfig.notch_enabled && (
                    <div className="flex items-center gap-2">
                        <CustomNumberInput
                            step={0.1}
                            value={filterConfig.notch_freq || 50}
                            onChange={(val) => {
                                onFilterChange(sensorType, 'notch_freq', val);
                                onSave?.(buildUpdatedConfig('notch_freq', val));
                            }}
                            accentColor={accentColor}
                            className="w-[100px] !h-[1.75rem]"
                            unit="Hz"
                        />
                    </div>
                )}
            </div>

            {/* Notch Q Factor */}
            {filterConfig.notch_enabled && (
                <div className="space-y-2 pl-6 mb-2">
                    <label className="text-xs text-muted flex justify-between items-center font-medium">
                        <span className="flex items-center gap-1.5"><Sliders size={12} /> Notch Q Factor</span>
                        <span className={`${colorClass} font-bold text-sm bg-${accentColor}-500/10 px-2 py-0.5 rounded`}>
                            {filterConfig.notch_q || 30}
                        </span>
                    </label>
                    <div className="px-1">
                        <CustomSlider
                            min={5}
                            max={100}
                            step={1}
                            value={filterConfig.notch_q || 30}
                            onChange={(val) => onFilterChange(sensorType, 'notch_q', val)}
                            onFinalChange={(val) => {
                                onSave?.(buildUpdatedConfig('notch_q', val));
                            }}
                            accentColor={accentColor}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted font-mono font-bold px-1">
                        <span>5 (Wide)</span>
                        <span>100 (Narrow)</span>
                    </div>
                </div>
            )}

            <div className="space-y-2 mb-4">
                <label className="text-sm font-medium flex items-center gap-2 cursor-pointer text-text hover:text-text/80 transition-colors">
                    <input
                        type="checkbox"
                        checked={filterConfig.bandpass_enabled || false}
                        onChange={(e) => {
                            onFilterChange(sensorType, 'bandpass_enabled', e.target.checked);
                            onSave?.(buildUpdatedConfig('bandpass_enabled', e.target.checked));
                        }}
                        className="accent-primary hidden"
                    />
                    <Power size={14} className={filterConfig.bandpass_enabled ? `text-${accentColor}-500` : "text-red-500"} />
                    <Waves size={14} className={filterConfig.bandpass_enabled ? `text-${accentColor}-500` : "text-muted"} />
                    Bandpass Filter
                </label>
                {filterConfig.bandpass_enabled && (
                    <div className="flex gap-2 items-center pl-6 pr-2 h-12">
                        {(() => {
                            const ranges = {
                                EMG: { min: 1, max: 300, step: 2 },
                                EEG: { min: 0.5, max: 60, step: 0.5 },
                                EOG: { min: 0.1, max: 20, step: 0.1 },
                                ECG: { min: 0.1, max: 40, step: 0.1 }
                            };
                            const range = ranges[sensorType] || { min: 1, max: 300, step: 1 };

                            return (
                                <RangeSlider
                                    min={range.min}
                                    max={range.max}
                                    step={range.step}
                                    minValue={filterConfig.bandpass_low || range.min}
                                    maxValue={filterConfig.bandpass_high || range.max}
                                    color={
                                        accentColor === 'primary' ? '#3b82f6' :
                                            accentColor === 'emerald' ? '#10b981' :
                                                accentColor === 'orange' ? '#f97316' : '#3b82f6'
                                    }
                                    labelSuffix="Hz"
                                    onChange={({ min, max }) => {
                                        onFilterChange(sensorType, 'bandpass_low', min);
                                        onFilterChange(sensorType, 'bandpass_high', max);
                                    }}
                                    onFinalChange={({ min, max }) => {
                                        if (onSave) {
                                            onSave({
                                                ...config,
                                                filters: {
                                                    ...config.filters,
                                                    [sensorType]: {
                                                        ...config.filters?.[sensorType],
                                                        bandpass_low: min,
                                                        bandpass_high: max
                                                    }
                                                }
                                            });
                                        }
                                    }}
                                />
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* Bandpass Order */}
            {filterConfig.bandpass_enabled && (
                <div className="space-y-2 pt-3 border-t border-border/40">
                    <label className="text-xs text-muted flex justify-between items-center font-medium">
                        <span className="flex items-center gap-1.5"><ListOrdered size={12} /> Bandpass Order</span>
                        <span className={`${colorClass} font-bold text-sm bg-${accentColor}-500/10 px-2 py-0.5 rounded`}>
                            {filterConfig.bandpass_order || 4}
                        </span>
                    </label>
                    <div className="px-1">
                        <CustomSlider
                            min={1}
                            max={8}
                            step={1}
                            value={filterConfig.bandpass_order || 4}
                            onChange={(val) => onFilterChange(sensorType, 'bandpass_order', val)}
                            onFinalChange={(val) => {
                                onSave?.(buildUpdatedConfig('bandpass_order', val));
                            }}
                            accentColor={accentColor}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted font-mono font-bold px-1">
                        <span>1st</span>
                        <span>8th</span>
                    </div>
                </div>
            )}

            {/* EMG Envelope Controls */}
            {sensorType === 'EMG' && filterConfig.envelope_enabled && (
                <div className="space-y-3 pt-3 border-t border-border/40 mt-3">
                    <h5 className={`text-xs font-bold ${colorClass} uppercase tracking-wider flex items-center gap-1.5`}>
                        <Activity size={12} /> Envelope Settings
                    </h5>
                    <div className="space-y-2">
                        <label className="text-xs text-muted flex justify-between items-center font-medium">
                            <span className="flex items-center gap-1.5"><Sliders size={12} /> Envelope Cutoff</span>
                            <span className={`${colorClass} font-bold text-sm bg-${accentColor}-500/10 px-2 py-0.5 rounded`}>
                                {filterConfig.envelope_cutoff || 8} Hz
                            </span>
                        </label>
                        <div className="px-1">
                            <CustomSlider
                                min={1}
                                max={30}
                                step={0.5}
                                value={filterConfig.envelope_cutoff || 8}
                                onChange={(val) => onFilterChange(sensorType, 'envelope_cutoff', val)}
                                onFinalChange={(val) => {
                                    onSave?.(buildUpdatedConfig('envelope_cutoff', val));
                                }}
                                accentColor={accentColor}
                            />
                        </div>
                        <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted font-mono font-bold px-1">
                            <span>1 Hz</span>
                            <span>30 Hz</span>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs text-muted flex justify-between items-center font-medium">
                            <span className="flex items-center gap-1.5"><ListOrdered size={12} /> Envelope Order</span>
                            <span className={`${colorClass} font-bold text-sm bg-${accentColor}-500/10 px-2 py-0.5 rounded`}>
                                {filterConfig.envelope_order || 4}
                            </span>
                        </label>
                        <div className="px-1">
                            <CustomSlider
                                min={1}
                                max={6}
                                step={1}
                                value={filterConfig.envelope_order || 4}
                                onChange={(val) => onFilterChange(sensorType, 'envelope_order', val)}
                                onFinalChange={(val) => {
                                    onSave?.(buildUpdatedConfig('envelope_order', val));
                                }}
                                accentColor={accentColor}
                            />
                        </div>
                        <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted font-mono font-bold px-1">
                            <span>1st</span>
                            <span>6th</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="h-[35px] shrink-0" />
        </div>
    )
}
