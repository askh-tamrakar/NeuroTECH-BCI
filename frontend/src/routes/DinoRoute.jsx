import React from 'react'
import { useOutletContext } from 'react-router-dom'
import DinoView from '../components/views/DinoView'

export default function DinoRoute() {
  const { lastEvent, streamConnected } = useOutletContext()
  return <DinoView isConnected={streamConnected} wsEvent={lastEvent} isPaused={false} />
}
