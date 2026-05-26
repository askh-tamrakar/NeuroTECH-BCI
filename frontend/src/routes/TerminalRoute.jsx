import React from 'react'
import { useOutletContext } from 'react-router-dom'
import LiveDashboard from '../components/views/LiveDashboard'

export default function TerminalRoute() {
  const { lastMessage, lastConfig, lastEvent, sendMessage, activeWsUrl, mobileMainView, setMobileMainView, streamConnected } = useOutletContext()

  return (
    <LiveDashboard
      wsData={lastMessage}
      wsConfig={lastConfig}
      wsEvent={lastEvent}
      sendMessage={sendMessage}
      wsUrl={streamConnected ? activeWsUrl : null}
      mobileMainView={mobileMainView}
      setMobileMainView={setMobileMainView}
    />
  )
}
