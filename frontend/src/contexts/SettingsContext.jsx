import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { audioStorage } from '../utils/AudioStorage';
import { fetchWithBase } from '../utils/runtimeConnection';

const SettingsContext = createContext(null);

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};

const DEFAULT_SETTINGS = {
    general: {
        apiUrl: '',
        wsUrl: '',
        useMock: false,
    },
    dino: {
        gravity: 0.6,
        jumpStrength: 10,
        gameSpeed: 5,
        obstacleDensity: 1500,
        controlChannel: 0,
        difficulty: 'normal',
        visuals: {
            showTrees: true,
            showClouds: true,
            showStars: true,
            dayNightCycle: true,
        }
    },
    ssvep: {
        brightness: 100,
        refreshRate: 60,
        protocol: {
            cueDuration: 2,
            stimDuration: 5,
            restDuration: 3,
            rounds: 5,
        }
    },
    rps: {
        manualMode: false,
        difficulty: 1,
    },
    calibration: {
        activeSensor: 'EMG',
        activeChannel: 0,
        yAxisRange: 200,
        zoomLevel: 1,
        timeWindow: 5,
    },
    ml: {
        emg: {
            n_estimators: 100,
            max_depth: 10,
            test_size: 0.2,
            selectedChannel: 0,
        },
        eog: {
            n_estimators: 100,
            max_depth: 10,
            test_size: 0.2,
            selectedChannel: 0,
        }
    },
    keymap: {
        collection: {
            startStop: 'Enter',
            changeTarget: 'ShiftLeft',
            deleteLatest: 'ControlRight',
            deleteAll: 'Space',
            toggleAuto: 'Numpad1',
            toggleZoom: 'Numpad2',
            toggleTimeWindow: 'Numpad0',
            appendSample: 'NumpadEnter',
            limitIncr5: 'ArrowUp',
            limitDecr5: 'ArrowDown',
            limitIncr1: 'ArrowRight',
            limitDecr1: 'ArrowLeft',
            newSession: 'AltRight',
            toggleWinDuration: 'NumpadDecimal'
        }
    },
    collectionState: {
        zoom: 1,
        timeWindow: 3000,
        windowDuration: 1500,
        autoLimit: 30,
        autoCalibrate: false
    },
    audio: {
        sfxEnabled: true,
        bgmEnabled: true,
        bgmVolume: 0.3,
        bgmTrack: null,
        availableTracks: [],
    }
};

export function SettingsProvider({ children }) {
    const [settings, setSettings] = useState(() => {
        const publicConfig = getPublicRuntimeConfig();
        const baseSettings = deepMerge(DEFAULT_SETTINGS, publicConfig || {});
        try {
            const saved = localStorage.getItem('neurotech_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.audio && parsed.audio.bgmFile) {
                    delete parsed.audio.bgmFile;
                }
                return deepMerge(DEFAULT_SETTINGS, parsed);
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
        return baseSettings;
    });

    const updateSettings = useCallback((section, newValues) => {
        setSettings(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                ...newValues
            }
        }));
    }, []);

    const updateDeepSettings = useCallback((path, value) => {
        setSettings(prev => {
            const next = { ...prev };
            const keys = path.split('.');
            let current = next;
            for (let i = 0; i < keys.length - 1; i++) {
                current[keys[i]] = { ...current[keys[i]] };
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
            return next;
        });
    }, []);

    const resetSettings = useCallback((section = null) => {
        if (section) {
            setSettings(prev => ({
                ...prev,
                [section]: DEFAULT_SETTINGS[section]
            }));
        } else {
            setSettings(deepMerge(DEFAULT_SETTINGS, getPublicRuntimeConfig() || {}));
        }
    }, []);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const configRes = await fetch('./config.json');
                if (configRes.ok) {
                    const publicConfig = await configRes.json();
                    if (publicConfig?.general) {
                        publicConfig.general = { ...publicConfig.general };
                        if (!publicConfig.general.apiUrl) delete publicConfig.general.apiUrl;
                        if (!publicConfig.general.wsUrl) delete publicConfig.general.wsUrl;
                    }
                    setSettings(prev => deepMerge(prev, publicConfig));
                }
            } catch (e) {
                console.warn('Could not load public/config.json, using defaults.');
            }

            const defaultTracks = [
                { name: 'Fed_Up_Slowed__Reverb_-_Ghostemane_1772539057.mp3', size: 5680123, isDefault: true }
            ];

            try {
                const localTracks = await audioStorage.getAllTracks();
                const formattedLocal = localTracks.map(t => ({ ...t, isLocal: true }));

                let serverTracks = [];
                try {
                    const res = await fetchWithBase('/api/audio/tracks', { signal: AbortSignal.timeout(2000) });
                    if (res.ok) {
                        serverTracks = await res.json();
                    } else if (res.status === 404) {
                        console.log('Backend audio tracks API not available (Offline Mode)');
                    }
                } catch (e) {
                    console.warn('Backend audio API unavailable, using local/default tracks only.');
                }

                const allTracks = [...defaultTracks, ...formattedLocal, ...serverTracks];
                const uniqueTracks = allTracks.reduce((acc, current) => {
                    const existing = acc.find(item => item.name === current.name);
                    if (!existing) return acc.concat([current]);
                    return acc;
                }, []);

                updateDeepSettings('audio.availableTracks', uniqueTracks);

                const saved = localStorage.getItem('neurotech_settings');
                const currentSettings = saved ? JSON.parse(saved) : {};
                if (uniqueTracks.length > 0 && (!currentSettings.audio || !currentSettings.audio.bgmTrack)) {
                    updateDeepSettings('audio.bgmTrack', uniqueTracks[0].name);
                }
            } catch (err) {
                console.error('Failed to initialize audio tracks:', err);
                updateDeepSettings('audio.availableTracks', defaultTracks);
            }
        };
        fetchInitialData();
    }, [updateDeepSettings]);

    useEffect(() => {
        try {
            const { availableTracks, ...safeAudio } = settings.audio;
            const settingsToSave = {
                ...settings,
                audio: safeAudio
            };
            localStorage.setItem('neurotech_settings', JSON.stringify(settingsToSave));
        } catch (e) {
            console.error('Failed to save settings:', e);
        }
    }, [settings]);

    const contextValue = useMemo(() => ({
        settings,
        updateSettings,
        updateDeepSettings,
        resetSettings
    }), [settings, updateSettings, updateDeepSettings, resetSettings]);

    return (
        <SettingsContext.Provider value={contextValue}>
            {children}
        </SettingsContext.Provider>
    );
}

function deepMerge(target, source) {
    const result = { ...target };
    if (source) {
        for (const key in source) {
            if (source[key] instanceof Object && key in target) {
                result[key] = deepMerge(target[key], source[key]);
            } else {
                result[key] = source[key];
            }
        }
    }
    return result;
}
