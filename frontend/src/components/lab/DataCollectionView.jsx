import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import WorkerTimeSeriesChart from '../charts/WorkerTimeSeriesChart';
import WorkerFFTChart from '../charts/WorkerFFTChart';
import WindowListPanel from '../data_collection/WindowListPanel';
import EEGDataCollectionPanel from '../data_collection/EEGDataCollectionPanel';
import ConfigPanel from '../data_collection/ConfigPanel';
import SessionManagerPanel from '../data_collection/SessionManagerPanel';
import AutoCalibrationWizard from '../data_collection/AutoCalibrationWizard';
import InlineModeToggle from '../ui/inputs/InlineModeToggle';
import { CalibrationApi } from '../../services/calibrationApi';
import CustomSelect from '../ui/inputs/CustomSelect';
import { formatAmplitudeValue } from '../../utils/spectrumFormat';
import { useSettings } from '../../contexts/SettingsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getRuntimeConnection } from '../../utils/runtimeConnection';
import {
    Activity, Play, Square, Database, Zap,
    Target, ChartSpline, Brain, ArrowRightFromLine,
    ZoomIn, ArrowUpDown, ArrowDown, ArrowUp, Sigma
} from 'lucide-react';
import { soundHandler } from '../../handlers/SoundHandler'

// Workers
import SessionWorker from '../../workers/session.worker.js?worker';
import WindowWorker from '../../workers/window.worker.js?worker';
import SaveWorker from '../../workers/save.worker.js?worker';
import '../../styles/live/SignalChart.css';

const DEFAULT_PALETTE = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#f97316', '#06d6a0'
];


const EMG_COLLECTION_GAP_MS = 500;
const EMG_BURST_STRIDE_MS = 150;
const EMG_BURST_WINDOWS = 5;
const WINDOW_PREVIEW_POINTS = 72;

const SENSOR_LABELS = {
    EMG: ['Rock', 'Paper', 'Scissors', 'Rest'],
    EOG: ['SingleBlink', 'DoubleBlink', 'Rest'],
    EEG: ['Target 1', 'Target 2', 'Target 3',
        'Target 4', 'Target 5', 'Target 6', 'Rest'],
};

function downsampleSamples(samples, maxPoints = WINDOW_PREVIEW_POINTS) {
    if (!Array.isArray(samples) || samples.length === 0) return [];
    if (samples.length <= maxPoints) return samples.slice();
    if (maxPoints <= 1) return [Number(samples[0] || 0)];

    const lastIndex = samples.length - 1;
    return Array.from({ length: maxPoints }, (_, index) => {
        const sourceIndex = Math.round((index / (maxPoints - 1)) * lastIndex);
        return Number(samples[sourceIndex] || 0);
    });
}

function getActualEmgCaptureWindowMs(durWindowMs) {
    const duration = Number(durWindowMs) || 0;
    return duration + ((EMG_BURST_WINDOWS - 1) * EMG_BURST_STRIDE_MS);
}

function isEditableElement(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tagName = target.tagName?.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}



/**
 * DataCollectionView
 * The main container for the BCI data collection experience.
 */
