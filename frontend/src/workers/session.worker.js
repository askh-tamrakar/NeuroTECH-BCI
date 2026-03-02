/* eslint-disable no-restricted-globals */

// State
let activeSensor = 'EMG';
let isTestMode = false;
let sessions = [];
let loading = false;

// --- Message Handler ---
self.onmessage = async function (e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            activeSensor = payload.sensor || activeSensor;
            isTestMode = payload.isTestMode !== undefined ? payload.isTestMode : isTestMode;
            await fetchSessions();
            break;
        case 'SET_SENSOR':
            activeSensor = payload;
            await fetchSessions();
            break;
        case 'FETCH_SESSIONS':
            await fetchSessions();
            break;
        case 'CREATE_SESSION':
            handleCreate(payload.name);
            break;
        case 'RENAME_SESSION':
            await handleRename(payload.oldName, payload.newName);
            break;
        case 'DELETE_SESSION':
            await handleDeleteSession(payload.name);
            break;
        case 'MERGE_SESSIONS':
            await handleMultiMerge(payload.sourceSessions, payload.targetName);
            break;
        case 'CLEAR_SESSION':
            await handleClearSession(payload.name);
            break;
        case 'FETCH_SESSIONS':
            await fetchSessions(payload?.silent);
            break;
        case 'FETCH_DETAILS':
            await fetchSessionDetails(payload);
            break;
        case 'DELETE_ROW':
            await handleDeleteRow(payload);
            break;
    }
};

async function fetchSessions(silent = false) {
    if (!silent) {
        loading = true;
        notifyLoading(true);
    }
    try {
        const url = isTestMode
            ? `/api/prediction/sessions`
            : `/api/sessions/${activeSensor}`;

        const res = await fetch(url);
        const data = await res.json();
        if (data.tables) {
            sessions = data.tables.reverse();
            self.postMessage({
                type: 'SESSIONS_UPDATED',
                payload: sessions
            });
        }
    } catch (err) {
        console.error("Worker: Failed to fetch sessions:", err);
    } finally {
        if (!silent) {
            loading = false;
            notifyLoading(false);
        }
    }
}

async function handleCreate(name) {
    if (isTestMode) return;
    const safeName = name.trim().replace(/[^a-zA-Z0-9]/g, '_');
    const fullName = `${activeSensor.toLowerCase()}_session_${safeName}`;

    if (!sessions.includes(fullName)) {
        sessions = [fullName, ...sessions];
        self.postMessage({
            type: 'SESSIONS_UPDATED',
            payload: sessions
        });
    }

    self.postMessage({
        type: 'SESSION_CREATED',
        payload: { safeName, fullName }
    });
}

async function handleRename(oldName, newName) {
    const cleanNew = newName.trim().replace(/[^a-zA-Z0-9]/g, '_');

    try {
        const res = await fetch(`/api/sessions/${activeSensor}/${encodeURIComponent(oldName)}/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_name: cleanNew })
        });

        if (res.ok) {
            await fetchSessions();
            self.postMessage({ type: 'RENAME_SUCCESS', payload: { oldName, newName: cleanNew } });
        } else {
            console.error("Worker: Failed to rename session");
        }
    } catch (err) {
        console.error("Worker: Error renaming session", err);
    }
}

async function handleDeleteSession(name) {
    try {
        const url = isTestMode
            ? `/api/prediction/sessions/${name}`
            : `/api/sessions/${activeSensor}/${name}`;

        const res = await fetch(url, { method: 'DELETE' });

        if (res.ok) {
            sessions = sessions.filter(s => s !== name);
            self.postMessage({
                type: 'SESSIONS_UPDATED',
                payload: sessions
            });
            self.postMessage({ type: 'DELETE_SUCCESS', payload: name });
        }
    } catch (err) {
        console.error("Worker: Error deleting session:", err);
    }
}

async function handleClearSession(name) {
    try {
        const url = isTestMode
            ? `/api/prediction/sessions/${name}/clear`
            : `/api/sessions/${activeSensor}/${name}/clear`;

        const res = await fetch(url, { method: 'DELETE' });

        if (res.ok) {
            // REMOVED fetchSessions() here - clearing rows shouldn't refresh the session list
            self.postMessage({ type: 'CLEAR_SUCCESS', payload: name });
        } else {
            console.error("Worker: Failed to clear session rows");
        }
    } catch (err) {
        console.error("Worker: Error clearing session:", err);
    }
}

async function handleMultiMerge(sourceSessions, targetName) {
    const targetClean = targetName.trim().replace(/[^a-zA-Z0-9]/g, '_');

    try {
        const res = await fetch(`/api/sessions/${activeSensor}/merge_multiple`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source_sessions: sourceSessions,
                target_session: targetClean
            })
        });

        if (res.ok) {
            await fetchSessions();
            self.postMessage({ type: 'MERGE_SUCCESS', payload: targetClean });
        }
    } catch (err) {
        console.error("Worker: Error merging sessions", err);
    }
}

async function fetchSessionDetails({ fullName, limit = 20, offset = 0, isReset = false, direction = 'append', sortBy = 'id', order = 'ASC', label = null, from = null, to = null }) {
    if (!fullName || !fullName.includes('_session_')) return;

    notifyDetailsLoading(true);
    try {
        let url;
        if (isTestMode) {
            url = `/api/prediction/sessions/${fullName}`;
        } else {
            const sensor = fullName.split('_')[0].toUpperCase(); // Extract sensor from fullName
            url = `/api/sessions/${sensor}/${fullName}?limit=${limit}&offset=${offset}`;
            if (sortBy) url += `&sortBy=${sortBy}`;
            if (order) url += `&order=${order}`;
            if (label !== null && label !== undefined) url += `&label=${label}`;
            if (from !== null && from !== undefined) url += `&from=${from}`;
            if (to !== null && to !== undefined) url += `&to=${to}`;
        }

        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            self.postMessage({
                type: 'SESSION_DETAILS_RESULT',
                payload: {
                    data,
                    isReset,
                    direction,
                    offset,
                    fullName
                }
            });
        }
    } catch (err) {
        console.error("Worker: Error fetching session details:", err);
    } finally {
        notifyDetailsLoading(false);
    }
}

async function handleDeleteRow({ fullName, rowId }) {
    try {
        const url = isTestMode
            ? `/api/prediction/sessions/${fullName}/rows/${rowId}`
            : `/api/sessions/${activeSensor}/${fullName}/rows/${rowId}`;

        const res = await fetch(url, { method: 'DELETE' });

        if (res.ok) {
            self.postMessage({ type: 'ROW_DELETE_SUCCESS', payload: { rowId, fullName } });
        }
    } catch (err) {
        console.error("Worker: Error deleting row:", err);
    }
}

function notifyLoading(isLoading) {
    self.postMessage({ type: 'LOADING_STATUS', payload: isLoading });
}

function notifyDetailsLoading(isLoading) {
    self.postMessage({ type: 'DETAILS_LOADING_STATUS', payload: isLoading });
}
