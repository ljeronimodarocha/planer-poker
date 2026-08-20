import { useEffect, useState } from 'react'
import { fetchRooms, fetchRoomDetail } from '../api'
import { formatCard } from '../types'
import type { SavedRoom, SavedRoomDetail } from '../types'

export default function History({ onBack }: { onBack: () => void }) {
  const [rooms, setRooms] = useState<SavedRoom[] | null>(null)
  const [detail, setDetail] = useState<SavedRoomDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchRooms()
      .then(setRooms)
      .catch(() => setError('Falha ao carregar o histórico'))
  }, [])

  async function open(id: string) {
    setLoading(true)
    setError(null)
    try {
      setDetail(await fetchRoomDetail(id))
    } catch {
      setError('Falha ao carregar a sessão')
    } finally {
      setLoading(false)
    }
  }

  if (detail) {
    return <Detail detail={normalizeDetail(detail)} onBack={() => setDetail(null)} />
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          ← Voltar
        </button>
        <h1 className="text-xl font-bold text-white">Histórico de sessões</h1>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-800 bg-rose-950 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      {rooms === null && !error && <p className="text-sm text-slate-400">Carregando…</p>}

      {rooms === null && !error && <p className="text-sm text-slate-400">Carregando…</p>}

      {rooms !== null && rooms.length === 0 && (
        <p className="text-sm text-slate-400">Nenhuma sessão salva ainda.</p>
      )}

      <ul className="space-y-2">
        {rooms === null ? null : rooms.map((room) => (
          <li key={room.id}>
            <button
              onClick={() => void open(room.id)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-left hover:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-sm tracking-widest text-emerald-300">
                    {room.code}
                  </span>
                  <span className="ml-3 text-sm text-slate-300">por {room.hostName}</span>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>
                    {new Date(room.createdAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}{' '}
                    {new Date(room.createdAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  <div>
                    {room.doneCount}/{room.storyCount} stories estimados
                  </div>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {loading && <p className="mt-4 text-sm text-slate-400">Carregando…</p>}
    </div>
  )
}

function normalizeDetail(detail: SavedRoomDetail): SavedRoomDetail {
  const normalizedStories = (detail.stories ?? []).map((story) => ({
    ...story,
    rounds: (story.rounds ?? []).map((round) => ({
      ...round,
      consensus: round.consensus === null || round.consensus === undefined ? null : round.consensus,
      estimates: (round.estimates ?? []).map((est) => ({
        name: est.name ?? '',
        value: est.value ?? 0,
      })),
    })),
  }))
  return { ...detail, stories: normalizedStories }
}

function Detail({ detail, onBack }: { detail: SavedRoomDetail; onBack: () => void }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          ← Voltar
        </button>
        <h1 className="text-xl font-bold text-white">Sessão {detail.code}</h1>
        <span className="text-sm text-slate-500">
          por {detail.hostName} ·{' '}
          {new Date(detail.createdAt).toLocaleDateString('pt-BR')}
        </span>
        <button
          onClick={() => (window.location.href = `/api/rooms/${detail.id}/export.csv`)}
          className="ml-auto rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          ⬇ Exportar CSV
        </button>
      </div>

      <div className="space-y-6">
        {detail.stories.map((story) => (
          <div key={story.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-100">{story.title}</h2>
                {story.description && (
                  <p className="mt-1 text-sm text-slate-400">{story.description}</p>
                )}
              </div>
              <span
                className={`shrink-0 rounded px-2 py-1 font-mono text-sm ${
                  story.status === 'done'
                    ? 'bg-slate-800 text-emerald-300'
                    : 'bg-slate-900 text-slate-500'
                }`}
              >
                {story.status === 'done' ? formatCard(story.estimate) : 'pendente'}
              </span>
            </div>
            {story.rounds.length > 0 && (
              <div className="mt-4 space-y-2">
                {story.rounds.map((round) => (
                  <div
                    key={round.number}
                    className="rounded-lg border border-slate-800/70 bg-slate-950/50 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-500">Rodada {round.number}:</span>{' '}
                    {round.estimates.map((est) => (
                      <span key={est.name} className="mr-2">
                        <span className="text-slate-400">{est.name}</span>{' '}
                        <span className="font-mono text-slate-200">{formatCard(est.value)}</span>
                      </span>
                    ))}
                    {round.consensus !== null && (
                      <span className="ml-2 font-mono text-emerald-300">
                        → consenso {formatCard(round.consensus)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {detail.stories.length === 0 && <p className="text-sm text-slate-400">Sem stories.</p>}
      </div>
    </div>
  )
}
