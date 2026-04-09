import { fetchWithBase } from '../utils/runtimeConnection';

/**
 * DataService
 * Handles persistence of recorded sessions to the backend.
 */
export const DataService = {
    /**
     * Saves a recorded session to the server (legacy JSON format).
     * @param {string} filename - The formatted filename.
     * @param {Object} payload - The session data.
     * @returns {Promise<Object>} The server response.
     */
    async saveSession(filename, payload, sensorType = 'recordings') {
        try {
            const response = await fetchWithBase('/api/record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, payload, sensor_type: sensorType })
            });

            if (!response.ok) {
                let errorMessage = 'Failed to save session';
                try {
                    const err = await response.json();
                    errorMessage = err.error || errorMessage;
                } catch (e) {
                    // If not JSON, use status text
                    errorMessage = `${response.status} ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            return await response.json();
        } catch (error) {
            console.error('[DataService] Error saving session:', error);
            throw error;
        }
    },

    // =================================================================
    //  Hybrid Recording API (server-side CSV + metadata.json)
    // =================================================================

    /**
     * Start a server-side hybrid recording.
     * @param {number[]} channels - Channel indices, e.g. [0, 1]
     * @param {string} dataType - "raw" (default) or "filtered"
     */
    async startHybridRecording(channels = [0, 1], dataType = 'raw') {
        const res = await fetchWithBase('/api/hybrid/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channels, data_type: dataType }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to start recording');
        return data;
    },

    /** Stop the running hybrid recording and finalise files. */
    async stopHybridRecording() {
        const res = await fetchWithBase('/api/hybrid/stop', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to stop recording');
        return data;
    },

    /** Pause the running hybrid recording. */
    async pauseHybridRecording() {
        const res = await fetchWithBase('/api/hybrid/pause', { method: 'POST' });
        return res.json();
    },

    /** Resume the paused hybrid recording. */
    async resumeHybridRecording() {
        const res = await fetchWithBase('/api/hybrid/resume', { method: 'POST' });
        return res.json();
    },

    /** Get current hybrid recording status. */
    async getHybridStatus() {
        const res = await fetchWithBase('/api/hybrid/status');
        return res.json();
    },

    /** List all server-side hybrid recordings. */
    async listHybridRecordings() {
        const res = await fetchWithBase('/api/hybrid/recordings');
        return res.json();
    },

    /**
     * Delete a hybrid recording session.
     * @param {string} sessionPath - Relative path within the data dir
     */
    async deleteHybridRecording(sessionPath) {
        const res = await fetchWithBase(`/api/hybrid/recordings/${encodeURIComponent(sessionPath)}`, {
            method: 'DELETE',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete recording');
        return data;
    },
};
