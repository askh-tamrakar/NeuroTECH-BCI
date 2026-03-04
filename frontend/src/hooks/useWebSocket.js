/**
<<<<<<< HEAD
 * useWebSocket.js - Native WebSocket Version
 * 
 * Replaces socket.io-client with native WebSocket for Django Channels compatibility.
 */

import { useState, useEffect, useRef } from 'react'

export function useWebSocket(url) {
=======
 * useWebSocket.js - OFFLINE CAPABLE VERSION
 * 
 * Uses 'socket.io-client' npm package instead of CDN for offline support.
 */

import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

export function useWebSocket(url = 'http://localhost:1972') {
>>>>>>> extra-features
  const [status, setStatus] = useState('disconnected')
  const [lastMessage, setLastMessage] = useState(null)
  const [lastConfig, setLastConfig] = useState(null)
  const [lastEvent, setLastEvent] = useState(null)
  const [latency, setLatency] = useState(0)

  const socketRef = useRef(null)
  const pingTimer = useRef(null)
  const lastPingTime = useRef(0)

<<<<<<< HEAD
  // Determine default URL if not provided
  const getDefaultUrl = () => {
    if (typeof window === 'undefined') return ''; // SSR safety
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws/signal/`;
  }

  const [currentUrl, setCurrentUrl] = useState(url || getDefaultUrl())

  const connect = (connectUrl) => {
    const endpoint = connectUrl || currentUrl;

    if (socketRef.current?.readyState === WebSocket.OPEN && endpoint === currentUrl) {
=======
  const [currentUrl, setCurrentUrl] = useState(url)

  const connect = (connectUrl) => {
    const endpoint = connectUrl || currentUrl || url

    // Don't reconnect if already connected to same endpoint
    if (socketRef.current?.connected && endpoint === currentUrl) {
>>>>>>> extra-features
      console.log('⚠️ Already connected')
      return
    }

<<<<<<< HEAD
    // Close existing if any
    if (socketRef.current) {
      socketRef.current.close();
    }

    console.log(`🔌 Connecting to WebSocket: ${endpoint}`)
=======
    console.log(`🔌 Connecting to WebSocket: ${endpoint} (Offline Mode)`)
>>>>>>> extra-features
    setStatus('connecting')
    setCurrentUrl(endpoint)

    try {
<<<<<<< HEAD
      const ws = new WebSocket(endpoint);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setStatus('connected');

        // Start Ping Loop (Application Level Keepalive)
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            lastPingTime.current = performance.now();
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 2000);
      };

      ws.onclose = (event) => {
        console.log('❌ WebSocket disconnected', event.code, event.reason);
        setStatus('disconnected');
        setLatency(0);
        if (pingTimer.current) clearInterval(pingTimer.current);
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        // onerror event doesn't give much detail in JS
        setStatus('error');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (e) {
          console.warn('⚠️ Parse error:', e);
        }
      };

    } catch (e) {
      console.error('❌ Failed to create WebSocket:', e)
=======
      // Connect directly using the imported 'io' function
      socketRef.current = io(endpoint, {
        reconnection: true,
        timeout: 10000,
        transports: ['websocket', 'polling']
      })

      setupSocketListeners()

    } catch (e) {
      console.error('❌ Failed to initialize Socket.IO:', e)
>>>>>>> extra-features
      setStatus('error')
    }
  }

<<<<<<< HEAD
  const handleMessage = (data) => {
    // 1. PONG
    if (data.type === 'pong') {
      const now = performance.now();
      setLatency(Math.round(now - lastPingTime.current));
      return;
    }

    // 2. PREDICTION
    if (data.type === 'prediction' || data.type === 'emg_prediction') {
      setLastEvent({ type: 'emg_prediction', ...data });
      return;
    }

    // 3. CONFIG
    if (data.type === 'config_update') {
      setLastConfig(data.payload);
      return;
    }

    // 4. DATA 
    // Legacy / Generic Message Handler for Viz
    // Assuming 'lastMessage' consumers expect { data: string, raw: object }
    setLastMessage({
      data: JSON.stringify(data),
      timestamp: Date.now(),
      raw: data
    });
  };

  const disconnect = useRef(() => {
    console.log('🔌 Disconnecting...')
=======
  const setupSocketListeners = () => {
    if (!socketRef.current) return

    // === CONNECTION EVENT ===
    socketRef.current.on('connect', () => {
      console.log('✅ WebSocket connected')
      setStatus('connected')

      if (socketRef.current) {
        pingTimer.current = setInterval(() => {
          if (socketRef.current?.connected) {
            lastPingTime.current = performance.now()
            socketRef.current.emit('ping')
          }
        }, 500)
      }
    })

    // === DISCONNECTION EVENT ===
    socketRef.current.on('disconnect', () => {
      console.log('❌ WebSocket disconnected')
      setStatus('disconnected')
      setLatency(0)

      if (pingTimer.current) {
        clearInterval(pingTimer.current)
        pingTimer.current = null
      }
    })

    // === ERROR EVENT ===
    socketRef.current.on('error', (error) => {
      console.error('❌ WebSocket error:', error)
      setStatus('disconnected')
    })

    // === CONNECTION ERROR (Failed to connect) ===
    socketRef.current.on('connect_error', (err) => {
      console.warn('⚠️ Connection failed:', err.message)
      setStatus('disconnected')
    })

    // === PONG EVENT (latency measurement) ===
    socketRef.current.on('pong', () => {
      if (socketRef.current?.connected) {
        const now = performance.now()
        const latencyMs = Math.round(now - lastPingTime.current)
        setLatency(latencyMs)
      }
    })

    // === DATA EVENTS ===

    // Batch Listener
    // No throttling for batch data to prevent data loss. The backend controls the rate (approx 30Hz).
    socketRef.current.on('bio_data_batch', (batchData) => {
      if (!batchData || !batchData.samples || batchData.samples.length === 0) return

      // Optimized parsing: Avoid try-catch block for clean data to reduce V8 deopt
      // Only wrap critical parts or assume backend data shape is mostly correct.

      const lastSample = batchData.samples[batchData.samples.length - 1]

      // Fast path reconstruction
      const rawPayload = {
        stream_name: batchData.stream_name,
        // We only strictly need channels/timestamp for 'lastMessage' consumers (non-LiveView)
        // LiveView uses _batch directly.
        channels: lastSample.channels,
        sample_rate: batchData.sample_rate,
        sample_count: lastSample.sample_count,
        timestamp: lastSample.timestamp,
        _batch: batchData.samples
      }

      setLastMessage({
        // Avoid JSON.stringify if not strictly needed by consumers, but useWebSocket contract implies string 'data'
        data: JSON.stringify(rawPayload),
        timestamp: Date.now(),
        raw: rawPayload
      })
    })

    let lastUpdate = 0
    socketRef.current.on('bio_data_update', (data) => {
      try {
        // Throttle updates to ~30Hz (33ms)
        const now = Date.now()
        if (now - lastUpdate < 33) return
        lastUpdate = now

        // Handle NEW LSL format
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
            timestamp = timestamp * 1000 // Convert to milliseconds
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
              sample_count: data.sample_count
            }
          })
        }
        else if (data.channels) {
          setLastMessage({
            data: JSON.stringify(data),
            timestamp: Date.now(),
            raw: data
          })
        }
      } catch (e) {
        console.warn('⚠️ Failed to parse bio_data_update:', e)
      }
    })

    // === ALTERNATIVE DATA EVENT ===
    socketRef.current.on('signal_update', (data) => {
      try {
        if (data.channels) {
          setLastMessage({
            data: JSON.stringify(data),
            timestamp: Date.now(),
            raw: data
          })
        }
      } catch (e) {
        console.warn('⚠️ Failed to parse signal_update:', e)
      }
    })

    // === CONFIG UPDATE EVENT ===
    socketRef.current.on('config_updated', (data) => {
      console.log('🔄 Config updated from server:', data)
      if (data && data.config) {
        setLastConfig(data.config)
      }
    })

    // === EVENT STREAM ===
    socketRef.current.on('bio_event', (eventData) => {
      // console.log('⚡ Bio Event:', eventData)
      setLastEvent(eventData)
    })

    socketRef.current.on('emg_prediction', (data) => {
      // console.log('🧠 Prediction:', data) // Optional logging
      setLastEvent({ type: 'emg_prediction', ...data })
    })

    // === STATUS EVENTS ===
    socketRef.current.on('status', (data) => {
      console.log('📊 Server status:', data)
    })

    socketRef.current.on('response', (data) => {
      console.log('📨 Server response:', data)
    })
  }

  const disconnect = () => {
    console.log('🔌 Disconnecting...')

>>>>>>> extra-features
    if (pingTimer.current) {
      clearInterval(pingTimer.current)
      pingTimer.current = null
    }

    if (socketRef.current) {
<<<<<<< HEAD
      socketRef.current.close()
      socketRef.current = null
    }
    setStatus('disconnected')
    setLatency(0)
  }).current

  const sendMessage = useRef((data) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      // console.warn('⚠️ WebSocket not connected, buffering/dropping:', data)
      return false
    }
    try {
      socketRef.current.send(JSON.stringify(data))
=======
      socketRef.current.disconnect()
      socketRef.current = null
    }

    setStatus('disconnected')
    setLatency(0)
    console.log('✅ Disconnected')
  }

  const sendMessage = (data) => {
    if (!socketRef.current || !socketRef.current.connected) {
      console.warn('⚠️ WebSocket not connected, cannot send message:', data)
      return false
    }

    try {
      socketRef.current.emit('message', data)
      console.log('📤 Sent message:', data)
>>>>>>> extra-features
      return true
    } catch (e) {
      console.error('❌ Error sending message:', e)
      return false
    }
<<<<<<< HEAD
  }).current

  const requestStatus = useRef(() => {
    sendMessage({ type: 'request_status' });
  }).current

  useEffect(() => {
    // Only connect on mount if using default URL or if explicitly called?
    // User code calls connect() manually in some places?
    // The previous hook called connect() on mount.
    connect();
    return () => {
      disconnect()
    }
  }, []) // Depend on url?
=======
  }

  const requestStatus = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('request_status')
      console.log('📡 Status request sent')
    }
  }

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [])
>>>>>>> extra-features

  return {
    status,
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
