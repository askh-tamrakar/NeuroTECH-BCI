/* eslint-disable no-restricted-globals */

self.onmessage = async (event) => {
    const { type, payload } = event.data || {};
    
    if (type === 'SAVE_WINDOWS') {
        const {
            requestId,
            apiBaseUrl = '',
            sensor,
            mode,
            sessionName,
            session_name,
            windows = []
        } = payload || {};

        try {
            const response = await fetch(`${apiBaseUrl}/api/windows/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sensor,
                    mode,
                    session_name: session_name || sessionName,
                    windows,
                })
            });

            const data = await response.json();
            if (!response.ok && response.status !== 207) {
                throw new Error(data?.error || `Batch save failed (${response.status})`);
            }

            self.postMessage({
                type: 'SAVE_WINDOWS_COMPLETE',
                payload: {
                    requestId,
                    ...data,
                }
            });
        } catch (error) {
            self.postMessage({
                type: 'SAVE_WINDOWS_ERROR',
                payload: {
                    requestId,
                    error: error instanceof Error ? error.message : String(error),
                }
            });
        }
    } else if (type === 'SAVE_SINGLE_WINDOW') {
        const {
            requestId,
            apiBaseUrl = '',
            sensor,
            mode,
            session_name,
            window
        } = payload || {};

        try {
            const response = await fetch(`${apiBaseUrl}/api/window`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sensor,
                    mode,
                    session_name,
                    ...window // window object contains action, channel, samples, timestamps, metadata
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || `Window save failed (${response.status})`);
            }

            self.postMessage({
                type: 'SAVE_SINGLE_WINDOW_COMPLETE',
                payload: {
                    requestId,
                    id: window.id,
                    ...data,
                }
            });
        } catch (error) {
            self.postMessage({
                type: 'SAVE_SINGLE_WINDOW_ERROR',
                payload: {
                    requestId,
                    id: window.id,
                    error: error instanceof Error ? error.message : String(error),
                }
            });
        }
    }
};
