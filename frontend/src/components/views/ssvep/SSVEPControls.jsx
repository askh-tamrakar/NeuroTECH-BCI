import React from 'react';
import { Settings, Play, Square, Activity, MousePointer2, Keyboard, Sun, Monitor, Power, Zap } from 'lucide-react';

const COMMON_KEYS = ['W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape'];
const MOUSE_ACTIONS = ['Left Click', 'Right Click', 'Double Click'];

export default function SSVEPControls({
    configs,
    updateConfig,
    brightness,
    setBrightness,
    refreshRate,
    setRefreshRate,
    globalRunning,
    startFlicker,
    stopFlicker,
    runProtocol
}) {
    return (
        <div className="flex flex-col gap-6 font-mono">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                    <Settings size={20} /> SSVEP SETUP
                </h3>
                <div className={`w-3 h-3 rounded-full animate-pulse ${globalRunning ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'}`} />
            </div>

            {/* Global Actions */}
            <div className="grid grid-cols-1 gap-4">
                <button
                    onClick={globalRunning ? stopFlicker : startFlicker}
                    className={`w-full py-3 rounded-xl font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2 ${globalRunning
                            ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20'
                            : 'bg-green-500/10 border-green-500/50 text-green-500 hover:bg-green-500/20 shadow-glow'
                        }`}
                >
                    {globalRunning ? <><Square size={18} /> Stop Simulation</> : <><Play size={18} /> Start Simulation</>}
                </button>

                {!globalRunning && (
                    <button
                        onClick={runProtocol}
                        className="w-full py-2 bg-primary/10 border-2 border-primary/50 text-primary rounded-xl font-bold uppercase tracking-widest hover:bg-primary/20 transition-all flex items-center justify-center gap-2"
                    >
                        <Zap size={18} /> Run Automated Protocol
                    </button>
                )}
            </div>

            {/* Target Settings */}
            <div className="space-y-4">
                <h4 className="text-xs font-bold text-muted uppercase tracking-widest border-b border-border pb-1">Targets</h4>
                {configs.map((cfg) => (
                    <div key={cfg.id} className={`p-4 rounded-xl border transition-all space-y-3 ${cfg.enabled ? 'bg-bg/50 border-border' : 'bg-bg/20 border-border/30 grayscale opacity-60'}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 overflow-hidden flex-grow">
                                <button
                                    onClick={() => updateConfig(cfg.id, { enabled: !cfg.enabled })}
                                    className={`p-1.5 rounded-lg transition-all shrink-0 ${cfg.enabled ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-bg border border-border text-muted hover:border-primary/50'}`}
                                    title={cfg.enabled ? "Disable Target" : "Enable Target"}
                                >
                                    <Power size={12} />
                                </button>
                                <input
                                    className="bg-transparent font-bold text-sm outline-none focus:text-primary transition-colors w-full"
                                    value={cfg.label}
                                    onChange={(e) => updateConfig(cfg.id, { label: e.target.value })}
                                />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <input
                                    type="number"
                                    value={cfg.freq}
                                    onChange={(e) => updateConfig(cfg.id, { freq: parseFloat(e.target.value) || 0 })}
                                    className="w-16 bg-bg border border-border rounded px-2 py-1 text-center text-primary font-bold focus:border-primary/50 outline-none"
                                />
                                <span className="text-[10px] text-muted">Hz</span>
                            </div>
                        </div>

                        {/* Mapping Selection */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase text-muted flex items-center gap-1"><Keyboard size={10} /> Key</label>
                                <select
                                    className="w-full bg-bg border border-border rounded px-1 py-1 text-[10px] outline-none focus:border-primary/50"
                                    value={cfg.mappedKey || 'None'}
                                    onChange={(e) => updateConfig(cfg.id, { mappedKey: e.target.value })}
                                >
                                    <option value="None">None</option>
                                    {COMMON_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase text-muted flex items-center gap-1"><MousePointer2 size={10} /> Mouse</label>
                                <select
                                    className="w-full bg-bg border border-border rounded px-1 py-1 text-[10px] outline-none focus:border-primary/50"
                                    value={cfg.mappedMouse || 'None'}
                                    onChange={(e) => updateConfig(cfg.id, { mappedMouse: e.target.value })}
                                >
                                    <option value="None">None</option>
                                    {MOUSE_ACTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Config Settings */}
            <div className="space-y-4 pt-4 border-t border-border">
                <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-muted uppercase tracking-widest">
                            <span className="flex items-center gap-2"><Sun size={14} /> Brightness</span>
                            <span className="text-primary">{Math.round(brightness * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.05"
                            value={brightness}
                            onChange={(e) => setBrightness(parseFloat(e.target.value))}
                            className="w-full accent-primary h-1 bg-bg rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-muted uppercase tracking-widest flex items-center gap-2">
                            <Monitor size={14} /> Refresh Rate
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={refreshRate}
                                onChange={(e) => setRefreshRate(parseInt(e.target.value) || 60)}
                                className="w-16 bg-bg border border-border rounded px-2 py-1 text-center font-bold text-primary focus:border-primary/50 outline-none"
                            />
                            <span className="text-[10px] text-muted">FPS</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
