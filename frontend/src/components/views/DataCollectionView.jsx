import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import WorkerTimeSeriesChart from '../charts/WorkerTimeSeriesChart';
import WindowListPanel from '../calibration/WindowListPanel';
import EEGDataCollectionPanel from '../calibration/EEGDataCollectionPanel';
import ConfigPanel from '../calibration/ConfigPanel';
import SessionManagerPanel from '../calibration/SessionManagerPanel';
import { CalibrationApi } from '../../services/calibrationApi';
import CustomSelect from '../ui/CustomSelect';
import { useSettings } from '../../contexts/SettingsContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
    Activity, Play, Square, Database, Zap,
    Target, Radio, ChartSpline, Brain, ArrowRightFromLine
} from 'lucide-react';
import { soundHandler } from '../../handlers/SoundHandler'

// Workers
import SessionWorker from '../../workers/session.worker.js?worker';
import WindowWorker from '../../workers/window.worker.js?worker';

const DEFAULT_PALETTE = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#f97316', '#06d6a0'
];

const SENSOR_LABELS = {
    EMG: ['Rock', 'Paper', 'Scissors', 'Rest'],
    EOG: ['SingleBlink', 'DoubleBlink', 'Rest'],
    EEG: ['Target 1', 'Target 2', 'Target 3', 'Target 4', 'Target 5', 'Target 6', 'Rest'],
};

import AutoCalibrationWizard from '../calibration/AutoCalibrationWizard';

/**
 * DataCollectionView
 * The main container for the BCI data collection experience.
 */
