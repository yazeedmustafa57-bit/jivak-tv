// ═══════════════════════════════════════════════════════════════════
// ROJ TV – WebRTC Signaling via Supabase Realtime
//
// Admin publiziert Kamera → Supabase Channel
// Jeder Viewer verbindet sich direkt per WebRTC zum Admin
// Kein externer Server nötig!
// ═══════════════════════════════════════════════════════════════════

import { supabase } from './supabase.js'

const CHANNEL_NAME = 'roj-live-webrtc'
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

// ─── Admin: Einen Kanal erstellen ────────────────────────────────

export function createAdminChannel() {
  if (!supabase) throw new Error('Supabase nicht konfiguriert')
  return supabase.channel(CHANNEL_NAME, {
    config: { broadcast: { self: false, ack: true } }
  })
}

// ─── Viewer: Einen Kanal abonnieren ──────────────────────────────

export function createViewerChannel() {
  if (!supabase) throw new Error('Supabase nicht konfiguriert')
  return supabase.channel(CHANNEL_NAME, {
    config: { broadcast: { self: false } }
  })
}

// ─── WebRTC Peer Connection Factory ──────────────────────────────

export function createPeerConnection(onTrack, onIceCandidate) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

  pc.ontrack = onTrack
  pc.onicecandidate = onIceCandidate

  pc.onconnectionstatechange = () => {
    // Connection state logging handled by caller
  }

  return pc
}

export { ICE_SERVERS, CHANNEL_NAME }
