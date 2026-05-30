import { fetchWithBase } from '../utils/runtimeConnection';

/**
 * List all completed hybrid recordings across all sensor types.
 * @returns {Promise<Array<{session, sensor_type, data_type, duration_seconds, total_rows, created, path, integrity}>>}
 */
export async function listHybridRecordings() {
    const res = await fetchWithBase('/api/hybrid/recordings');
    if (!res.ok) throw new Error(`Failed to list recordings: ${res.status}`);
    return res.json();
}

/**
 * Fetch the metadata.json for a specific recording session.
 * @param {string} sensorType  e.g. "EEG"
 * @param {string} sessionName e.g. "EEG_09-04-2026__03-30-31"
 * @returns {Promise<Object>} parsed metadata object
 */
export async function getRecordingMetadata(sensorType, sessionName) {
    const res = await fetchWithBase(
        `/api/hybrid/recording/${encodeURIComponent(sensorType)}/${encodeURIComponent(sessionName)}/metadata`
    );
    if (!res.ok) throw new Error(`Failed to fetch metadata: ${res.status}`);
    return res.json();
}

/**
 * Fetch a paginated chunk of CSV data for a single channel.
 * @param {string} sensorType
 * @param {string} sessionName
 * @param {number} channel  channel index (matches metadata.acquisition.channels[*].index)
 * @param {number} offset   number of rows to skip
 * @param {number} limit    max rows to return (server caps at 50000)
 * @returns {Promise<{channel, offset, limit, total_rows, headers, values: number[]}>}
 */
export async function getRecordingData(sensorType, sessionName, channel = 0, offset = 0, limit = 10000) {
    const params = new URLSearchParams({ channel, offset, limit });
    const res = await fetchWithBase(
        `/api/hybrid/recording/${encodeURIComponent(sensorType)}/${encodeURIComponent(sessionName)}/data?${params}`
    );
    if (!res.ok) throw new Error(`Failed to fetch data: ${res.status}`);
    return res.json();
}