export default function DataCollectionView({ wsData, wsEvent, config: initialConfig, wsUrl, onSwitchLab }) {
    const { settings, updateSettings } = useSettings();
    const { currentTheme } = useTheme();

    // Top-level states
    const [activeSensor, setActiveSensor] = useState('EMG'); // 'EMG' | 'EOG' | 'EEG'
    const [activeChannelIndex, setActiveChannelIndex] = useState(0); // Explicitly selected channel index
    const [mode, setMode] = useState('collection'); // 'collection' | 'test'
    const [config, setConfig] = useState(initialConfig || {});
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const [runInProgress, setRunInProgress] = useState(false);
    const [windowProgress, setWindowProgress] = useState({});

    // Data states
    // Data states (chartData removed for Worker optimization)
    // const [chartData, setChartData] = useState([]); // REMOVED

    const [markedWindows, setMarkedWindows] = useState([]);
    const [showEegWindowList, setShowEegWindowList] = useState(false); // Toggle between collection panel and list
    const [readyWindows, setReadyWindows] = useState([]); // Windows waiting to be appended
    const [bufferWindows, setBufferWindows] = useState([]); // History of processed windows
    const [activeWindow, setActiveWindow] = useState(null);
    const [highlightedWindow, setHighlightedWindow] = useState(null); // New: for inspection
    const [targetLabel, setTargetLabel] = useState('Rock'); // e.g., 'Rock', 'Paper', etc.

    const [totalPredictedCount, setTotalPredictedCount] = useState(0);

    // Worker Instances
    const sessionWorkerRef = useRef(null);
    const windowWorkerRef = useRef(null);
    const dataWorkerRef = useRef(null);

    // Session Management State (Managed by Worker)
    const [sessions, setSessions] = useState([]);
    const [isSessionLoading, setIsSessionLoading] = useState(false);
    const [isTableLoading, setIsTableLoading] = useState(false);
    const [isDetailsReset, setIsDetailsReset] = useState(true); // Track if current fetch is a reset
    const [sessionRows, setSessionRows] = useState([]);
    const [sessionTotalRows, setSessionTotalRows] = useState(0);
    const [sessionAbsoluteTotalRows, setSessionAbsoluteTotalRows] = useState(0);
    const [sessionHasMore, setSessionHasMore] = useState(true);

    const [sessionName, setSessionName] = useState(() => {
        const now = new Date();
        return `Session_${now.getDate()}_${now.getHours()}${now.getMinutes()}`;
    });
    const [appendMode, setAppendMode] = useState(false);
    const [autoLimit, setAutoLimit] = useState(settings?.collectionState?.autoLimit || 30);
    const [autoCalibrate, setAutoCalibrate] = useState(settings?.collectionState?.autoCalibrate || false); // Auto-calibration toggle
    const [windowDuration, setWindowDuration] = useState(settings?.collectionState?.windowDuration || 1500); // ms
    const [timeWindow, setTimeWindow] = useState(settings?.collectionState?.timeWindow || 5000); // visible sweep window length for calibration plot

    const [dataLastUpdated, setDataLastUpdated] = useState(0);

    // Refs for accessing latest state inside interval/timeouts
    // const chartDataRef = useRef(chartData); // REMOVED
    const chartRef = useRef(null); // Access to Worker Chart
    const latestSignalTimeRef = useRef(Date.now()); // Track latest TS for logic

    const activeSensorRef = useRef(activeSensor);
    const activeChannelIndexRef = useRef(activeChannelIndex); // Ref for channel
    const targetLabelRef = useRef(targetLabel);
    const markedWindowsRef = useRef(markedWindows);
    const readyWindowsRef = useRef(readyWindows);
    const sessionNameRef = useRef(sessionName);
    const sessionInputRef = useRef(null); // Ref for focusing session name input

    // Keep refs in sync
    // useEffect(() => { chartDataRef.current = chartData; }, [chartData]);

    useEffect(() => { activeSensorRef.current = activeSensor; }, [activeSensor]);
    useEffect(() => { activeChannelIndexRef.current = activeChannelIndex; }, [activeChannelIndex]);
    useEffect(() => { targetLabelRef.current = targetLabel; }, [targetLabel]);
    useEffect(() => { markedWindowsRef.current = markedWindows; }, [markedWindows]);
    useEffect(() => { readyWindowsRef.current = readyWindows; }, [readyWindows]);
    const autoLimitRef = useRef(autoLimit);
    useEffect(() => { autoLimitRef.current = autoLimit; }, [autoLimit]);
    useEffect(() => { sessionNameRef.current = sessionName; }, [sessionName]);


    // Compute matching channels for the active sensor
    const matchingChannels = React.useMemo(() => {
        if (!config?.channel_mapping) return [];
        return Object.entries(config.channel_mapping)
            .filter(([key, val]) => val.sensor === activeSensor || val.type === activeSensor)
            .map(([key, val]) => ({
                id: key,
                index: parseInt(key.replace('ch', ''), 10),
                label: val.label || val.name || key
            }))
            .sort((a, b) => a.index - b.index)
            .slice(0, 2); // Limit to 2 channels (CH0, CH1)
    }, [activeSensor, config]);

    // Auto-select first matching channel when sensor changes
    // Auto-select first matching channel when sensor changes
    useEffect(() => {
        console.log('[DataCollectionView] matchingChannels:', matchingChannels);
        if (matchingChannels.length > 0) {
            // If current selection is not in the new list, reset to first match
            const exists = matchingChannels.find(c => c.index === activeChannelIndex);
            if (!exists) {
                console.log(`[DataCollectionView] Auto-switching channel from ${activeChannelIndex} to ${matchingChannels[0].index} for sensor ${activeSensor}`);
                setActiveChannelIndex(matchingChannels[0].index);
            }
        } else {
            // Fallback if no mapping found (shouldn't happen with valid config)
            if (activeChannelIndex !== 0) setActiveChannelIndex(0);
        }
    }, [activeSensor, matchingChannels, activeChannelIndex]);

    const fullCurrentSessionName = React.useMemo(() => {
        if (!sessionName) return null;
        if (sessionName.includes("_session_")) return sessionName;
        return `${activeSensor.toLowerCase()}_session_${sessionName}`;
    }, [sessionName, activeSensor]);

    const configuredSensors = React.useMemo(() => {
        const sensors = new Set();
        if (config?.channel_mapping) {
            Object.values(config.channel_mapping).forEach(val => {
                if (val.sensor) sensors.add(val.sensor);
                else if (val.type) sensors.add(val.type);
            });
        }
        return sensors.size > 0 ? Array.from(sensors) : ['EMG', 'EOG', 'EEG'];
    }, [config]);

    const eegTargets = useMemo(() => {
        const configuredTargets = config?.features?.EEG?.targets;
        if (Array.isArray(configuredTargets) && configuredTargets.length > 0) {
            return configuredTargets.map((target, index) => ({
                id: target.id ?? index,
                label: target.label || `Target ${index + 1}`,
                freq: Number(target.freq ?? config?.features?.EEG?.target_freqs?.[index] ?? 0),
                enabled: target.enabled !== false,
            }));
        }

        const fallbackFreqs = config?.features?.EEG?.target_freqs || [8, 10, 12, 15, 18, 20];
        return fallbackFreqs.slice(0, 6).map((freq, index) => ({
            id: index,
            label: `Target ${index + 1}`,
            freq: Number(freq),
            enabled: true,
        }));
    }, [config]);

    const availableLabels = useMemo(() => {
        if (activeSensor === 'EEG') {
            return [...eegTargets.filter(target => target.enabled).map(target => target.label), 'Rest'];
        }
        return SENSOR_LABELS[activeSensor] || [];
    }, [activeSensor, eegTargets]);

    const selectedEegTarget = useMemo(() => {
        return eegTargets.find(target => target.label === targetLabel) || null;
    }, [eegTargets, targetLabel]);

    const windowDurationOptions = useMemo(() => {
        return activeSensor === 'EEG' ? [1000, 1500, 2000, 3000] : [500, 1000, 1500, 2000];
    }, [activeSensor]);

    useEffect(() => {
        if (!availableLabels.length) return;
        if (!availableLabels.includes(targetLabel)) {
            setTargetLabel(availableLabels[0]);
        }
    }, [availableLabels, targetLabel]);

    // Initialize DataWorker
    useEffect(() => {
        if (!wsUrl) return;

        console.log('[DataCollectionView] Initializing DataWorker...');
        const worker = new Worker(new URL('../../workers/data.worker.js', import.meta.url), { type: 'module' });
        dataWorkerRef.current = worker;

        worker.postMessage({ type: 'CONNECT', payload: { url: wsUrl } });

        return () => {
            console.log('[DataCollectionView] Terminating DataWorker...');
            worker.terminate();
        };
    }, [wsUrl]);

    // Initialize Workers (Session & Window)
    useEffect(() => {
        sessionWorkerRef.current = new SessionWorker();
        windowWorkerRef.current = new WindowWorker();

        sessionWorkerRef.current.onmessage = (e) => {
            const { type, payload } = e.data;
            switch (type) {
                case 'SESSIONS_UPDATED':
                    setSessions(payload);
                    break;
                case 'LOADING_STATUS':
                    setIsSessionLoading(payload);
                    break;
                case 'DETAILS_LOADING_STATUS':
                    setIsTableLoading(payload);
                    break;
                case 'SESSION_DETAILS_RESULT':
                    const { data, isReset, direction, offset } = payload;
                    const newRows = Array.isArray(data) ? data : (data.rows || []);
                    const total = data.total !== undefined ? data.total : newRows.length;
                    const absoluteTotal = data.absolute_total !== undefined ? data.absolute_total : total;
                    const annotatedRows = newRows.map((r, i) => ({ ...r, absoluteIndex: offset + i }));

                    setSessionTotalRows(total);
                    setSessionAbsoluteTotalRows(absoluteTotal);
                    setIsDetailsReset(isReset);
                    if (isReset) {
                        setSessionRows(annotatedRows);
                    } else {
                        setSessionRows(prev => direction === 'down' ? [...prev, ...annotatedRows] : [...annotatedRows, ...prev]);
                    }
                    setSessionHasMore(annotatedRows.length >= 20 && (offset + annotatedRows.length < total));
                    break;
                case 'SESSION_CREATED':
                    setSessionName(payload.safeName);
                    break;
                case 'DELETE_SUCCESS':
                    // Use Ref to get latest session name
                    const currentName = sessionNameRef.current;
                    if (payload === currentName || payload.includes(currentName)) {
                        setSessionName('Default');
                    }
                    break;
                case 'CLEAR_SUCCESS':
                    const currentNameClear = sessionNameRef.current;
                    if (payload === currentNameClear || payload.includes(currentNameClear)) {
                        sessionWorkerRef.current?.postMessage({
                            type: 'FETCH_DETAILS',
                            payload: { fullName: payload, limit: 20, offset: 0, isReset: true }
                        });
                    }
                    break;
                case 'ROW_DELETE_SUCCESS':
                    // OPTIMIZATION: Instead of full reload, filter locally
                    const { rowId } = payload;
                    setSessionRows(prev => prev.filter(r => r.id !== rowId));
                    setSessionTotalRows(prev => Math.max(0, prev - 1));
                    break;
            }
        };

        windowWorkerRef.current.onmessage = async (e) => {
            const { type, payload } = e.data;
            switch (type) {
                case 'WINDOWS_UPDATED':
                    setMarkedWindows(payload);
                    break;
                case 'REQUEST_SAMPLES':
                    const { id, start, end, delay } = payload;
                    setTimeout(async () => {
                        if (chartRef.current) {
                            try {
                                const samplesPoints = await chartRef.current.getSamples(start, end);
                                if (samplesPoints && samplesPoints.length > 0) {
                                    const samples = samplesPoints.map(p => p.value);
                                    const timestamps = samplesPoints.map(p => p.time);
                                    windowWorkerRef.current.postMessage({
                                        type: 'WINDOW_COLLECTED',
                                        payload: { id, startTime: start, endTime: end, samples, timestamps, status: 'collected' }
                                    });
                                }
                            } catch (err) {
                                console.error("Failed to get samples for worker window", err);
                            }
                        }
                    }, delay);
                    break;
                case 'TRIGGER_AUTO_APPEND':
                    handleAppendSamples();
                    break;
            }
        };

        // Initial Worker Config
        sessionWorkerRef.current.postMessage({ type: 'INIT', payload: { sensor: activeSensor, isTestMode: mode === 'test' } });
        windowWorkerRef.current.postMessage({
            type: 'INIT',
            payload: {
                activeSensor,
                activeChannelIndex,
                targetLabel,
                mode,
                autoLimit,
                autoCalibrate,
                windowDuration,
                timeWindow,
                isCalibrating
            }
        });

        return () => {
            sessionWorkerRef.current?.terminate();
            windowWorkerRef.current?.terminate();
        };
    }, []);

    // Sync state to workers
    useEffect(() => {
        windowWorkerRef.current?.postMessage({
            type: 'UPDATE_STATE',
            payload: { activeSensor, activeChannelIndex, targetLabel, mode, autoLimit, autoCalibrate, windowDuration, timeWindow }
        });
    }, [activeSensor, activeChannelIndex, targetLabel, mode, autoLimit, autoCalibrate, windowDuration, timeWindow]);

    // Ensure config is loaded on mount
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const cfg = await CalibrationApi.fetchSensorConfig();
                setConfig(cfg);
            } catch (err) {
                console.error('[DataCollectionView] Failed to load config:', err);
            }
        };
        if (!initialConfig || Object.keys(initialConfig).length === 0) {
            loadConfig();
        }
    }, [initialConfig]);


    // Recording mode states
    const [availableRecordings, setAvailableRecordings] = useState([]);
    const [selectedRecording, setSelectedRecording] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isLoadingRecording, setIsLoadingRecording] = useState(false);

    // Fetch recordings list
    const refreshRecordings = useCallback(async () => {
        const list = await CalibrationApi.listRecordings();
        setAvailableRecordings(list);
    }, []);

    useEffect(() => {
        refreshRecordings();
    }, [refreshRecordings]);

    // Handle recording selection and data loading
    useEffect(() => {
        const loadSelectedRecording = async () => {
            if (!selectedRecording || mode !== 'recording') return;

            setIsLoadingRecording(true);
            try {
                const recording = await CalibrationApi.getRecording(selectedRecording);

                // recording.data is Array of { timestamp, channels: { ch0, ch1... } }
                if (recording && recording.data) {
                    // Map to chartData format { time, value }
                    // Use activeChannelIndex
                    const targetChIdx = activeChannelIndex;

                    const formattedData = recording.data.map(point => ({
                        time: point.timestamp,
                        value: point.channels[`ch${targetChIdx}`] || point.channels[targetChIdx] || 0
                    }));

                    // Wait for chartRef to be ready?
                    if (chartRef.current) {
                        chartRef.current.clearData();
                        chartRef.current.addData(formattedData);
                    }
                    latestSignalTimeRef.current = formattedData.length > 0 ? formattedData[formattedData.length - 1].time : Date.now();

                    console.log(`[DataCollectionView] Loaded ${formattedData.length} samples for ${activeSensor} Ch${targetChIdx}`);
                }
            } catch (error) {
                console.error('[DataCollectionView] Failed to load recording:', error);
                alert('Failed to load recording data.');
            } finally {
                setIsLoadingRecording(false);
            }
        };

        loadSelectedRecording();
    }, [selectedRecording, mode, activeSensor, activeChannelIndex]); // Depend on activeChannelIndex


    // Zoom state (Y-axis) similar to LiveView
    const [zoom, setZoom] = useState(settings?.collectionState?.zoom || 1);
    const [manualYRange, setManualYRange] = useState("");
    const [customLineColor, setCustomLineColor] = useState(null); // New state for line color
    const BASE_AMPLITUDE = 1500;

    const currentYDomain = React.useMemo(() => {
        if (manualYRange && !isNaN(parseFloat(manualYRange))) {
            const r = parseFloat(manualYRange);
            return [-r, r];
        }
        return [-BASE_AMPLITUDE / zoom, BASE_AMPLITUDE / zoom];
    }, [manualYRange, zoom]);

    // Refs for real-time windowing
    const windowIntervalRef = useRef(null);
    const appendLockRef = useRef(false);
    const GAP_DURATION = 500; // ms
    const MAX_WINDOWS = autoCalibrate ? 50 : 2000;

    // Additional Refs for windowing logic (Defined here to avoid TDZ)
    const timeWindowRef = useRef(timeWindow);
    const windowDurationRef = useRef(windowDuration);

    useEffect(() => { timeWindowRef.current = timeWindow; }, [timeWindow]);
    useEffect(() => { windowDurationRef.current = windowDuration; }, [windowDuration]);

    // Persist collection state changes
    useEffect(() => {
        updateSettings('collectionState', {
            zoom,
            timeWindow,
            windowDuration,
            autoLimit,
            autoCalibrate
        });
    }, [zoom, timeWindow, windowDuration, autoLimit, autoCalibrate, updateSettings]);

    // Handlers
    const handleSensorChange = (sensor) => {
        setActiveSensor(sensor);
        soundHandler.playMLSwitch();
        if (sensor === 'EEG') {
            setMode('collection');
            setWindowDuration(1500);
            setTimeWindow(prev => Math.max(prev, 8000));
            setAutoLimit(prev => Math.max(prev, 24));
        } else if (sensor !== 'EEG' && mode === 'recording') {
            setMode('collection');
        }
        sessionWorkerRef.current?.postMessage({ type: 'SET_SENSOR', payload: sensor });
    };

    const handleTargetChange = (newTarget) => {
        setTargetLabel(newTarget);
        soundHandler.playSettingSwitch();
    };

    const buildWindowMetadata = useCallback((win) => {
        if (activeSensor !== 'EEG') return undefined;
        const matchedTarget = eegTargets.find(target => target.label === win.label) || selectedEegTarget;
        return {
            targetId: matchedTarget?.id ?? null,
            targetLabel: win.label,
            targetFrequency: matchedTarget?.freq ?? 0,
            channelIndex: win.channel ?? activeChannelIndex,
            sampleCount: Array.isArray(win.samples) ? win.samples.length : 0,
            windowMs: win.endTime && win.startTime ? Math.max(0, win.endTime - win.startTime) : windowDuration,
        };
    }, [activeSensor, eegTargets, selectedEegTarget, activeChannelIndex, windowDuration]);

    const startAutoWindowing = useCallback(() => {
        windowWorkerRef.current?.postMessage({ type: 'START_WINDOWING' });
    }, []);

    const handleStartCalibration = useCallback(async (overriddenLabel) => {
        setIsCalibrating(true);
        soundHandler.playRPSStart(); // Sounds similar to a start/alert
        const label = overriddenLabel || targetLabel;
        CalibrationApi.startCalibration(activeSensor, mode, label, windowDuration, sessionName)
            .catch(e => console.error("Start Calib API failed", e));

        if (mode === 'collection' || mode === 'test') {
            if (activeSensor !== 'EEG') {
                startAutoWindowing();
            }
        }
    }, [activeSensor, mode, targetLabel, windowDuration, sessionName, startAutoWindowing]);

    const handleStopCalibration = useCallback(async () => {
        setIsCalibrating(false);
        soundHandler.playDinoPause(); // Sounds like a stop/pause
        windowWorkerRef.current?.postMessage({ type: 'STOP_WINDOWING' });
        await CalibrationApi.stopCalibration(activeSensor);
        setActiveWindow(null);
    }, [activeSensor]);




    const handleManualWindowSelect = useCallback(async (start, end) => {
        const id = Math.random().toString(36).substr(2, 9);
        if (chartRef.current) {
            try {
                const samplesPoints = await chartRef.current.getSamples(start, end);
                const samples = samplesPoints ? samplesPoints.map(p => p.value) : [];
                const timestamps = samplesPoints ? samplesPoints.map(p => p.time) : [];

                windowWorkerRef.current?.postMessage({
                    type: 'WINDOW_COLLECTED',
                    payload: {
                        id,
                        sensor: activeSensor,
                        mode: 'recording',
                        startTime: start,
                        endTime: end,
                        label: targetLabel,
                        channel: activeChannelIndex,
                        status: 'collected',
                        samples,
                        timestamps
                    }
                });
            } catch (err) {
                console.error("Manual selection error:", err);
            }
        }
    }, [activeSensor, activeChannelIndex, targetLabel]);

    const handleEEGRecord = useCallback(async (start, end, label) => {
        if (!chartRef.current) return;

        try {
            const samplesPoints = await chartRef.current.getSamples(start, end);
            if (!samplesPoints || samplesPoints.length === 0) {
                console.warn("[DataCollectionView] No samples collected for EEG sequence");
                return;
            }
            const allSamples = samplesPoints.map(p => p.value);
            const allTimestamps = samplesPoints.map(p => p.time);

            // Segment into 1.5s windows with 0.25s step
            const durationSec = (end - start) / 1000;
            const N = samplesPoints.length;
            const fs = N / durationSec;

            const winLenSec = 1.5;
            const stepSec = 0.25;
            const winLenSamples = Math.floor(winLenSec * fs);
            const stepSamples = Math.floor(stepSec * fs);

            const segments = [];
            let offset = 0;

            while (offset + winLenSamples <= N) {
                segments.push({
                    samples: allSamples.slice(offset, offset + winLenSamples),
                    timestamps: allTimestamps.slice(offset, offset + winLenSamples),
                    startTime: start + (offset / fs) * 1000,
                    endTime: start + ((offset + winLenSamples) / fs) * 1000,
                });
                offset += stepSamples;
            }

            // Fallback if data is too short
            if (segments.length === 0 && N > 0) {
                segments.push({
                    samples: allSamples,
                    timestamps: allTimestamps,
                    startTime: start,
                    endTime: end,
                });
            }

            const activeTargets = eegTargets.filter(t => t.enabled);
            const selectedTarget = activeTargets.find(t => t.label === label) || selectedEegTarget;

            // Prepare all promises and optimistic UI state
            const promises = [];
            const tempWindows = [];

            segments.forEach((seg, idx) => {
                const winId = `eeg-${Date.now()}-${idx}`;
                const newWindow = {
                    id: winId,
                    sensor: activeSensor,
                    startTime: seg.startTime,
                    endTime: seg.endTime,
                    label: label,
                    channel: activeChannelIndex,
                    samples: seg.samples,
                    timestamps: seg.timestamps,
                    status: 'saving'
                };
                tempWindows.push(newWindow);

                const payload = {
                    action: label,
                    channel: activeChannelIndex,
                    samples: seg.samples,
                    timestamps: seg.timestamps,
                    metadata: {
                        targetFrequency: selectedTarget?.freq || 0,
                        channelIndex: activeChannelIndex,
                        sampleCount: seg.samples.length,
                        windowMs: seg.endTime - seg.startTime,
                        source: 'ssvep_collector'
                    }
                };

                promises.push(
                    CalibrationApi.sendWindow(activeSensor, payload, sessionName)
                        .then(resp => ({ winId, resp }))
                        .catch(err => ({ winId, error: err }))
                );
            });

            // Add all as 'saving'
            setMarkedWindows(prev => [...tempWindows, ...prev]);

            // Execute all API requests concurrently
            const results = await Promise.all(promises);

            setMarkedWindows(prev => {
                const draft = [...prev];
                results.forEach(({ winId, resp, error }) => {
                    const idx = draft.findIndex(w => w.id === winId);
                    if (idx !== -1) {
                        if (error) {
                            console.error("EEG segment record failed:", error);
                            draft[idx] = { ...draft[idx], status: 'error' };
                        } else {
                            draft[idx] = {
                                ...draft[idx],
                                status: 'saved',
                                predictedLabel: resp?.predicted_label,
                                features: resp?.features
                            };
                        }
                    }
                });
                return draft;
            });

            setDataLastUpdated(Date.now());
            sessionWorkerRef.current?.postMessage({ type: 'FETCH_SESSIONS', payload: { silent: true } });
        } catch (err) {
            console.error("EEG manual record extraction failed:", err);
        }
    }, [activeSensor, activeChannelIndex, sessionName, eegTargets, selectedEegTarget]);




    /**
     * Saves all 'collected' (Green) windows from readyWindows to the database.
     */
    const handleAppendSamples = useCallback(async () => {
        if (appendLockRef.current) return;
        const toAppend = markedWindows.filter(w => w.status === 'collected');
        if (!toAppend || toAppend.length === 0) return;

        appendLockRef.current = true;
        setRunInProgress(true);

        // Optimistically update React state synchronously to prevent race conditions
        setMarkedWindows(prev => prev.map(w =>
            toAppend.find(t => t.id === w.id) ? { ...w, status: 'saving' } : w
        ));

        // Also inform the worker to ensure its state tracking matches
        windowWorkerRef.current?.postMessage({
            type: 'MARK_WINDOWS_SAVING',
            payload: toAppend.map(w => w.id)
        });

        try {
            for (const win of toAppend) {
                try {
                    let resp;
                    if (mode === 'test') {
                        resp = await CalibrationApi.sendPredictionWindow(activeSensor, {
                            action: win.label,
                            samples: win.samples
                        });
                    } else {
                        resp = await CalibrationApi.sendWindow(activeSensor, {
                            action: win.label,
                            channel: win.channel,
                            samples: win.samples,
                            timestamps: win.timestamps,
                            metadata: buildWindowMetadata(win),
                        }, sessionName);
                    }

                    const status = (mode === 'test') ? (resp.match ? 'correct' : 'incorrect') : 'saved';
                    windowWorkerRef.current?.postMessage({
                        type: 'WINDOW_COLLECTED',
                        payload: { ...win, status, features: resp.features, predictedLabel: resp.predicted_label }
                    });

                } catch (err) {
                    console.error("Error saving window:", win.id, err);
                    windowWorkerRef.current?.postMessage({
                        type: 'WINDOW_COLLECTED',
                        payload: { ...win, status: 'error' }
                    });
                }
            }
            setDataLastUpdated(Date.now());
            sessionWorkerRef.current?.postMessage({ type: 'FETCH_SESSIONS', payload: { silent: true } }); // Refresh session list silently
        } finally {
            setRunInProgress(false);
            appendLockRef.current = false;
        }
    }, [mode, activeSensor, sessionName, markedWindows, buildWindowMetadata]);

    const deleteWindow = (id) => {
        windowWorkerRef.current?.postMessage({ type: 'DELETE_WINDOW', payload: id });
    };

    const handleClearAllWindows = () => {
        windowWorkerRef.current?.postMessage({ type: 'CLEAR_ALL_WINDOWS' });
        setBufferWindows([]);
        setTotalPredictedCount(0);
    };

    const markMissed = (id) => {
        setMarkedWindows(prev => prev.map(w => w.id === id ? { ...w, isMissedActual: !w.isMissedActual } : w));
    };

    // Test Mode Handler
    const handleTestRecord = async (targetGestureLabel) => {
        return new Promise((resolve, reject) => {
            const currentTw = timeWindowRef.current;
            const currentDur = windowDurationRef.current;
            const latestTs = latestSignalTimeRef.current; // Ref

            const delayToCenter = currentTw / 2;
            const start = latestTs + delayToCenter;
            const end = start + currentDur;

            const newWindow = {
                id: Math.random().toString(36).substr(2, 9),
                sensor: activeSensor,
                mode: 'test',
                startTime: start,
                endTime: end,
                label: targetGestureLabel,
                channel: activeChannelIndex,
                status: 'pending',
                samples: []
            };

            setMarkedWindows(prev => [...prev, newWindow].slice(-MAX_WINDOWS));
            setActiveWindow(newWindow);
            setRunInProgress(true); // Locks UI slightly

            setTimeout(async () => {
                if (!markedWindowsRef.current.find(w => w.id === newWindow.id)) {
                    reject(new Error("Window deleted"));
                    return;
                }

                try {
                    const latestDataTs = latestSignalTimeRef.current;
                    const systemLag = Math.max(0, Date.now() - latestDataTs);
                    const shiftedStart = start + systemLag;
                    const shiftedEnd = end + systemLag;

                    // ASYNC FETCH
                    if (!chartRef.current) throw new Error("Chart not ready");
                    const samplesPoints = await chartRef.current.getSamples(shiftedStart, shiftedEnd);

                    if (!samplesPoints || samplesPoints.length === 0) throw new Error("No data collected");

                    const samples = samplesPoints.map(p => p.value);
                    const timestamps = samplesPoints.map(p => p.time);

                    setWindowProgress(prev => ({ ...prev, [newWindow.id]: { status: 'saving' } }));

                    const resp = await CalibrationApi.sendWindow(activeSensor, {
                        action: targetGestureLabel,
                        channel: activeChannelIndex,
                        samples,
                        timestamps,
                        metadata: buildWindowMetadata({
                            label: targetGestureLabel,
                            channel: activeChannelIndex,
                            samples,
                            startTime: shiftedStart,
                            endTime: shiftedEnd,
                        }),
                    }, sessionName);

                    setWindowProgress(prev => ({ ...prev, [newWindow.id]: { status: 'saved' } }));

                    setMarkedWindows(prev => prev.map(w => {
                        if (w.id === newWindow.id) {
                            return {
                                ...w,
                                predictedLabel: resp.predicted_label,
                                status: 'saved',
                                features: resp.features,
                                startTime: shiftedStart,
                                endTime: shiftedEnd,
                                samples: samples
                            };
                        }
                        return w;
                    }));

                    resolve({ detected: resp.detected, predicted_label: resp.predicted_label });

                } catch (e) {
                    console.error("Test record failed:", e);
                    setWindowProgress(prev => ({ ...prev, [newWindow.id]: { status: 'error' } }));
                    reject(e);
                } finally {
                    setRunInProgress(false);
                    setActiveWindow(null);
                }
            }, delayToCenter + currentDur + 200);
        });
    };

    // Run calibration logic
    const runCalibration = useCallback(async (isAuto = false) => {
        if (!markedWindows || markedWindows.length === 0) return;

        setRunInProgress(true);
        try {
            // Filter windows to only those matching the current target label (per user request)
            const windowsToCalibrate = markedWindows.filter(w => w.label === targetLabel);

            if (windowsToCalibrate.length === 0) {
                console.warn('[DataCollectionView] No matching windows for target label:', targetLabel);
                setRunInProgress(false);
                return;
            }

            // 1. Call robust calibration endpoint
            const result = await CalibrationApi.calibrateThresholds(activeSensor, windowsToCalibrate);
            console.log('[DataCollectionView] Calibration result:', result);

            // 2. Update config locally
            // Ideally we also trigger the ConfigPanel to reload, but since config is lifted state in parent (usually), 
            // or here passing down... currently `config` is local state.
            // We should refetch configuration.
            const refreshedConfig = await CalibrationApi.fetchSensorConfig();
            setConfig(refreshedConfig);

            if (isAuto || autoCalibrate) {
                // Auto-mode: Reset progress and samples
                handleClearAllWindows();
                console.log('[DataCollectionView] Auto-calibration complete. Resetting samples.');
            } else {
                // Manual mode: Update window statuses to show results
                if (result.window_results) {
                    setMarkedWindows(prev => {
                        return prev.map((w, i) => {
                            const res = result.window_results[i];
                            // Heuristic match by index as IDs might not persist in backend pure logic
                            // If actions match
                            if (res && res.action === w.label) {
                                return {
                                    ...w,
                                    status: res.status_after,
                                    predictedLabel: res.status_after === 'correct' ? w.label : 'Rest'
                                };
                            }
                            return w;
                        });
                    });
                }
                const acc = result.accuracy_after !== undefined ? result.accuracy_after : (result.accuracy || 0);
                alert(`Calibration Complete! Accuracy: ${(acc * 100).toFixed(1)}%`);
                // Reset just like auto mode
                handleClearAllWindows();
                setTotalPredictedCount(0);
            }

        } catch (err) {
            console.error('Calibration error:', err);
            // Only alert in manual mode or log in auto
            if (!isAuto) {
                alert(`Calibration failed: ${err.message}`);
            } else {
                console.warn('Auto-calibration failed. Disabling auto-mode.');
                setAutoCalibrate(false);
            }
        } finally {
            setRunInProgress(false);
        }
    }, [markedWindows, activeSensor, autoCalibrate]);

    // Auto-Calibration / Auto-Save Trigger
    useEffect(() => {
        if (!autoCalibrate || runInProgress) return;

        // Count valid active samples (ready to save)
        const readyBatchCount = markedWindows.filter(w => w.status === 'collected' && w.label === targetLabel).length;
        console.log(`[AutoEffect] Ready Batch: ${readyBatchCount}, Limit: ${autoLimit}`);

        // Check Limit (Batch Size)
        if (readyBatchCount >= autoLimit) {
            // Check if we have unsaved collected windows
            const hasUnsaved = markedWindows.some(w => w.status === 'collected');

            if (hasUnsaved) {
                console.log(`[DataCollectionView] Limit ${autoLimit} reached. Auto-appending...`);
                handleAppendSamples();
            }
            return;
        }

    }, [markedWindows, autoCalibrate, isCalibrating, runInProgress, activeSensor, autoLimit]);

    // Optimization: Flusing directly to Worker
    const incomingBufferRef = useRef([]);

    // Data Processing for Chart Plotting - REMOVED (Handled by DataWorker -> BroadcastChannel -> ChartWorker)
    // Note: windowWorkerRef still needs timing updates, we can either pipe them from DataWorker or 
    // keep a minimal listener here. Let's keep a minimal one for windowing logic.

    useEffect(() => {
        if (!wsData) return;
        const payload = wsData.raw || wsData;
        const samples = payload._batch || payload.samples || (payload.channels ? [payload] : []);
        if (samples.length === 0) return;

        const lastSample = samples[samples.length - 1];
        let incomingTs = Number(lastSample.timestamp);
        if (!incomingTs || incomingTs < 1e9) incomingTs = Date.now();

        latestSignalTimeRef.current = incomingTs;
        windowWorkerRef.current?.postMessage({ type: 'UPDATE_SIGNAL_TIME', payload: incomingTs });
    }, [wsData]);


    // Flush to Worker loop (30fps) - REMOVED (Handled by DataWorker -> BroadcastChannel -> ChartWorker)


    // Sync Windows to Worker
    useEffect(() => {
        if (chartRef.current) {
            chartRef.current.updateWindows(markedWindows);
        }
    }, [markedWindows]);

    // Derived state instead of useEffect -> setState (Double render fix)
    const frameTime = React.useMemo(() => {
        // The WorkerTimeSeriesChart will manage its own internal time,
        // but we still need a 'now' for mapping windows.
        // We can use the latestSignalTimeRef for this.
        return latestSignalTimeRef.current;
    }, [latestSignalTimeRef.current]); // Updates when latestSignalTimeRef changes

    const scannerValue = 0; // Worker chart handles scanner internally

    // Cleanup
    useEffect(() => {
        return () => {
            if (windowIntervalRef.current) clearInterval(windowIntervalRef.current);
        };
    }, []);

    // Keyboard Controls
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if typing in an input (except for AltRight/AltGr)
            const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA';

            const code = e.code;
            const km = settings?.keymap?.collection || {};

            // Special case: AltRight/AltGr to focus session name
            if (code === 'AltRight' || code === km.newSession) {
                e.preventDefault();
                if (sessionInputRef.current) {
                    sessionInputRef.current.focus();
                    sessionInputRef.current.select();
                }
                return;
            }

            // Safe bypass for structural hotkeys even if typing
            const isStructuralKey = code.startsWith('Arrow') || code.startsWith('Numpad') || code.startsWith('F') || code === 'ControlRight';
            const matchesHotkey = Object.values(km).includes(code);

            if (isTyping && !(isStructuralKey && matchesHotkey)) return;

            if (code === km.startStop) {
                e.preventDefault();
                if (isCalibrating) handleStopCalibration();
                else handleStartCalibration();
            } else if (code === km.toggleAuto) {
                e.preventDefault();
                setAutoCalibrate(prev => !prev);
            } else if (code === km.changeTarget) {
                e.preventDefault();
                setTargetLabel(prev => {
                    const options = availableLabels;
                    if (!options.length) return prev;
                    const idx = options.indexOf(prev);
                    return options[(idx + 1) % options.length];
                });
            } else if (code === km.deleteLatest) {
                e.preventDefault();
                if (readyWindowsRef.current.length > 0) {
                    const lastReady = readyWindowsRef.current[readyWindowsRef.current.length - 1];
                    deleteWindow(lastReady.id);
                }
            } else if (code === km.deleteAll) {
                e.preventDefault();
                handleClearAllWindows();
            } else if (code === km.appendSample) {
                e.preventDefault();
                handleAppendSamples();
            } else if (code === km.toggleTimeWindow) {
                e.preventDefault();
                setTimeWindow(prev => {
                    const options = [3000, 5000, 8000, 10000, 15000, 20000];
                    const idx = options.indexOf(prev);
                    return options[(idx + 1) % options.length];
                });
            } else if (code === km.toggleZoom) {
                e.preventDefault();
                setZoom(prev => {
                    const options = [1, 2, 5, 10, 25];
                    const idx = options.indexOf(prev);
                    return options[(idx + 1) % options.length];
                });
                setManualYRange("");
            } else if (code === km.limitIncr5) {
                e.preventDefault();
                setAutoLimit(prev => Math.min(200, prev + 5));
            } else if (code === km.limitDecr5) {
                e.preventDefault();
                setAutoLimit(prev => Math.max(1, prev - 5));
            } else if (code === km.limitIncr1) {
                e.preventDefault();
                setAutoLimit(prev => Math.min(200, prev + 1));
            } else if (code === km.limitDecr1) {
                e.preventDefault();
                setAutoLimit(prev => Math.max(1, prev - 1));
            } else if (code === km.toggleWinDuration) {
                e.preventDefault();
                setWindowDuration(prev => {
                    const options = windowDurationOptions;
                    const idx = options.indexOf(prev);
                    return options[(idx + 1) % options.length];
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCalibrating, handleStartCalibration, handleStopCalibration, settings?.keymap?.collection, activeSensor, handleAppendSamples, availableLabels, windowDurationOptions]);



    // Memoize chart config to prevent spurious worker updates
    const chartConfig = React.useMemo(() => {
        const themeColor = currentTheme?.colors?.['--primary'] || '#E3A500';

        // Match the Live Graph axis color perfectly
        const axisColor = currentTheme?.colors?.['--muted'] || '#9ca3af';

        const defaultChannelColor = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7'][activeChannelIndex % 4];

        return {
            yMin: currentYDomain[0],
            yMax: currentYDomain[1],
            lineColor: customLineColor || defaultChannelColor,
            bgColor: 'transparent',
            gridColor: '#444',
            themeColor: themeColor, // Pass theme color to worker
            themeAxisColor: axisColor // Match SignalChart.jsx exactly
        };
    }, [currentYDomain, activeChannelIndex, customLineColor, currentTheme]);

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-bg text-text animate-in fade-in duration-500 overflow-hidden gap-2">


            {/* TOP ROW: SIDEBAR + CHART (50%) */}
            <div className="flex-1 flex min-h-0 px-2 pb-1 pt-2 gap-2">
                {/* SIDEBAR CARD */}
                <div className="w-[260px] flex-none flex flex-col bg-surface border-border border-2 rounded-xl shadow-sm overflow-hidden">
                    {/* Sidebar Header */}
                    <div className="p-1 border-b border-border flex items-center justify-between gap-2 bg-surface/50">
                        <div className="flex flex-row items-center gap-2.5">
                            <span className="flex flex-row text-[22px] items-center font-bold tracking-tight">
                                <Database size={24} className="text-primary mr-1" /> Data Collection
                                <button
                                    onClick={onSwitchLab}
                                    className="transition-all group flex items-center ml-4 gap-3 "
                                    title="Switch to ML Training"
                                >
                                    <ArrowRightFromLine size={18} className="text-muted group-hover:text-primary transition-all group-hover:translate-x-0.5" />
                                    <Brain size={24} className="text-muted group-hover:text-primary transition-colors" />
                                </button>
                            </span>
                        </div>
                    </div>

                    {/* Sidebar Scrollable Content */}
                    <div className="flex-grow overflow-y-auto p-3 space-y-4 no-scrollbar">

                        {/* 1. SENSOR & MODE */}
                        <div className="space-y-3">
                            <label className="text-[16px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5"><Activity size={22} /> Sensor & Mode</label>

                            {/* Pill Toggle for Sensors */}
                            {configuredSensors.length > 1 ? (
                                <div className="flex items-center justify-center gap-3 select-none">
                                    <span className={`text-[24px] font-black tracking-tight transition-colors ${activeSensor === configuredSensors[0] ? 'text-primary' : 'text-muted'}`}>
                                        {configuredSensors[0]}
                                    </span>

                                    <button
                                        onClick={() => {
                                            const idx = configuredSensors.indexOf(activeSensor);
                                            handleSensorChange(configuredSensors[(idx + 1) % configuredSensors.length]);
                                        }}
                                        className={`w-14 h-7 rounded-full relative transition-colors border-2 border-border bg-bg`}
                                    >
                                        <div className={`absolute top-0.5 bottom-0.5 w-5 rounded-full bg-text shadow transition-all ${configuredSensors.indexOf(activeSensor) > 0 ? 'left-[calc(100%-22px)]' : 'left-0.5'}`} />
                                    </button>

                                    <span className={`text-[24px] font-black tracking-tight transition-colors ${activeSensor !== configuredSensors[0] ? 'text-primary' : 'text-muted'}`}>
                                        {activeSensor !== configuredSensors[0] ? activeSensor : configuredSensors[configuredSensors.length - 1]}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-xs font-black text-primary uppercase tracking-widest">{configuredSensors[0]}</span>
                            )}

                            {/* Segmented Control for Modes (Image 1 Style) */}
                            <div className="flex p-1 bg-bg border-2 border-accent/30 rounded-[50px] overflow-hidden shadow-inner">
                                {['collection', 'recorded', 'test'].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setMode(m)}
                                        className={`flex-1 py-1.5 rounded-[50px] font-black text-[12px] px-[4px] transition-all uppercase tracking-widest ${mode === m
                                            ? 'bg-accent text-primary-contrast shadow-md'
                                            : 'text-muted hover:text-text hover:bg-white/5'
                                            }`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="h-[2px] w-full bg-border/95"></div>

                        {/* 2. COLLECTION CONTROLS */}
                        <div className="space-y-3">
                            <label className="text-[16px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5"><Zap size={22} /> Data Collection</label>

                            {activeSensor === 'EEG' ? (
                                <div className="space-y-3 rounded-xl border border-primary/20 bg-bg/60 p-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted uppercase flex items-center gap-1"><Target size={12} /> EEG Target</span>
                                        <span className="text-[11px] font-bold uppercase tracking-widest text-primary">
                                            {selectedEegTarget ? `${selectedEegTarget.freq.toFixed(1)} Hz` : 'Rest'}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {eegTargets.filter(target => target.enabled).map(target => (
                                            <button
                                                key={target.id}
                                                onClick={() => handleTargetChange(target.label)}
                                                className={`rounded-lg border px-2 py-2 text-left transition-all ${targetLabel === target.label
                                                    ? 'border-primary bg-primary/15 text-text shadow-sm'
                                                    : 'border-border bg-bg text-muted hover:text-text'
                                                    }`}
                                            >
                                                <div className="text-xs font-bold uppercase tracking-wider">{target.label}</div>
                                                <div className="text-base font-black text-primary">{target.freq.toFixed(1)} Hz</div>
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => handleTargetChange('Rest')}
                                            className={`rounded-lg border px-2 py-2 text-left transition-all ${targetLabel === 'Rest'
                                                ? 'border-primary bg-primary/15 text-text shadow-sm'
                                                : 'border-border bg-bg text-muted hover:text-text'
                                                }`}
                                        >
                                            <div className="text-xs font-bold uppercase tracking-wider">Rest</div>
                                            <div className="text-sm font-black text-primary/80">Baseline</div>
                                        </button>
                                    </div>
                                    <div className="rounded-lg border border-border/70 bg-surface/60 p-2 text-[11px] leading-relaxed text-muted">
                                        Collect 30-50 trials per target with {windowDuration} ms windows.
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <span className="text-xs text-muted uppercase flex items-center gap-1"><Target size={12} /> Target Label</span>
                                    <CustomSelect
                                        value={targetLabel}
                                        onChange={handleTargetChange}
                                        options={availableLabels}
                                    />
                                </div>
                            )}

                            {/* Action Buttons Redesign */}
                            {showWizard ? (
                                <AutoCalibrationWizard
                                    isActive={showWizard}
                                    onClose={() => setShowWizard(false)}
                                    sensor={activeSensor}
                                    onStartRecording={() => handleStartCalibration(targetLabel)}
                                    onStopRecording={handleStopCalibration}
                                    setTargetLabel={setTargetLabel}
                                    setAutoLimit={setAutoLimit}
                                    readyCount={markedWindows.filter(w => w.label === targetLabel).length}
                                    isRecording={isCalibrating}
                                    targetCount={autoLimit}
                                    labels={SENSOR_LABELS[activeSensor]}
                                    inline={true}
                                />
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={isCalibrating ? handleStopCalibration : () => handleStartCalibration()}
                                        className={`w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-3 transition-all shadow-md active:scale-95 ${isCalibrating
                                            ? 'bg-red-500/10 border border-red-500/50 text-red-500 hover:bg-red-500/20'
                                            : 'bg-primary text-primary-contrast hover:scale-[1.02] shadow-primary/20'
                                            }`}
                                    >
                                        {isCalibrating ? (
                                            <><Square size={18} fill="currentColor" /> STOP RECORDING</>
                                        ) : (
                                            <><Play size={18} fill="currentColor" /> START COLLECTION</>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setShowWizard(true)}
                                        className="w-full py-3 bg-surface border border-primary/30 text-primary rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/5 transition-all text-sm uppercase tracking-wider"
                                    >
                                        <Target size={16} /> CALIBRATION WIZARD
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* CHART CARD */}
                <div className="flex-grow min-w-0 bg-surface border-2 border-border rounded-xl shadow-sm overflow-hidden flex flex-col relative group">
                    {/* Status Badge Overlay */}
                    <div className="absolute top-1.5 right-3 z-10">
                        <div className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border backdrop-blur-sm shadow-sm ${isCalibrating
                            ? 'bg-red-500/10 text-red-500 border-red-500/20 animate-pulse'
                            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                            {isCalibrating ? '● REC' : '● IDLE'}
                        </div>
                    </div>

                    {/* Chart Header Controls */}
                    <div className="px-3 py-1.5 border-b border-border bg-bg flex items-center justify-between gap-4 max-h-[40px] flex-none">
                        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
                            {/* Zoom */}
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-bold text-muted uppercase">Zoom</span>
                                <div className="flex gap-0.5">
                                    {[1, 2, 5, 10, 25].map(z => (
                                        <button
                                            key={z}
                                            onClick={() => { setZoom(z); setManualYRange(""); }}
                                            className={`px-1.5 py-0.5 text-xs rounded font-bold transition-all ${zoom === z && !manualYRange
                                                ? 'bg-primary text-white shadow-sm'
                                                : 'bg-surface hover:bg-white/10 text-muted hover:text-text border border-border'
                                                }`}
                                        >
                                            {z}x
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="w-[1px] h-3 bg-border shrink-0"></div>

                            {/* Window / Duration */}
                            <div className="flex items-center gap-2 shrink-0">
                                <label className="text-xs font-bold text-muted uppercase">Win</label>
                                <select
                                    value={timeWindow}
                                    onChange={(e) => setTimeWindow(Number(e.target.value))}
                                    className="bg-bg border border-border rounded px-1 py-0.5 text-xs font-mono outline-none"
                                >
                                    {[3000, 5000, 8000, 10000, 15000, 20000].map(v => (
                                        <option key={v} value={v}>{v / 1000}s</option>
                                    ))}
                                </select>

                                <label className="text-xs font-bold text-muted uppercase ml-1">Dur</label>
                                <select
                                    value={windowDuration}
                                    onChange={(e) => setWindowDuration(Number(e.target.value))}
                                    className="bg-bg border border-border rounded px-1 py-0.5 text-xs font-mono outline-none"
                                >
                                    {windowDurationOptions.map(v => (
                                        <option key={v} value={v}>{v}ms</option>
                                    ))}
                                </select>
                            </div>

                            <div className="w-[1px] h-3 bg-border shrink-0"></div>

                            {/* Color Picker */}
                            <div className="flex items-center gap-2 shrink-0 relative">
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        const currentColor = customLineColor || chartConfig.lineColor;
                                        const currentIndex = DEFAULT_PALETTE.indexOf(currentColor);
                                        const nextIndex = (currentIndex + 1) % DEFAULT_PALETTE.length;
                                        setCustomLineColor(DEFAULT_PALETTE[nextIndex === -1 ? 0 : nextIndex]);
                                    }}
                                    className="p-1 hover:bg-muted/10 rounded-full transition-colors cursor-pointer group flex items-center"
                                    title="Click to Cycle Color"
                                >
                                    <ChartSpline size={24} strokeWidth={3} style={{ color: customLineColor || chartConfig.lineColor }} className="group-hover:scale-110 transition-transform" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-grow relative">
                        <div className="absolute inset-0 p-2">
                            <WorkerTimeSeriesChart
                                ref={chartRef}
                                timeWindow={timeWindow}
                                activeSensor={activeSensor}
                                activeChannelIndex={activeChannelIndex}
                                channelIndex={activeChannelIndex}
                                config={chartConfig}
                                onWindowSelect={handleManualWindowSelect}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* BOTTOM ROW: SESSION + WINDOW LIST (50%) */}
            <div className="flex-1 min-h-0 px-2 pb-2 pt-1 grid grid-cols-1 lg:grid-cols-12 gap-2">
                {/* Session Panel */}
                <div className="lg:col-span-9 h-full min-h-0 overflow-hidden shadow-sm">
                    {(mode === 'collection' || mode === 'recorded' || mode === 'test') ? (
                        <SessionManagerPanel
                            activeSensor={activeSensor}
                            currentSessionName={sessionName}
                            onSessionChange={setSessionName}
                            refreshTrigger={dataLastUpdated}
                            isTestMode={mode === 'test'}
                            inputRef={sessionInputRef}
                            sessions={sessions}
                            isLoading={isSessionLoading}
                            isTableLoading={isTableLoading}
                            isResetMode={isDetailsReset}
                            rows={sessionRows}
                            totalRows={sessionTotalRows}
                            absoluteTotalRows={sessionAbsoluteTotalRows}
                            hasMore={sessionHasMore}
                            onFetchDetails={(payload) => sessionWorkerRef.current?.postMessage({ type: 'FETCH_DETAILS', payload })}
                            onDeleteSession={(name) => sessionWorkerRef.current?.postMessage({ type: 'DELETE_SESSION', payload: { name } })}
                            onRenameSession={(oldName, newName) => sessionWorkerRef.current?.postMessage({ type: 'RENAME_SESSION', payload: { oldName, newName } })}
                            onMergeSessions={(sourceSessions, targetName) => sessionWorkerRef.current?.postMessage({ type: 'MERGE_SESSIONS', payload: { sourceSessions, targetName } })}
                            onDeleteRow={(rowId) => sessionWorkerRef.current?.postMessage({ type: 'DELETE_ROW', payload: { fullName: fullCurrentSessionName, rowId } })}
                            onClearSession={(name) => sessionWorkerRef.current?.postMessage({ type: 'CLEAR_SESSION', payload: { name } })}
                            onCreateSession={(name) => sessionWorkerRef.current?.postMessage({ type: 'CREATE_SESSION', payload: { name } })}
                        />
                    ) : (
                        <ConfigPanel config={config} sensor={activeSensor} onSave={setConfig} />
                    )}
                </div>                {/* Window List */}
                <div className="lg:col-span-3 h-full min-h-0 overflow-hidden shadow-sm flex flex-col bg-card rounded-md">
                    {activeSensor === 'EEG' ? (
                        <>
                            <div className="flex border-b border-border p-1 bg-muted/30">
                                <button
                                    onClick={() => setShowEegWindowList(false)}
                                    className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-md transition-colors ${!showEegWindowList ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:bg-muted'}`}
                                >
                                    Collection View
                                </button>
                                <button
                                    onClick={() => setShowEegWindowList(true)}
                                    className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-md transition-colors ${showEegWindowList ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:bg-muted'}`}
                                >
                                    Window List
                                </button>
                            </div>
                            <div className="flex-1 min-h-0 overflow-hidden">
                                {showEegWindowList ? (
                                    <WindowListPanel
                                        windows={markedWindows}
                                        onDelete={deleteWindow}
                                        onMarkMissed={markMissed}
                                        onHighlight={setHighlightedWindow}
                                        activeSensor={activeSensor}
                                        windowProgress={windowProgress}
                                        autoLimit={autoLimit}
                                        onAutoLimitChange={setAutoLimit}
                                        autoCalibrate={autoCalibrate}
                                        onAutoCalibrateChange={setAutoCalibrate}
                                        onClearSaved={handleAppendSamples}
                                        onDeleteAll={handleClearAllWindows}
                                    />
                                ) : (
                                    <EEGDataCollectionPanel
                                        isCalibrating={isCalibrating}
                                        targetLabel={targetLabel}
                                        targetFrequency={selectedEegTarget?.freq || 0}
                                        onRecord={handleEEGRecord}
                                        savedCount={markedWindows.filter(w => w.label === targetLabel && (w.status === 'saved' || w.status === 'correct')).length}
                                    />
                                )}
                            </div>
                        </>
                    ) : (
                        <WindowListPanel
                            windows={markedWindows}
                            onDelete={deleteWindow}
                            onMarkMissed={markMissed}
                            onHighlight={setHighlightedWindow}
                            activeSensor={activeSensor}
                            windowProgress={windowProgress}
                            autoLimit={autoLimit}
                            onAutoLimitChange={setAutoLimit}
                            autoCalibrate={autoCalibrate}
                            onAutoCalibrateChange={setAutoCalibrate}
                            onClearSaved={handleAppendSamples}
                            onDeleteAll={handleClearAllWindows}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
