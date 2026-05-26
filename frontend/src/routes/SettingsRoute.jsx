import React from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'
import SettingsView from '../components/views/SettingsView'

export default function SettingsRoute() {
  const location = useLocation()
  const {
    latency,
    status,
    connectionStatus,
    apiUrl,
    localWs,
    setLocalWs,
    ngrokWs,
    setNgrokWs,
    updateConnection,
  } = useOutletContext()

  return (
    <SettingsView
      key={location.pathname}
      latency={latency}
      connectionState={status}
      connectionStatus={connectionStatus}
      apiUrl={apiUrl}
      localWs={localWs}
      setLocalWs={setLocalWs}
      ngrokWs={ngrokWs}
      setNgrokWs={setNgrokWs}
      connect={updateConnection}
    />
  )
}
