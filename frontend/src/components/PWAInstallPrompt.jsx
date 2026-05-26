import React, { useEffect, useState } from 'react';

let deferredPrompt = null;

export default function PWAInstallPrompt() {
  const [showBanner, setShowBanner] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed this session
    if (sessionStorage.getItem('pwa-dismissed')) return;

    const handler = (e) => {
      e.preventDefault();
      deferredPrompt = e;
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
      deferredPrompt = null;
    }
    setInstalling(false);
  };

  const handleDismiss = () => {
    sessionStorage.setItem('pwa-dismissed', '1');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <>
      <style>{`
        @keyframes pwa-slide-up {
          from { transform: translateY(120%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .pwa-banner {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 99999;
          width: 340px;
          background: linear-gradient(135deg, #1a0a3e 0%, #2d1060 60%, #1a0a3e 100%);
          border: 1px solid rgba(180, 120, 255, 0.35);
          border-radius: 16px;
          box-shadow:
            0 0 0 1px rgba(255, 180, 50, 0.08),
            0 8px 32px rgba(91,33,182,0.45),
            0 2px 8px rgba(0,0,0,0.6);
          animation: pwa-slide-up 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
          overflow: hidden;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .pwa-banner::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,185,50,0.06) 0%, transparent 60%);
          pointer-events: none;
        }
        .pwa-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 16px 12px;
        }
        .pwa-logo {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          object-fit: cover;
          box-shadow: 0 0 12px rgba(255,180,50,0.4);
          flex-shrink: 0;
        }
        .pwa-titles {
          flex: 1;
          min-width: 0;
        }
        .pwa-title {
          font-size: 14px;
          font-weight: 700;
          color: #f0d9ff;
          letter-spacing: 0.01em;
          margin: 0 0 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pwa-subtitle {
          font-size: 11px;
          color: rgba(200,160,255,0.7);
          margin: 0;
        }
        .pwa-close {
          background: none;
          border: none;
          color: rgba(200,160,255,0.5);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          line-height: 1;
          font-size: 16px;
          transition: color 0.2s, background 0.2s;
          flex-shrink: 0;
        }
        .pwa-close:hover { color: #f0d9ff; background: rgba(255,255,255,0.08); }
        .pwa-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(180,120,255,0.25), transparent);
          margin: 0 16px;
        }
        .pwa-body {
          padding: 12px 16px 16px;
        }
        .pwa-desc {
          font-size: 12px;
          color: rgba(210,180,255,0.8);
          margin: 0 0 14px;
          line-height: 1.5;
        }
        .pwa-actions {
          display: flex;
          gap: 8px;
        }
        .pwa-btn-install {
          flex: 1;
          padding: 9px 16px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #7c3aed, #f59e0b);
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          letter-spacing: 0.02em;
          box-shadow: 0 2px 12px rgba(124,58,237,0.4);
          transition: opacity 0.2s, transform 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .pwa-btn-install:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .pwa-btn-install:disabled { opacity: 0.6; cursor: not-allowed; }
        .pwa-btn-later {
          padding: 9px 14px;
          border-radius: 10px;
          border: 1px solid rgba(180,120,255,0.25);
          background: rgba(255,255,255,0.04);
          color: rgba(200,160,255,0.7);
          font-size: 12px;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
        }
        .pwa-btn-later:hover { background: rgba(255,255,255,0.08); color: #f0d9ff; }
        .pwa-features {
          display: flex;
          gap: 10px;
          margin-bottom: 12px;
        }
        .pwa-feature {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: rgba(180,140,255,0.75);
          text-align: center;
        }
        .pwa-feature-icon {
          font-size: 18px;
          line-height: 1;
        }
      `}</style>

      <div className="pwa-banner" role="dialog" aria-label="Install NeuroTECH app">
        <div className="pwa-header">
          <img src="/pwa-192.png" alt="NeuroTECH logo" className="pwa-logo" />
          <div className="pwa-titles">
            <p className="pwa-title">NeuroTECH BCI</p>
            <p className="pwa-subtitle">Install as desktop app</p>
          </div>
          <button className="pwa-close" onClick={handleDismiss} aria-label="Dismiss">✕</button>
        </div>

        <div className="pwa-divider" />

        <div className="pwa-body">
          <div className="pwa-features">
            <div className="pwa-feature">
              <span className="pwa-feature-icon">⚡</span>
              Fast launch
            </div>
            <div className="pwa-feature">
              <span className="pwa-feature-icon">📴</span>
              Works offline
            </div>
            <div className="pwa-feature">
              <span className="pwa-feature-icon">🖥️</span>
              Full screen
            </div>
          </div>

          <div className="pwa-actions">
            <button
              id="pwa-install-btn"
              className="pwa-btn-install"
              onClick={handleInstall}
              disabled={installing}
            >
              {installing ? '⏳ Installing…' : '⬇ Install App'}
            </button>
            <button className="pwa-btn-later" onClick={handleDismiss}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
