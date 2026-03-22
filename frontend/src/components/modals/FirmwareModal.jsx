import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Download, Check, Cpu, Calendar, Info, Code, Zap, Loader2 } from 'lucide-react';

const SyntaxHighlighted = ({ content }) => {
  const lines = content.split('\n');
  
  return (
    <pre className="font-mono text-lg leading-relaxed p-6 inline-block min-w-full">
        {lines.map((line, i) => {
          if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')) {
            return <div key={i} className="text-muted/30 italic">{line}</div>;
          }
          if (line.trim().startsWith('#')) {
            return <div key={i} className="text-secondary font-bold">{line}</div>;
          }
          if (line.includes('(') && line.includes(')')) {
            const parts = line.split(/(\(|\))/);
            return (
              <div key={i} className="whitespace-pre">
                <span className="text-primary/90 font-bold">{parts[0]}</span>
                <span className="text-text/20">(</span>
                <span className="text-accent italic">{parts[2]}</span>
                <span className="text-text/20">)</span>
                <span className="text-text/60">{parts.slice(4).join('')}</span>
              </div>
            );
          }
          return <div key={i} className="text-text/80 whitespace-pre">{line}</div>;
        })}
      </pre>
  );
};

export default function FirmwareModal({ isOpen, onClose }) {
  const [firmwareList, setFirmwareList] = useState([]);
  const [selectedFw, setSelectedFw] = useState(null);
  const [fwContent, setFwContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch manifest
  useEffect(() => {
    if (isOpen) {
      setManifestLoading(true);
      fetch('/firmware/firmware.json')
        .then(res => res.json())
        .then(data => {
          setFirmwareList(data.firmwares);
          if (data.firmwares.length > 0) {
            setSelectedFw(data.firmwares[0]);
          }
          setManifestLoading(false);
        })
        .catch(err => {
          console.error('Failed to load firmware manifest:', err);
          setManifestLoading(false);
        });
    }
  }, [isOpen]);

  // Fetch firmware content when selection changes
  useEffect(() => {
    if (selectedFw) {
      setLoading(true);
      fetch(`/firmware/${selectedFw.file}`)
        .then(res => {
          if (!res.ok) throw new Error('File not found');
          return res.text();
        })
        .then(text => {
          setFwContent(text);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load firmware content:', err);
          setFwContent('// Error loading firmware source: ' + err.message);
          setLoading(false);
        });
    }
  }, [selectedFw]);

  const handleCopy = () => {
    navigator.clipboard.writeText(fwContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!selectedFw) return;
    const blob = new Blob([fwContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFw.file;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-['Inter']">
          <style>{`
            .fw-scroll::-webkit-scrollbar {
              width: 8px;
              height: 8px;
            }
            .fw-scroll::-webkit-scrollbar-track {
              background: rgba(0, 0, 0, 0.4);
            }
            .fw-scroll::-webkit-scrollbar-thumb {
              background: rgba(255, 255, 255, 0.15);
              border-radius: 4px;
              border: 1px solid rgba(0, 0, 0, 0.2);
            }
            .fw-scroll::-webkit-scrollbar-thumb:hover {
              background: rgba(255, 255, 255, 0.3);
            }
            .fw-scroll::-webkit-scrollbar-corner {
              background: transparent;
            }

            .sidebar-scroll::-webkit-scrollbar {
              width: 5px;
            }
            .sidebar-scroll::-webkit-scrollbar-track {
              background: transparent;
            }
            .sidebar-scroll::-webkit-scrollbar-thumb {
              background: rgba(255, 255, 255, 0.2);
              border-radius: 10px;
            }
            .sidebar-scroll::-webkit-scrollbar-thumb:hover {
              background: rgba(255, 255, 255, 0.4);
            }
          `}</style>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
          />
          
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 30 }}
            className="relative w-full max-w-5xl h-[85vh] border border-border/20 rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col"
            style={{
              background: 'linear-gradient(135deg, rgba(5,5,10,1) 0%, rgba(15,15,20,1) 50%, rgba(5,5,10,1) 100%)',
            }}
          >
            {/* Theme Vibrant Gradient Layer */}
            <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
              style={{ background: 'linear-gradient(45deg, var(--primary) 0%, var(--accent) 50%, var(--secondary) 100%)' }} 
            />
            
            {/* Vibrant Texture Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.02] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />
            
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-30" />

            {/* Header */}
            <div className="p-6 border-b border-border/10 flex items-center justify-between bg-black/10 backdrop-blur-md">
              <div className="flex items-center gap-6">
                <div className="p-3 bg-primary/20 rounded-xl shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)] border border-primary/30">
                  <Cpu className="text-primary" size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold font-['Outfit'] text-text uppercase tracking-tight">Firmware Repository</h2>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] text-primary font-bold uppercase tracking-[0.3em] bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">Dynamic Matrix</span>
                    <span className="text-[9px] text-muted/40 font-bold uppercase tracking-[0.3em] border-l border-border/10 pl-3">Sync Active</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-xl transition-all hover:rotate-90 text-muted/20 hover:text-text"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar */}
              <div className="w-[280px] border-r border-border/10 bg-black/20 p-5 flex flex-col gap-6 overflow-hidden">
                <div className="space-y-2 flex-1 overflow-y-auto sidebar-scroll">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-bold text-muted/20 uppercase tracking-[0.4em]">Variants</span>
                  </div>
                  {manifestLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-30">
                      <Loader2 className="animate-spin text-primary" size={24} />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted">Loading</span>
                    </div>
                  ) : (
                    firmwareList.map(fw => (
                      <button
                        key={fw.id}
                        onClick={() => setSelectedFw(fw)}
                        className={`w-full text-left p-3.5 rounded-xl transition-all border group relative overflow-hidden ${
                          selectedFw?.id === fw.id 
                            ? 'bg-primary/10 border-primary/40 text-text shadow-[0_0_20px_rgba(0,0,0,0.3)]' 
                            : 'border-border/10 text-muted/60 hover:bg-white/5 hover:text-text/80'
                        }`}
                      >
                        {selectedFw?.id === fw.id && (
                          <motion.div layoutId="active-nav-btn" className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent -z-10" />
                        )}
                        <div className="text-sm font-bold tracking-tight">{fw.name}</div>
                        <div className="text-[9px] font-bold opacity-30 mt-0.5 flex items-center gap-2">
                           {fw.board}
                        </div>
                      </button>
                    ))
                  )}
                </div>
                
                {/* Meta Info in Sidebar */}
                {selectedFw && !manifestLoading && (
                  <div className="pt-4 border-t border-border/10 space-y-3">
                    <div className="flex items-center justify-between">
                       <span className="text-[8px] font-bold text-muted/20 uppercase tracking-widest">Compiled</span>
                       <span className="text-[10px] font-bold text-muted/60">{selectedFw.date}</span>
                    </div>
                    <div className="flex items-center justify-between font-bold">
                       <span className="text-[8px] text-muted/20 uppercase tracking-widest">Version</span>
                       <span className="text-[10px] text-primary/70">v{selectedFw.version}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Content area */}
              <div className="flex-1 p-6 flex flex-col bg-black/10 relative overflow-hidden">
                {selectedFw ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex-1 flex flex-col min-h-0"
                  >
                    <div className="flex items-center justify-between mb-5">
                       <h3 className="text-3xl font-bold font-['Outfit'] text-text tracking-widest flex items-center gap-4">
                         {selectedFw.name.toUpperCase()}
                         <div className="h-px flex-1 w-20 bg-gradient-to-r from-border/20 to-transparent" />
                       </h3>
                       <div className="flex items-center gap-2 opacity-20">
                         <Code size={14} className="text-muted" />
                         <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-muted">Source Matrix</span>
                       </div>
                    </div>

                    <div className="flex-1 overflow-hidden rounded-2xl border border-border/10 shadow-[inset_0_0_40px_rgba(0,0,0,0.8)] bg-black/60 group relative flex flex-col">
                      {loading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10 rounded-2xl">
                           <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                      ) : null}
                      <div className="fw-scroll flex-1 overflow-auto">
                        <SyntaxHighlighted content={fwContent} />
                      </div>
                    </div>
                  </motion.div>
                ) : (
                   <div className="flex-1 flex items-center justify-center opacity-10">
                    <div className="text-center space-y-4">
                      <Cpu size={60} className="mx-auto" />
                      <div className="text-[10px] font-bold uppercase tracking-[0.5em] text-muted">Awaiting Uplink</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 bg-black/20 border-t border-border/10 flex items-center justify-between gap-6 backdrop-blur-md">
               {/* Briefing Box */}
               {selectedFw ? (
                 <motion.div 
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   className="flex-1 max-w-[450px] flex items-center gap-4 p-3 bg-bg/10 rounded-xl border border-border/10 overflow-hidden"
                 >
                   <div className="p-2 bg-accent/20 rounded-lg shrink-0">
                     <Zap size={16} className="text-accent" />
                   </div>
                   <div className="min-w-0">
                     <p className="text-[11px] text-muted font-bold leading-relaxed line-clamp-2 uppercase tracking-tight">
                       {selectedFw.description}
                     </p>
                   </div>
                 </motion.div>
               ) : <div className="flex-1" />}

               <div className="flex gap-3">
                  <button 
                  onClick={handleCopy}
                  disabled={!selectedFw || loading}
                  className="flex items-center gap-2 px-5 py-3 bg-bg/20 hover:bg-bg/40 text-text rounded-xl font-bold text-[10px] tracking-widest transition-all border border-border/10 active:scale-95 disabled:opacity-20"
                >
                  {copied ? <Check size={16} className="text-primary" /> : <Copy size={16} className="text-muted" />}
                  {copied ? 'MATRIX CLONED' : 'COPY SOURCE'}
                </button>
                
                <button 
                  onClick={handleDownload}
                  disabled={!selectedFw || loading}
                  className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-contrast rounded-xl font-bold text-[10px] tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)] hover:shadow-[0_0_30px_rgba(var(--primary-rgb),0.4)] hover:scale-[1.02] active:scale-95 group relative overflow-hidden disabled:opacity-20"
                >
                  <div className="absolute inset-0 bg-white/30 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out skew-x-12" />
                  <Download size={16} />
                  DOWNLOAD BINARY
                </button>
               </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
