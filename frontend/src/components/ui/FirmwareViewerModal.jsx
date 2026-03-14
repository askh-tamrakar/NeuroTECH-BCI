import React, { useState, useEffect } from 'react';
import { X, Download, Copy, Check, Terminal } from 'lucide-react';
import { firmwares } from '../../data/firmwareData';

// Simple regex-based syntax highlighter for Arduino/C++
const highlightSyntax = (code) => {
  if (!code) return '';
  let highlighted = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Comments (// ...)
  highlighted = highlighted.replace(/(\/\/.*)/g, '<span class="text-emerald-500/70 italic">$1</span>');
  // Strings ("...")
  highlighted = highlighted.replace(/(".*?")/g, '<span class="text-amber-300">$1</span>');
  // Keywords
  const keywords = ['void', 'int', 'float', 'bool', 'boolean', 'char', 'const', 'volatile', 'static', 'if', 'else', 'for', 'while', 'return', 'true', 'false'];
  const keywordRegex = new RegExp(`\\\\b(${keywords.join('|')})\\\\b`, 'g');
  highlighted = highlighted.replace(keywordRegex, '<span class="text-sky-400 font-bold">$1</span>');
  // Preprocessor directives (#include, #define)
  highlighted = highlighted.replace(/(#(?:include|define).*)/g, '<span class="text-fuchsia-400">$1</span>');
  // Functions
  highlighted = highlighted.replace(/([a-zA-Z0-9_]+)(?=\\)/g, '<span class="text-amber-200">$1</span>');

  return highlighted;
};

export default function FirmwareViewerModal({ isOpen, onClose }) {
  const [selectedFirmwareId, setSelectedFirmwareId] = useState(firmwares[0]?.id || '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(t);
    }
  }, [copied]);

  if (!isOpen) return null;

  const currentFirmware = firmwares.find(f => f.id === selectedFirmwareId) || firmwares[0];

  const handleCopy = () => {
    if (currentFirmware) {
      navigator.clipboard.writeText(currentFirmware.content);
      setCopied(true);
    }
  };

  const handleDownload = () => {
    if (currentFirmware) {
      const blob = new Blob([currentFirmware.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentFirmware.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-surface border-2 border-primary/20 rounded-[2rem] shadow-2xl shadow-black/50 overflow-hidden relative"
      >
        {/* Glow Effects */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent/20 rounded-full blur-[100px] pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-bg/50 backdrop-blur-md relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/20 text-primary rounded-xl shadow-glow">
              <Terminal size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter text-text">Arduino Firmware</h2>
              <p className="text-sm font-medium text-muted">Neurotech Controller Source Code</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 bg-bg text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all border-2 border-transparent hover:border-red-500/20 active:scale-95"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-6 relative z-10">

          {/* Selector */}
          <div className="space-y-2 shrink-0">
            <label className="text-xs font-black uppercase tracking-widest text-primary">Target Hardware Configuration</label>
            <div className="relative">
              <select
                value={selectedFirmwareId}
                onChange={(e) => setSelectedFirmwareId(e.target.value)}
                className="w-full appearance-none bg-bg border-2 border-border/50 text-text text-lg font-bold px-5 py-4 rounded-xl outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all cursor-pointer shadow-inner"
              >
                {firmwares.map(fw => (
                  <option key={fw.id} value={fw.id}>{fw.name} - {fw.description}</option>
                ))}
              </select>
              <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </div>
            </div>
          </div>

          {/* Code Viewer */}
          <div className="flex-1 bg-[#0a0a0c] border-2 border-border/50 rounded-2xl overflow-hidden relative group hover:border-primary/30 transition-all flex flex-col shadow-inner min-h-[300px]">
            <div className="absolute top-0 w-full h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-green-500/50" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted/50 font-bold">{currentFirmware?.name}</span>
            </div>

            <pre className="flex-1 overflow-auto p-4 m-0 custom-scrollbar text-sm font-mono leading-relaxed text-slate-300">
              <code dangerouslySetInnerHTML={{ __html: highlightSyntax(currentFirmware?.content) }} />
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-border/50 bg-bg/50 backdrop-blur-md flex items-center justify-end gap-4 shrink-0 relative z-10">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-6 py-3 bg-surface text-text hover:text-primary rounded-xl font-bold uppercase tracking-widest text-sm transition-all border-2 border-border hover:border-primary/40 active:scale-95 shadow-lg"
          >
            {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-contrast rounded-xl font-black uppercase tracking-widest text-sm transition-all shadow-glow hover:scale-105 active:scale-95 border border-white/10"
          >
            <Download size={18} />
            Download .INO
          </button>
        </div>

      </div>
    </div>
  );
}
