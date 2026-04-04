const DEFAULT_API_URL = 'http://localhost:5005';
const DEFAULT_WS_URL = 'ws://localhost:5005';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

function hasWindow() {
    return typeof window !== 'undefined';
}

function normalizeBaseUrl(value) {
    if (!value || typeof value !== 'string') return '';
    return value.trim().replace(/\/+$/, '');
}

function getLocationOrigin() {
    if (!hasWindow() || !window.location?.origin) return '';
    return normalizeBaseUrl(window.location.origin);
}

function parseUrl(value) {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function isLoopbackUrl(value) {
    const parsed = parseUrl(value);
    return !!parsed && LOOPBACK_HOSTS.has(parsed.hostname);
}

export function deriveWsUrlFromApi(apiUrl) {
    const normalized = normalizeBaseUrl(apiUrl);
    if (!normalized) return '';
    if (normalized.startsWith('ws://') || normalized.startsWith('wss://')) {
        return normalized;
    }
    if (normalized.startsWith('https://')) {
        return `wss://${normalized.slice('https://'.length)}`;
    }
    if (normalized.startsWith('http://')) {
        return `ws://${normalized.slice('http://'.length)}`;
    }
    return '';
}

export function deriveApiUrlFromWs(wsUrl) {
    const normalized = normalizeBaseUrl(wsUrl);
    if (!normalized) return '';
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
        return normalized;
    }
    if (normalized.startsWith('wss://')) {
        return `https://${normalized.slice('wss://'.length)}`;
    }
    if (normalized.startsWith('ws://')) {
        return `http://${normalized.slice('ws://'.length)}`;
    }
    return '';
}

export function getPublicRuntimeConfig() {
    if (!hasWindow()) return null;
    return window.__NEUROTECH_PUBLIC_CONFIG__ || null;
}

export function setPublicRuntimeConfig(config) {
    if (!hasWindow()) return;
    window.__NEUROTECH_PUBLIC_CONFIG__ = config || null;
}

export async function loadPublicRuntimeConfig() {
    if (!hasWindow()) return null;
    if (window.__NEUROTECH_PUBLIC_CONFIG__) {
        return window.__NEUROTECH_PUBLIC_CONFIG__;
    }

    try {
        const response = await fetch('./config.json', { cache: 'no-store' });
        if (!response.ok) return null;
        const config = await response.json();
        setPublicRuntimeConfig(config);
        return config;
    } catch {
        return null;
    }
}

function getStoredSettings() {
    if (!hasWindow()) return null;
    try {
        const raw = window.localStorage.getItem('neurotech_settings');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function shouldUsePageOrigin(endpoint, pageOrigin) {
    if (!pageOrigin || !endpoint) return false;
    const pageParsed = parseUrl(pageOrigin);
    if (!pageParsed || LOOPBACK_HOSTS.has(pageParsed.hostname)) return false;
    return isLoopbackUrl(endpoint);
}

export function getRuntimeConnection() {
    const defaults = {
        apiUrl: DEFAULT_API_URL,
        wsUrl: DEFAULT_WS_URL,
    };

    const publicConfig = getPublicRuntimeConfig()?.general || {};
    const storedSettings = getStoredSettings()?.general || {};

    let apiUrl = normalizeBaseUrl(storedSettings.apiUrl || publicConfig.apiUrl || defaults.apiUrl);
    let wsUrl = normalizeBaseUrl(storedSettings.wsUrl || publicConfig.wsUrl || defaults.wsUrl);
    const pageOrigin = getLocationOrigin();

    if (!apiUrl && wsUrl) apiUrl = deriveApiUrlFromWs(wsUrl);
    if (!wsUrl && apiUrl) wsUrl = deriveWsUrlFromApi(apiUrl);

    if (shouldUsePageOrigin(apiUrl, pageOrigin)) {
        apiUrl = pageOrigin;
    }
    if (shouldUsePageOrigin(wsUrl, pageOrigin)) {
        wsUrl = deriveWsUrlFromApi(pageOrigin);
    }

    if (!apiUrl && wsUrl) apiUrl = deriveApiUrlFromWs(wsUrl);
    if (!wsUrl && apiUrl) wsUrl = deriveWsUrlFromApi(apiUrl);

    return {
        apiUrl: normalizeBaseUrl(apiUrl || defaults.apiUrl),
        wsUrl: normalizeBaseUrl(wsUrl || defaults.wsUrl),
    };
}

export function buildApiUrl(path) {
    const { apiUrl } = getRuntimeConnection();
    const safePath = path.startsWith('/') ? path : `/${path}`;
    return `${apiUrl}${safePath}`;
}

export function fetchWithBase(path, init) {
    return fetch(buildApiUrl(path), init);
}

function rewriteUrlString(input) {
    const { apiUrl } = getRuntimeConnection();
    const normalizedApi = normalizeBaseUrl(apiUrl);

    if (typeof input !== 'string') {
        return input;
    }

    if (input.startsWith('/api/')) {
        return `${normalizedApi}${input}`;
    }

    const parsed = parseUrl(input);
    if (!parsed) {
        return input;
    }

    if (parsed.pathname.startsWith('/api/') && isLoopbackUrl(parsed.origin) && normalizedApi) {
        return `${normalizedApi}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return input;
}

export function installConnectionFetchInterceptor() {
    if (!hasWindow() || window.__NEUROTECH_FETCH_PATCHED__) {
        return;
    }

    const originalFetch = window.fetch.bind(window);
    window.__NEUROTECH_FETCH_PATCHED__ = true;

    window.fetch = (input, init) => {
        if (typeof input === 'string') {
            return originalFetch(rewriteUrlString(input), init);
        }

        if (input instanceof Request) {
            const rewrittenUrl = rewriteUrlString(input.url);
            if (rewrittenUrl !== input.url) {
                return originalFetch(rewrittenUrl, {
                    method: input.method,
                    headers: input.headers,
                    body: input.body,
                    cache: input.cache,
                    credentials: input.credentials,
                    integrity: input.integrity,
                    keepalive: input.keepalive,
                    mode: input.mode,
                    redirect: input.redirect,
                    referrer: input.referrer,
                    referrerPolicy: input.referrerPolicy,
                    signal: input.signal,
                });
            }
        }

        return originalFetch(input, init);
    };
}