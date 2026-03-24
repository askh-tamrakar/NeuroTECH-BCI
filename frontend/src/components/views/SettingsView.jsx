import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  Settings,
  Palette,
  Globe,
  Database,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Copy,
  Keyboard,
  Edit3,
  Play,
  StopCircle,
  Minus,
  Trash,
  ZoomIn,
  ZoomOut,
  Target,
  Clock,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ArrowLeft,
  Power,
  ToggleRight,
  Menu,
  ChevronLeft,
  Activity,
  UserPlus
} from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { soundHandler } from '../../handlers/SoundHandler'
import { Music, Volume2, Upload, VolumeX } from 'lucide-react'
import { audioStorage } from '../../utils/AudioStorage'

// Helper for color inputs
const ColorInput = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between p-3 bg-bg/50 rounded-xl border border-border/50">
    <label className="text-sm font-medium text-text">{label}</label>
    <div className="flex items-center gap-3">
      <span className="text-xs font-mono text-muted uppercase">{value}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded-lg overflow-hidden cursor-pointer border-none p-0 bg-transparent"
        title={`Change ${label}`}
      />
    </div>
  </div>
);

export default function SettingsView({ latency = 0, localWs = '', setLocalWs = () => {}, ngrokWs = '', setNgrokWs = () => {}, connect = () => {} }) {
  const {
    themes,
    currentTheme,
    currentThemeId,
    setTheme,
    addTheme,
    updateTheme,
    updateThemeColor,
    removeTheme,
    resetThemes
  } = useTheme()

  const { user, logout } = useAuth()

  const { settings, updateDeepSettings } = useSettings()

  // Local settings state
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('api_url') || 'http://localhost:8000')
  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem('ws_url') || 'ws://localhost:1972')
  const [useMock, setUseMock] = useState(() => localStorage.getItem('use_mock') === 'true')
  const [activeSection, setActiveSection] = useState('account');

  // Editor state
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');

  // Keybinding state
  const [listeningKeyFor, setListeningKeyFor] = useState(null);

  // Telemetry state
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animFrame;
    const calcFps = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        const delta = now - lastTime;
        setFps(delta > 0 ? Math.round((frameCount * 1000) / delta) : 0);
        frameCount = 0;
        lastTime = now;
      }
      animFrame = requestAnimationFrame(calcFps);
    };
    animFrame = requestAnimationFrame(calcFps);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  const formatKeyCode = (code) => {
    if (!code) return '???';
    let display = code;
    if (display === 'Space') return 'SPACEBAR';
    if (display === 'Enter') return '↩ ENTER';
    if (display === 'NumpadEnter') return '⌗ NUM ENTER';
    if (display === 'NumpadDecimal') return 'NUM . (DEL)';
    if (display.startsWith('Numpad')) return display.replace('Numpad', 'NUM ');
    if (display === 'ShiftLeft') return 'L-SHIFT';
    if (display === 'ShiftRight') return 'R-SHIFT';
    if (display === 'ControlRight') return 'R-CTRL';
    if (display === 'ControlLeft') return 'L-CTRL';
    if (display === 'AltRight') return 'ALT GR';
    if (display === 'AltLeft') return 'L-ALT';
    if (display === 'ArrowUp') return 'UP';
    if (display === 'ArrowDown') return 'DOWN';
    if (display === 'ArrowRight') return 'RIGHT';
    if (display === 'ArrowLeft') return 'LEFT';
    return display;
  };

  // Handle keybinding input
  useEffect(() => {
    if (!listeningKeyFor) return;

    let timeout;
    const handleKeyDown = (e) => {
      e.preventDefault();

      let keyCode = e.code;

      // Fallback if code is missing (rare but happens on some browsers/os)
      if (!keyCode) {
        if (e.key === 'Shift' && e.location === 2) keyCode = 'ShiftRight';
        else if (e.key === 'Shift' && e.location === 1) keyCode = 'ShiftLeft';
        else if (e.key === 'Control' && e.location === 2) keyCode = 'ControlRight';
        else if (e.key === 'Control' && e.location === 1) keyCode = 'ControlLeft';
        else if (e.key === 'Alt' && e.location === 2) keyCode = 'AltRight';
        else if (e.key === 'Alt' && e.location === 1) keyCode = 'AltLeft';
        else keyCode = e.key;
      }

      if (e.key === 'AltGraph') keyCode = 'AltRight';

      // Delay to handle AltGr sending ControlLeft first on Windows
      if (keyCode === 'ControlLeft' && e.key !== 'Control') {
        timeout = setTimeout(() => {
          updateDeepSettings(`keymap.collection.${listeningKeyFor}`, 'ControlLeft');
          setListeningKeyFor(null);
        }, 100);
        return;
      }

      if (timeout) clearTimeout(timeout);
      updateDeepSettings(`keymap.collection.${listeningKeyFor}`, keyCode);
      setListeningKeyFor(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeout) clearTimeout(timeout);
    };
  }, [listeningKeyFor, updateDeepSettings]);

  // Auto-save settings
  useEffect(() => {
    localStorage.setItem('api_url', apiUrl)
    localStorage.setItem('ws_url', wsUrl)
    localStorage.setItem('use_mock', useMock)
  }, [apiUrl, wsUrl, useMock])

  const handleBgmUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      // 1. Save to IndexedDB for offline support
      const savedTrack = await audioStorage.saveTrack(file);

      // 2. Update local state
      const currentTracks = settings.audio.availableTracks || [];
      const updatedTracks = [...currentTracks, { ...savedTrack, isLocal: true }];

      // Remove duplicates
      const uniqueTracks = updatedTracks.reduce((acc, current) => {
        const x = acc.find(item => item.name === current.name);
        if (!x) return acc.concat([current]);
        return acc;
      }, []);

      updateDeepSettings('audio.availableTracks', uniqueTracks);

      // Auto-select if it's the only one or just uploaded
      updateDeepSettings('audio.bgmTrack', savedTrack.name);

      soundHandler.playDataSave(); // Feedback

      // 3. Optional: Try to upload to backend if online
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || '';
        const formData = new FormData();
        formData.append('file', file);
        fetch(`${API_BASE_URL}/api/audio/upload`, { method: 'POST', body: formData })
          .catch(e => console.log('Offline: Could not sync to server, but saved locally.'));
      } catch (e) {
        // Ignore backend sync errors
      }

    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  const handleDeleteTrack = async (track) => {
    try {
      const filename = track.name;

      // 1. Delete from IndexedDB if local
      if (track.isLocal) {
        await audioStorage.deleteTrack(filename);
      }

      // 2. Update local state
      const updatedTracks = settings.audio.availableTracks.filter(t => t.name !== filename);
      updateDeepSettings('audio.availableTracks', updatedTracks);

      if (settings.audio.bgmTrack === filename) {
        updateDeepSettings('audio.bgmTrack', updatedTracks.length > 0 ? updatedTracks[0].name : null);
      }

      soundHandler.playDataSave();

      // 3. Optional: Try to delete from server
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || '';
        fetch(`${API_BASE_URL}/api/audio/track/${filename}`, { method: 'DELETE' })
          .catch(e => console.log('Offline: Could not delete from server.'));
      } catch (e) { }

    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Sync Audio Settings to SoundHandler
  useEffect(() => {
    if (settings.audio) {
      soundHandler.enabled = settings.audio.sfxEnabled ?? true;
      soundHandler.setBgmVolume(settings.audio.bgmVolume ?? 0.3);

      if (settings.audio.bgmEnabled && settings.audio.bgmTrack) {
        const track = settings.audio.availableTracks?.find(t => t.name === settings.audio.bgmTrack);

        const loadTrack = async () => {
          let trackUrl = '';

          if (track?.isLocal) {
            const localData = await audioStorage.getTrack(track.name);
            if (localData && localData.data) {
              trackUrl = URL.createObjectURL(localData.data);
            }
          } else if (track?.isDefault) {
            trackUrl = `data/audio/${track.name}`;
          } else {
            const API_BASE_URL = import.meta.env.VITE_API_URL || '';
            trackUrl = `${API_BASE_URL}/api/audio/track/${settings.audio.bgmTrack}`;
          }

          if (trackUrl) {
            await soundHandler.loadBackgroundMusic(trackUrl);
            soundHandler.startBackgroundMusic();

            // Clean up blob URL if it was created
            if (trackUrl.startsWith('blob:')) {
              // Note: We might need to keep it if SoundHandler doesn't buffer it immediately,
              // but loadBackgroundMusic is async and awaits decode, so it's safe.
              // Actually, better to clean up after some time or on next load.
            }
          }
        };

        loadTrack();
      }
      else {
        soundHandler.stopBackgroundMusic();
      }
    }
  }, [settings.audio?.bgmEnabled, settings.audio?.bgmTrack, settings.audio?.bgmVolume, settings.audio?.sfxEnabled, settings.audio?.availableTracks]);

  const handleCreateTheme = () => {
    const newId = addTheme(`Custom Theme ${themes.length + 1}`);
    // Auto-scroll or focus?
  };

  const handleDuplicateTheme = () => {
    const newId = addTheme(`${currentTheme.name} (Copy)`);
    // Ideally we would copy the colors here, but addTheme currently clones the *current* theme colors
    // so it already does exactly what we want!
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="font-sans absolute inset-0 pt-[96px] flex overflow-hidden bg-bg text-text">
      {/* ── SIDEBAR ── */}
      <aside className="w-[66px] bg-surface/30 border-r border-border flex flex-col items-center py-4 gap-1 shrink-0 z-20">
        {[
          { id: 'account', icon: UserPlus, label: 'Account' },
          { divider: true },
          { id: 'appearance', icon: Palette, label: 'Style' },
          { id: 'connectivity', icon: Globe, label: 'Link' },
          { divider: true },
          { id: 'audio', icon: Music, label: 'Audio' },
          { id: 'hotkeys', icon: Keyboard, label: 'Keys' },
          { divider: true },
          { id: 'telemetry', icon: Activity, label: 'Telem' }
        ].map((item, i) => {
          if (item.divider) return <div key={`div-${i}`} className="w-[28px] h-px bg-border my-1.5" />;
          const isActive = activeSection === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`relative w-[46px] h-[46px] rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all border border-transparent group ${isActive ? 'bg-primary/10 border-primary/20' : 'hover:bg-surface'}`}
              title={item.label}
            >
              <Icon size={18} className={`transition-all ${isActive ? 'text-primary' : 'text-muted group-hover:text-text'}`} strokeWidth={1.8} />
              <span className={`text-[8px] font-bold tracking-[0.07em] uppercase transition-all ${isActive ? 'text-primary' : 'text-muted group-hover:text-text'}`}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r-[3px] shadow-[0_0_10px_var(--primary)]" />
              )}
            </button>
          );
        })}
      </aside>

      {/* ── MAIN ── */}
      <main className="flex-1 overflow-y-auto px-5 py-6 flex flex-col items-center min-w-0 custom-scrollbar">
        <div className="w-full max-w-[900px] flex flex-col gap-6">
        {/* APPEARANCE */}
        {activeSection === 'appearance' && (
          <div className="flex flex-col gap-4 animate-fade-in">
             <div className="flex items-start justify-between gap-3">
               <div>
                 <h2 className="text-[22px] font-bold tracking-tight">Appearance</h2>
                 <p className="text-[13px] text-muted mt-1">Customize your dashboard theme and color palette</p>
               </div>
               <div className="flex gap-2">
                 <button onClick={resetThemes} className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold tracking-[0.06em] cursor-pointer border border-border bg-surface/50 text-muted hover:text-text hover:border-white/20 transition-all">Reset Defaults</button>
                 <button onClick={handleCreateTheme} className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold tracking-[0.06em] cursor-pointer border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all">+ New Theme</button>
               </div>
             </div>

             <div className="bg-surface/50 border border-border rounded-2xl overflow-hidden shadow-lg">
                <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-muted flex items-center gap-2">
                    <Palette size={14} className="opacity-70" strokeWidth={1.8} /> Color Theme
                  </span>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    {themes.map((t) => (
                       <div 
                         key={t.id} 
                         onClick={() => setTheme(t.id)}
                         className={`border rounded-xl p-3 cursor-pointer transition-all bg-surface/80 hover:-translate-y-[1px] ${currentThemeId === t.id ? 'border-primary ring-1 ring-primary/50 shadow-[0_0_20px_rgba(0,200,240,0.08)]' : 'border-border/50 hover:border-border'}`}
                       >
                         <div className="flex gap-1.5 mb-2">
                           <div className="w-[11px] h-[11px] rounded-full" style={{backgroundColor: t.colors['--bg']}} />
                           <div className="w-[11px] h-[11px] rounded-full" style={{backgroundColor: t.colors['--primary']}} />
                           <div className="w-[11px] h-[11px] rounded-full" style={{backgroundColor: t.colors['--accent']}} />
                         </div>
                         <div className={`text-[11px] font-medium leading-[1.3] truncate ${currentThemeId === t.id ? 'text-primary' : 'text-muted'}`}>{t.name}</div>
                       </div>
                    ))}
                  </div>
                  <div className="h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                  <div className="bg-surface/80 rounded-xl px-4 py-3.5 border border-border flex items-center gap-3.5">
                    <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted shrink-0">Active</div>
                    <div className="flex-1 flex flex-col gap-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: '65%', backgroundColor: currentTheme.colors['--primary'] || 'var(--primary)' }} />
                      <div className="h-1.5 rounded-full" style={{ width: '45%', backgroundColor: currentTheme.colors['--accent'] || 'var(--accent)' }} />
                    </div>
                    <div className="flex gap-2">
                       <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentTheme.colors['--bg'] || 'var(--bg)' }} />
                       <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentTheme.colors['--primary'] || 'var(--primary)' }} />
                       <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentTheme.colors['--accent'] || 'var(--accent)' }} />
                    </div>
                  </div>
                </div>
             </div>

             <div className="bg-surface/50 border border-border rounded-2xl overflow-hidden shadow-lg">
                <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-muted flex items-center gap-2">
                    <Edit3 size={14} className="opacity-70" strokeWidth={1.8} /> Custom Palette
                  </span>
                  {currentTheme.type === 'custom' && (
                     <div className="flex gap-2">
                       <button onClick={handleDuplicateTheme} className="px-2 py-1 rounded text-[10px] bg-surface border border-border text-muted hover:text-text">Duplicate</button>
                       <button onClick={() => removeTheme(currentThemeId)} className="px-2 py-1 rounded text-[10px] bg-red-500/10 border border-red-500/20 text-red-500">Delete</button>
                     </div>
                  )}
                </div>
                <div className="p-5 flex flex-col">
                  {currentTheme.type === 'custom' ? (
                     <>
                        <div className="flex items-center justify-between py-3 border-b border-border/50">
                          <span className="text-[14px] font-medium text-text">Theme Name</span>
                          {isEditingName ? (
                             <input type="text" autoFocus value={tempName} onChange={e => setTempName(e.target.value)} onBlur={() => { updateTheme(currentThemeId, { name: tempName || currentTheme.name }); setIsEditingName(false); }} onKeyDown={e => { if (e.key === 'Enter') { updateTheme(currentThemeId, { name: tempName || currentTheme.name }); setIsEditingName(false); } }} className="bg-bg border border-primary rounded px-2 py-1 text-sm outline-none w-[150px] text-right" />
                          ) : (
                             <span className="text-[14px] font-bold border-b border-dashed border-primary/50 cursor-pointer" onClick={() => { setTempName(currentTheme.name); setIsEditingName(true); }}>{currentTheme.name}</span>
                          )}
                        </div>
                        {[
                          { label: 'System Background', key: '--bg' },
                          { label: 'Surface UI Nodes', key: '--surface' },
                          { label: 'Base Typography', key: '--text' },
                          { label: 'Primary Action Alpha', key: '--primary' },
                          { label: 'Accent Highlight', key: '--accent' },
                          { label: 'Vector Border Edge', key: '--border' }
                        ].map(({ label, key }) => (
                           <div key={key} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                              <span className="text-[14px] font-medium">{label}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] text-muted font-mono">{currentTheme.colors[key]}</span>
                                <input type="color" value={currentTheme.colors[key]} onChange={(e) => updateThemeColor(currentThemeId, key, e.target.value)} className="w-[30px] h-[30px] rounded-lg border border-border cursor-pointer p-0 bg-transparent shrink-0" />
                              </div>
                           </div>
                        ))}
                     </>
                  ) : (
                     <div className="text-center py-6 text-muted text-sm">Select a custom theme or duplicate the current one to edit colors.</div>
                  )}
                </div>
             </div>
          </div>
        )}

        {/* CONNECTIVITY */}
        {activeSection === 'connectivity' && (
          <div className="flex flex-col gap-4 animate-fade-in">
             <div className="flex items-start justify-between gap-3">
               <div>
                 <h2 className="text-[22px] font-bold tracking-tight">Connectivity</h2>
                 <p className="text-[13px] text-muted mt-1">Manage BCI device link and stream configuration</p>
               </div>
               <span className={`text-[12px] font-bold tracking-[0.06em] ${latency > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  ● {latency > 0 ? 'Connected' : 'Disconnected'}
               </span>
             </div>

             <div className="bg-surface/50 border border-border rounded-2xl overflow-hidden shadow-lg">
                <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-muted flex items-center gap-2">
                    <Globe size={14} className="opacity-70" strokeWidth={1.8} /> Endpoint Configuration
                  </span>
                </div>
                <div className="p-5 flex flex-col">
                  <div className="flex flex-col gap-4 mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Core API Protocol</label>
                        <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="w-full px-4 py-2 bg-bg border border-border rounded-xl outline-none focus:border-primary text-sm font-mono tabular-nums transition-all" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Neural Socket Tunnel</label>
                        <input type="text" value={wsUrl} onChange={e => setWsUrl(e.target.value)} className="w-full px-4 py-2 bg-bg border border-border rounded-xl outline-none focus:border-primary text-sm font-mono tabular-nums transition-all" />
                      </div>
                    </div>
                    <div className="h-px bg-border/50" />
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Local WS URL</label>
                        <div className="flex gap-2">
                          <input type="text" value={localWs} onChange={e => setLocalWs(e.target.value)} className="w-full px-4 py-2 bg-bg border border-border rounded-xl outline-none focus:border-primary text-sm font-mono tabular-nums transition-all" />
                          <button onClick={() => connect(localWs)} className="px-4 py-2 bg-primary/10 text-primary border border-primary/30 rounded-xl font-bold text-sm hover:bg-primary/20 transition-all shrink-0">Connect</button>
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Ngrok WS URL</label>
                        <div className="flex gap-2">
                          <input type="text" value={ngrokWs} onChange={e => setNgrokWs(e.target.value)} className="w-full px-4 py-2 bg-bg border border-border rounded-xl outline-none focus:border-primary text-sm font-mono tabular-nums transition-all" />
                          <button onClick={() => connect(ngrokWs)} className="px-4 py-2 bg-primary/10 text-primary border border-primary/30 rounded-xl font-bold text-sm hover:bg-primary/20 transition-all shrink-0">Connect</button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-3 border-t border-border/50">
                    <div className="space-y-0.5">
                      <div className="text-[14px] font-medium">Mock Dataset Simulation</div>
                      <div className="text-[12px] text-muted">Bypass neural hardware via synthetic signal injection</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ml-6">
                      <input type="checkbox" checked={useMock} onChange={e => setUseMock(e.target.checked)} className="sr-only peer" />
                      <div className="w-10 h-6 bg-surface-hover peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 border border-border-hi"></div>
                    </label>
                  </div>
                </div>
             </div>
          </div>
        )}

        {/* AUDIO & SOUNDSCAPES */}
        {activeSection === 'audio' && (
          <div className="flex flex-col gap-4 animate-fade-in">
             <div className="flex items-start justify-between gap-3">
               <div>
                 <h2 className="text-[22px] font-bold tracking-tight">Audio & SFX</h2>
                 <p className="text-[13px] text-muted mt-1">Configure neural feedback audio and system sounds</p>
               </div>
             </div>

             <div className="bg-surface/50 border border-border rounded-2xl overflow-hidden shadow-lg">
                <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-muted flex items-center gap-2">
                    <Music size={14} className="opacity-70" strokeWidth={1.8} /> Sound Options
                  </span>
                </div>
                <div className="p-5 flex flex-col">
                  <div className="flex items-center justify-between py-3 border-b border-border/50">
                    <div className="space-y-0.5">
                      <div className="text-[14px] font-medium">Synthesized SFX</div>
                      <div className="text-[12px] text-muted">Neuro-feedback audio cues for interactions</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ml-6">
                      <input type="checkbox" checked={settings.audio?.sfxEnabled ?? true} onChange={e => updateDeepSettings('audio.sfxEnabled', e.target.checked)} className="sr-only peer" />
                      <div className="w-10 h-6 bg-surface-hover peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary border border-border-hi"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between py-3 border-b border-border/50">
                    <div className="space-y-0.5">
                      <div className="text-[14px] font-medium">Ambient Sound track</div>
                      <div className="text-[12px] text-muted">Continuous background atmosphere</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ml-6">
                      <input type="checkbox" checked={settings.audio?.bgmEnabled ?? false} onChange={e => updateDeepSettings('audio.bgmEnabled', e.target.checked)} className="sr-only peer" />
                      <div className="w-10 h-6 bg-surface-hover peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary border border-border-hi"></div>
                    </label>
                  </div>

                  {(settings.audio?.bgmEnabled) && (
                    <div className="py-4 space-y-4">
                      <div className="flex items-center gap-4">
                        <span className="text-[14px] font-medium w-[150px]">Volume</span>
                        <input type="range" min="0" max="0.5" step="0.01" value={settings.audio?.bgmVolume ?? 0.1} onChange={e => updateDeepSettings('audio.bgmVolume', parseFloat(e.target.value))} className="flex-1 h-1 bg-surface-hover rounded-full appearance-none accent-primary cursor-pointer" />
                        <span className="text-[13px] font-bold text-primary w-10 text-right tabular-nums">{(settings.audio?.bgmVolume * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-[12px] font-bold text-muted uppercase tracking-[0.1em]">Available Tracks</span>
                        <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary px-3 py-1.5 bg-primary/10 rounded border border-primary/20 cursor-pointer hover:bg-primary/20 transition-all flex items-center gap-1.5">
                           <Upload size={12} /> Upload Track
                           <input type="file" accept="audio/*" onChange={handleBgmUpload} className="hidden" />
                        </label>
                      </div>
                      <div className="grid grid-cols-1 gap-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                        {settings.audio?.availableTracks?.map(track => (
                          <div key={track.name} onClick={() => updateDeepSettings('audio.bgmTrack', track.name)} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${settings.audio.bgmTrack === track.name ? 'bg-primary/5 border-primary shadow-[0_0_10px_rgba(0,200,240,0.1)]' : 'bg-surface border-border/50 hover:border-border'}`}>
                            <div className="flex items-center gap-3">
                               <Music size={14} className={settings.audio.bgmTrack === track.name ? 'text-primary' : 'text-muted'} />
                               <div>
                                 <div className={`text-[13px] font-bold ${settings.audio.bgmTrack === track.name ? 'text-primary' : 'text-text'}`}>{track.name}</div>
                                 <div className="text-[10px] font-mono text-muted uppercase">{(track.size / 1024 / 1024).toFixed(2)} MB</div>
                               </div>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteTrack(track); }} className="p-1.5 text-muted hover:text-red-500 bg-surface border border-border rounded hover:bg-red-500/10 transition-all">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
             </div>
          </div>
        )}

        {/* HOTKEYS */}
        {activeSection === 'hotkeys' && (
          <div className="flex flex-col gap-4 animate-fade-in">
             <div className="flex items-start justify-between gap-3">
               <div>
                 <h2 className="text-[22px] font-bold tracking-tight">Neural Hotkeys</h2>
                 <p className="text-[13px] text-muted mt-1">Keyboard shortcuts for stream and data operations</p>
               </div>
               <button onClick={() => updateDeepSettings('keymap', {})} className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold tracking-[0.06em] cursor-pointer border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all">Reset Keymap</button>
             </div>

             <div className="bg-surface/50 border border-border rounded-2xl overflow-hidden shadow-lg">
                <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-muted flex items-center gap-2">
                    <Keyboard size={14} className="opacity-70" strokeWidth={1.8} /> Stream Operations
                  </span>
                </div>
                <div className="p-5 flex flex-col">
                  {[
                    { id: 'startStop', label: 'Start / Stop Collection', desc: 'Toggle neural data stream recording', icon: Play },
                    { id: 'appendSample', label: 'Append Sample', desc: 'Add current window to dataset', icon: Plus },
                    { id: 'deleteLatest', label: 'Delete Last Window', desc: 'Remove last appended sample from dataset', icon: Trash2 },
                    { id: 'deleteAll', label: 'Clear All Windows', desc: 'Delete all samples from dataset', icon: Trash },
                    { id: 'newSession', label: 'Create New Session', desc: 'Start a fresh tracking document', icon: Edit3 }
                  ].map(({ id, label, desc, icon: Icon }) => {
                    const isListening = listeningKeyFor === id;
                    // Provide a default value directly since reset might wipe it, though useSettings ideally merges
                    // We'll just display formatKeyCode safely
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
        )}

        {/* TELEMETRY */}
        {activeSection === 'telemetry' && (
          <div className="flex flex-col gap-4 animate-fade-in">
             <div className="flex items-start justify-between gap-3">
               <div>
                 <h2 className="text-[22px] font-bold tracking-tight">Telemetry</h2>
                 <p className="text-[13px] text-muted mt-1">System diagnostics, session analytics and logging</p>
               </div>
             </div>

             <div className="grid grid-cols-2 gap-3">
               <div className="bg-surface/50 border border-border rounded-xl p-4 flex flex-col relative overflow-hidden">
                 <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-muted mb-2">Neural Pipeline</div>
                 <div className="text-[28px] font-bold tracking-tight leading-none text-text">{latency > 0 ? latency : '—'}<span className="text-[13px] font-normal text-muted ml-1">ms</span></div>
                 <div className={`text-[12px] mt-1 ${latency > 0 ? 'text-emerald-500' : 'text-red-500'}`}>{latency > 0 ? 'Connected' : 'No device connected'}</div>
                 <div className="absolute right-0 bottom-0 flex items-end gap-[3px] opacity-30 p-3 h-[40px] pointer-events-none">
                   {[...Array(10)].map((_, i) => <div key={i} className="w-[3px] bg-primary rounded-t-[2px]" style={{height: `${Math.floor(Math.random() * 20 + 4)}px`}} />)}
                 </div>
               </div>
               <div className="bg-surface/50 border border-border rounded-xl p-4 flex flex-col">
                 <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-muted mb-2">Sync Refresh</div>
                 <div className="text-[28px] font-bold tracking-tight leading-none text-text tabular-nums">{fps}<span className="text-[13px] font-normal text-muted ml-1">fps</span></div>
                 <div className="text-[12px] mt-1 text-muted">Frontend rendering speed</div>
               </div>
             </div>
          </div>
        )}
        {/* ACCOUNT */}
        {activeSection === 'account' && (
          <div className="flex flex-col gap-4 animate-fade-in w-full">
             <div className="flex items-start justify-between gap-3">
               <div>
                 <h2 className="text-[26px] font-bold tracking-tight text-text">Account Overview</h2>
                 <p className="text-[14px] text-muted mt-1">Manage local operator settings and review current link credentials</p>
               </div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
               {/* Profile */}
        <div className="bg-surface/50 border border-border rounded-2xl p-[18px]">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-surface to-bg border border-border-hi flex items-center justify-center text-[18px] font-extrabold text-primary mb-3 shadow-[0_4px_10px_rgba(0,0,0,0.2)]">
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="Avatar" className="w-full h-full rounded-xl object-cover" /> : (user?.name?.charAt(0).toUpperCase() || 'U')}
          </div>
          <div className="text-[10px] tracking-[0.12em] text-muted uppercase mb-0.5 font-bold">Neural Operator</div>
          <div className="text-[18px] font-bold tracking-[-0.3px] text-text truncate">{user?.username || 'ANONYMOUS'}</div>
          <div className="text-[12px] text-muted mt-1 truncate">{user?.email || 'operator@neurotech.bci'}</div>
          {user && (
            <button onClick={logout} className="mt-3.5 w-full p-[9px] rounded-lg border border-red-500/35 bg-red-500/10 text-red-500 text-[11px] font-bold tracking-[0.08em] uppercase cursor-pointer hover:bg-red-500/20 transition-all text-center">
              ⊗ Disconnect Link
            </button>
          )}
        </div>
               
               {/* Quick Info */}
        <div className="bg-surface/50 border border-border rounded-2xl overflow-hidden shadow-lg">
          <div className="px-4 py-[11px] border-b border-border">
             <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-muted flex items-center gap-2">
                 <Activity size={14} className="opacity-70" strokeWidth={1.8} /> Quick Info
             </span>
          </div>
          <div className="px-4 py-[11px] border-b border-border flex justify-between items-center">
             <span className="text-[13px] text-muted">Available themes</span>
             <span className="text-[13px] font-bold">{themes.length}</span>
          </div>
          <div className="px-4 py-[11px] border-b border-border flex justify-between items-center">
             <span className="text-[13px] text-muted">Active hotkeys</span>
             <span className="text-[13px] font-bold">{Object.keys(settings.keymap?.collection || {}).length}</span>
          </div>
          <div className="px-4 py-[11px] border-b border-border flex justify-between items-center">
             <span className="text-[13px] text-muted">Device status</span>
             <span className={`text-[13px] font-bold ${latency > 0 ? 'text-emerald-500' : 'text-red-500'}`}>{latency > 0 ? 'Online' : 'Offline'}</span>
          </div>
          <div className="px-4 py-[11px] flex justify-between items-center">
             <span className="text-[13px] text-muted">Target Protocol</span>
             <span className="text-[13px] font-bold truncate max-w-[100px]">{wsUrl}</span>
          </div>
        </div>
             </div>
          </div>
        )}

        </div>
      </main>

    </div>
  )
}
