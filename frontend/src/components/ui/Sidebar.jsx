import React, { useState, useRef, useEffect } from 'react';
import {
    ChevronDown, ChevronUp, Minus, Plus, Filter, Zap,
    Waves, Sliders, Cpu, Power, ArrowRightLeft, Check, Play,
    Pause, ListOrdered, Timer, Activity, CheckCircle, Network,
    Radio, Square, Save, Trash2, Brain, Menu, X
} from 'lucide-react';
import ElectricBorder from './ElectricBorder';
import CustomSelect from './CustomSelect';
import CustomRangeSlider from './CustomRangeSlider';
import CustomNumberInput from './CustomNumberInput';
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
            <aside className={`w-[4.5rem] bg-surface/80 backdrop-blur-md border-r border-border h-full flex flex-col items-center py-4 space-y-6 transition-all duration-300 z-10 overflow-hidden ${className}`}>
                {/* Header spacer to dodge absolute logos etc */}
                <div className="h-[94px] shrink-0" />

                <button onClick={() => setIsExpanded(true)} className="p-2 rounded-xl text-muted hover:text-text hover:bg-bg/50 transition-colors">
                    <Menu size={24} />
                </button>

                <div className="w-8 h-px bg-border/50" />

                {/* Stream Power (Hidden on Desktop since it's implied or in topbar? Wait, Top Bar doesn't have Stream Pause) */}
                <button
                    onClick={() => { soundHandler.playToggle(!isPaused); setIsPaused(!isPaused); }}
                    className={`p-3 rounded-2xl transition-all shadow-lg ${isPaused ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'}`}
                    title={isPaused ? "Resume Stream" : "Pause Stream"}
                >
                    {isPaused ? <Play size={20} className="fill-current" /> : <Pause size={20} className="fill-current" />}
                </button>

                {/* Rec Ops */}
                <button
                    onClick={() => recordState?.isRecording ? recordHandlers?.stopRecording() : recordHandlers?.startRecording()}
                    className={`lg:hidden p-3 rounded-2xl transition-all shadow-lg ${recordState?.isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-surface border border-border text-muted hover:text-text hover:border-primary/50'}`}
                    title={recordState?.isRecording ? "Stop Recording" : "Start Recording"}
                >
                    {recordState?.isRecording ? <Square size={20} fill="currentColor" /> : <Radio size={20} />}
                </button>

                {recordState?.isConfirmationPending && (
                    <button onClick={recordHandlers?.saveRecording} className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 transition-all shadow-lg" title="Save Recording">
                        <Save size={20} />
                    </button>
                )}

                <div className="w-8 h-px bg-border/50" />

                <button onClick={() => setMobileMainView && setMobileMainView(mobileMainView === '3dbrain' ? 'graphs' : '3dbrain')} className={`p-3 rounded-2xl transition-all shadow-lg lg:hidden ${mobileMainView === '3dbrain' ? 'bg-primary/20 text-primary border border-primary/50' : 'bg-surface border border-border text-muted hover:text-text hover:border-primary/50'}`} title="Toggle 3D Brain">
                    <Brain size={20} />
                </button>

                {/* Shrunk Sidebar Channel Toggles */}
                <div className="flex flex-col gap-4 items-center w-full px-2 lg:flex">
                    {[0, 1].map(chIdx => {
                        const chKey = `ch${chIdx}`;
                        const isEnabled = config.channel_mapping?.[chKey]?.enabled !== false;
                        const currentSensor = config.channel_mapping?.[chKey]?.sensor || 'EMG';
                        const SENSORS = ['EMG', 'EEG', 'EOG', 'ECG', 'DATA'];

                        const cycleSensor = () => {
                            const currentIndex = SENSORS.indexOf(currentSensor);
                            const nextSensor = SENSORS[(currentIndex + 1) % SENSORS.length];
                            handleChannelMapping(chKey, nextSensor);
                        };

                        return (
                            <div key={chKey} className={`flex flex-col items-center w-full rounded-2xl border transition-all shadow-lg overflow-hidden group ${isEnabled ? 'bg-primary/10 border-primary/50 text-primary' : 'bg-surface border-border text-muted'}`}>
                                <button
                                    onClick={() => handleChannelToggle(chKey, !isEnabled)}
                                    className="py-2.5 w-full flex items-center justify-center hover:bg-bg/50 transition-colors relative"
                                    title={isEnabled ? `Disable CH${chIdx}` : `Enable CH${chIdx}`}
                                >
                                    <span className="text-sm font-bold font-mono tracking-tighter">CH{chIdx}</span>
                                    <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Toggle CH{chIdx}</div>
                                </button>
                                <button
                                    onClick={cycleSensor}
                                    className="py-1 w-full bg-bg/50 border-t border-border flex items-center justify-center text-[10px] font-bold hover:text-text hover:bg-bg transition-colors"
                                    title="Click to cycle sensor type"
                                >
                                    {currentSensor}
                                </button>
                            </div>
                        )
                    })}
                </div>

                <div className="flex-1" />

                <button onClick={() => setIsExpanded(true)} className="p-3 mb-4 rounded-2xl bg-surface border border-border text-muted hover:text-text hover:border-primary/50 transition-all shadow-lg" title="Filters & Mapping">
                    <Filter size={20} />
                </button>
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
            options={['EMG', 'EOG', 'EEG']}
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
        orange: 'bg-orange-500'
    };
    const buttonBg = bgColors[accentColor] || 'bg-primary';

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
                        onChange={(e) => onFilterChange(sensorType, 'notch_enabled', e.target.checked)}
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
                            onChange={(val) => onFilterChange(sensorType, 'notch_freq', val)}
                            accentColor={accentColor}
                            className="w-[100px] !h-[1.75rem]"
                            unit="Hz"
                        />
                    </div>
                )}
            </div>

            <div className="space-y-2 mb-4">
                <label className="text-sm font-medium flex items-center gap-2 cursor-pointer text-text hover:text-text/80 transition-colors">
                    <input
                        type="checkbox"
                        checked={filterConfig.bandpass_enabled || false}
                        onChange={(e) => onFilterChange(sensorType, 'bandpass_enabled', e.target.checked)}
                        className="accent-primary hidden"
                    />
                    <Power size={14} className={filterConfig.bandpass_enabled ? `text-${accentColor}-500` : "text-red-500"} />
                    <Waves size={14} className={filterConfig.bandpass_enabled ? `text-${accentColor}-500` : "text-muted"} />
                    Bandpass Filter
                </label>
                {filterConfig.bandpass_enabled && (
                    <div className="flex gap-2 items-center pl-6">
                        <CustomNumberInput
                            step={0.1}
                            value={filterConfig.bandpass_low || 1}
                            onChange={(val) => onFilterChange(sensorType, 'bandpass_low', val)}
                            accentColor={accentColor}
                            className="w-[80px]"
                        />
                        <span className="text-xs text-muted font-bold">-</span>
                        <CustomNumberInput
                            step={0.1}
                            value={filterConfig.bandpass_high || 100}
                            onChange={(val) => onFilterChange(sensorType, 'bandpass_high', val)}
                            accentColor={accentColor}
                            className="w-[100px]"
                            unit="Hz"
                        />
                    </div>
                )}
            </div>

            <div className="space-y-2 pt-3 border-t border-border/40">
                <label className="text-xs text-muted flex justify-between items-center font-medium">
                    <span className="flex items-center gap-1.5"><Sliders size={12} /> High-Pass Cutoff</span>
                    <span className={`${colorClass} font-bold text-sm bg-${accentColor}-500/10 px-2 py-0.5 rounded`}>
                        {filterConfig.cutoff || 1} Hz
                    </span>
                </label>
                <div className="px-1">
                    <CustomRangeSlider
                        min={0.1}
                        max={200}
                        step={0.1}
                        value={filterConfig.cutoff || 1}
                        onChange={(val) => onFilterChange(sensorType, 'cutoff', val)}
                        accentColor={accentColor}
                    />
                </div>
                <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted font-mono font-bold px-1">
                    <span>0.1 Hz</span>
                    <span>200 Hz</span>
                </div>
            </div>

            {filterConfig.order && (
                <div className="space-y-2 pt-3 border-t border-border/40 mt-3">
                    <label className="text-xs text-muted flex justify-between items-center font-medium">
                        <span className="flex items-center gap-1.5"><ListOrdered size={12} /> Filter Order</span>
                        <span className={`${colorClass} font-bold text-sm bg-${accentColor}-500/10 px-2 py-0.5 rounded`}>
                            {filterConfig.order}
                        </span>
                    </label>
                    <div className="px-1">
                        <CustomRangeSlider
                            min={1}
                            max={8}
                            step={1}
                            value={filterConfig.order || 4}
                            onChange={(val) => onFilterChange(sensorType, 'order', val)}
                            accentColor={accentColor}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted font-mono font-bold px-1">
                        <span>1st</span>
                        <span>8th</span>
                    </div>
                </div>
            )}
            <div className="h-[35px] shrink-0" />
        </div>
    )
}