export default function DataCollectionView({ wsData, config: initialConfig, wsUrl, onSwitchLab }) {
    const { settings, updateSettings } = useSettings();
    const { currentTheme } = useTheme();
    const { apiUrl: runtimeApiUrl } = getRuntimeConnection();

    // Top-level states
    const [activeSensor, setActiveSensor] = useState('EMG'); // 'EMG' | 'EOG' | 'EEG'
    const [activeChannelIndex, setActiveChannelIndex] = useState(0); // Explicitly selected channel index
    const [mode, setMode] = useState('collection'); // 'collection' | 'test'
    const [config, setConfig] = useState(initialConfig || {});
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const [runInProgress, setRunInProgress] = useState(false);

    // Data states
    // Data states (chartData removed for Worker optimization)
    // const [chartData, setChartData] = useState([]); // REMOVED

    const [markedWindows, setMarkedWindows] = useState([]);
    const [showEegWindowList, setShowEegWindowList] = useState(false); // Toggle between collection panel and list
    const [activeWindow, setActiveWindow] = useState(null);
    const [targetLabel, setTargetLabel] = useState('Rock'); // e.g., 'Rock', 'Paper', etc.
    const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
    const [completedBatchCount, setCompletedBatchCount] = useState(0);
    const [activeBatchWindowIds, setActiveBatchWindowIds] = useState([]);
    const [isBatchProducing, setIsBatchProducing] = useState(false);
    const [isBatchSaving, setIsBatchSaving] = useState(false);

    const [totalPredictedCount, setTotalPredictedCount] = useState(0);

    // Worker Instances
    const sessionWorkerRef = useRef(null);
    const windowWorkerRef = useRef(null);
    const dataWorkerRef = useRef(null);
    const saveWorkerRef = useRef(null);
    const pendingSaveRequestRef = useRef(null);
    const handleAppendSamplesRef = useRef(null);
    const windowRequestIdRef = useRef(0);
    const pendingWindowRequestsRef = useRef(new Map());
    const deletedWindowIdsRef = useRef(new Set());
    const batchTransitionLockRef = useRef(false);

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
    const [batchSize, setBatchSize] = useState(settings?.collectionState?.batchSize || 5);
    const [numBatches, setNumBatches] = useState(settings?.collectionState?.numBatches || 6);
    const [autoLimit, setAutoLimit] = useState(settings?.collectionState?.autoLimit || 30);
    const [autoCalibrate, setAutoCalibrate] = useState(settings?.collectionState?.autoCalibrate || false); // Auto-calibration toggle
    const [windowDuration, setWindowDuration] = useState(settings?.collectionState?.windowDuration || 900); // ms
    const [timeWindow, setTimeWindow] = useState(settings?.collectionState?.timeWindow || 5000); // visible sweep window length for calibration plot
    const [graphMode, setGraphMode] = useState(settings?.collectionState?.graphMode || 'time');
    const [emgDisplayMode, setEmgDisplayMode] = useState(settings?.collectionState?.emgDisplayMode || 'raw');
    const [manualYRange, setManualYRange] = useState(() => {
        const saved = localStorage.getItem(`manual_y_range_${activeSensor}`);
        return saved || "";
    });
    // FFT Frequency Range Persistence
    const [fftFreqRange, setFftFreqRange] = useState(() => {
        const saved = localStorage.getItem(`fft_range_${activeSensor}`);
        if (saved) return JSON.parse(saved);
        const defaults = { EMG: { min: 1, max: 300 }, EEG: { min: 1, max: 50 }, EOG: { min: 1, max: 20 } };
        return defaults[activeSensor] || { min: 1, max: 50 };
    });

    const isInternalUpdate = useRef(false);
    const lastSensorRef = useRef(activeSensor);

    // Sync from LocalStorage on Sensor Switch
    useEffect(() => {
        const savedFft = localStorage.getItem(`fft_range_${activeSensor}`);
        let newFftRange;
        if (savedFft) {
            newFftRange = JSON.parse(savedFft);
        } else {
            const defaults = { EMG: { min: 1, max: 300 }, EEG: { min: 1, max: 50 }, EOG: { min: 1, max: 20 } };
            newFftRange = defaults[activeSensor] || { min: 1, max: 50 };
        }

        const savedY = localStorage.getItem(`manual_y_range_${activeSensor}`);

        isInternalUpdate.current = true;
        setFftFreqRange(newFftRange);
        setManualYRange(savedY || "");
        lastSensorRef.current = activeSensor;
    }, [activeSensor]);

    // Save to LocalStorage on Change
    useEffect(() => {
        if (isInternalUpdate.current) {
            isInternalUpdate.current = false;
            return;
        }
        localStorage.setItem(`fft_range_${activeSensor}`, JSON.stringify(fftFreqRange));
    }, [fftFreqRange, activeSensor]);

    useEffect(() => {
        if (isInternalUpdate.current) return;
        localStorage.setItem(`manual_y_range_${activeSensor}`, manualYRange);
    }, [manualYRange, activeSensor]);

    const updateFftRangeValue = useCallback((field, val) => {
        setFftFreqRange(prev => ({ ...prev, [field]: val }));
    }, []);

    const [fftStats, setFftStats] = useState({ min: 0, max: 0, mean: 0 });

    const [dataLastUpdated, setDataLastUpdated] = useState(0);
    const [chartLayoutReady, setChartLayoutReady] = useState(false);
    const [chartRenderKey, setChartRenderKey] = useState(0);

    // Refs for accessing latest state inside interval/timeouts
    // const chartDataRef = useRef(chartData); // REMOVED
    const chartRef = useRef(null); // Access to Worker Chart
    const chartCardRef = useRef(null);
    const chartLayoutReadyRef = useRef(false);
    const latestSignalTimeRef = useRef(Date.now()); // Track latest TS for logic

    const activeSensorRef = useRef(activeSensor);
    const activeChannelIndexRef = useRef(activeChannelIndex); // Ref for channel
    const targetLabelRef = useRef(targetLabel);
    const markedWindowsRef = useRef(markedWindows);
    const sessionNameRef = useRef(sessionName);
    const sessionInputRef = useRef(null); // Ref for focusing session name input

    // Keep refs in sync
    // useEffect(() => { chartDataRef.current = chartData; }, [chartData]);

    useEffect(() => { activeSensorRef.current = activeSensor; }, [activeSensor]);
    useEffect(() => {
        if (activeSensor === 'EMG' && windowDuration < 600) {
            setWindowDuration(900);
        }
    }, [activeSensor, windowDuration]);
    useEffect(() => {
        if (activeSensor !== 'EEG' && graphMode === 'fft') {
            setGraphMode('time');
        }
    }, [activeSensor, graphMode]);
    useEffect(() => { activeChannelIndexRef.current = activeChannelIndex; }, [activeChannelIndex]);
    useEffect(() => { targetLabelRef.current = targetLabel; }, [targetLabel]);
    useEffect(() => { markedWindowsRef.current = markedWindows; }, [markedWindows]);
    const autoLimitRef = useRef(autoLimit);
    useEffect(() => { autoLimitRef.current = autoLimit; }, [autoLimit]);
    useEffect(() => { sessionNameRef.current = sessionName; }, [sessionName]);
    const currentBatchIndexRef = useRef(currentBatchIndex);
    const completedBatchCountRef = useRef(completedBatchCount);
    const isBatchProducingRef = useRef(isBatchProducing);
    const isBatchSavingRef = useRef(isBatchSaving);
    useEffect(() => { currentBatchIndexRef.current = currentBatchIndex; }, [currentBatchIndex]);
    useEffect(() => { completedBatchCountRef.current = completedBatchCount; }, [completedBatchCount]);
    useEffect(() => { isBatchProducingRef.current = isBatchProducing; }, [isBatchProducing]);
    useEffect(() => { isBatchSavingRef.current = isBatchSaving; }, [isBatchSaving]);

    // Update autoLimit based on batch settings in auto mode
    useEffect(() => {
        if (autoCalibrate) {
            setAutoLimit(batchSize * numBatches);
        }
    }, [autoCalibrate, batchSize, numBatches]);


    // Compute matching channels for the active sensor
    const matchingChannels = React.useMemo(() => {
        if (!config?.channel_mapping) return [];
        const rawMatches = Object.entries(config.channel_mapping)
            .filter(([key, val]) => val.sensor === activeSensor || val.type === activeSensor)
            .map(([key, val]) => ({
                id: key,
                index: parseInt(key.replace('ch', ''), 10),
                rawLabel: val.label || val.name || key
            }))
            .sort((a, b) => a.index - b.index)
            .slice(0, 2); // Limit to 2 channels (CH0, CH1)

        const duplicateLabels = new Set(
            rawMatches
                .map((channel) => channel.rawLabel)
                .filter((label, idx, labels) => labels.indexOf(label) !== idx)
        );

        return rawMatches.map((channel, idx) => ({
            ...channel,
            label: rawMatches.length === 2
                ? `ch- A${idx + 1}`
                : (duplicateLabels.has(channel.rawLabel)
                    ? `${channel.rawLabel} · CH${channel.index}`
                    : channel.rawLabel)
        }));
    }, [activeSensor, config]);

    // Auto-select first matching channel when sensor changes
    useEffect(() => {
        if (matchingChannels.length > 0) {
            // If current selection is not in the new list, reset to first match
            const exists = matchingChannels.find(c => c.index === activeChannelIndex);
            if (!exists) {
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

    const visibleSensorToggle = useMemo(() => {
        if (configuredSensors.length >= 2) {
            return configuredSensors.slice(0, 2);
        }
        const fallback = configuredSensors[0] || activeSensor || 'EMG';
        return [fallback, fallback];
    }, [configuredSensors, activeSensor]);

    // Ensure activeSensor is always a valid configured sensor
    useEffect(() => {
        if (configuredSensors.length > 0 && !configuredSensors.includes(activeSensor)) {
            setActiveSensor(configuredSensors[0]);
        }
    }, [configuredSensors, activeSensor]);

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

    const actualCaptureWindowMs = useMemo(
        () => (activeSensor === 'EMG' ? getActualEmgCaptureWindowMs(windowDuration) : windowDuration),
        [activeSensor, windowDuration]
    );
    const autoTargetCount = useMemo(() => Math.max(1, batchSize * numBatches), [batchSize, numBatches]);
    const producedStatuses = useMemo(() => new Set(['pending', 'recording', 'collected', 'saved', 'correct']), []);

    const windowDurationOptions = useMemo(() => {
        if (activeSensor === 'EEG') return [1000, 1500, 2000, 3000];
        if (activeSensor === 'EMG') return [900, 1200, 1500, 1800];
        return [500, 1000, 1500, 2000];
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

        worker.onmessage = (e) => {
            const { type, payload, error } = e.data || {};

            if (type === 'UI_UPDATE') {
                const incomingTs = Number(payload?.lastSample?.timestamp);
                if (incomingTs && incomingTs > 0) {
                    latestSignalTimeRef.current = incomingTs;
                    setDataLastUpdated(Date.now());

                    const now = Date.now();
                    if (now - lastTimeUpdateRef.current > 50) {
                        windowWorkerRef.current?.postMessage({ type: 'UPDATE_SIGNAL_TIME', payload: incomingTs });
                        lastTimeUpdateRef.current = now;
                    }
                }
            } else if (type === 'STATUS') {
                if (payload === 'error' && error) {
                    console.error('[DataCollectionView] DataWorker error:', error);
                }
            } else if (type === 'CONFIG' && payload) {
                setConfig((prev) => payload || prev);
            }
        };

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
        saveWorkerRef.current = new SaveWorker();

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
                    const doCollect = async () => {
                        if (deletedWindowIdsRef.current.has(id)) return;
                        if (chartRef.current) {
                            try {
                                const samplesPoints = await chartRef.current.getSamples(start, end);
                                if (deletedWindowIdsRef.current.has(id)) return;
                                if (samplesPoints && samplesPoints.length > 0) {
                                    const samples = samplesPoints.map(p => p.value);
                                    const timestamps = samplesPoints.map(p => p.time);
                                    windowWorkerRef.current.postMessage({
                                        type: 'WINDOW_COLLECTED',
                                        payload: {
                                            id,
                                            startTime: start,
                                            endTime: end,
                                            samples,
                                            timestamps,
                                            status: 'collected',
                                            captureWindowMs: end - start
                                        }
                                    });
                                } else {
                                    windowWorkerRef.current.postMessage({
                                        type: 'WINDOW_COLLECTED',
                                        payload: {
                                            id,
                                            startTime: start,
                                            endTime: end,
                                            status: 'error',
                                            captureWindowMs: end - start
                                        }
                                    });
                                }
                            } catch (err) {
                                console.error("Failed to get samples for worker window", err);
                                windowWorkerRef.current.postMessage({
                                    type: 'WINDOW_COLLECTED',
                                    payload: {
                                        id,
                                        startTime: start,
                                        endTime: end,
                                        status: 'error',
                                        captureWindowMs: end - start
                                    }
                                });
                            }
                        }
                    };
                    if (delay > 0) {
                        setTimeout(doCollect, delay);
                    } else {
                        doCollect();
                    }
                    break;
                case 'BATCH_PRODUCTION_COMPLETE':
                    setIsBatchProducing(false);
                    break;
                case 'TRIGGER_AUTO_APPEND':
                    handleAppendSamplesRef.current?.();
                    break;
                case 'WINDOWS_FULL_RESULT': {
                    const requestId = payload?.requestId;
                    if (pendingWindowRequestsRef.current.has(requestId)) {
                        const resolve = pendingWindowRequestsRef.current.get(requestId);
                        pendingWindowRequestsRef.current.delete(requestId);
                        resolve(payload?.windows || []);
                    }
                    break;
                }
            }
        };

        saveWorkerRef.current.onmessage = (e) => {
            const { type, payload } = e.data || {};
            const pending = pendingSaveRequestRef.current;
            if (!pending || payload?.requestId !== pending.requestId) {
                return;
            }

            if (type === 'SAVE_WINDOW_PROGRESS') {
                const result = payload?.result || {};
                if (deletedWindowIdsRef.current.has(result.id)) {
                    return;
                }
                windowWorkerRef.current?.postMessage({
                    type: 'WINDOW_COLLECTED',
                    payload: {
                        id: result.id,
                        status: result.error ? 'error' : 'saved',
                        features: result.features,
                        predictedLabel: result.predicted_label,
                        windows_saved: result.windows_saved ?? 1,
                    }
                });
            } else if (type === 'SAVE_WINDOWS_COMPLETE') {
                pending.resolve(payload);
                pendingSaveRequestRef.current = null;
            } else if (type === 'SAVE_WINDOWS_ERROR') {
                pending.reject(new Error(payload?.error || 'Batch save failed'));
                pendingSaveRequestRef.current = null;
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
                batchSize,
                numBatches,
                windowDuration: actualCaptureWindowMs,
                timeWindow,
                isCalibrating
            }
        });

        return () => {
            sessionWorkerRef.current?.terminate();
            windowWorkerRef.current?.terminate();
            saveWorkerRef.current?.terminate();
        };
    }, []);

    // Sync state to workers
    useEffect(() => {
        windowWorkerRef.current?.postMessage({
            type: 'UPDATE_STATE',
            payload: { activeSensor, activeChannelIndex, targetLabel, mode, autoLimit, autoCalibrate, batchSize, numBatches, windowDuration: actualCaptureWindowMs, timeWindow }
        });
    }, [activeSensor, activeChannelIndex, targetLabel, mode, autoLimit, autoCalibrate, batchSize, numBatches, actualCaptureWindowMs, timeWindow]);

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
    }, [selectedRecording, mode, activeSensor, activeChannelIndex, graphMode]); // Added graphMode to dependencies


    // Zoom state (Y-axis) similar to LiveView
    const [zoom, setZoom] = useState(settings?.collectionState?.zoom || 1);
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
    const appendLockRef = useRef(false);
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
            batchSize,
            numBatches,
            autoCalibrate,
            graphMode,
            emgDisplayMode,
            fftFreqRange
        });
    }, [zoom, timeWindow, windowDuration, autoLimit, batchSize, numBatches, autoCalibrate, graphMode, emgDisplayMode, fftFreqRange, updateSettings]);

    // Handlers
    const handleSensorChange = (sensor) => {
        setActiveSensor(sensor);
        soundHandler.playMLSwitch();
        if (sensor === 'EEG') {
            setMode('collection');
            setWindowDuration(1500);
            setTimeWindow(prev => Math.max(prev, 8000));
            setAutoLimit(prev => Math.max(prev, 24));
        } else if (sensor === 'EMG') {
            setWindowDuration(prev => [900, 1200, 1500, 1800].includes(prev) ? prev : 900);
        } else if (sensor !== 'EEG' && mode === 'recorded') {
            setMode('collection');
        }
        sessionWorkerRef.current?.postMessage({ type: 'SET_SENSOR', payload: sensor });
    };

    const handleTargetChange = (newTarget) => {
        setTargetLabel(newTarget);
        soundHandler.playSettingSwitch();
    };

    const handleChannelToggle = useCallback(() => {
        if (matchingChannels.length < 2) return;
        const currentIdx = matchingChannels.findIndex(c => c.index === activeChannelIndex);
        const nextIdx = (currentIdx + 1) % matchingChannels.length;
        setActiveChannelIndex(matchingChannels[nextIdx].index);
        soundHandler.playSettingSwitch();
    }, [matchingChannels, activeChannelIndex]);

    const buildWindowMetadata = useCallback((win) => {
        if (activeSensor === 'EMG') {
            const durWindowMs = Number(win.windowDurationMs || windowDuration || 0);
            const captureWindowMs = Number(
                win.captureWindowMs
                || (win.endTime && win.startTime ? Math.max(0, win.endTime - win.startTime) : actualCaptureWindowMs)
                || actualCaptureWindowMs
            );
            return {
                collectionMode: mode,
                channelIndex: win.channel ?? activeChannelIndex,
                sampleCount: Array.isArray(win.samples) ? win.samples.length : 0,
                windowMs: durWindowMs,
                captureWindowMs,
                sessionWindowMs: durWindowMs,
                sessionOverlap: 0,
                sessionStrideMs: EMG_BURST_STRIDE_MS,
                strideMs: EMG_BURST_STRIDE_MS,
                gapMs: EMG_COLLECTION_GAP_MS,
                samplingRate: Number(config?.sampling_rate || 1000),
                source: 'frontend_auto_window',
            };
        }
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
    }, [activeSensor, eegTargets, selectedEegTarget, activeChannelIndex, windowDuration, actualCaptureWindowMs, mode, config]);


    const startAutoWindowing = useCallback((payload = {}) => {
        windowWorkerRef.current?.postMessage({ type: 'START_WINDOWING', payload });
    }, []);

    const handleStartCalibration = useCallback(async (overriddenLabel) => {
        setIsCalibrating(true);
        batchTransitionLockRef.current = false;
        setCompletedBatchCount(0);
        setActiveBatchWindowIds([]);
        setIsBatchSaving(false);
        soundHandler.playRPSStart(); // Sounds similar to a start/alert
        const label = overriddenLabel || targetLabel;
        CalibrationApi.startCalibration(activeSensor, mode, label, windowDuration, sessionName, {
            channel_index: activeChannelIndex,
            time_window_ms: timeWindow,
            gap_duration_ms: activeSensor === 'EMG' ? EMG_COLLECTION_GAP_MS : 0,
            overlap: 0,
            capture_window_ms: activeSensor === 'EMG' ? actualCaptureWindowMs : windowDuration,
        })
            .catch(e => console.error("Start Calib API failed", e));

        if (mode === 'collection' || mode === 'test') {
            if (activeSensor !== 'EEG') {
                if (autoCalibrate) {
                    setCurrentBatchIndex(1);
                    setIsBatchProducing(true);
                    startAutoWindowing({ batchIndex: 1, batchSize, totalBatches: numBatches });
                } else {
                    setCurrentBatchIndex(0);
                    setIsBatchProducing(false);
                    startAutoWindowing();
                }
            }
        }
    }, [activeSensor, mode, targetLabel, windowDuration, actualCaptureWindowMs, sessionName, startAutoWindowing, activeChannelIndex, timeWindow, autoCalibrate, batchSize, numBatches, autoLimit]);

    const handleStopCalibration = useCallback(async () => {
        setIsCalibrating(false);
        batchTransitionLockRef.current = false;
        setCurrentBatchIndex(0);
        setCompletedBatchCount(0);
        setActiveBatchWindowIds([]);
        setIsBatchProducing(false);
        setIsBatchSaving(false);
        soundHandler.playDinoPause();
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
                    createdAtMs: Date.now(),
                    sensor: activeSensor,
                    startTime: seg.startTime,
                    endTime: seg.endTime,
                    label: label,
                    channel: activeChannelIndex,
                    samples: seg.samples,
                    timestamps: seg.timestamps,
                    status: 'collected'
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

            // Add all as collected until the backend save resolves
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
            refreshSessionData(true, {
                fullName: `${activeSensor.toLowerCase()}_session_${sessionName}`,
            });
        } catch (err) {
            console.error("EEG manual record extraction failed:", err);
        }
    }, [activeSensor, activeChannelIndex, sessionName, eegTargets, selectedEegTarget, refreshSessionData]);

    function refreshSessionData(silent = false, options = {}) {
        const { includeSessions = false, fullName = null } = options;

        if (includeSessions) {
            sessionWorkerRef.current?.postMessage({ type: 'FETCH_SESSIONS', payload: { silent } });
        }

        const fallbackFullName = fullName || (
            mode === 'test'
                ? 'prediction_session_History'
                : (fullCurrentSessionName || (sessionName ? `${activeSensor.toLowerCase()}_session_${sessionName}` : null))
        );

        if (!fallbackFullName) return;

        sessionWorkerRef.current?.postMessage({
            type: 'FETCH_DETAILS',
            payload: { fullName: fallbackFullName, limit: 20, offset: 0, isReset: true }
        });
    }

    const requestFullWindows = useCallback((windowIds) => {
        return new Promise((resolve, reject) => {
            if (!windowWorkerRef.current) {
                reject(new Error('Window worker not ready'));
                return;
            }

            const requestId = `windows_${windowRequestIdRef.current++}`;
            pendingWindowRequestsRef.current.set(requestId, resolve);

            windowWorkerRef.current.postMessage({
                type: 'GET_WINDOWS_FULL',
                payload: {
                    requestId,
                    ids: Array.isArray(windowIds) ? windowIds : [],
                }
            });
        });
    }, []);

    const dispatchBatchSave = useCallback((windowsToSave) => {
        return new Promise((resolve, reject) => {
            if (!saveWorkerRef.current) {
                reject(new Error('Save worker not ready'));
                return;
            }

            const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            pendingSaveRequestRef.current = {
                requestId,
                resolve,
                reject,
                windowIds: windowsToSave.map((window) => window.id)
            };

            saveWorkerRef.current.postMessage({
                type: 'SAVE_WINDOWS',
                payload: {
                    requestId,
                    apiBaseUrl: runtimeApiUrl,
                    sensor: activeSensor,
                    mode,
                    session_name: sessionName,
                    windows: windowsToSave.map((window) => ({
                        id: window.id,
                        sensor: activeSensor,
                        action: window.label,
                        channel: window.channel,
                        samples: window.samples,
                        timestamps: window.timestamps,
                        metadata: buildWindowMetadata(window),
                    })),
                }
            });
        });
    }, [runtimeApiUrl, activeSensor, buildWindowMetadata, mode, sessionName]);

    /**
     * Saves all collected windows to the database.
     */
    const handleAppendSamples = useCallback(async (explicitWindowIds = null) => {
        if (appendLockRef.current) return;
        const appendCountLimit = Array.isArray(explicitWindowIds) && explicitWindowIds.length > 0
            ? explicitWindowIds.length
            : (autoCalibrate ? Math.max(1, batchSize) : Math.max(1, autoLimit));
        const explicitIdSet = Array.isArray(explicitWindowIds) && explicitWindowIds.length > 0
            ? new Set(explicitWindowIds)
            : null;
        const toAppend = markedWindows
            .filter(w => w.status === 'collected' && (!explicitIdSet || explicitIdSet.has(w.id)))
            .slice(0, appendCountLimit);
        if (!toAppend || toAppend.length === 0) return;

        const pendingIds = toAppend.map((window) => window.id);

        appendLockRef.current = true;
        setRunInProgress(true);

        try {
            const fullWindows = await requestFullWindows(pendingIds);
            const fullWindowsById = new Map(fullWindows.map((window) => [window.id, window]));

            if (mode === 'test') {
                for (const win of toAppend) {
                    try {
                        const fullWindow = fullWindowsById.get(win.id);
                        if (!fullWindow) {
                            throw new Error(`Missing full samples for window ${win.id}`);
                        }

                        const resp = await CalibrationApi.sendPredictionWindow(activeSensor, {
                            action: fullWindow.label,
                            samples: fullWindow.samples
                        });

                        windowWorkerRef.current?.postMessage({
                            type: 'WINDOW_COLLECTED',
                            payload: {
                                id: win.id,
                                status: resp.match ? 'correct' : 'incorrect',
                                features: resp.features,
                                predictedLabel: resp.predicted_label,
                            }
                        });
                    } catch (err) {
                        console.error("Error saving test window:", win.id, err);
                        windowWorkerRef.current?.postMessage({
                            type: 'WINDOW_COLLECTED',
                            payload: { id: win.id, status: 'error' }
                        });
                    }
                }
            } else {
                const windowsForSave = pendingIds
                    .map((id) => fullWindowsById.get(id))
                    .filter(Boolean);

                await dispatchBatchSave(windowsForSave);
                const sessionTableName = `${activeSensor.toLowerCase()}_session_${sessionName}`;

                refreshSessionData(true, { fullName: sessionTableName });
            }

            setDataLastUpdated(Date.now());
        } finally {
            setRunInProgress(false);
            appendLockRef.current = false;
        }
    }, [mode, activeSensor, markedWindows, autoCalibrate, batchSize, autoLimit, dispatchBatchSave, refreshSessionData, requestFullWindows]);

    const producedCount = useMemo(
        () => markedWindows.filter((window) => producedStatuses.has(window.status)).length,
        [markedWindows, producedStatuses]
    );
    const activeBatchWindows = useMemo(
        () => autoCalibrate
            ? markedWindows.filter((window) => Number(window.batchIndex || 0) === currentBatchIndex)
            : [],
        [markedWindows, autoCalibrate, currentBatchIndex]
    );
    const activeBatchProducedCount = activeBatchWindows.filter((window) => producedStatuses.has(window.status)).length;
    const activeBatchPendingCount = activeBatchWindows.filter((window) => ['pending', 'recording'].includes(window.status)).length;
    const activeBatchCollectedIds = activeBatchWindows
        .filter((window) => window.status === 'collected')
        .map((window) => window.id);
    const activeBatchSavedCount = activeBatchWindows.filter((window) => ['saved', 'correct'].includes(window.status)).length;
    const activeBatchErrorCount = activeBatchWindows.filter((window) => ['error', 'incorrect'].includes(window.status)).length;
    const manualProgressPercent = useMemo(
        () => Math.min(100, (producedCount / Math.max(1, autoLimit)) * 100),
        [producedCount, autoLimit]
    );
    const batchProgressPercent = useMemo(
        () => Math.min(100, (completedBatchCount / Math.max(1, numBatches)) * 100),
        [completedBatchCount, numBatches]
    );

    const advanceAutoBatch = useCallback(async () => {
        if (batchTransitionLockRef.current) return;
        batchTransitionLockRef.current = true;

        const finishedBatch = currentBatchIndexRef.current;
        const nextCompletedCount = finishedBatch;

        setCompletedBatchCount(nextCompletedCount);
        setActiveBatchWindowIds([]);
        setIsBatchSaving(false);
        setIsBatchProducing(false);

        if (nextCompletedCount >= numBatches || producedCount >= autoTargetCount) {
            await handleStopCalibration();
        } else {
            const nextBatchIndex = finishedBatch + 1;
            setCurrentBatchIndex(nextBatchIndex);
            setIsBatchProducing(true);
            windowWorkerRef.current?.postMessage({
                type: 'RESUME_NEXT_BATCH',
                payload: {
                    batchIndex: nextBatchIndex,
                    batchSize,
                    totalBatches: numBatches,
                }
            });
        }

        batchTransitionLockRef.current = false;
    }, [autoTargetCount, batchSize, numBatches, producedCount, handleStopCalibration]);

    const resumeActiveBatch = useCallback(() => {
        if (batchTransitionLockRef.current) return;
        batchTransitionLockRef.current = true;
        const activeBatch = currentBatchIndexRef.current;
        setActiveBatchWindowIds([]);
        setIsBatchSaving(false);
        setIsBatchProducing(true);
        windowWorkerRef.current?.postMessage({
            type: 'RESUME_NEXT_BATCH',
            payload: {
                batchIndex: activeBatch,
                batchSize,
                totalBatches: numBatches,
            }
        });
        batchTransitionLockRef.current = false;
    }, [batchSize, numBatches]);

    // Auto-save, batch gating, and manual stop logic
    useEffect(() => {
        if (!isCalibrating) return;

        if (!autoCalibrate) {
            if (activeSensor !== 'EEG' && producedCount >= Math.max(1, autoLimit)) {
                handleStopCalibration();
            }
            return;
        }

        if (currentBatchIndex <= 0) return;

        if (
            !isBatchProducingRef.current &&
            !isBatchSavingRef.current &&
            activeBatchProducedCount >= batchSize &&
            activeBatchPendingCount === 0 &&
            activeBatchCollectedIds.length > 0
        ) {
            if (!appendLockRef.current) {
                setActiveBatchWindowIds(activeBatchCollectedIds);
                setIsBatchSaving(true);
                handleAppendSamples(activeBatchCollectedIds);
            }
            return;
        }

        if (
            isBatchSavingRef.current &&
            activeBatchPendingCount === 0 &&
            activeBatchCollectedIds.length === 0 &&
            activeBatchWindowIds.length > 0
        ) {
            if (activeBatchSavedCount >= batchSize) {
                advanceAutoBatch();
            } else if (activeBatchProducedCount < batchSize) {
                resumeActiveBatch();
            }
            return;
        }

        if (
            !isBatchProducingRef.current &&
            !isBatchSavingRef.current &&
            activeBatchProducedCount < batchSize &&
            activeBatchErrorCount > 0
        ) {
            resumeActiveBatch();
        }
    }, [
        isCalibrating,
        autoCalibrate,
        activeSensor,
        producedCount,
        autoLimit,
        currentBatchIndex,
        batchSize,
        activeBatchProducedCount,
        activeBatchPendingCount,
        activeBatchCollectedIds,
        activeBatchSavedCount,
        activeBatchErrorCount,
        activeBatchWindowIds.length,
        handleAppendSamples,
        handleStopCalibration,
        advanceAutoBatch,
        resumeActiveBatch
    ]);

    useEffect(() => {
        handleAppendSamplesRef.current = handleAppendSamples;
    }, [handleAppendSamples]);

    const deleteWindow = useCallback((id) => {
        deletedWindowIdsRef.current.add(id);
        windowWorkerRef.current?.postMessage({ type: 'DELETE_WINDOW', payload: id });
        setActiveBatchWindowIds((prev) => prev.filter((windowId) => windowId !== id));
    }, []);

    const deleteLatestWorkingWindow = useCallback(() => {
        const windows = markedWindowsRef.current || [];
        const selectLatest = (statuses) => windows
            .filter((window) => statuses.includes(window.status))
            .sort((left, right) => {
                const rightCreated = Number(right.createdAtMs ?? right.startTime ?? 0);
                const leftCreated = Number(left.createdAtMs ?? left.startTime ?? 0);
                return rightCreated - leftCreated;
            })[0] || null;

        const latestCollected = selectLatest(['collected']);
        if (latestCollected) {
            deleteWindow(latestCollected.id);
            return;
        }

        const latestPending = selectLatest(['pending', 'recording']);
        if (latestPending) {
            deleteWindow(latestPending.id);
        }
    }, [deleteWindow]);

    const handleClearAllWindows = useCallback(() => {
        markedWindowsRef.current.forEach((window) => {
            deletedWindowIdsRef.current.add(window.id);
        });
        windowWorkerRef.current?.postMessage({ type: 'CLEAR_ALL_WINDOWS' });
        setTotalPredictedCount(0);
        setActiveWindow(null);
        setActiveBatchWindowIds([]);
        setCompletedBatchCount(0);
        setCurrentBatchIndex(autoCalibrate ? currentBatchIndexRef.current : 0);
        setIsBatchSaving(false);
    }, [autoCalibrate]);

    const markMissed = useCallback((id) => {
        setMarkedWindows(prev => prev.map(w => w.id === id ? { ...w, isMissedActual: !w.isMissedActual } : w));
    }, []);

    // Test Mode Handler
    const handleTestRecord = async (targetGestureLabel) => {
        return new Promise((resolve, reject) => {
            const currentTw = timeWindowRef.current;
            const actualCaptureDur = activeSensor === 'EMG' ? getActualEmgCaptureWindowMs(currentDur) : currentDur;
            const currentDur = windowDurationRef.current;
            const latestTs = latestSignalTimeRef.current; // Ref

            const delayToCenter = currentTw / 2;
            const start = latestTs + delayToCenter;
            const end = start + currentDur;

            const newWindow = {
                id: Math.random().toString(36).substr(2, 9),
                createdAtMs: Date.now(),
                sensor: activeSensor,
                mode: 'test',
                startTime: start,
                endTime: end,
                label: targetGestureLabel,
                channel: activeChannelIndex,
                status: 'pending',
                samples: [],
                captureWindowMs: actualCaptureDur,
                windowDurationMs: currentDur
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
                            captureWindowMs: currentDur,
                        }),
                    }, sessionName);

                    setMarkedWindows(prev => prev.map(w => {
                        if (w.id === newWindow.id) {
                            return {
                                ...w,
                                predictedLabel: resp.predicted_label,
                                status: 'saved',
                                features: resp.features,
                                windows_saved: resp.windows_saved, // NEW: feedback for EMG bursts
                                startTime: shiftedStart,
                                endTime: shiftedEnd,
                                samples: downsampleSamples(samples)
                            };
                        }
                        return w;
                    }));

                    setDataLastUpdated(Date.now());
                    refreshSessionData(true, {
                        fullName: `${activeSensor.toLowerCase()}_session_${sessionName}`,
                    });

                    resolve({ detected: resp.detected, predicted_label: resp.predicted_label });

                } catch (e) {
                    console.error("Test record failed:", e);
                    setMarkedWindows(prev => prev.map(w =>
                        w.id === newWindow.id ? { ...w, status: 'error' } : w
                    ));
                    reject(e);
                } finally {
                    setRunInProgress(false);
                    setActiveWindow(null);
                }
            }, delayToCenter + actualCaptureDur + 200);
        });
    };

    // Run calibration logic
    const runCalibration = useCallback(async (isAuto = false) => {
        if (!markedWindows || markedWindows.length === 0) return;

        setRunInProgress(true);
        try {
            const windowsToCalibrate = markedWindows.filter((window) => {
                if (!window?.features) return false;
                return ['saved', 'correct'].includes(window.status);
            });

            if (windowsToCalibrate.length === 0) {
                console.warn('[DataCollectionView] No saved windows available for calibration');
                setRunInProgress(false);
                return;
            }

            // 1. Call robust calibration endpoint
            const result = await CalibrationApi.calibrateThresholds(activeSensor, windowsToCalibrate, sessionName);
            console.log('[DataCollectionView] Calibration result:', result);

            // 2. Update config locally
            const refreshedConfig = await CalibrationApi.fetchSensorConfig();
            setConfig(refreshedConfig);

            if (isAuto || autoCalibrate) {
                // Auto-mode: reset visible progress; saved session rows remain on disk
                handleClearAllWindows();
                console.log('[DataCollectionView] Auto-calibration complete. Resetting captures.');
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
                const labelSummary = Object.entries(result.samples_per_action || {})
                    .map(([label, count]) => `${label}: ${count}`)
                    .join(', ');
                alert(`Calibration Complete! Accuracy: ${(acc * 100).toFixed(1)}%. Saved to session${sessionName ? ` ${sessionName}` : ''}${labelSummary ? ` | ${labelSummary}` : ''}`);
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
    }, [markedWindows, activeSensor, autoCalibrate, sessionName, handleClearAllWindows]);

    // Auto-Calibration / Auto-Save Trigger
    useEffect(() => {
        if (!autoCalibrate || runInProgress) return;

        // Count valid active captures ready to save
        const readyBatchCount = markedWindows.filter(w => w.status === 'collected' && w.label === targetLabel).length;

        // Check Limit (Batch Size)
        if (readyBatchCount >= autoTargetCount) {
            // Check if we have unsaved collected windows
            const hasUnsaved = markedWindows.some(w => w.status === 'collected');

            if (hasUnsaved) {
                console.log(`[DataCollectionView] Limit ${autoTargetCount} reached. Auto-appending...`);
                handleAppendSamples();
            }
            return;
        }

    }, [markedWindows, autoCalibrate, isCalibrating, runInProgress, activeSensor, autoTargetCount, handleAppendSamples]);

    const lastTimeUpdateRef = useRef(0);

    useEffect(() => {
        if (!wsData || dataWorkerRef.current) return;
        const payload = wsData.raw || wsData;
        const samples = payload._batch || payload.samples || (payload.channels ? [payload] : []);
        if (samples.length === 0) return;

        const lastSample = samples[samples.length - 1];
        let incomingTs = Number(lastSample.timestamp);
        if (!incomingTs || incomingTs < 1e9) incomingTs = Date.now();

        latestSignalTimeRef.current = incomingTs;

        // Throttle the update to the window worker to 10Hz
        const now = Date.now();
        if (now - lastTimeUpdateRef.current > 100) {
            windowWorkerRef.current?.postMessage({ type: 'UPDATE_SIGNAL_TIME', payload: incomingTs });
            lastTimeUpdateRef.current = now;
        }
    }, [wsData]);

    // Sync Windows to Worker
    const overlayWindows = useMemo(() => (
        markedWindows.map(({ id, startTime, endTime, status, label }) => ({
            id,
            startTime,
            endTime,
            status,
            label
        }))
    ), [markedWindows]);

    useEffect(() => {
        if (chartRef.current?.updateWindows) {
            chartRef.current.updateWindows(overlayWindows);
        }
    }, [overlayWindows]);

    // Derived state instead of useEffect -> setState (Double render fix)
    const frameTime = React.useMemo(() => {
        // The WorkerTimeSeriesChart will manage its own internal time,
        // but we still need a 'now' for mapping windows.
        // We can use the latestSignalTimeRef for this.
        return latestSignalTimeRef.current;
    }, [latestSignalTimeRef.current]); // Updates when latestSignalTimeRef changes

    const scannerValue = 0; // Worker chart handles scanner internally

    // Keyboard Controls
    useEffect(() => {
        const handleKeyDown = (e) => {
            const isTyping = isEditableElement(e.target);

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
                deleteLatestWorkingWindow();
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
            } else if (code === 'ArrowUp') {
                e.preventDefault();
                if (autoCalibrate) {
                    setNumBatches(prev => Math.max(1, prev + 1));
                } else {
                    setAutoLimit(prev => Math.min(200, prev + 5));
                }
            } else if (code === 'ArrowDown') {
                e.preventDefault();
                if (autoCalibrate) {
                    setNumBatches(prev => Math.max(1, prev - 1));
                } else {
                    setAutoLimit(prev => Math.max(1, prev - 5));
                }
            } else if (code === 'ArrowRight') {
                e.preventDefault();
                if (autoCalibrate) {
                    setBatchSize(prev => Math.max(1, prev + 1));
                } else {
                    setAutoLimit(prev => Math.min(200, prev + 1));
                }
            } else if (code === 'ArrowLeft') {
                e.preventDefault();
                if (autoCalibrate) {
                    setBatchSize(prev => Math.max(1, prev - 1));
                } else {
                    setAutoLimit(prev => Math.max(1, prev - 1));
                }
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
    }, [isCalibrating, handleStartCalibration, handleStopCalibration, settings?.keymap?.collection, activeSensor, handleAppendSamples, availableLabels, windowDurationOptions, autoCalibrate, deleteLatestWorkingWindow, handleClearAllWindows]);



    // Memoize chart config to prevent spurious worker updates
    const chartConfig = React.useMemo(() => {
        const themeColor = currentTheme?.colors?.['--primary'] || '#E3A500';

        // Match the Live Graph axis color perfectly
        const axisColor = currentTheme?.colors?.['--muted'] || '#9ca3af';
        const computedStyle = typeof window !== 'undefined'
            ? window.getComputedStyle(document.documentElement)
            : null;

        const defaultChannelColor = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7'][activeChannelIndex % 4];
        const windowStyles = {
            pending: {
                fill: computedStyle?.getPropertyValue('--window-pending-bg')?.trim() || 'rgba(245, 158, 11, 0.14)',
                stroke: computedStyle?.getPropertyValue('--window-pending-border-strong')?.trim() || '#f59e0b',
                text: currentTheme?.colors?.['--text'] || '#ffffff'
            },
            collected: {
                fill: computedStyle?.getPropertyValue('--window-collected-bg')?.trim() || 'rgba(56, 189, 248, 0.12)',
                stroke: computedStyle?.getPropertyValue('--window-collected-border-strong')?.trim() || '#38bdf8',
                text: currentTheme?.colors?.['--text'] || '#ffffff'
            },
            saved: {
                fill: computedStyle?.getPropertyValue('--window-saved-bg')?.trim() || 'rgba(16, 185, 129, 0.12)',
                stroke: computedStyle?.getPropertyValue('--window-saved-border-strong')?.trim() || '#10b981',
                text: currentTheme?.colors?.['--text'] || '#ffffff'
            },
            error: {
                fill: computedStyle?.getPropertyValue('--window-error-bg')?.trim() || 'rgba(244, 63, 94, 0.12)',
                stroke: computedStyle?.getPropertyValue('--window-error-border-strong')?.trim() || '#f43f5e',
                text: currentTheme?.colors?.['--text'] || '#ffffff'
            }
        };

        return {
            yMin: currentYDomain[0],
            yMax: currentYDomain[1],
            lineColor: customLineColor || defaultChannelColor,
            bgColor: 'transparent',
            gridColor: '#444',
            themeColor: themeColor, // Pass theme color to worker
            themeAxisColor: axisColor, // Match SignalChart.jsx exactly
            windowStyles
        };
    }, [currentYDomain, activeChannelIndex, customLineColor, currentTheme]);

    const fftChartConfig = React.useMemo(() => {
        const axisColor = currentTheme?.colors?.['--muted'] || '#9ca3af';
        const defaultChannelColor = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7'][activeChannelIndex % 4];

        return {
            color: customLineColor || defaultChannelColor,
            zoom,
            manualRange: manualYRange,
            freqMin: Number(fftFreqRange?.min || 1),
            freqMax: Number(fftFreqRange?.max || 50),
            themeAxisColor: axisColor,
            unitMode: 'amplitude',
            sampleRate: Number(config?.sampling_rate || 1000),
        };
    }, [activeChannelIndex, customLineColor, zoom, manualYRange, fftFreqRange, currentTheme, config]);

    const currentChannelLabel = React.useMemo(() => {
        const channel = matchingChannels.find((item) => item.index === activeChannelIndex);
        return channel?.label || `${activeSensor} CH${activeChannelIndex}`;
    }, [matchingChannels, activeChannelIndex, activeSensor]);
    const currentGraphTitle = `Graph ${activeChannelIndex + 1}`;
    const isFftMode = activeSensor === 'EEG' && graphMode === 'fft';
    const fftRangeValue = Number(manualYRange) || Math.max(1, Math.ceil((fftStats.max || 1) * 1.15));
    const fftRangeDisplay = formatAmplitudeValue(fftRangeValue);

    useEffect(() => {
        chartLayoutReadyRef.current = chartLayoutReady;
    }, [chartLayoutReady]);

    useLayoutEffect(() => {
        const card = chartCardRef.current;
        if (!card) return undefined;

        let frameA = null;
        let frameB = null;
        let settleTimer = null;
        let cancelled = false;
        let lastWidth = 0;
        let lastHeight = 0;

        chartLayoutReadyRef.current = false;
        setChartLayoutReady(false);

        const measureAndArm = () => {
            if (frameA) cancelAnimationFrame(frameA);
            if (frameB) cancelAnimationFrame(frameB);
            if (settleTimer) clearTimeout(settleTimer);

            frameA = requestAnimationFrame(() => {
                frameB = requestAnimationFrame(() => {
                    if (cancelled) return;

                    const width = Math.round(card.clientWidth || 0);
                    const height = Math.round(card.clientHeight || 0);
                    if (width < 320 || height < 180) {
                        measureAndArm();
                        return;
                    }

                    lastWidth = width;
                    lastHeight = height;

                    settleTimer = setTimeout(() => {
                        if (cancelled) return;

                        const stableWidth = Math.round(card.clientWidth || 0);
                        const stableHeight = Math.round(card.clientHeight || 0);
                        if (Math.abs(stableWidth - lastWidth) <= 2 && Math.abs(stableHeight - lastHeight) <= 2) {
                            chartLayoutReadyRef.current = true;
                            setChartLayoutReady(true);
                            setChartRenderKey((prev) => prev + 1);
                        } else {
                            measureAndArm();
                        }
                    }, 40);
                });
            });
        };

        const observer = new ResizeObserver(() => {
            if (cancelled) return;
            const width = Math.round(card.clientWidth || 0);
            const height = Math.round(card.clientHeight || 0);
            if (!chartLayoutReadyRef.current || Math.abs(width - lastWidth) > 8 || Math.abs(height - lastHeight) > 8) {
                chartLayoutReadyRef.current = false;
                setChartLayoutReady(false);
                measureAndArm();
            }
        });

        observer.observe(card);
        measureAndArm();

        return () => {
            cancelled = true;
            observer.disconnect();
            if (frameA) cancelAnimationFrame(frameA);
            if (frameB) cancelAnimationFrame(frameB);
            if (settleTimer) clearTimeout(settleTimer);
        };
    }, [activeSensor, graphMode, mode]);


    return (
        <div className="flex flex-col flex-1 min-h-0 bg-bg text-text animate-in fade-in duration-500 overflow-hidden gap-2">
            {/* TOP ROW: SIDEBAR + CHART (50%) */}
            <div className="flex-1 flex min-h-0 px-2 pb-1 pt-2 gap-2">
                {/* SIDEBAR CARD */}
                <div className="w-[260px] flex-none flex flex-col bg-surface border-border border-2 rounded-xl shadow-sm overflow-hidden">
                    {/* Sidebar Header */}
                    <div className="px-1 py-[7px] border-b border-border flex items-center justify-between gap-2 bg-bg/60">
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
                            <label className="text-[16px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                                <Activity size={22} className="shrink-0" />
                                {configuredSensors.length === 1 && matchingChannels.length === 2 ? 'Channel' : 'Sensor'} & Mode
                            </label>

                            {/* Pill Toggle for Sensors / Channels */}
                            {configuredSensors.length <= 2 ? (
                                <div className="flex items-center justify-center">
                                    {configuredSensors.length === 1 && matchingChannels.length === 2 ? (
                                        <InlineModeToggle
                                            value={activeChannelIndex}
                                            onChange={(value) => setActiveChannelIndex(Number(value))}
                                            options={matchingChannels.map(c => ({ id: c.index, label: c.label }))}
                                            className="scale-[1.25]"
                                        />
                                    ) : (
                                        <InlineModeToggle
                                            value={activeSensor}
                                            onChange={(value) => {
                                                if (configuredSensors.length > 1) {
                                                    handleSensorChange(value);
                                                }
                                            }}
                                            disabled={configuredSensors.length < 2}
                                            options={[
                                                { id: visibleSensorToggle[0], label: visibleSensorToggle[0] },
                                                { id: visibleSensorToggle[1], label: visibleSensorToggle[1] },
                                            ]}
                                            className="scale-[1.25]"
                                        />
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {configuredSensors.map((sensor) => (
                                        <button
                                            key={sensor}
                                            type="button"
                                            onClick={() => handleSensorChange(sensor)}
                                            className={`px-3 py-1.5 rounded-full border text-xs font-black uppercase tracking-[0.2em] transition-colors ${activeSensor === sensor
                                                ? 'border-primary bg-primary text-black'
                                                : 'border-border bg-bg text-muted hover:text-text'
                                                }`}
                                        >
                                            {sensor}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Segmented Control for Modes (Image 1 Style) */}
                            <div className="flex p-1 bg-bg border-2 border-accent/30 rounded-[20px] overflow-hidden shadow-inner">
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
                                        Collect 30-50 captures per target with {windowDuration} ms windows.
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
                                    {activeSensor === 'EMG' && (
                                        <div className="rounded-lg border border-border/70 bg-surface/60 p-2 text-[11px] leading-relaxed text-muted">
                                            Each EMG capture uses a {windowDuration} ms analysis window. The full burst lasts {actualCaptureWindowMs} ms and is sliced into 5 saved windows with a 150 ms stride.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Action Buttons Redesign */}
                            {showWizard ? (
                                <AutoCalibrationWizard
                                    isActive={showWizard}
                                    onClose={() => setShowWizard(false)}
                                    sensor={activeSensor}
                                    onStartRecording={(label) => handleStartCalibration(label)}
                                    onStopRecording={handleStopCalibration}
                                    setTargetLabel={setTargetLabel}
                                    setAutoLimit={setAutoLimit}
                                    readyCount={markedWindows.filter(w => w.label === targetLabel && producedStatuses.has(w.status)).length}
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
                <div
                    ref={chartCardRef}
                    className="flex-grow min-w-0 bg-surface border-2 border-border rounded-xl shadow-sm overflow-hidden flex flex-col relative min-h-0"
                >
                    {/* Status Badge Overlay */}
                    <div className="absolute top-14 right-2 z-10">
                        <div className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border backdrop-blur-sm shadow-sm ${isCalibrating
                            ? 'bg-red-500/10 text-red-500 border-red-500/20 animate-pulse'
                            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                            {isCalibrating ? '● REC' : '● IDLE'}
                        </div>
                    </div>

                    {!chartLayoutReady ? (
                        <div className="flex flex-1 min-h-0 items-center justify-center text-muted/70 text-sm font-semibold tracking-wide uppercase">
                            Preparing graph layout...
                        </div>
                    ) : !isFftMode ? (
                        <>
                            {/* Time Series Chart Header Controls */}
                            <div
                                className="chart-header"
                                style={{ height: 'var(--chart-header-height, 48px)' }}
                            >
                                {/* Left: Title and Color */}
                                <div className="flex items-center gap-4 min-w-0">
                                    <h3 className="chart-title" style={{ position: 'relative' }}>
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                const currentColor = customLineColor || chartConfig.lineColor;
                                                const currentIndex = DEFAULT_PALETTE.indexOf(currentColor);
                                                const nextIndex = (currentIndex + 1) % DEFAULT_PALETTE.length;
                                                setCustomLineColor(DEFAULT_PALETTE[nextIndex === -1 ? 0 : nextIndex]);
                                            }}
                                            className="p-1 hover:bg-muted/10 rounded-full transition-colors cursor-pointer group flex items-center shrink-0"
                                            title="Click to Cycle Color"
                                        >
                                            <ChartSpline
                                                size={32}
                                                strokeWidth={3}
                                                style={{ color: customLineColor || chartConfig.lineColor }}
                                                className="mr-2 group-hover:scale-110 transition-transform"
                                            />
                                        </button>
                                        <span className="flex items-center gap-2 shrink-0">
                                            {currentGraphTitle}
                                            <span className="channel-color-dot" style={{ backgroundColor: customLineColor || chartConfig.lineColor }}></span>
                                            {activeSensor}
                                        </span>
                                    </h3>

                                    <div className="flex items-center">
                                        {activeSensor === 'EEG' && (
                                            <InlineModeToggle
                                                value={graphMode}
                                                onChange={setGraphMode}
                                                options={[
                                                    { id: 'time', label: '' },
                                                    { id: 'fft', label: 'FFT' },
                                                ]}
                                            />
                                        )}
                                        {activeSensor === 'EMG' && (
                                            <InlineModeToggle
                                                value={emgDisplayMode}
                                                onChange={setEmgDisplayMode}
                                                options={[
                                                    { id: 'raw', label: '' },
                                                    { id: 'envelope', label: 'ENVELOPE' },
                                                ]}
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Middle: Controls Box */}
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1.5 text-muted">
                                            <Activity size={18} />
                                            <span className="text-xs font-bold uppercase tracking-wider">Window</span>
                                        </div>
                                        <div className="w-[75px]">
                                            <CustomSelect
                                                value={timeWindow}
                                                onChange={(value) => setTimeWindow(Number(value))}
                                                options={[3000, 5000, 8000, 10000, 15000, 20000].map(v => ({ value: v, label: `${v / 1000}s` }))}
                                                triggerClassName="h-8 px-2.5 !rounded-lg !bg-bg/80 !border-border text-sm font-bold"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 ">
                                        <div className="flex items-center gap-1.5 text-muted">
                                            <Target size={18} />
                                            <span className="text-xs font-bold uppercase tracking-wider">Capture</span>
                                        </div>
                                        <div className="w-[160px]">
                                            <CustomSelect
                                                value={windowDuration}
                                                onChange={(value) => setWindowDuration(Number(value))}
                                                options={windowDurationOptions.map(v => ({
                                                    value: v,
                                                    label: activeSensor === 'EMG' ? `${v}ms window` : `${v}ms`
                                                }))}
                                                triggerClassName="h-8 px-2.5 !rounded-lg !bg-bg/80 !border-border text-sm font-bold"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 ">
                                        <div className="flex items-center gap-1.5 text-muted">
                                            <ZoomIn size={18} />
                                            <span className="text-xs font-bold uppercase tracking-wider">Zoom</span>
                                        </div>
                                        <div className="flex gap-1.5 bg-bg/50 p-1.5 rounded-lg">
                                            {[1, 2, 5, 10, 25].map(z => (
                                                <button
                                                    key={z}
                                                    onClick={() => { setZoom(z); setManualYRange(""); }}
                                                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all border ${zoom === z && !manualYRange
                                                        ? 'bg-primary text-white border-primary shadow-sm'
                                                        : 'bg-bg text-muted border-border hover:text-text hover:border-muted/50'
                                                        }`}
                                                >
                                                    {z}x
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Stats Box */}
                                <div className="flex items-center gap-4 pl-4 border-l border-border">
                                    <div className="range-display text-[16px] font-bold text-muted tabular-nums">
                                        +/-{Number(manualYRange) || Math.round(1500 / zoom)} uV
                                    </div>
                                    <div className="chart-stats flex gap-5">
                                        <div className="stat-item flex items-center gap-0.25">
                                            <span className="stat-label-chart flex items-center gap-1 text-xs text-muted"><ArrowDown size={18} />Min</span>
                                            <span className="stat-value text-sm font-mono font-bold">{activeWindow?.samples ? Math.min(...activeWindow.samples).toFixed(2) : '0.00'}</span>
                                        </div>
                                        <div className="stat-item flex items-center gap-0.25">
                                            <span className="stat-label-chart flex items-center gap-1 text-xs text-muted"><ArrowUp size={18} />Max</span>
                                            <span className="stat-value text-sm font-mono font-bold">{activeWindow?.samples ? Math.max(...activeWindow.samples).toFixed(2) : '0.00'}</span>
                                        </div>
                                        <div className="stat-item flex items-center gap-0.25">
                                            <span className="stat-label-chart flex items-center gap-1 text-xs text-muted"><Sigma size={18} />Mean</span>
                                            <span className="stat-value text-sm font-mono font-bold">{activeWindow?.samples ? (activeWindow.samples.reduce((sum, value) => sum + value, 0) / Math.max(1, activeWindow.samples.length)).toFixed(2) : '0.00'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="chart-area flex-grow relative">
                                <div className="absolute inset-0 p-2">
                                    <WorkerTimeSeriesChart
                                        key={`timeseries-${chartRenderKey}-${activeSensor}-${activeChannelIndex}-${emgDisplayMode}`}
                                        ref={chartRef}
                                        timeWindow={timeWindow}
                                        activeSensor={activeSensor}
                                        displayMode={emgDisplayMode}
                                        activeChannelIndex={activeChannelIndex}
                                        channelIndex={activeChannelIndex}
                                        config={chartConfig}
                                        onWindowSelect={handleManualWindowSelect}
                                        noBorder={true}
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        /* FFT Mode (Header integrated in WorkerFFTChart) */
                        <div className="chart-area flex-grow flex flex-col min-h-0 relative">
                            <div className="absolute inset-0 p-0">
                                <WorkerFFTChart
                                    key={`fft-${chartRenderKey}-${activeSensor}-${activeChannelIndex}`}
                                    ref={chartRef}
                                    channelIndex={activeChannelIndex}
                                    graphNo={`Graph ${activeChannelIndex + 1}`}
                                    title={activeSensor}
                                    color={customLineColor || chartConfig.lineColor}
                                    onColorChange={setCustomLineColor}
                                    titleAddon={
                                        activeSensor === 'EEG' && (
                                            <InlineModeToggle
                                                value={graphMode}
                                                onChange={setGraphMode}
                                                options={[
                                                    { id: 'time', label: '' },
                                                    { id: 'fft', label: 'FFT' },
                                                ]}
                                            />
                                        )
                                    }
                                    frequencyFrom={fftFreqRange?.min || 1}
                                    frequencyTo={fftFreqRange?.max || 50}
                                    onApplyFilters={({ frequencyFrom, frequencyTo }) => {
                                        setFftFreqRangeMap(prev => ({
                                            ...prev,
                                            [activeSensor]: { min: frequencyFrom, max: frequencyTo }
                                        }));
                                    }}
                                    currentZoom={zoom}
                                    onZoomChange={(z) => { setZoom(z); setManualYRange(""); }}
                                    currentManual={manualYRange}
                                    onRangeChange={setManualYRange}
                                    config={fftChartConfig}
                                    onStatsChange={setFftStats}
                                    noBorder={true}
                                />
                            </div>
                        </div>
                    )}
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
                </div>

                {/* Window List */}
                <div className="lg:col-span-3 h-full min-h-0 overflow-hidden shadow-sm flex flex-col bg-card rounded-md">
                    {activeSensor === 'EEG' ? (
                        <>
                            <div className="flex flex-col flex-1 gap-2 overflow-hidden">
                                <div className="flex items-center gap-1 rounded-xl border border-border bg-bg/80 p-1 shadow-sm">
                                    {[
                                        { id: 'collection', label: 'Collections', icon: Zap },
                                        { id: 'list', label: 'Windows', icon: Database }
                                    ].map((tab) => {
                                        const Icon = tab.icon;
                                        const isActive = (showEegWindowList ? 'list' : 'collection') === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                onClick={() => setShowEegWindowList(tab.id === 'list')}
                                                className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold uppercase tracking-wider transition-all duration-200 ${isActive
                                                    ? 'bg-primary/15 text-primary border border-primary/30'
                                                    : 'border border-transparent text-muted hover:bg-surface hover:text-text'
                                                    }`}
                                            >
                                                <span className="flex items-center justify-center gap-2">
                                                    <Icon size={16} />
                                                    {tab.label}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className='relative flex-1 min-h-0 overflow-hidden'>
                                    <div className={`h-full transition-all duration-200 ${showEegWindowList ? 'pointer-events-none absolute inset-0 opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}`}>
                                        <EEGDataCollectionPanel
                                            isCalibrating={isCalibrating}
                                            targetLabel={targetLabel}
                                            targetFrequency={selectedEegTarget?.freq || 0}
                                            onRecord={handleEEGRecord}
                                            savedCount={markedWindows.filter(w => w.label === targetLabel && (w.status === 'saved' || w.status === 'correct')).length}
                                            targetCount={autoCalibrate ? autoTargetCount : autoLimit}
                                        />
                                    </div>
                                    <div className={`h-full transition-all duration-200 ${showEegWindowList ? 'opacity-100 translate-y-0' : 'pointer-events-none absolute inset-0 opacity-0 -translate-y-1'}`}>
                                        <WindowListPanel
                                            windows={markedWindows}
                                            onDelete={deleteWindow}
                                            onMarkMissed={markMissed}
                                            activeSensor={activeSensor}
                                            autoLimit={autoLimit}
                                            onAutoLimitChange={setAutoLimit}
                                            batchSize={batchSize}
                                            onBatchSizeChange={setBatchSize}
                                            numBatches={numBatches}
                                            onNumBatchesChange={setNumBatches}
                                            autoCalibrate={autoCalibrate}
                                            onAutoCalibrateChange={setAutoCalibrate}
                                            onClearSaved={handleAppendSamples}
                                            onDeleteAll={handleClearAllWindows}
                                            progressMode={autoCalibrate ? 'batches' : 'captures'}
                                            progressCurrent={autoCalibrate ? completedBatchCount : producedCount}
                                            progressTotal={autoCalibrate ? numBatches : autoLimit}
                                            progressPercent={autoCalibrate ? batchProgressPercent : manualProgressPercent}
                                            currentBatchIndex={currentBatchIndex}
                                        />
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <WindowListPanel
                            windows={markedWindows}
                            onDelete={deleteWindow}
                            onMarkMissed={markMissed}
                            activeSensor={activeSensor}
                            autoLimit={autoLimit}
                            onAutoLimitChange={setAutoLimit}
                            batchSize={batchSize}
                            onBatchSizeChange={setBatchSize}
                            numBatches={numBatches}
                            onNumBatchesChange={setNumBatches}
                            autoCalibrate={autoCalibrate}
                            onAutoCalibrateChange={setAutoCalibrate}
                            onClearSaved={handleAppendSamples}
                            onDeleteAll={handleClearAllWindows}
                            progressMode={autoCalibrate ? 'batches' : 'captures'}
                            progressCurrent={autoCalibrate ? completedBatchCount : producedCount}
                            progressTotal={autoCalibrate ? numBatches : autoLimit}
                            progressPercent={autoCalibrate ? batchProgressPercent : manualProgressPercent}
                            currentBatchIndex={currentBatchIndex}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
