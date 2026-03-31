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
  UserPlus,
  ChevronUp,
  ChevronDown,
  Minimize2,
  Maximize2,
  Eye,
  EyeOff
} from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { soundHandler } from '../../handlers/SoundHandler'
import { Music, Volume2, Upload, VolumeX } from 'lucide-react'
import { audioStorage } from '../../utils/AudioStorage'
import { Reorder } from 'framer-motion'

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

// Color Manipulation Helpers
const hexToHsl = (hex) => {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) h = s = 0;
  else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
};

const hslToHex = (h, s, l) => {
  let r, g, b;
  if (s === 0) r = g = b = l;
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    let p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = x => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r).padStart(2, '0')}${toHex(g).padStart(2, '0')}${toHex(b).padStart(2, '0')}`;
};

const adjustLightness = (hex, amount) => {
  try {
    const [h, s, l] = hexToHsl(hex);
    const newL = Math.max(0, Math.min(1, l + amount));
    return hslToHex(h, s, newL);
  } catch (e) { return hex; }
};

const adjustSaturation = (hex, amount) => {
  try {
    const [h, s, l] = hexToHsl(hex);
    const newS = Math.max(0, Math.min(1, s + amount));
    return hslToHex(h, newS, l);
  } catch (e) { return hex; }
};

const generateRandomHex = () => {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
};

export default function SettingsView({
  latency = 0,
  localWs = '',
  setLocalWs = () => { },
  ngrokWs = '',
  setNgrokWs = () => { },
  connect = () => { },
  activeSection: controlledSection,
  onSectionChange
}) {
  const {
    themes,
    currentTheme,
    currentThemeId,
    setTheme,
    addTheme,
    addFullTheme,
    updateTheme,
    updateThemeColor,
    removeTheme,
    resetThemes,
    resetThemeColors,
    reorderThemes,
    toggleThemeVisibility,
    updateThemeOrder
  } = useTheme()

  const { user, logout } = useAuth()

  const { settings, updateDeepSettings } = useSettings()

  // Telemetry state
  const [fps, setFps] = useState(0);
  const [activeSection, setActiveSection] = useState(controlledSection || 'account');

  // Sync with prop
  useEffect(() => {
    if (controlledSection) {
      setActiveSection(controlledSection);
    }
  }, [controlledSection]);

  const handleSectionChange = (id) => {
    setActiveSection(id);
    if (onSectionChange) onSectionChange(id);
  };

  // Theme Builder State
  const [builderName, setBuilderName] = useState('Custom Theme');
  const [builderId, setBuilderId] = useState('theme-custom-theme');
  const [builderTab, setBuilderTab] = useState('json'); // 'json' or 'visual'
  const [builderJsonText, setBuilderJsonText] = useState('{\n  "accent": "#0ea5e9",\n  "navBase": "#020617",\n  "navPill": "#0ea5e9",\n  "colors": {\n    "--bg": "#020617",\n    "--surface": "#0f172a",\n    "--text": "#f8fafc",\n    "--muted": "#94a3b8",\n    "--primary": "#38bdf8",\n    "--primary-contrast": "#0f172a",\n    "--accent": "#0ea5e9",\n    "--border": "#1e293b",\n    "--shadow": "rgba(0, 0, 0, 0.4)",\n    "--day": "#f8fafc",\n    "--night": "#020617",\n    "--tree-day": "#38bdf8",\n    "--tree-night": "#1e293b",\n    "--cloud-day": "#ffffff",\n    "--cloud-night": "#334155",\n    "--sun-day": "#38bdf8",\n    "--sun-night": "#38bdf8",\n    "--moon-day": "#ffffff",\n    "--moon-night": "#cbd5e1",\n    "--sky-day": "#e0f2fe",\n    "--sky-night": "#020617",\n    "--text-secondary": "#cbd5e1",\n    "--text-tertiary": "#94a3b8",\n    "--text-highlight": "#38bdf8",\n    "--text-error": "#ef4444",\n    "--text-success": "#22c55e",\n    "--title": "#38bdf8",\n    "--heading": "#f8fafc",\n    "--label": "#94a3b8",\n    "--section-bg": "#0f172a",\n    "--section-border": "#1e293b",\n    "--panel-bg": "#020617",\n    "--panel-border": "#1e293b",\n    "--header-bg": "#0f172a",\n    "--header-text": "#f8fafc",\n    "--event-bg": "#0f172a",\n    "--event-border": "#1e293b",\n    "--event-text": "#cbd5e1",\n    "--selection-bg": "rgba(56, 189, 248, 0.15)",\n    "--selection-border": "#38bdf8",\n    "--graph-line-1": "#38bdf8",\n    "--graph-line-2": "#0ea5e9",\n    "--graph-bg": "#020617",\n    "--graph-grid": "rgba(56, 189, 248, 0.1)",\n    "--graph-text": "#cbd5e1"\n  }\n}');
  const [builderError, setBuilderError] = useState('');

  // Native HTML5 UI Drag and Drop
  const [draggedThemeId, setDraggedThemeId] = useState(null);

  const handleDragStart = (e, id) => {
    setDraggedThemeId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setTimeout(() => { if (e.target) e.target.style.opacity = '0.4'; }, 0);
  };

  const handleDragEnter = (e, targetId) => {
    e.preventDefault();
    if (!draggedThemeId || draggedThemeId === targetId) return;
    const newThemes = [...themes];
    const sourceIdx = newThemes.findIndex(t => t.id === draggedThemeId);
    const targetIdx = newThemes.findIndex(t => t.id === targetId);
    if (sourceIdx < 0 || targetIdx < 0) return;
    const [movedObj] = newThemes.splice(sourceIdx, 1);
    newThemes.splice(targetIdx, 0, movedObj);
    reorderThemes(newThemes);
  };

  const handleDragEnd = (e) => {
    setDraggedThemeId(null);
    if (e.target) e.target.style.opacity = '1';
  };

  useEffect(() => {
    setBuilderId('theme-' + builderName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''));
  }, [builderName]);

  const handleSaveBuiltTheme = () => {
    setBuilderError('');
    try {
      const parsed = JSON.parse(builderJsonText);
      const reqCols = ['--bg', '--surface', '--text', '--primary', '--accent', '--border'];
      if (!parsed.colors) { setBuilderError('Missing "colors" object.'); return; }
      const missing = reqCols.filter(c => !parsed.colors[c]);
      if (missing.length > 0) { setBuilderError(`Missing required colors: ${missing.join(', ')}`); return; }

      const newTheme = {
        id: builderId,
        name: builderName,
        type: 'custom',
        accent: parsed.accent || parsed.colors['--accent'],
        navBase: parsed.navBase || parsed.colors['--bg'],
        navPill: parsed.navPill || parsed.colors['--primary'],
        colors: parsed.colors
      };

      if (themes.some(t => t.id === newTheme.id)) {
        setBuilderError(`Theme ID "${newTheme.id}" already exists. Use a unique name.`);
        return;
      }

      addFullTheme(newTheme);
      setBuilderError('Success!');
      setTimeout(() => setBuilderError(''), 3000);
    } catch (e) {
      setBuilderError('Invalid JSON format.');
    }
  };

  // Editor state
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');

  // Keybinding state
  const [listeningKeyFor, setListeningKeyFor] = useState(null);

  // Appearance Preview state
  const [previewLineWidth1, setPreviewLineWidth1] = useState(65);
  const [previewLineWidth2, setPreviewLineWidth2] = useState(45);
  const [showPreviewLines, setShowPreviewLines] = useState(true);
  const [showTuning, setShowTuning] = useState(false);


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

  // fps detection effect removed for brevity here, but assuming it stays...
  // (Simplified for instruction, keeping existing fps effect)

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
    <div className="font-sans absolute inset-0 pt-[85px] flex overflow-hidden bg-bg text-text">
      {/* Background Image Overlay */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: 'url("/Resources/Nenural Brain .png")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.05,
          filter: 'grayscale(0.4) brightness(1)'
        }}
      />
      {/* ── SIDEBAR ── */}
      <aside className="w-[66px] bg-surface/90 border-r border-border flex flex-col items-center py-4 gap-1 shrink-0 z-20">
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
              onClick={() => handleSectionChange(item.id)}
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
      <main className={`flex-1 overflow-x-hidden px-5 py-6 flex flex-col min-w-0 ${activeSection === 'appearance' ? 'overflow-y-hidden' : 'overflow-y-auto custom-scrollbar'}`}>
        <style dangerouslySetInnerHTML={{
          __html: `
          .hide-scroll::-webkit-scrollbar { display: none; }
          .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
          .bg-checkered {
             background-image: linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%);
             background-size: 8px 8px;
             background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
          }
        `}} />
        <div className="w-full h-full flex flex-col gap-6">
          {/* APPEARANCE */}
          {activeSection === 'appearance' && (
            <div className="flex flex-col lg:flex-row gap-6 animate-fade-in items-start h-full">

              {/* LEFT PANEL: Theme Organizer */}
              <div className="flex-[3] flex flex-col gap-4 w-full h-full">
                <div className="flex items-start justify-between gap-3 shrink-0">
                  <div>
                    <h2 className="text-[22px] font-bold tracking-tight">Appearance</h2>
                    <p className="text-[13px] text-muted mt-1">Organize your dashboard themes (Drag cards to reorder)</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={resetThemes} className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold tracking-[0.06em] cursor-pointer border border-border bg-surface/95 text-muted hover:text-text hover:border-white/20 transition-all">Reset Defaults</button>
                  </div>
                </div>

                <div className="bg-surface/95 border border-border rounded-2xl overflow-hidden shadow-lg flex-1 flex flex-col min-h-0">
                  <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3 shrink-0">
                    <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-muted flex items-center gap-2">
                      <Palette size={14} className="opacity-70" strokeWidth={1.8} /> Color Themes
                    </span>
                  </div>
                  <div className="p-5 flex flex-col gap-4 overflow-y-auto hide-scroll flex-1">
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 place-content-start">
                      {themes.map((t) => (
                        <div
                          key={t.id}
                          draggable="true"
                          onDragStart={(e) => handleDragStart(e, t.id)}
                          onDragEnter={(e) => handleDragEnter(e, t.id)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(e) => e.preventDefault()}
                          onClick={() => setTheme(t.id)}
                          className={`relative border rounded-xl p-5 min-h-[100px] flex flex-col justify-end cursor-grab active:cursor-grabbing transition-all bg-surface/80 hover:scale-[1.02] ${draggedThemeId === t.id ? 'opacity-40 border-dashed border-primary/50' : ''} ${currentThemeId === t.id ? 'border-primary ring-1 ring-primary/50 shadow-[0_0_20px_rgba(0,200,240,0.08)]' : 'border-border/50 hover:border-border'}`}
                        >
                          {/* Inline Toggles & Actions */}
                          <div className="absolute top-2.5 right-2.5 flex items-center gap-2 z-10">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setBuilderName(`${t.name} Draft`);
                                setBuilderJsonText(JSON.stringify({
                                  accent: t.accent || t.colors['--accent'],
                                  navBase: t.navBase || t.colors['--bg'],
                                  navPill: t.navPill || t.colors['--primary'],
                                  colors: t.colors
                                }, null, 2));
                                setBuilderTab('visual');
                              }}
                              className="w-[22px] h-[22px] rounded flex items-center justify-center bg-surface border border-border hover:bg-primary/20 hover:border-primary/50 hover:text-primary transition-all text-muted shadow-sm"
                              title="Load into Builder"
                            >
                              <Copy size={11} strokeWidth={2.5} />
                            </button>

                            <div
                              className="w-[16px] h-[16px] rounded-full border cursor-pointer flex items-center justify-center transition-transform hover:scale-110 bg-surface shadow-sm"
                              onClick={(e) => { e.stopPropagation(); toggleThemeVisibility(t.id); }}
                              style={{ borderColor: t.visible !== false ? t.colors['--primary'] : 'var(--border)' }}
                              title={t.visible !== false ? "Theme Enabled. Click to disable" : "Theme Disabled. Click to enable"}
                            >
                              {t.visible !== false && <div className="w-[8px] h-[8px] rounded-full" style={{ backgroundColor: t.colors['--primary'] }} />}
                            </div>
                          </div>

                          <div className="flex gap-2.5 mb-2.5 pointer-events-none pr-12">
                            <div className="w-[14px] h-[14px] rounded-full shadow-sm border border-black/20" style={{ backgroundColor: t.colors['--bg'] }} />
                            <div className="w-[14px] h-[14px] rounded-full shadow-sm border border-black/20" style={{ backgroundColor: t.colors['--primary'] }} />
                            <div className="w-[14px] h-[14px] rounded-full shadow-sm border border-black/20" style={{ backgroundColor: t.colors['--accent'] }} />
                          </div>
                          <div className={`text-[14px] font-bold tracking-tight leading-[1.3] truncate pointer-events-none ${currentThemeId === t.id ? 'text-primary drop-shadow-[0_0_8px_var(--primary)] text-shadow-glow' : 'text-text'}`}>{t.name}</div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-surface/80 rounded-xl px-4 py-3.5 border border-border flex flex-col gap-3 mt-4">
                      <div className="flex items-center gap-3.5 w-full">
                        <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted shrink-0">Active Indicator</div>
                        <div className="flex-1 flex flex-col gap-1.5 min-h-[16px] justify-center">
                          <div className="h-1.5 rounded-full transition-all duration-300" style={{ width: `${previewLineWidth1}%`, backgroundColor: currentTheme.colors['--primary'] || 'var(--primary)' }} />
                          <div className="h-1.5 rounded-full transition-all duration-300" style={{ width: `${previewLineWidth2}%`, backgroundColor: currentTheme.colors['--accent'] || 'var(--accent)' }} />
                        </div>
                        <div className="flex gap-2 items-center">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentTheme.colors['--bg'] || 'var(--bg)' }} />
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentTheme.colors['--primary'] || 'var(--primary)' }} />
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentTheme.colors['--accent'] || 'var(--accent)' }} />
                          <div className="h-4 w-px bg-border/50 mx-1" />
                          <button onClick={() => setShowTuning(!showTuning)} className={`p-1.5 rounded-md transition-all ${showTuning ? 'text-primary' : 'text-muted hover:text-text'}`} title="Tune Lines">
                            <Settings size={14} className={showTuning ? 'animate-spin-slow' : ''} />
                          </button>
                        </div>
                      </div>
                      {showTuning && (
                        <div className="flex flex-col gap-3 pt-3 border-t border-border/10 animate-in fade-in slide-in-from-top-1 duration-200">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex justify-between text-[8px] font-bold text-muted uppercase">
                                <span>Line 1 Scale</span><span className="text-primary">{previewLineWidth1}%</span>
                              </div>
                              <input type="range" min="5" max="100" value={previewLineWidth1} onChange={(e) => setPreviewLineWidth1(parseInt(e.target.value))} className="w-full h-1 bg-surface-hover rounded-full appearance-none cursor-pointer" style={{ accentColor: 'var(--primary)' }} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <div className="flex justify-between text-[8px] font-bold text-primary uppercase">
                                <span>Line 2 Scale</span><span className="text-accent">{previewLineWidth2}%</span>
                              </div>
                              <input type="range" min="5" max="100" value={previewLineWidth2} onChange={(e) => setPreviewLineWidth2(parseInt(e.target.value))} className="w-full h-1 bg-surface-hover rounded-full appearance-none cursor-pointer" style={{ accentColor: 'var(--accent)' }} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex justify-between text-[8px] font-bold uppercase text-primary">
                                <span>Primary Intensity</span>
                                <span>{(hexToHsl(currentTheme.colors['--primary'] || '#000000')[1] * 100).toFixed(0)}%</span>
                              </div>
                              <input type="range" min="0" max="1" step="0.01"
                                value={hexToHsl(currentTheme.colors['--primary'] || '#000000')[1]}
                                onChange={(e) => {
                                  const [h, s, l] = hexToHsl(currentTheme.colors['--primary']);
                                  updateThemeColor(currentThemeId, '--primary', hslToHex(h, parseFloat(e.target.value), l));
                                }}
                                className="w-full h-1 bg-surface-hover rounded-full appearance-none cursor-pointer" style={{ accentColor: 'var(--primary)' }}
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <div className="flex justify-between text-[8px] font-bold uppercase text-accent">
                                <span>Accent Intensity</span>
                                <span>{(hexToHsl(currentTheme.colors['--accent'] || '#000000')[1] * 100).toFixed(0)}%</span>
                              </div>
                              <input
                                type="range" min="0" max="1" step="0.01"
                                value={hexToHsl(currentTheme.colors['--accent'] || '#000000')[1]}
                                onChange={(e) => {
                                  const [h, s, l] = hexToHsl(currentTheme.colors['--accent']);
                                  updateThemeColor(currentThemeId, '--accent', hslToHex(h, parseFloat(e.target.value), l));
                                }}
                                className="w-full h-1 bg-surface-hover rounded-full appearance-none cursor-pointer" style={{ accentColor: 'var(--accent)' }}
                              />
                            </div>
                          </div>

                          <button
                            onClick={() => { resetThemeColors(currentThemeId); setShowTuning(false); }}
                            className="text-[9px] font-bold text-primary self-center hover:underline flex items-center gap-1 opacity-70 hover:opacity-100 py-1"
                          >
                            <RefreshCw size={10} /> Full Restore (Source Colors)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div> {/* End of Left Panel */}

              {/* RIGHT PANEL: Theme Builder */}
              <div className="flex-[2] flex flex-col w-full h-[calc(100vh-120px)] sticky top-6">
                <div className="bg-surface/90 border border-border rounded-2xl overflow-hidden shadow-lg flex flex-col h-full">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 bg-surface z-10 shrink-0">
                    <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-text flex items-center gap-2">
                      <Plus size={14} className="opacity-70 text-primary" strokeWidth={1.8} /> Theme Builder
                    </span>
                    <button onClick={handleSaveBuiltTheme} className="px-4 py-1.5 bg-primary/10 text-primary border border-primary/40 rounded-lg hover:bg-primary/20 text-[10px] font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(0,180,255,0.1)]">
                      Save Theme
                    </button>
                  </div>

                  {/* Mode Toggle */}
                  <div className="flex border-b border-border/50 text-[10px] uppercase font-bold tracking-widest bg-surface/50 shrink-0">
                    <button onClick={() => setBuilderTab('json')} className={`flex-1 py-3 border-b-2 transition-all ${builderTab === 'json' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted hover:text-text'}`}>
                      Raw JSON
                    </button>
                    <button onClick={() => setBuilderTab('visual')} className={`flex-1 py-3 border-b-2 transition-all ${builderTab === 'visual' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted hover:text-text'}`}>
                      Visual UI
                    </button>
                  </div>

                  <div className="p-5 flex flex-col gap-6 overflow-y-auto hide-scroll flex-1">
                    <div className="flex flex-col gap-2 relative">
                      <label className="text-[10px] uppercase font-bold text-muted tracking-widest">Theme Name</label>
                      <input
                        type="text"
                        value={builderName}
                        onChange={e => setBuilderName(e.target.value)}
                        className="bg-bg border border-border/80 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 text-text transition-all"
                      />
                      <div className="flex justify-between items-center mt-1 px-1">
                        <span className="text-[10px] font-mono text-muted/70 tracking-tight">ID: <span className="text-primary/70">{builderId}</span></span>
                        <span className="text-[10px] font-mono text-muted/70 tracking-tight">{builderId}.json</span>
                      </div>
                    </div>

                    {builderTab === 'json' && (
                      <div className="flex flex-col gap-2 flex-1">
                        <div className="flex justify-between items-end mb-1">
                          <label className="text-[10px] uppercase font-bold text-muted tracking-widest">JSON Definition</label>
                          <span className="text-[9px] text-muted/60 uppercase font-bold">Raw Import</span>
                        </div>
                        <p className="text-[12px] text-muted mb-1 leading-relaxed">Paste your full theme <code className="text-primary bg-primary/10 px-1 rounded">json</code> mapping below. Missing essential tokens will block saving.</p>
                        <textarea
                          value={builderJsonText}
                          onChange={e => setBuilderJsonText(e.target.value)}
                          className="bg-[#0a0a0c] border border-border/80 rounded-xl p-5 text-[14px] font-mono text-[#a5d6a7] min-h-[500px] h-full flex-1 outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 shadow-inner resize-y custom-scrollbar leading-relaxed"
                          spellCheck="false"
                        />
                      </div>
                    )}

                    {builderTab === 'visual' && (() => {
                      let colorsObj = {};
                      try { colorsObj = JSON.parse(builderJsonText).colors || {}; } catch (e) { }

                      return (
                        <div className="flex flex-col gap-4">
                          <div className="flex justify-between items-end mb-1">
                            <label className="text-[10px] uppercase font-bold text-muted tracking-widest">Visual Color Editor</label>
                            <span className="text-[9px] text-muted/60 uppercase font-bold">Complete Palette</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
                            {Object.entries(colorsObj).map(([key, val]) => {
                              const label = key.replace('--', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                              return (
                                <div key={key} className="flex flex-col p-3 border border-border/50 rounded-lg bg-bg/50 group hover:border-primary/40 transition-all shadow-sm gap-2">
                                  <div className="flex justify-between items-start">
                                    <div className="flex flex-col truncate pr-2">
                                      <span className="text-[12px] font-bold text-text group-hover:text-primary transition-colors">{label}</span>
                                      <span className="text-[9px] text-muted font-mono tracking-tighter opacity-70">{key}</span>
                                    </div>
                                    <div className="relative w-[28px] h-[28px] rounded-lg overflow-hidden border border-border shrink-0 shadow-inner group-hover:scale-110 transition-transform bg-checkered">
                                      <div className="absolute inset-0" style={{ backgroundColor: val }} />
                                      <input
                                        type="color"
                                        value={val && typeof val === 'string' && val.length >= 7 ? val.substring(0, 7) : '#000000'}
                                        onChange={(e) => {
                                          try {
                                            const p = JSON.parse(builderJsonText);
                                            if (!p.colors) p.colors = {};
                                            p.colors[key] = e.target.value;
                                            if (key === '--bg') p.navBase = e.target.value;
                                            if (key === '--primary') p.navPill = e.target.value;
                                            if (key === '--accent') p.accent = e.target.value;
                                            setBuilderJsonText(JSON.stringify(p, null, 2));
                                          } catch (err) { }
                                        }}
                                        className="absolute -top-4 -left-4 w-[64px] h-[64px] cursor-pointer opacity-0"
                                      />
                                    </div>
                                  </div>
                                  <input
                                    type="text"
                                    value={val}
                                    onChange={(e) => {
                                      try {
                                        const p = JSON.parse(builderJsonText);
                                        if (!p.colors) p.colors = {};
                                        p.colors[key] = e.target.value;
                                        if (key === '--bg') p.navBase = e.target.value;
                                        if (key === '--primary') p.navPill = e.target.value;
                                        if (key === '--accent') p.accent = e.target.value;
                                        setBuilderJsonText(JSON.stringify(p, null, 2));
                                      } catch (err) { }
                                    }}
                                    className="w-full bg-surface/50 border border-border/60 rounded px-2 py-1.5 text-[11px] font-mono text-muted focus:text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all placeholder:text-muted/30"
                                    placeholder="HEX or RGBA"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {builderError && (
                      <div className={`text-[12px] font-bold mt-2 px-3 py-2.5 rounded-lg border flex items-center gap-2 shrink-0 ${builderError === 'Success!' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                        {builderError === 'Success!' ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> : <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                        {builderError}
                      </div>
                    )}

                    <div className="h-[60px] shrink-0 w-full" /> {/* Spacer for footer */}
                  </div>
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

              <div className="bg-surface/95 border border-border rounded-2xl overflow-hidden shadow-lg">
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
                        <input type="text" value={settings.general.apiUrl} onChange={e => updateDeepSettings('general.apiUrl', e.target.value)} className="w-full px-4 py-2 bg-bg border border-border rounded-xl outline-none focus:border-primary text-sm font-mono tabular-nums transition-all" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Active Master Socket</label>
                        <input type="text" value={settings.general.wsUrl} onChange={e => updateDeepSettings('general.wsUrl', e.target.value)} className="w-full px-4 py-2 bg-bg border border-border rounded-xl outline-none focus:border-primary text-sm font-mono tabular-nums transition-all" />
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
                      <input type="checkbox" checked={settings.general.useMock} onChange={e => updateDeepSettings('general.useMock', e.target.checked)} className="sr-only peer" />
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

              <div className="bg-surface/95 border border-border rounded-2xl overflow-hidden shadow-lg">
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

              <div className="bg-surface/95 border border-border rounded-2xl overflow-hidden shadow-lg">
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

              <div className="bg-surface/95 border border-border rounded-2xl overflow-hidden shadow-lg mt-2">
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
                <div className="bg-surface/95 border border-border rounded-xl p-4 flex flex-col relative overflow-hidden">
                  <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-muted mb-2">Neural Pipeline</div>
                  <div className="text-[28px] font-bold tracking-tight leading-none text-text">{latency > 0 ? latency : '—'}<span className="text-[13px] font-normal text-muted ml-1">ms</span></div>
                  <div className={`text-[12px] mt-1 ${latency > 0 ? 'text-emerald-500' : 'text-red-500'}`}>{latency > 0 ? 'Connected' : 'No device connected'}</div>
                  <div className="absolute right-0 bottom-0 flex items-end gap-[3px] opacity-30 p-3 h-[40px] pointer-events-none">
                    {[...Array(10)].map((_, i) => <div key={i} className="w-[3px] bg-primary rounded-t-[2px]" style={{ height: `${Math.floor(Math.random() * 20 + 4)}px` }} />)}
                  </div>
                </div>
                <div className="bg-surface/95 border border-border rounded-xl p-4 flex flex-col">
                  <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-muted mb-2">Sync Refresh</div>
                  <div className="text-[28px] font-bold tracking-tight leading-none text-text tabular-nums">{fps}<span className="text-[13px] font-normal text-muted ml-1">fps</span></div>
                  <div className="text-[12px] mt-1 text-muted">Frontend rendering speed</div>
                </div>
              </div>
            </div>
          )}
          {/* ACCOUNT */}
          {activeSection === 'account' && (
            <div className="flex flex-col gap-6 animate-fade-in w-full">
              <div className="flex flex-col items-center justify-center gap-1.5 mb-5 text-center px-4">
                <h2 className="text-[26px] font-black tracking-tight text-white flex items-center justify-center gap-3">
                  <div className="p-2 bg-amber-500/50 rounded-xl border border-amber-500/15">
                    <UserPlus className="text-amber-500" size={22} strokeWidth={2.5} />
                  </div>
                  Account Overview
                </h2>
                <p className="text-[13px] text-muted max-w-[450px]">Manage operator settings and link credentials in a compact view</p>
              </div>

              <div className="flex flex-col gap-4 mt-1">
                {/* Profile */}
                <div className="bg-surface/90 border border-amber-500/20 rounded-2xl p-6 relative overflow-hidden group shadow-[0_8px_32px_rgba(0,0,0,0.15)]">
                  <div className="flex items-center gap-6 relative z-10">
                    <div className="relative">
                      <div className="w-[60px] h-[60px] rounded-2xl bg-amber-500/50 border border-amber-500/30 flex items-center justify-center text-[28px] font-black text-amber-500 shadow-inner">
                        {user?.avatarUrl ? <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : (user?.username?.charAt(0).toUpperCase() || 'U')}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full bg-emerald-500 border-[3px] border-[#18181b] shadow-[0_0_12px_rgba(16,185,129,0.5)]"></div>
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] tracking-[0.2em] text-amber-500/80 uppercase font-black flex items-center gap-2 mb-1.5 px-0.5">
                        <Activity size={10} className="text-amber-500" /> Neural Operator
                      </div>
                      <div className="text-[22px] font-bold tracking-tight text-white leading-tight mb-0.5 group-hover:text-amber-500 transition-colors duration-300 uppercase">{user?.username || 'ANONYMOUS'}</div>
                      <div className="text-[13px] text-muted flex items-center gap-2 mt-0.5 opacity-80">{user?.email || 'operator@neurotech.bci'}</div>
                    </div>
                  </div>

                  {user && (
                    <div className="mt-4 pt-0 relative z-10">
                      <button onClick={logout} className="w-full py-2.5 rounded-xl border border-red-500/20 bg-red-500/5 text-red-500 text-[11px] font-bold tracking-[0.1em] uppercase cursor-pointer hover:bg-red-500/10 transition-all flex items-center justify-center gap-2">
                        <Power size={14} className="opacity-80" /> Disconnect Link
                      </button>
                    </div>
                  )}
                </div>

                {/* Quick Info */}
                <div className="bg-surface/90 border border-amber-500/25 rounded-2xl overflow-hidden flex flex-col group shadow-[0_8px_32px_rgba(0,0,0,0.15)]">
                  <div className="px-5 py-3 border-b border-amber-500/15 flex items-center gap-3 relative z-10 bg-amber-500/30">
                    <Database size={17} className="text-amber-500" strokeWidth={2.5} />
                    <span className="text-[13px] font-black tracking-[0.15em] uppercase text-text flex items-center gap-2">
                      System Status
                    </span>
                  </div>

                  <div className="grid grid-cols-1 flex-1 p-4 gap-2 relative z-10">
                    {[
                      { label: 'Available themes', value: themes.length, icon: Palette },
                      { label: 'Active hotkeys', value: Object.keys(settings.keymap?.collection || {}).length, icon: Keyboard },
                      { label: 'Device status', value: latency > 0 ? 'Online' : 'Offline', icon: Activity, isStatus: true },
                      { label: 'Target Protocol', value: (settings.general.wsUrl || '').replace('ws://', '').replace('wss://', ''), icon: Globe, highlight: true }
                    ].map((stat, i) => {
                      const StatIcon = stat.icon;
                      return (
                        <div key={i} className="flex justify-between items-center gap-3 px-4 py-3 rounded-xl hover:bg-amber-500/30 border border-amber-500/5 hover:border-amber-500/20 transition-all duration-300 group/item bg-[#000000]/15 shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-bg/50 border border-amber-500/20 flex items-center justify-center shadow-inner text-amber-500/80 group-hover/item:text-amber-500 transition-colors duration-300 shrink-0">
                              <StatIcon size={16} strokeWidth={2} />
                            </div>
                            <span className="text-[13px] text-muted font-bold group-hover/item:text-white transition-colors duration-300 leading-tight uppercase tracking-tight">{stat.label}</span>
                          </div>
                          <span className={`font-black ${stat.isStatus ? (latency > 0 ? 'text-emerald-500 drop-shadow-[0_0_6px_rgba(16,185,129,0.3)] text-[14px]' : 'text-red-500 font-medium text-[14px]') : (stat.highlight ? 'text-amber-400 font-mono text-[11px] bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20 cursor-default shadow-sm inline-block max-w-[150px] truncate' : 'text-text text-[15px]')}`}>
                            {stat.value}
                          </span>
                        </div>
                      )
                    })}
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
