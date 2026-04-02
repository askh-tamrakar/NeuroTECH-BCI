/**
 * useWebSocket.js - unified transport/api/stream connection hook
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { deriveApiUrlFromWs, getRuntimeConnection } from '../utils/runtimeConnection'

const STATUS_POLL_MS = 2000
const STREAM_FRESHNESS_MS = 2000

function getConnectionState({ isConnecting, transportConnected, apiReachable, streamActive, hasServerStatus }) {
  if (isConnecting && !transportConnected) {
    return 'connecting'
  }

  if (streamActive) {
    return 'streaming'
  }

  if (!transportConnected && !apiReachable) {
    return 'disconnected'
  }

  if (hasServerStatus) {
    return 'stream_offline'
  }

  return 'connected'
}

export function useWebSocket(url = getRuntimeConnection().wsUrl) {
  const [transportConnected, setTransportConnected] = useState(false)
  const [apiReachable, setApiReachable] = useState(false)
  const [streamActive, setStreamActive] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)
  const [lastConfig, setLastConfig] = useState(null)
  const [lastEvent, setLastEvent] = useState(null)
  const [latency, setLatency] = useState(0)
  const [currentUrl, setCurrentUrl] = useState(url)
  const [serverStatus, setServerStatus] = useState(null)
  const [lastStreamAt, setLastStreamAt] = useState(0)

  const socketRef = useRef(null)
  const pingTimerRef = useRef(null)
  const statusTimerRef = useRef(null)
  const staleStreamTimerRef = useRef(null)
  const lastPingTime = useRef(0)
  const lastStreamAtRef = useRef(0)

  useEffect(() => {
    if (url) {
      setCurrentUrl(url)
    }
  }, [url])

  const clearTimers = () => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current)
      pingTimerRef.current = null
    }
    if (statusTimerRef.current) {
      clearInterval(statusTimerRef.current)
      statusTimerRef.current = null
    }
    if (staleStreamTimerRef.current) {
      clearInterval(staleStreamTimerRef.current)
      staleStreamTimerRef.current = null
    }
  }

  const startStatusPolling = (endpoint) => {
    if (!endpoint) return

    const apiBaseUrl = deriveApiUrlFromWs(endpoint)
    if (!apiBaseUrl) return

    const pollStatus = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/status`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`Status failed: ${response.status}`)
        }

        const payload = await response.json()
        setApiReachable(true)
        setServerStatus(payload)

        const streamIsFresh = payload.stream_active || (Date.now() - lastStreamAtRef.current <= STREAM_FRESHNESS_MS)
        setStreamActive(Boolean(streamIsFresh))
      } catch (error) {
        setApiReachable(false)
        setServerStatus(null)
        setStreamActive(false)
      }
    }

    pollStatus()
    statusTimerRef.current = setInterval(pollStatus, STATUS_POLL_MS)
    staleStreamTimerRef.current = setInterval(() => {
      if (Date.now() - lastStreamAtRef.current > STREAM_FRESHNESS_MS) {
        setStreamActive(false)
      }
    }, 1000)
  }

  const teardownSocket = () => {
    clearTimers()

    if (socketRef.current) {
      socketRef.current.removeAllListeners()
      socketRef.current.disconnect()
      socketRef.current = null
    }
  }

  const connect = (connectUrl) => {
    const endpoint = connectUrl || currentUrl || url || getRuntimeConnection().wsUrl
    if (!endpoint) return

    if (socketRef.current?.connected && endpoint === currentUrl) {
      return
    }

    teardownSocket()
    setCurrentUrl(endpoint)
    setIsConnecting(true)
    setLatency(0)

    try {
      socketRef.current = io(endpoint, {
        reconnection: true,
        timeout: 10000,
        transports: ['websocket', 'polling']
      })

      socketRef.current.on('connect', () => {
        setTransportConnected(true)
        setIsConnecting(false)
        startStatusPolling(endpoint)

        pingTimerRef.current = setInterval(() => {
          if (socketRef.current?.connected) {
            lastPingTime.current = performance.now()
            socketRef.current.emit('ping')
          }
        }, 500)
      })

      socketRef.current.on('disconnect', () => {
        setTransportConnected(false)
        setIsConnecting(false)
        setLatency(0)
        clearTimers()
      })

      socketRef.current.on('error', () => {
        setTransportConnected(false)
        setIsConnecting(false)
      })

      socketRef.current.on('connect_error', () => {
        setTransportConnected(false)
        setIsConnecting(false)
      })

      socketRef.current.on('pong', () => {
        if (socketRef.current?.connected) {
          const now = performance.now()
          setLatency(Math.round(now - lastPingTime.current))
        }
      })

      socketRef.current.on('bio_data_batch', (batchData) => {
        if (!batchData?.samples?.length) return

        const lastSample = batchData.samples[batchData.samples.length - 1]
        const rawPayload = {
          stream_name: batchData.stream_name,
          channels: lastSample.channels,
          sample_rate: batchData.sample_rate,
          sample_count: lastSample.sample_count,
          timestamp: lastSample.timestamp,
          _batch: batchData.samples
        }

        const now = Date.now()
        lastStreamAtRef.current = now
        setLastStreamAt(now)
        setStreamActive(true)
        setLastMessage({
          data: JSON.stringify(rawPayload),
          timestamp: Date.now(),
          raw: rawPayload
        })
      })

      let lastUpdate = 0
      socketRef.current.on('bio_data_update', (data) => {
        try {
          const now = Date.now()
          if (now - lastUpdate < 33) return
          lastUpdate = now

          if (data.stream_name && data.channels && typeof data.channels === 'object') {
            const channels = data.channels
            const normalized = {}

            Object.entries(channels).forEach(([idx, ch]) => {
              if (typeof ch === 'object') {
                normalized[idx] = {
                  value: ch.value ?? 0,
                  sensor: ch.type || ch.label || 'UNKNOWN',
                  label: ch.label,
                  timestamp: ch.timestamp
                }
              } else {
                normalized[idx] = {
                  value: ch,
                  sensor: 'UNKNOWN'
                }
              }
            })

            let timestamp = data.timestamp || Date.now()
            if (timestamp < 10000000000) {
              timestamp = timestamp * 1000
            }

            const now = Date.now()
            lastStreamAtRef.current = now
            setLastStreamAt(now)
            setStreamActive(true)
            setLastMessage({
              data: JSON.stringify(data),
              timestamp: Date.now(),
              raw: {
                timestamp,
                channels: normalized,
                sample_rate: data.sample_rate,
                num_channels: data.channel_count,
                stream_name: data.stream_name,
                sample_count: data.sample_count
              }
            })
          } else if (data.channels) {
            const now = Date.now()
            lastStreamAtRef.current = now
            setLastStreamAt(now)
            setStreamActive(true)
            setLastMessage({
              data: JSON.stringify(data),
              timestamp: Date.now(),
              raw: data
            })
          }
        } catch (error) {
          console.warn('Failed to parse bio_data_update:', error)
        }
      })

      socketRef.current.on('signal_update', (data) => {
        try {
          if (data.channels) {
            const now = Date.now()
            lastStreamAtRef.current = now
            setLastStreamAt(now)
            setStreamActive(true)
            setLastMessage({
              data: JSON.stringify(data),
              timestamp: Date.now(),
              raw: data
            })
          }
        } catch (error) {
          console.warn('Failed to parse signal_update:', error)
        }
      })

      socketRef.current.on('config_updated', (data) => {
        if (data?.config) {
          setLastConfig(data.config)
        }
      })

      socketRef.current.on('bio_event', (eventData) => {
        setLastEvent(eventData)
      })

      socketRef.current.on('eeg_prediction', (data) => {
        setLastEvent({ event: 'eeg_prediction', ...data })
      })

      socketRef.current.on('eeg_mode_result', (data) => {
        setLastEvent({ event: 'eeg_mode_result', ...data })
      })

      socketRef.current.on('emg_prediction', (data) => {
        setLastEvent({ type: 'emg_prediction', ...data })
      })
    } catch (error) {
      setTransportConnected(false)
      setIsConnecting(false)
    }
  }

  const disconnect = () => {
    teardownSocket()
    setTransportConnected(false)
    setApiReachable(false)
    setStreamActive(false)
    setIsConnecting(false)
    setLatency(0)
  }

  const sendMessage = (data) => {
    if (!socketRef.current?.connected) {
      return false
    }

    try {
      socketRef.current.emit('message', data)
      return true
    } catch {
      return false
    }
  }

  const requestStatus = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('request_status')
    }
  }

  useEffect(() => () => disconnect(), [])

  const status = useMemo(() => getConnectionState({
    isConnecting,
    transportConnected,
    apiReachable,
    streamActive,
    hasServerStatus: Boolean(serverStatus)
  }), [apiReachable, isConnecting, serverStatus, streamActive, transportConnected])

  return {
    status,
    connectionState: status,
    transportConnected,
    apiReachable,
    streamActive,
    serverStatus,
    lastMessage,
    lastConfig,
    lastEvent,
    latency,
    connect,
    disconnect,
    currentUrl,
    sendMessage,
    requestStatus
  }
}

export default useWebSocket
