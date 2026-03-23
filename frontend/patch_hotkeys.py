file_path = "D:/Neuroscience/BCI/frontend/src/components/views/SettingsView.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. Update Stream Operations
text = text.replace(
    """                  {[
                    { id: 'startStop', label: 'Start / Stop Collection', desc: 'Toggle neural data stream recording', icon: Play },
                    { id: 'appendSample', label: 'Append Sample', desc: 'Add current window to dataset', icon: Plus },
                    { id: 'deleteLatest', label: 'Delete Last Window', desc: 'Remove last appended sample from dataset', icon: Trash2 },
                    { id: 'newSession', label: 'Create New Session', desc: 'Start a fresh tracking document', icon: Edit3 }
                  ].map(({ id, label, desc, icon: Icon }) => {""",
    """                  {[
                    { id: 'startStop', label: 'Start / Stop Collection', desc: 'Toggle neural data stream recording', icon: Play },
                    { id: 'appendSample', label: 'Append Sample', desc: 'Add current window to dataset', icon: Plus },
                    { id: 'deleteLatest', label: 'Delete Last Window', desc: 'Remove last appended sample from dataset', icon: Trash2 },
                    { id: 'deleteAll', label: 'Clear All Windows', desc: 'Delete all samples from dataset', icon: Trash },
                    { id: 'newSession', label: 'Create New Session', desc: 'Start a fresh tracking document', icon: Edit3 }
                  ].map(({ id, label, desc, icon: Icon }) => {"""
)

# 2. Add Diagnostic Toggles Panel below Stream Operations
target = """                      </div>
                    );
                  })}
                </div>
             </div>
          </div>
        )}"""

replacement = """                      </div>
                    );
                  })}
                </div>
             </div>

             <div className="bg-surface/50 border border-border rounded-2xl overflow-hidden shadow-lg mt-2">
                <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-muted flex items-center gap-2">
                    <Activity size={14} className="opacity-70" strokeWidth={1.8} /> Diagnostic Toggles
                  </span>
                </div>
                <div className="p-5 flex flex-col">
                  {[
                    { id: 'toggleAuto', label: 'Toggle Auto Mode', desc: 'Switch ML prediction automation', icon: Power },
                    { id: 'toggleTimeWindow', label: 'Toggle Time Window', desc: 'Change visible stream duration', icon: Clock },
                    { id: 'toggleZoom', label: 'Toggle Zoom Scale', desc: 'Zoom in/out on EEG charts', icon: ZoomIn },
                    { id: 'toggleWinDuration', label: 'Switch Win Duration', desc: 'Alternate window size bounds', icon: ToggleRight },
                    { id: 'changeTarget', label: 'Change Target Label', desc: 'Cycle through ML focus targets', icon: Target },
                    { id: 'limitIncr5', label: 'Increase Limit (+5)', desc: 'Raise threshold bound quickly', icon: ArrowUp },
                    { id: 'limitDecr5', label: 'Decrease Limit (-5)', desc: 'Lower threshold bound quickly', icon: ArrowDown },
                    { id: 'limitIncr1', label: 'Increase Limit (+1)', desc: 'Raise threshold bound slightly', icon: ArrowRight },
                    { id: 'limitDecr1', label: 'Decrease Limit (-1)', desc: 'Lower threshold bound slightly', icon: ArrowLeft }
                  ].map(({ id, label, desc, icon: Icon }) => {
                    const isListening = listeningKeyFor === id;
                    const code = settings.keymap?.collection?.[id];
                    return (
                      <div key={id} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-3">
                           <div className="w-[30px] h-[30px] rounded-lg bg-surface border border-border flex items-center justify-center shrink-0">
                              <Icon size={14} className="text-muted" strokeWidth={1.8} />
                           </div>
                           <div>
                              <div className="text-[14px] font-medium">{label}</div>
                              <div className="text-[12px] text-muted mt-0.5">{desc}</div>
                           </div>
                        </div>
                        <button onClick={() => setListeningKeyFor(isListening ? null : id)} className={`px-2.5 py-1 text-[11px] font-bold font-mono tracking-[0.04em] rounded-md border ${isListening ? 'bg-primary/20 border-primary/40 text-primary animate-pulse shadow-[0_0_8px_rgba(0,200,240,0.3)]' : 'bg-surface border-border-hi text-muted hover:text-text'}`}>
                           {isListening ? 'AWAITING...' : formatKeyCode(code)}
                        </button>
                      </div>
                    );
                  })}
                </div>
             </div>
          </div>
        )}"""

text = text.replace(target, replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("HOTKEYS PATCHED")
