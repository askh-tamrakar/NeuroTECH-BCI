import React, { useState, useEffect } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
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
  ToggleRight
} from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { soundHandler } from '../../handlers/SoundHandler'
import { Music, Volume2, Upload, VolumeX } from 'lucide-react'

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

export default function SettingsView({ latency = 0 }) {
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

  const { settings, updateDeepSettings } = useSettings()

  // Local settings state
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('api_url') || 'http://localhost:8000')
  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem('ws_url') || 'ws://localhost:1972')
  const [useMock, setUseMock] = useState(() => localStorage.getItem('use_mock') === 'true')

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

    const formData = new FormData();
    formData.append('file', file);

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${API_BASE_URL}/api/audio/upload`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();
        // Refresh tracks list
        const tracksRes = await fetch(`${API_BASE_URL}/api/audio/tracks`);
        if (tracksRes.ok) {
          const tracks = await tracksRes.json();
          updateDeepSettings('audio.availableTracks', tracks);
          // Auto-select if it's the only one
          if (tracks.length === 1) {
            updateDeepSettings('audio.bgmTrack', tracks[0].name);
          }
        }
        soundHandler.playDataSave(); // Feedback
      }
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  const handleDeleteTrack = async (filename) => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${API_BASE_URL}/api/audio/track/${filename}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const tracksRes = await fetch(`${API_BASE_URL}/api/audio/tracks`);
        if (tracksRes.ok) {
          const tracks = await tracksRes.json();
          updateDeepSettings('audio.availableTracks', tracks);
          // If we deleted the active track, select another or null
          if (settings.audio.bgmTrack === filename) {
            updateDeepSettings('audio.bgmTrack', tracks.length > 0 ? tracks[0].name : null);
          }
        }
        soundHandler.playDataSave(); // Feedback (using save sound for now)
      }
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
        // Use full URL to be sure, defaulting to common dev port if env not set
        const API_BASE_URL = import.meta.env.VITE_API_URL || '';
        const trackUrl = `${API_BASE_URL}/api/audio/track/${settings.audio.bgmTrack}`;
        soundHandler.loadBackgroundMusic(trackUrl).then(() => {
          soundHandler.startBackgroundMusic();
        });
      }
      else {
        soundHandler.stopBackgroundMusic();
      }
    }
  }, [settings.audio?.bgmEnabled, settings.audio?.bgmTrack, settings.audio?.bgmVolume, settings.audio?.sfxEnabled]);

  const handleCreateTheme = () => {
    const newId = addTheme(`Custom Theme ${themes.length + 1}`);
    // Auto-scroll or focus?
  };

  const handleDuplicateTheme = () => {
    const newId = addTheme(`${currentTheme.name} (Copy)`);
    // Ideally we would copy the colors here, but addTheme currently clones the *current* theme colors
    // so it already does exactly what we want!
  };

  return (
    <div className="w-full mx-auto pt-8 px-4 lg:px-8 pb-32 space-y-10">

      {/* Header */}
      <div className="flex items-center gap-5 mb-10">
        <div className="p-5 bg-primary/20 rounded-2xl text-primary shadow-glow">
          <Settings size={44} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-4xl font-black text-text tracking-tighter uppercase">Settings</h1>
          <p className="text-xl text-muted font-medium">Manage your workspace preferences & neural controls</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* LEFT COLUMN: Appearance & Connectivity */}
        <div className="lg:col-span-7 space-y-12">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-text flex items-center gap-4 uppercase tracking-tighter">
                <Palette size={32} className="text-primary" />
                Appearance
              </h2>
              <div className="flex gap-3">
                <button
                  onClick={resetThemes}
                  className="px-4 py-2 text-sm font-bold text-muted hover:text-text hover:bg-surface rounded-lg transition-colors border border-border/50"
                >
                  Reset Defaults
                </button>
                <button
                  onClick={handleCreateTheme}
                  className="flex items-center gap-2 px-6 py-3 bg-surface hover:bg-primary hover:text-primary-contrast border border-border rounded-xl font-black text-base transition-all shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5"
                >
                  <Plus size={20} />
                  New Theme
                </button>
              </div>
            </div>

            <div className="card p-8 bg-surface space-y-8 rounded-[2rem] border-2 shadow-xl">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`group relative p-4 rounded-2xl border-2 transition-all duration-300 text-left ${currentThemeId === t.id
                      ? 'bg-primary/10 border-primary shadow-glow scale-105 z-10'
                      : 'bg-bg border-border/50 hover:bg-surface hover:border-muted'
                      }`}
                  >
                    <div className="flex gap-1.5 mb-3">
                      <div className="w-4 h-4 rounded-full shadow-inner border border-white/10" style={{ backgroundColor: t.colors['--bg'] }} />
                      <div className="w-4 h-4 rounded-full shadow-inner border border-white/10" style={{ backgroundColor: t.colors['--primary'] }} />
                      <div className="w-4 h-4 rounded-full shadow-inner border border-white/10" style={{ backgroundColor: t.colors['--accent'] }} />
                    </div>
                    <span className={`text-sm font-black truncate block ${currentThemeId === t.id ? 'text-primary' : 'text-muted group-hover:text-text'}`}>
                      {t.name}
                    </span>
                    {currentThemeId === t.id && (
                      <div className="absolute top-3 right-3">
                        <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="h-px bg-border/50 w-full" />

              <div className="space-y-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {isEditingName ? (
                      <input
                        autoFocus
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        onBlur={() => {
                          updateTheme(currentThemeId, { name: tempName || currentTheme.name });
                          setIsEditingName(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateTheme(currentThemeId, { name: tempName || currentTheme.name });
                            setIsEditingName(false);
                          }
                        }}
                        className="bg-bg border-2 border-primary rounded-xl px-4 py-2 text-2xl font-black text-text outline-none shadow-glow transition-all"
                      />
                    ) : (
                      <h3
                        className={`text-2xl font-black uppercase tracking-tighter flex items-center gap-4 ${currentTheme.type === 'custom' ? 'cursor-pointer hover:underline decoration-dashed decoration-primary underline-offset-8' : ''}`}
                        onClick={() => {
                          if (currentTheme.type === 'custom') {
                            setTempName(currentTheme.name);
                            setIsEditingName(true);
                          }
                        }}
                      >
                        {currentTheme.name}
                        {currentTheme.type === 'custom' && <span className="text-[10px] bg-primary/20 text-primary px-3 py-1 rounded-full align-middle font-black tracking-widest">CUSTOM UI</span>}
                      </h3>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleDuplicateTheme}
                      className="p-3.5 bg-bg text-muted hover:text-text hover:border-primary border-2 border-border/50 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
                      title="Duplicate Theme"
                    >
                      <Copy size={24} />
                    </button>
                    {currentTheme.type === 'custom' && (
                      <button
                        onClick={() => removeTheme(currentThemeId)}
                        className="p-3.5 bg-red-500/10 text-red-400 hover:text-red-500 hover:bg-red-500/20 rounded-xl transition-all border-2 border-red-500/20 shadow-md hover:shadow-red-500/10 active:scale-95"
                        title="Delete Theme"
                      >
                        <Trash2 size={24} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <h4 className="text-sm font-black text-muted uppercase tracking-[0.3em] mb-4 border-l-4 border-primary pl-4">Foundation Layers</h4>
                    <div className="space-y-4">
                      <ColorInput label="System Background" value={currentTheme.colors['--bg']} onChange={(v) => updateThemeColor(currentThemeId, '--bg', v)} />
                      <ColorInput label="Surface UI Nodes" value={currentTheme.colors['--surface']} onChange={(v) => updateThemeColor(currentThemeId, '--surface', v)} />
                      <ColorInput label="Base Typography" value={currentTheme.colors['--text']} onChange={(v) => updateThemeColor(currentThemeId, '--text', v)} />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h4 className="text-sm font-black text-muted uppercase tracking-[0.3em] mb-4 border-l-4 border-accent pl-4">Signal Indicators</h4>
                    <div className="space-y-4">
                      <ColorInput label="Primary Action Alpha" value={currentTheme.colors['--primary']} onChange={(v) => updateThemeColor(currentThemeId, '--primary', v)} />
                      <ColorInput label="Accent Highlight" value={currentTheme.colors['--accent']} onChange={(v) => updateThemeColor(currentThemeId, '--accent', v)} />
                      <ColorInput label="Vector Border Edge" value={currentTheme.colors['--border']} onChange={(v) => updateThemeColor(currentThemeId, '--border', v)} />
                    </div>
                  </div>
                </div>

                {currentTheme.type === 'default' && (
                  <div className="mt-8 p-6 bg-primary/10 border-2 border-primary/20 text-primary text-xl font-bold rounded-2xl flex items-center gap-5 shadow-inner">
                    <Settings size={28} className="shrink-0 animate-spin-slow" />
                    <span>System core theme active. Create a duplicate to unleash full customization.</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black text-text flex items-center gap-4 uppercase tracking-tighter">
              <Globe size={32} className="text-primary" />
              Connectivity
            </h2>
            <div className="card p-8 bg-surface space-y-8 rounded-[2rem] border-2 shadow-xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Core API Protocol</label>
                  <input
                    type="text"
                    value={apiUrl}
                    onChange={e => setApiUrl(e.target.value)}
                    className="w-full px-5 py-3 bg-bg border-2 border-border/50 rounded-xl outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-xl font-black tabular-nums"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Neural Socket Tunnel</label>
                  <input
                    type="text"
                    value={wsUrl}
                    onChange={e => setWsUrl(e.target.value)}
                    className="w-full px-5 py-3 bg-bg border-2 border-border/50 rounded-xl outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-xl font-black tabular-nums"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-6 bg-bg rounded-[1.5rem] border-2 border-border shadow-inner group hover:border-amber-500/30 transition-all">
                <div className="flex items-center gap-6">
                  <div className={`p-5 rounded-xl shadow-xl transition-all duration-500 ${useMock ? 'bg-amber-500/20 text-amber-500 border-2 border-amber-500/40 shadow-amber-500/10 scale-105' : 'bg-muted/20 text-muted border-2 border-border'}`}>
                    <Database size={32} strokeWidth={2.5} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xl font-black uppercase tracking-tighter">Mock Dataset Simulation</h4>
                    <p className="text-sm text-muted font-medium">Bypass neural hardware via synthetic signal injection</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer scale-[1.5] mr-6">
                  <input type="checkbox" checked={useMock} onChange={e => setUseMock(e.target.checked)} className="sr-only peer" />
                  <div className="w-12 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 shadow-lg"></div>
                </label>
              </div>
            </div>

          </section>

          {/* Audio & Soundscapes */}
          <section className="space-y-4">
            <h2 className="text-2xl font-black text-text flex items-center gap-4 uppercase tracking-tighter">
              <Music size={32} className="text-primary" />
              Audio & Soundscapes
            </h2>
            <div className="card p-8 bg-surface space-y-8 rounded-[2rem] border-2 shadow-xl">
              <div className="flex items-center justify-between p-6 bg-bg rounded-[1.5rem] border-2 border-border shadow-inner">
                <div className="flex items-center gap-6">
                  <div className={`p-5 rounded-xl transition-all ${settings.audio?.sfxEnabled ? 'bg-primary/20 text-primary' : 'bg-muted/20 text-muted'}`}>
                    <Volume2 size={32} />
                  </div>
                  <div>
                    <h4 className="text-xl font-black uppercase tracking-tighter">Synthesized SFX</h4>
                    <p className="text-sm text-muted">Neuro-feedback audio cues for interactions</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer scale-[1.5] mr-6">
                  <input
                    type="checkbox"
                    checked={settings.audio?.sfxEnabled ?? true}
                    onChange={e => updateDeepSettings('audio.sfxEnabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              <div className="h-px bg-border/50" />

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className={`p-5 rounded-xl transition-all ${settings.audio?.bgmEnabled ? 'bg-primary/20 text-primary' : 'bg-muted/20 text-muted'}`}>
                      <Music size={32} />
                    </div>
                    <div>
                      <h4 className="text-xl font-black uppercase tracking-tighter">Ambient Sound track</h4>
                      <p className="text-sm text-muted">Continuous background atmosphere</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer scale-[1.5] mr-6">
                    <input
                      type="checkbox"
                      checked={settings.audio?.bgmEnabled ?? false}
                      onChange={e => updateDeepSettings('audio.bgmEnabled', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-12 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                  </label>
                </div>

                {settings.audio?.bgmEnabled && (
                  <div className="animate-in slide-in-from-top duration-300 space-y-8 pt-4 px-4 bg-bg/50 rounded-2xl p-6 border border-border/50">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-black text-muted uppercase tracking-widest">Atmosphere Volume</span>
                        <span className="text-sm font-mono text-primary font-bold">{(settings.audio?.bgmVolume * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <VolumeX size={18} className="text-muted" />
                        <input
                          type="range"
                          min="0"
                          max="0.5"
                          step="0.01"
                          value={settings.audio?.bgmVolume ?? 0.1}
                          onChange={e => updateDeepSettings('audio.bgmVolume', parseFloat(e.target.value))}
                          className="flex-1 accent-primary h-2 bg-border/50 rounded-lg appearance-none cursor-pointer"
                        />
                        <Volume2 size={18} className="text-muted" />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-muted uppercase tracking-widest">Available Tracks</span>
                        <label className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-contrast rounded-lg cursor-pointer transition-all font-black text-xs uppercase tracking-tighter">
                          <Upload size={14} />
                          Upload Track
                          <input type="file" accept="audio/*" onChange={handleBgmUpload} className="hidden" />
                        </label>
                      </div>

                      <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
                        {settings.audio?.availableTracks?.length > 0 ? (
                          settings.audio.availableTracks.map((track) => (
                            <div
                              key={track.name}
                              className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${settings.audio.bgmTrack === track.name
                                ? 'bg-primary/10 border-primary shadow-glow'
                                : 'bg-surface border-border/50 hover:border-muted'
                                }`}
                            >
                              <div
                                className="flex-1 flex items-center gap-4 cursor-pointer"
                                onClick={() => updateDeepSettings('audio.bgmTrack', track.name)}
                              >
                                <div className={`p-2 rounded-lg ${settings.audio.bgmTrack === track.name ? 'bg-primary text-primary-contrast' : 'bg-muted/20 text-muted'}`}>
                                  <Music size={18} />
                                </div>
                                <div className="space-y-0.5">
                                  <div className={`font-black text-sm truncate max-w-[200px] ${settings.audio.bgmTrack === track.name ? 'text-primary' : 'text-text'}`}>
                                    {track.name}
                                  </div>
                                  <div className="text-[10px] text-muted font-mono uppercase">
                                    {(track.size / 1024 / 1024).toFixed(2)} MB
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={() => handleDeleteTrack(track.name)}
                                className="p-2 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                title="Delete Track"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-8 bg-bg/30 rounded-xl border-2 border-dashed border-border/50 text-muted italic text-sm">
                            No tracks uploaded. Use the upload button to add atmosphere.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Keybindings & Diagnostics */}
        <div className="lg:col-span-5 space-y-8">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[24px] pl-8 font-black text-text flex items-center gap-4 uppercase tracking-tighter">
                <Keyboard size={40} className="text-primary" />
                Neural Hotkeys
              </h2>
              <span className="pr-8">
                <button
                  onClick={() => resetSettings('keymap')}
                  className="px-3 py-1.5 text-base font-black text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all border-2 border-border uppercase tracking-widest"
                >
                  Reset Keymap
                </button>
              </span>
            </div>

            <div className="p-8 bg-surface rounded-[2rem] border-3 border-bg shadow-2xl relative overflow-hidden group">
              <div className="absolute -top-6 -right-6 p-10 opacity-[0.03] transition-transform duration-700 group-hover:scale-125 group-hover:-rotate-12">
                <Keyboard size={160} />
              </div>

              <div className="relative space-y-10">
                <div>
                  <h3 className="text-[18px] font-black text-muted uppercase tracking-[0.4em] mb-6 inline-block border-b-4 border-primary pb-1.5">Stream Operations</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {[
                      { id: 'startStop', label: 'Start / Stop Collection', icon: Play, color: 'text-primary', bgColor: 'bg-yellow-500/10' },
                      { id: 'appendSample', label: 'Append Sample', icon: Plus, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
                      { id: 'deleteLatest', label: 'Delete Last Window', icon: Trash2, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
                      { id: 'deleteAll', label: 'Clear All Windows', icon: Trash, color: 'text-red-500', bgColor: 'bg-red-500/10' },
                      { id: 'newSession', label: 'Create New Session', icon: Edit3, color: 'text-sky-500', bgColor: 'bg-sky-500/10' },
                    ].map(({ id, label, icon: Icon, color, bgColor }) => {
                      const isListening = listeningKeyFor === id;
                      const currentCode = settings.keymap?.collection?.[id];
                      const displayCode = isListening ? 'AWAITING...' : formatKeyCode(currentCode);

                      return (
                        <div key={id} className="flex items-center justify-between p-5 bg-bg rounded-xl border-2 border-muted hover:border-primary/40 transition-all group/item shadow-sm hover:shadow-md">
                          <span className="text-lg font-black text-text flex items-center gap-4 group-hover/item:translate-x-1 transition-transform">
                            <div className={`${bgColor} p-2 rounded-lg`}>
                              {Icon && <Icon size={26} className={`${color}`} />}
                            </div>
                            {label}
                          </span>
                          <button
                            onClick={() => setListeningKeyFor(isListening ? null : id)}
                            className={`px-4 py-2 rounded-xl font-mono text-base font-black border-2 transition-all flex items-center gap-3 ${isListening
                              ? 'bg-bg border-primary text-primary animate-pulse shadow-glow'
                              : 'bg-surface border-border text-muted hover:text-text hover:border-primary'
                              }`}
                          >
                            {isListening ? 'AWAITING...' : displayCode}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="text-[18px] font-black text-muted uppercase tracking-[0.4em] mb-6 inline-block border-b-4 border-accent pb-1.5">Diagnostic Toggles</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {[
                      { id: 'toggleAuto', label: 'Toggle Auto Mode', icon: Power, color: 'text-accent', bgColor: 'bg-yellow-500/10' },
                      { id: 'toggleTimeWindow', label: 'Toggle Time Window', icon: Clock, color: 'text-accent', bgColor: 'bg-yellow-500/10' },
                      { id: 'toggleZoom', label: 'Toggle Zoom Scale', icon: ZoomIn, color: 'text-accent', bgColor: 'bg-yellow-500/10' },
                      { id: 'toggleWinDuration', label: 'Switch Win Duration', icon: ToggleRight, color: 'text-accent', bgColor: 'bg-yellow-500/10' },
                      { id: 'changeTarget', label: 'Change Target Label', icon: Target, color: 'text-accent', bgColor: 'bg-yellow-500/10' },
                      { id: 'limitIncr5', label: 'Increase Limit (+5)', icon: ArrowUp, color: 'text-accent', bgColor: 'bg-yellow-500/10' },
                      { id: 'limitDecr5', label: 'Decrease Limit (-5)', icon: ArrowDown, color: 'text-accent', bgColor: 'bg-yellow-500/10' },
                      { id: 'limitIncr1', label: 'Increase Limit (+1)', icon: ArrowRight, color: 'text-accent', bgColor: 'bg-yellow-500/10' },
                      { id: 'limitDecr1', label: 'Decrease Limit (-1)', icon: ArrowLeft, color: 'text-accent', bgColor: 'bg-yellow-500/10' },
                    ].map(({ id, label, icon: Icon, color, bgColor }) => {
                      const isListening = listeningKeyFor === id;
                      const currentCode = settings.keymap?.collection?.[id];
                      const displayCode = isListening ? 'AWAITING...' : formatKeyCode(currentCode);

                      return (
                        <div key={id} className="flex items-center justify-between p-5 bg-bg rounded-xl border-2 border-muted hover:border-accent/40 transition-all group/item shadow-sm hover:shadow-md">
                          <span className="text-lg font-black text-text flex items-center gap-4 group-hover/item:translate-x-1 transition-transform">
                            <div className={`${bgColor} p-2 rounded-lg`}>
                              {Icon && <Icon size={26} className={`${color}`} />}
                            </div>
                            {label}
                          </span>
                          <button
                            onClick={() => setListeningKeyFor(isListening ? null : id)}
                            className={`px-4 py-2 rounded-xl font-mono text-sm font-black border-2 transition-all flex items-center gap-3 ${isListening
                              ? 'bg-accent/20 border-accent text-accent animate-pulse shadow-glow'
                              : 'bg-surface border-border text-muted hover:text-text hover:border-accent'
                              }`}
                          >
                            {isListening ? 'AWAITING...' : displayCode}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 p-6 bg-primary/5 rounded-[1.5rem] border-2 border-dashed border-primary/20 flex items-start gap-6 shadow-inner">
              <div className="text-primary bg-primary/10 p-4 rounded-xl shrink-0 shadow-lg">
                <Clock size={32} strokeWidth={3} />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-black uppercase tracking-tighter">Hardware Interrupts</h4>
                <p className="text-sm text-muted font-medium leading-relaxed">Neural hotkeys differentiate between Main and NumPad hardware interrupts. Ensure <span className="text-text font-black">NumLock</span> is active.</p>
              </div>
            </div>
          </section>
          {/* Real-time Diagnostics (MOVED TO LEFT) */}
          <section className="space-y-4">
            <div className="card p-8 bg-surface/40 border-2 border-dashed border-border rounded-[2rem] relative overflow-hidden group">
              <div className="flex items-center justify-between mb-8">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black uppercase tracking-tighter text-text">Telemetry</h3>
                  <p className="text-sm text-muted font-medium">Neurotech BCI (Brain Computer Interface) Runtime Context</p>
                </div>
                <div className="h-14 w-14 flex items-center justify-center bg-emerald-500/10 rounded-2xl border-2 border-emerald-500/20 text-emerald-500 shadow-glow animate-pulse">
                  <RefreshCw size={28} strokeWidth={2.5} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-bg/90 border-2 border-border rounded-[1.5rem] group-hover:border-primary/30 transition-all shadow-xl">
                  <div className="text-3xl font-black text-text mb-2 tabular-nums tracking-tighter">{latency}ms</div>
                  <div className="text-[10px] font-black text-muted uppercase tracking-[0.3em] border-l-4 border-primary pl-2">Neural Pipeline</div>
                </div>
                <div className="p-6 bg-bg/90 border-2 border-border rounded-[1.5rem] group-hover:border-accent/30 transition-all shadow-xl">
                  <div className="text-3xl font-black text-text mb-2 tabular-nums tracking-tighter">{fps}fps</div>
                  <div className="text-[10px] font-black text-muted uppercase tracking-[0.3em] border-l-4 border-accent pl-2">Sync Refresh</div>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-4 px-4 py-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10 ">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse" />
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">Neural Tunnel: Synchronized</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
