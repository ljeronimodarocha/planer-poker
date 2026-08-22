import { useCallback, useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import Home from './screens/Home'
import Room from './screens/Room'
import type { RoomState } from './types'

export interface AckResult {
  ok: boolean
  error?: string
  name?: string
}

export default function App() {
  const [view, setView] = useState<'home' | 'room'>('home')
  const [room, setRoom] = useState<RoomState | null>(null)
  const [me, setMe] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [socket] = useState<Socket>(() => io('/', { path: '/realtime' }))

  useEffect(() => {
    const onState = (state: RoomState) => {
      setRoom(state)
      setView('room')
    }
    socket.on('room:state', onState)
    const onDelta = ({ round }: { roomId: string; round: RoomState['round'] }) => {
      setRoom((prev) => (prev ? { ...prev, round } : prev))
    }
    socket.on('room:delta', onDelta)
    const onCreated = (data: { roomId: string; code: string; hostName: string }) => {
      const newState: RoomState = {
        roomId: data.roomId,
        code: data.code,
        hostName: data.hostName,
        finished: false,
        participants: [{ name: data.hostName }],
        stories: [],
        round: null,
      }
      setRoom(newState)
      setView('room')
      setMe(data.hostName)
    }
    socket.on('room:created', onCreated)
    return () => {
      socket.off('room:state', onState)
      socket.off('room:delta', onDelta)
      socket.off('room:created', onCreated)
    }
  }, [socket])

  const emit = useCallback(
    (event: string, data?: Record<string, unknown>): Promise<AckResult> => {
      return new Promise((resolve) =>
        socket.emit(event, data ?? {}, (res: AckResult) => resolve(res)),
      )
    },
    [socket],
  )

  async function handleCreate(name: string, password: string) {
    setError(null)
    setMe(name)
    const res = await emit('room:create', { name, password })
    if (!res.ok) {
      setMe('')
      setError(res.error || 'Erro ao criar a sala')
      return
    }
    if (res.name) setMe(res.name)
    if (typeof res.hostToken === 'string') setToken(res.hostToken)
  }

  async function handleJoin(code: string, name: string) {
    setError(null)
    setMe(name)
    const res = await emit('room:join', { code, name })
    if (!res.ok) {
      setMe('')
      setError(res.error || 'Erro ao entrar na sala')
      return
    }
    if (res.name) setMe(res.name)
    if (typeof res.participantToken === 'string') setToken(res.participantToken)
  }

  function handleLeave() {
    void emit('room:leave')
    setRoom(null)
    setMe('')
    setError(null)
    setView('home')
  }

  if (view === 'room' && room) {
    return (
      <Room
        room={room}
        me={me}
        token={token}
        emit={emit}
        onToken={(t) => setToken(t)}
        onLeave={handleLeave}
      />
    )
  }

  return <Home error={error} onCreate={handleCreate} onJoin={handleJoin} />
}