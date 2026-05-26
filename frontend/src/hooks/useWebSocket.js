import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { fetchWithBase, getRuntimeConnection, getSocketIoConnection } from '../utils/runtimeConnection'

function deriveStatus(transportStatus, apiStatus) {
  if (transportStatus === 'connecting') {
    return 'connecting'
  }

  const apiUp = Boolean(apiStatus?.api_up)
  const transportConnected = Boolean(apiStatus?.transport_connected)
  const streamActive = Boolean(apiStatus?.stream_active)

  if (streamActive) return 'streaming'
  if (apiUp && transportConnected) return 'connected'
  if (apiUp) return 'stream_offline'
  if (transportConnected) return 'connected'
  return 'disconnected'
}

export function useWebSocket(url = '') {
  const [transportStatus, setTransportStatus] = useState('disconnected')
  const [lastMessage, setLastMessage] = useState(null)
  const [lastConfig, setLastConfig] = useState(null)
  const [lastEvent, setLastEvent] = useState(null)
  const [latency, setLatency] = useState(0)
  const [currentUrl, setCurrentUrl] = useState(url)
  const [connectionStatus, setConnectionStatus] = useState({
    api_up: false,
    socket_up: false,
    lsl_connected: false,
    stream_active: false,
    last_sample_age_ms: null,
    samples_broadcast: 0,
    sample_rate: 0,
    channel_mapping: {},
    socket_client_count: 0,
    raw_ingress_client_count: 0,
    transport_connected: false,
    resolved_api_url: '',
    resolved_ws_url: '',
  })

  const socketRef = useRef(null)
  const pingTimer = useRef(null)
  const statusPollTimer = useRef(null)
  const lastPingTime = useRef(0)

  useEffect(() => {
    if (url) {
      setCurrentUrl(url)
    }
  }, [url])

  const updateConnectionStatus = (updates = {}) => {
    const runtime = getRuntimeConnection()
    setConnectionStatus((prev) => ({
      ...prev,
      ...updates,
      transport_connected: socketRef.current?.connected ?? false,
      resolved_api_url: runtime.apiUrl,
      resolved_ws_url: runtime.wsUrl,
    }))
  }

  const connect = (connectUrl) => {
    const { endpoint: defaultEndpoint, options: socketOptions } = getSocketIoConnection()
    const endpoint = connectUrl || currentUrl || url || defaultEndpoint

    if (socketRef.current?.connected && endpoint === currentUrl) {
      return
    }

    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }

    setTransportStatus('connecting')
    setCurrentUrl(endpoint)

    try {
      socketRef.current = io(endpoint, {
        timeout: 10000,
        ...socketOptions,
      })

      setupSocketListeners()
    } catch (e) {
      console.error('Failed to initialize Socket.IO:', e)
      setTransportStatus('disconnected')
    }
  }

  const setupSocketListeners = () => {
    if (!socketRef.current) return

    socketRef.current.on('connect', () => {
      setTransportStatus('connected')
      updateConnectionStatus()

      if (socketRef.current) {
        pingTimer.current = setInterval(() => {
          if (socketRef.current?.connected) {
            lastPingTime.current = performance.now()
            socketRef.current.emit('ping')
          }
        }, 500)
      }
    })

    socketRef.current.on('disconnect', () => {
      setTransportStatus('disconnected')
      setLatency(0)
      updateConnectionStatus()

      if (pingTimer.current) {
        clearInterval(pingTimer.current)
        pingTimer.current = null
      }
    })

    socketRef.current.on('error', () => {
      setTransportStatus('disconnected')
      updateConnectionStatus()
    })

    socketRef.current.on('connect_error', () => {
      setTransportStatus('disconnected')
      updateConnectionStatus()
    })

    socketRef.current.on('pong', () => {
      if (socketRef.current?.connected) {
        setLatency(Math.round(performance.now() - lastPingTime.current))
      }
    })

    let lastBatchUpdate = 0
    socketRef.current.on('bio_data_batch', (batchData) => {
      if (!batchData?.samples?.length) return

      // Throttle main-thread state updates to ~4Hz to avoid excessive React re-renders.
      // Chart rendering is handled entirely by the worker pipeline (data.worker →
      // BroadcastChannel → signal/chart workers), so the main thread only needs
      // occasional updates for status indicators and recording hooks.
      const now = performance.now()
      if (now - lastBatchUpdate < 250) return
      lastBatchUpdate = now

      const lastSample = batchData.samples[batchData.samples.length - 1]
      const rawPayload = {
        stream_name: batchData.stream_name,
        channels: lastSample.channels,
        sample_rate: batchData.sample_rate,
        sample_count: lastSample.sample_count,
        timestamp: lastSample.timestamp,
        _batch: batchData.samples,
      }

      setLastMessage({
        data: JSON.stringify(rawPayload),
        timestamp: Date.now(),
        raw: rawPayload,
      })

      updateConnectionStatus({
        stream_active: true,
        last_sample_age_ms: 0,
      })
    })

    let lastUpdate = 0
    socketRef.current.on('bio_data_update', (data) => {
      try {
        const now = Date.now()
        if (now - lastUpdate < 33) return
        lastUpdate = now

        if (data.stream_name && data.channels && typeof data.channels === 'object') {
          const normalized = {}
          Object.entries(data.channels).forEach(([idx, ch]) => {
            normalized[idx] = typeof ch === 'object'
              ? {
                value: ch.value ?? 0,
                sensor: ch.type || ch.label || 'UNKNOWN',
                label: ch.label,
                timestamp: ch.timestamp,
              }
              : {
                value: ch,
                sensor: 'UNKNOWN',
              }
          })

          let timestamp = data.timestamp || Date.now()
          if (timestamp < 10000000000) {
            timestamp = timestamp * 1000
          }

          setLastMessage({
            data: JSON.stringify(data),
            timestamp: Date.now(),
            raw: {
              timestamp,
              channels: normalized,
              sample_rate: data.sample_rate,
              num_channels: data.channel_count,
              stream_name: data.stream_name,
              sample_count: data.sample_count,
            },
          })
        } else if (data.channels) {
          setLastMessage({
            data: JSON.stringify(data),
            timestamp: Date.now(),
            raw: data,
          })
        }
      } catch (e) {
        console.warn('Failed to parse bio_data_update:', e)
      }
    })

    socketRef.current.on('signal_update', (data) => {
      try {
        if (data.channels) {
          setLastMessage({
            data: JSON.stringify(data),
            timestamp: Date.now(),
            raw: data,
          })
        }
      } catch (e) {
        console.warn('Failed to parse signal_update:', e)
      }
    })

    socketRef.current.on('config_updated', (data) => {
      if (data?.config) {
        setLastConfig(data.config)
      }
    })

    socketRef.current.on('bio_event', (eventData) => setLastEvent(eventData))
    socketRef.current.on('eeg_prediction', (data) => setLastEvent({ event: 'eeg_prediction', ...data }))
    socketRef.current.on('eeg_mode_result', (data) => setLastEvent({ event: 'eeg_mode_result', ...data }))
    socketRef.current.on('emg_prediction', (data) => setLastEvent({ type: 'emg_prediction', ...data }))
  }

  const disconnect = () => {
    if (pingTimer.current) {
      clearInterval(pingTimer.current)
      pingTimer.current = null
    }

    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }

    setTransportStatus('disconnected')
    setLatency(0)
    updateConnectionStatus({
      stream_active: false,
    })
  }

  const sendMessage = (data) => {
    if (!socketRef.current?.connected) {
      return false
    }

    try {
      socketRef.current.emit('message', data)
      return true
    } catch (e) {
      console.error('Error sending message:', e)
      return false
    }
  }

  const requestStatus = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('request_status')
    }
  }

  useEffect(() => {
    let cancelled = false

    const refreshStatus = async () => {
      const runtime = getRuntimeConnection()
      try {
        const response = await fetchWithBase('/api/status', {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-store' },
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const payload = await response.json()
        if (cancelled) return
        setConnectionStatus({
          ...payload,
          api_up: payload.api_up ?? true,
          transport_connected: socketRef.current?.connected ?? false,
          resolved_api_url: runtime.apiUrl,
          resolved_ws_url: runtime.wsUrl,
        })
      } catch {
        if (cancelled) return
        setConnectionStatus((prev) => ({
          ...prev,
          api_up: false,
          socket_up: false,
          lsl_connected: false,
          stream_active: false,
          transport_connected: socketRef.current?.connected ?? false,
          resolved_api_url: runtime.apiUrl,
          resolved_ws_url: runtime.wsUrl,
        }))
      }
    }

    refreshStatus()
    statusPollTimer.current = setInterval(refreshStatus, 2000)

    return () => {
      cancelled = true
      if (statusPollTimer.current) {
        clearInterval(statusPollTimer.current)
        statusPollTimer.current = null
      }
    }
  }, [url, currentUrl])

  useEffect(() => () => disconnect(), [])

  const status = deriveStatus(transportStatus, connectionStatus)

  return {
    status,
    transportStatus,
    connectionStatus,
    lastMessage,
    lastConfig,
    lastEvent,
    latency,
    connect,
    disconnect,
    currentUrl,
    sendMessage,
    requestStatus,
  }
}

export default useWebSocket
