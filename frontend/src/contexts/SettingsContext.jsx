import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

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
        apiUrl: 'http://localhost:8000',
        wsUrl: 'ws://localhost:1972',
        useMock: false,
    },
    dino: {
        gravity: 0.6,
        jumpStrength: 10,
        gameSpeed: 5,
        obstacleDensity: 1500,
        controlChannel: 0,
        difficulty: 'normal', // easy, normal, hard
        visuals: {
            showTrees: true,
            showClouds: true,
            showStars: true,
            dayNightCycle: true,
        }
    },
    ssvep: {
        brightness: 100, // 0-100
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
        difficulty: 1, // 0-2 (Easy, Medium, Hard)
    },
    calibration: {
        activeSensor: 'EMG', // EMG, EOG, EEG
        activeChannel: 0,
        yAxisRange: 200,
        zoomLevel: 1,
        timeWindow: 5, // seconds
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
        timeWindow: 3000, // 3s
        windowDuration: 1500,
        autoLimit: 30,
        autoCalibrate: false
    },
    audio: {
        sfxEnabled: true,
        bgmEnabled: true,
        bgmVolume: 0.3,
        bgmTrack: null, // filename of the selected track
        availableTracks: [], // list of track objects from server
    }
};

export function SettingsProvider({ children }) {
    const [settings, setSettings] = useState(() => {
        try {
            const saved = localStorage.getItem('neurotech_settings');
            if (saved) {
                // Deep merge with defaults to ensure new fields are added if missing in old save
                const parsed = JSON.parse(saved);

                // MIGRATION: Remove legacy base64 bgmFile to prevent atob errors and save space
                if (parsed.audio && parsed.audio.bgmFile) {
                    delete parsed.audio.bgmFile;
                }

                return deepMerge(DEFAULT_SETTINGS, parsed);
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
        return DEFAULT_SETTINGS;
    });

    // Initial fetch of available tracks
    useEffect(() => {
        const fetchTracks = async () => {
            try {
                const API_BASE_URL = import.meta.env.VITE_API_URL || '';
                const res = await fetch(`${API_BASE_URL}/api/audio/tracks`);
                if (res.ok) {
                    const tracks = await res.json();
                    updateDeepSettings('audio.availableTracks', tracks);

                    // If no track is selected but tracks are available, select the first one
                    const saved = localStorage.getItem('neurotech_settings');
                    const currentSettings = saved ? JSON.parse(saved) : {};
                    if (tracks.length > 0 && (!currentSettings.audio || !currentSettings.audio.bgmTrack)) {
                        updateDeepSettings('audio.bgmTrack', tracks[0].name);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch audio tracks:', err);
            }
        };
        fetchTracks();
    }, []);

    // Save to localStorage whenever settings change
    useEffect(() => {
        try {
            // We DON'T want to save the full availableTracks list to localStorage to keep it small
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

    // Update a specific setting section
    const updateSettings = useCallback((section, newValues) => {
        setSettings(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                ...newValues
            }
        }));
    }, []);

    // Deep update helper (for nested objects like dino.visuals)
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

    // Reset a section or all to defaults
    const resetSettings = useCallback((section = null) => {
        if (section) {
            setSettings(prev => ({
                ...prev,
                [section]: DEFAULT_SETTINGS[section]
            }));
        } else {
            setSettings(DEFAULT_SETTINGS);
        }
    }, []);

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

// Simple Deep Merge Helper
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
