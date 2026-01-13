/**
 * useWebSocket.js - Native WebSocket Version
 * 
 * Replaces socket.io-client with native WebSocket for Django Channels compatibility.
 */

import { useState, useEffect, useRef } from 'react'

export function useWebSocket(url) {
  const [status, setStatus] = useState('disconnected')
  const [lastMessage, setLastMessage] = useState(null)
  const [lastConfig, setLastConfig] = useState(null)
  const [lastEvent, setLastEvent] = useState(null)
  const [latency, setLatency] = useState(0)

  const socketRef = useRef(null)
  const pingTimer = useRef(null)
  const lastPingTime = useRef(0)

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
      console.log('⚠️ Already connected')
      return
    }

    // Close existing if any
    if (socketRef.current) {
      socketRef.current.close();
    }

    console.log(`🔌 Connecting to WebSocket: ${endpoint}`)
    setStatus('connecting')
    setCurrentUrl(endpoint)

    try {
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
      setStatus('error')
    }
  }

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
      raw: data
    });
  };

  const disconnect = useRef(() => {
    console.log('🔌 Disconnecting...')
    if (pingTimer.current) {
      clearInterval(pingTimer.current)
      pingTimer.current = null
    }

    if (socketRef.current) {
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
      return true
    } catch (e) {
      console.error('❌ Error sending message:', e)
      return false
    }
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
