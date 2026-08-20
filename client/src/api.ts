import type { SavedRoom, SavedRoomDetail } from './types'

export async function fetchRooms(): Promise<SavedRoom[]> {
  const res = await fetch('/api/rooms')
  if (!res.ok) throw new Error('Falha ao listar sessões')
  return res.json()
}

export async function fetchRoomDetail(id: string): Promise<SavedRoomDetail> {
  const res = await fetch(`/api/rooms/${id}`)
  if (!res.ok) throw new Error('Falha ao carregar sessão')
  return res.json()
}

export function downloadCsv(id: string) {
  window.location.href = `/api/rooms/${id}/export.csv`
}
