import React, { useState, useRef, useEffect } from 'react';
import {
    ChevronDown, ChevronUp, Minus, Plus, Filter, Zap,
    Waves, Sliders, Cpu, Power, ArrowRightLeft, Check, Play,
    Pause, ListOrdered, Timer, Activity, CheckCircle, Network,
    ChevronLeft, ChevronRight, Menu, Square
} from 'lucide-react';
import ElectricBorder from './ElectricBorder';
import CustomSelect from './CustomSelect';
import ElasticSlider from './ElasticSlider';
import { soundHandler } from '../../handlers/SoundHandler';
export default function Sidebar({
    config,
    setConfig,
    isPaused,
    setIsPaused,
    onSave,
    className = '',
    isCollapsed = false,
    onToggle
}) {
    // Safety check to prevent crash if config is not yet loaded
    if (!config) return null;
    const handleSensorFilterChange = (sensorType, field, value) => {
        setConfig(prev => ({
            ...prev,
            filters: {
                ...prev.filters,
                [sensorType]: {
                    ...prev.filters?.[sensorType],
                    [field]: value
                }
            }
        }))
    }

    const handleChannelMapping = (chKey, sensorType) => {
        setConfig(prev => ({
            ...prev,
            channel_mapping: {
                ...prev.channel_mapping,
                [chKey]: {
                    ...prev.channel_mapping?.[chKey],
                    sensor: sensorType
                }
            }
        }))
    }

    /*
    * Get the sensor type for a given channel
    * E.g., getSensorTypeForChannel('ch0') returns 'EMG'
    */
    const getSensorTypeForChannel = (chKey) => {
        return config.channel_mapping?.[chKey]?.sensor || 'EMG'
    }

    /*
     * Get filter config for a sensor type
     * E.g., getFilterConfig('EMG') returns the EMG filter settings
     */
    const getFilterConfig = (sensorType) => {
        return config.filters?.[sensorType] || {}
    }

    const handleChannelToggle = (chKey, enabled) => {
        // Calculate new config based on current prop to avoid stale state issues
        const newConfig = {
            ...config,
            channel_mapping: {
                ...config.channel_mapping,
                [chKey]: {
                    // Start with existing properties
                    ...config.channel_mapping?.[chKey],
                    // Explicitly preserve sensor (or default to current getter value if missing)
                    // This ensures "sensor" key exists in the config even if it was implicit before
                    sensor: config.channel_mapping?.[chKey]?.sensor || 'EMG',
                    enabled: enabled
                }
            }
        }

        setConfig(newConfig)

        // Auto-save the change immediately
        if (onSave) {
            onSave(newConfig)
        }
    }

    return (
        <aside className={`
            ${isCollapsed ? 'w-[4.5rem] overflow-visible' : 'w-80 overflow-y-auto overflow-x-hidden'} 
            bg-surface/80 backdrop-blur-md border-r border-border h-full flex flex-col transition-all duration-300 ease-in-out
            [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] 
            ${className}
        `}>
            <div className="h-[94px] shrink-0" />

            <div className={`p-4 border-b border-border flex items-center justify-between ${isCollapsed ? 'flex-col gap-4' : ''}`}>
                {!isCollapsed ? (
                    <>
                        <div>
                            <h2 className="text-3xl font-bold text-text mb-1 flex items-center gap-3">
                                <Cpu size={32} className="text-primary animate-pulse" />
                                <span style={{ letterSpacing: '2.3px' }}>Controls</span>
                            </h2>
                            <p className="text-base text-muted">LSL Stream Configuration</p>
                        </div>
                        <button
                            onClick={onToggle}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            title="Collapse Sidebar"
                        >
                            <ChevronLeft size={24} />
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={onToggle}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors mb-2"
                            title="Expand Sidebar"
                        >
                            <Menu size={24} className="text-primary" />
                        </button>
                        <div className="flex flex-col items-center gap-8 mt-4">
                            <Cpu size={24} className="text-primary animate-pulse" title="Controls" />
                            <button onClick={onToggle} title="Channel Mapping" className="hover:text-primary transition-colors group relative">
                                <Network size={20} className="text-muted group-hover:text-primary" />
                                <div className="absolute left-14 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Channel Mapping</div>
                            </button>
                            <button onClick={onToggle} title="Signal Filters" className="hover:text-primary transition-colors group relative">
                                <Filter size={20} className="text-muted group-hover:text-primary" />
                                <div className="absolute left-14 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Signal Filters</div>
                            </button>
                            <div className="w-px h-8 bg-border" />
                        </div>
                    </>
                )}
            </div>

            <div className={`p-4 space-y-8 ${isCollapsed ? 'items-center flex flex-col px-0' : ''}`}>

                {!isCollapsed && (
                    <>
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

                                className={`w-full py-3 font-bold transition-all flex items-center justify-center gap-2 ${isPaused
                                    ? 'bg-accent/10 text-accent hover:bg-accent/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                                    : 'bg-primary/10 text-primary hover:bg-primary/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                                    } rounded-lg`}
                            >
                                {isPaused ? <Play size={20} className="fill-current pulse" style={{ color: "#ef4444" }} /> : <Pause size={20} className="fill-current pulse" style={{ color: "#10b981" }} />}
                                {isPaused
                                    ? <span className="text-red-400">STREAM PAUSED</span>
                                    : <span className="text-emerald-400">STREAMING</span>}
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

                        {/* SENSOR-BASED FILTERS (Not Channel-Based) */}
                        <section className="space-y-6">
                            <h3 className="text-sm font-bold text-muted uppercase tracking-wider flex items-center gap-2"><Filter size={16} /> Signal Filters</h3>

                            {/* EMG FILTER (applies to all EMG channels) */}
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

                            {/* EOG FILTER (applies to all EOG channels) */}
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

                            {/* EEG FILTER (applies to all EEG channels) */}
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
                    </>
                )}
            </div>

            <div className="h-[30px] shrink-0" />
        </aside >
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
        // Simulate delay or wait for onSave
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

/**
 * FilterSection Component
 * 
 * Renders filter controls for a SENSOR TYPE (EMG, EOG, or EEG)
 * 
 * KEY CHANGE: This section appears ONCE per sensor type
 * If multiple channels use the same sensor, they share this config
 * 
 * Example:
 *   - ch0 = EMG
 *   - ch1 = EMG
 *   - → Only ONE "EMG Filter" section appears
 *   - → All EMG channels use this config
 */
function FilterSection({
    sensorType,
    filterConfig,
    onFilterChange,
    colorClass,
    accentColor,
    channelsUsingThis,
    onSave
}) {
    // If no channels use this sensor, don't render it
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
            {/* Header: Sensor Type + Which Channels Use It */}
            <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-2">
                <div>
                    <h4 className={`text-xs font-bold ${colorClass}`}>
                        {sensorType} Filter
                    </h4>
                    <p className="text-[10px] text-muted mt-0.5">
                        Used by: {channelsUsingThis.map(ch => ch.toUpperCase()).join(', ')}
                    </p>
                </div>
                <button
                    onClick={() => onSave?.()}
                    className={`px-2 py-0.5 text-[10px] ${buttonBg} text-white rounded font-bold hover:opacity-90 flex items-center gap-1`}
                >
                    <Check size={10} /> APPLY
                </button>
            </div>

            {/* Filter Type - shows which kind of filter this sensor uses */}
            {filterConfig.type && (
                <div className="text-[10px] text-muted bg-bg rounded px-2 py-1 inline-block mb-2">
                    Type: <span className="font-bold text-text">{filterConfig.type}</span>
                </div>
            )}

            {/* NOTCH FILTER (for 50/60Hz mains interference) */}
            <div className="flex items-center justify-between">
                <label className="text-xs flex items-center gap-2 cursor-pointer text-text hover:text-text/80 transition-colors">
                    <input
                        type="checkbox"
                        checked={filterConfig.notch_enabled || false}
                        onChange={(e) => onFilterChange(sensorType, 'notch_enabled', e.target.checked)}
                        className="accent-primary hidden"
                    />
                    <Power size={12} className={filterConfig.notch_enabled ? `text-${accentColor}-500` : "text-red-500"} />
                    <Zap size={12} className={filterConfig.notch_enabled ? `text-${accentColor}-500` : "text-muted"} />
                    Notch Filter (Mains)
                </label>
                {filterConfig.notch_enabled && (
                    <div className="flex items-center gap-1">
                        <input
                            type="number"
                            step="0.1"
                            className="w-16 bg-bg border border-border rounded px-1 py-0.5 text-xs text-right"
                            value={filterConfig.notch_freq || 50}
                            onChange={(e) => onFilterChange(sensorType, 'notch_freq', Number(e.target.value))}
                        />
                        <span className="text-[10px] text-muted">Hz</span>
                    </div>
                )}
            </div>

            {/* BANDPASS FILTER */}
            <div className="space-y-1">
                <label className="text-xs flex items-center gap-2 cursor-pointer text-text hover:text-text/80 transition-colors">
                    <input
                        type="checkbox"
                        checked={filterConfig.bandpass_enabled || false}
                        onChange={(e) => onFilterChange(sensorType, 'bandpass_enabled', e.target.checked)}
                        className="accent-primary hidden"
                    />
                    <Power size={12} className={filterConfig.bandpass_enabled ? `text-${accentColor}-500` : "text-red-500"} />
                    <Waves size={12} className={filterConfig.bandpass_enabled ? `text-${accentColor}-500` : "text-muted"} />
                    Bandpass Filter
                </label>
                {filterConfig.bandpass_enabled && (
                    <div className="flex gap-2 items-center pl-5">
                        <input
                            type="number"
                            step="0.1"
                            className="w-14 bg-bg border border-border rounded px-1 py-0.5 text-xs"
                            value={filterConfig.bandpass_low || 1}
                            onChange={(e) => onFilterChange(sensorType, 'bandpass_low', Number(e.target.value))}
                        />
                        <span className="text-[10px] text-muted">-</span>
                        <input
                            type="number"
                            step="0.1"
                            className="w-14 bg-bg border border-border rounded px-1 py-0.5 text-xs"
                            value={filterConfig.bandpass_high || 100}
                            onChange={(e) => onFilterChange(sensorType, 'bandpass_high', Number(e.target.value))}
                        />
                        <span className="text-[10px] text-muted">Hz</span>
                    </div>
                )}
            </div>

            {/* HIGH-PASS FILTER CUTOFF */}
            <div className="space-y-1 pt-2 border-t border-border/30">
                <label className="text-[10px] text-muted flex justify-between items-center mb-1">
                    <span className="flex items-center gap-1"><Sliders size={10} /> High-Pass Cutoff</span>
                    <span className={colorClass} style={{ fontWeight: 'bold' }}>
                        {filterConfig.cutoff || 1} Hz
                    </span>
                </label>
                <div className="px-1">
                    <ElasticSlider
                        defaultValue={filterConfig.cutoff || 1}
                        startingValue={0.1}
                        maxValue={200}
                        stepSize={0.1}
                        onChange={(val) => onFilterChange(sensorType, 'cutoff', val)}
                        leftIcon={<Minus size={12} className="text-muted" />}
                        rightIcon={<Plus size={12} className="text-muted" />}
                        className="h-6"
                    />
                </div>
            </div>

            {/* FILTER ORDER */}
            {filterConfig.order && (
                <div className="space-y-1 pt-2 border-t border-border/30">
                    <label className="text-[10px] text-muted flex justify-between mb-1">
                        <span className="flex items-center gap-1"><ListOrdered size={10} /> Filter Order</span>
                        <span className={colorClass} style={{ fontWeight: 'bold' }}>
                            {filterConfig.order}
                        </span>
                    </label>
                    <div className="px-1">
                        <ElasticSlider
                            defaultValue={filterConfig.order || 4}
                            startingValue={1}
                            maxValue={8}
                            stepSize={1}
                            isStepped={true}
                            onChange={(val) => onFilterChange(sensorType, 'order', val)}
                            leftIcon={<Minus size={12} className="text-muted" />}
                            rightIcon={<Plus size={12} className="text-muted" />}
                            className="h-6"
                        />
                    </div>
                </div>
            )}
            <div className="h-[35px] shrink-0" />
        </div>
    )
}
