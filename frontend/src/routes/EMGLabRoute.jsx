import React from 'react'
import { useOutletContext } from 'react-router-dom'
import EMGLabView from '../components/views/EMGLabView'

export default function EMGLabRoute() {
  const { lastEvent, lastMessage } = useOutletContext()
  return <EMGLabView wsEvent={lastEvent} wsMessage={lastMessage} />
}
