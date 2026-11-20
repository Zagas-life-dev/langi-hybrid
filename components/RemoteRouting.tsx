'use client'
import { useEffect } from 'react'
import { startRemoteRouting } from '@/lib/hybrid/remoteConfig'

/** Loads the routing rules from Firebase Remote Config and keeps them live. Renders nothing. */
export default function RemoteRouting() {
  useEffect(() => { startRemoteRouting().catch(() => {}) }, [])
  return null
}
