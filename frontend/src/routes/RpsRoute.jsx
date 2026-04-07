import React from 'react'
import { useOutletContext } from 'react-router-dom'
import RPSGame from '../components/views/RPSGame'

export default function RpsRoute() {
  const { lastEvent } = useOutletContext()
  return <RPSGame wsEvent={lastEvent} />
}
