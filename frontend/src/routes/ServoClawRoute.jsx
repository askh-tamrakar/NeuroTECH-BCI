import React from 'react'
import { useOutletContext } from 'react-router-dom'
import ServoClawView from '../components/views/ServoClawView'

export default function ServoClawRoute() {
  const { lastEvent, streamConnected } = useOutletContext()
  return <ServoClawView wsEvent={lastEvent} isConnected={streamConnected} />
}
