import re

path = 'frontend/src/components/views/SSVEPView.jsx'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update the sidebar to absolute positioning
sidebar_marker = "{/* Right Sidebar */}\n            <div\n                className={`"
sidebar_new = "{/* Right Sidebar */}\n            <div\n                className={`absolute right-0 top-0 bottom-0 z-10 "
if sidebar_marker in code:
    code = code.replace(sidebar_marker, sidebar_new)
else:
    print("Warning: Could not find right sidebar marker.")

# 2. Update the Targets List to include the hide button and toggle mapping
targets_list_start = "{/* Targets List */}"
targets_list_end = "                    </div>\n                </div>\n            </div>\n        </div>\n    );\n}"

idx_start = code.find(targets_list_start)
idx_end = code.find(targets_list_end)

if idx_start != -1 and idx_end != -1:
    targets_code = """{/* Targets List */}
                    <div className="flex flex-col flex-1 min-h-[0] overflow-hidden border border-border/50 rounded-xl bg-bg/10 backdrop-blur-sm">
                        <div className="p-2 border-b border-border/50 bg-bg/30 shrink-0 flex items-center justify-between cursor-pointer hover:bg-bg/40 transition-colors" onClick={() => setShowTargets(!showTargets)}>
                            <h4 className="text-sm font-bold text-muted uppercase tracking-widest">Targets</h4>
                            <div className="flex items-center gap-2">
                                <span className="text-[16px] font-bold text-primary/60">{configs.filter(c => c.enabled).length} ACTIVE</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-muted transition-transform duration-300 ${!showTargets ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
                            </div>
                        </div>
                        <div className="flex flex-col flex-grow overflow-y-auto p-2 gap-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] border-t border-white/5">
                            {!showTargets ? (
                                <div className="space-y-0 mt-1">
                                    {configs.map(cfg => (
                                        <div key={cfg.id} className={`flex items-center justify-between px-2 py-2.5 hover:bg-bg/40 rounded transition-colors group ${!cfg.enabled && 'grayscale opacity-50'}`}>
                                            <div className="flex items-center gap-2 overflow-hidden flex-grow">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); updateConfig(cfg.id, { enabled: !cfg.enabled }) }}
                                                    className={`p-1 rounded transition-all shrink-0 ${cfg.enabled ? 'text-primary' : 'text-muted hover:text-primary'}`}
                                                    title={cfg.enabled ? "Disable Target" : "Enable Target"}
                                                >
                                                    <Power size={14} />
                                                </button>
                                                <span className="text-sm font-bold truncate text-muted group-hover:text-text transition-colors">{cfg.label}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 justify-center shrink-0">
                                                <Activity size={12} className="text-primary/70" />
                                                <span className="text-[12px] font-black text-primary font-mono">{cfg.freq}Hz</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                configs.map((cfg) => {
                                    const isMouse = cfg.controlType === 'Mouse';
                                    return (
                                        <div key={cfg.id} className={`p-3 rounded-xl border transition-all space-y-2 shrink-0 ${cfg.enabled ? 'bg-bg/50 border-border' : 'bg-bg/20 border-border/30 grayscale opacity-60'}`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 overflow-hidden flex-grow">
                                                    <button
                                                        onClick={() => updateConfig(cfg.id, { enabled: !cfg.enabled })}
                                                        className={`p-1.5 rounded-lg transition-all shrink-0 ${cfg.enabled ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-bg border border-border text-muted hover:border-primary/50'}`}
                                                        title={cfg.enabled ? "Disable Target" : "Enable Target"}
                                                    >
                                                        <Power size={16} />
                                                    </button>
                                                    <input
                                                        className="bg-transparent font-bold text-lg outline-none focus:text-primary transition-colors w-full"
                                                        value={cfg.label}
                                                        onChange={(e) => updateConfig(cfg.id, { label: e.target.value })}
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <input
                                                        type="number"
                                                        value={cfg.freq}
                                                        onChange={(e) => updateConfig(cfg.id, { freq: parseFloat(e.target.value) || 0 })}
                                                        className="w-16 bg-bg border border-border rounded px-2 py-0.5 text-center text-primary font-bold focus:border-primary/50 outline-none text-base"
                                                    />
                                                    <span className="text-sm text-muted">Hz</span>
                                                </div>
                                            </div>

                                            {/* Mapping Controls */}
                                            <div className="flex bg-bg/50 p-1 rounded-lg">
                                                <button
                                                    onClick={() => updateConfig(cfg.id, { controlType: 'Keyboard' })}
                                                    className={`flex-1 py-1 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 ${!isMouse ? 'bg-primary/20 text-primary shadow-sm' : 'text-muted hover:bg-bg/80'}`}
                                                >
                                                    <Keyboard size={12} /> Key
                                                </button>
                                                <button
                                                    onClick={() => updateConfig(cfg.id, { controlType: 'Mouse' })}
                                                    className={`flex-1 py-1 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 ${isMouse ? 'bg-primary/20 text-primary shadow-sm' : 'text-muted hover:bg-bg/80'}`}
                                                >
                                                    <MousePointer2 size={12} /> Mouse
                                                </button>
                                            </div>

                                            {!isMouse ? (
                                                <select
                                                    className="w-full bg-bg border border-border rounded px-2 py-1.5 text-sm font-medium outline-none focus:border-primary/50"
                                                    value={cfg.mappedKey || 'None'}
                                                    onChange={(e) => updateConfig(cfg.id, { mappedKey: e.target.value })}
                                                    disabled={!cfg.enabled}
                                                >
                                                    <option value="None">Unmapped</option>
                                                    {COMMON_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                                                </select>
                                            ) : (
                                                <select
                                                    className="w-full bg-bg border border-border rounded px-2 py-1.5 text-sm font-medium outline-none focus:border-primary/50"
                                                    value={cfg.mappedMouse || 'None'}
                                                    onChange={(e) => updateConfig(cfg.id, { mappedMouse: e.target.value })}
                                                    disabled={!cfg.enabled}
                                                >
                                                    <option value="None">Unmapped</option>
                                                    {MOUSE_ACTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                            )}
                                        </div>
                                    )
                                })
                            )}
"""
    code = code[:idx_start] + targets_code + "\n" + targets_list_end
else:
    print("Warning: Could not find targets list markers.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated SSVEPView.jsx successfully!")
