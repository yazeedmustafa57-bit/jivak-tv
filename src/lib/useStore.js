// Re-Render-Hook: feuert, wenn der Cloud-Sync neue Inhalte in den Store geschrieben hat.
import { useSyncExternalStore } from 'react'
import { subscribe, getStoreVersion } from './store.js'

export function useStoreVersion() {
  return useSyncExternalStore(subscribe, getStoreVersion)
}
