import { useEffect, useRef, useState } from 'react'
import { CARD_VALUES, formatCard } from '../types'
import type { RoomState } from '../types'
import { downloadCsv } from '../api'

interface RoomProps {
  room: RoomState
  me: string
  token: string | null
  emit: (event: string, payload?: unknown) => Promise<{ ok: boolean; error?: string }>
  onToken: (token: string | null) => void
  onLeave: () => void
}

export default function Room({ room, me, token, emit, onToken, onLeave }: RoomProps) {
  const isHost = room.hostName === me
  const [view, setView] = useState<'board' | 'summary'>('board')
  const [consensusPick, setConsensusPick] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [transferName, setTransferName] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authedAsHost, setAuthedAsHost] = useState(false)

  const currentStory = room.round ? room.stories.find((s) => s.id === room.round!.storyId) : null
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number>(0)

  function showNotice(message: string) {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000)
  }

  useEffect(() => {
    setConsensusPick(null)
  }, [room.round?.storyId, room.round?.number])

  async function run(event: string, payload?: unknown) {
    const res = await emit(event, { ...(payload ?? {}), authorization: token })
    if (!res.ok) showNotice(res.error || 'Algo deu errado')
    return res
  }

  function copyCode() {
    navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  async function handleAuthenticate() {
    if (!authPassword) return
    const res = await run('room:authenticate', { name: me, password: authPassword })
    if (res.ok && typeof res.hostToken === 'string') {
      onToken(res.hostToken)
      setAuthedAsHost(true)
      setAuthPassword('')
      showNotice('Responsibilidade como responsável habilitada')
    } else {
      showNotice(res.error || 'Senha irreconhecida')
    }
  }

  const selectedCount = room.round
    ? room.participants.filter((p) => room.round!.selections[p.name] !== undefined).length
    : 0
  const allSelected =
    room.round !== null &&
    room.participants.every((p) => room.round!.selections[p.name] !== undefined)

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-8">
      <header className="flex flex-wrap items-center gap-3 py-4">
        <span className="text-lg font-bold tracking-tight text-white">🃏 Planning Poker</span>
        <button
          onClick={copyCode}
          title="Copiar código da sala"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-sm tracking-widest text-emerald-300 hover:bg-slate-800"
        >
          {copied ? 'Copiado!' : room.code}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex -space-x-2">
            {room.participants.map((p) => (
              <span
                key={p.name}
                title={p.name}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-950 text-xs font-bold ${
                  p.name === room.hostName ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-200'
                }`}
              >
                {p.name.slice(0, 2).toUpperCase()}
              </span>
            ))}
          </div>
          <span className="text-sm text-slate-400">{room.participants.length} online</span>
          {isHost && !room.round && (
            <div className="flex items-center gap-2">
              <select
                value={transferName}
                onChange={(e) => setTransferName(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300 focus:border-emerald-600 focus:outline-none"
                title="Responsável pela sala"
              >
                {room.participants.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (transferName && transferName !== room.hostName) {
                    void run('host:transfer', { targetName: transferName })
                    setTransferName(room.hostName)
                  }
                }}
                disabled={!transferName || transferName === room.hostName}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
                title="Transferir responsabilidade da sala"
              >
                Transferir responsabilidade
              </button>
            </div>
          )}
          {!authedAsHost && (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Senha do responsável"
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300 focus:border-emerald-600 focus:outline-none"
                title="Autenticar como responsável"
              />
              <button
                onClick={handleAuthenticate}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
                title="Autenticar como responsável"
              >
                Entrar como responsável
              </button>
            </div>
          )}
          <button
            onClick={onLeave}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Sair
          </button>
        </div>
      </header>

      {notice && (
        <div className="mb-3 rounded-lg border border-amber-700 bg-amber-950 px-3 py-2 text-sm text-amber-200">
          {notice}
        </div>
      )}

      {room.finished ? (
        <SummaryView room={room} token={token} onError={showNotice} />
      ) : (
        <>
          <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
            <aside className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                  Backlog ({room.stories.length})
                </h2>
                <button
                  onClick={() => setView('board')}
                  className={`rounded px-2 py-1 text-xs ${
                    view === 'board' ? 'bg-slate-800 text-slate-200' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Board
                </button>
              </div>
              <StoryList room={room} isHost={isHost} run={run} />
              {isHost && <NewStoryForm run={run} />}
              <div className="mt-4 border-t border-slate-800 pt-3">
                <button
                  onClick={() => setView('summary')}
                  className={`w-full rounded-lg px-3 py-2 text-sm ${
                    view === 'summary'
                      ? 'bg-slate-800 text-slate-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Resumo da sessão
                </button>
              </div>
            </aside>

            <main className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                {view === 'summary' ? (
                  <SummaryView room={room} token={token} onError={showNotice} />
                ) : currentStory && room.round ? (
                <RoundView
                  room={room}
                  me={me}
                  isHost={isHost}
                  currentStory={currentStory}
                  selectedCount={selectedCount}
                  allSelected={allSelected}
                  consensusPick={consensusPick}
                  setConsensusPick={setConsensusPick}
                  run={run}
                />
              ) : (
                <IdleView isHost={isHost} />
              )}
            </main>
          </div>
        </>
      )}
    </div>
  )
}

function StoryList({
  room,
  isHost,
  run,
}: {
  room: RoomState
  isHost: boolean
  run: (event: string, payload?: unknown) => Promise<{ ok: boolean; error?: string }>
}) {
  return (
    <ul className="space-y-1.5">
      {room.stories.map((story) => (
        <li
          key={story.id}
          className={`rounded-lg border px-3 py-2 text-sm ${
            room.round?.storyId === story.id
              ? 'border-emerald-700 bg-emerald-950/40'
              : 'border-slate-800 bg-slate-950/40'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className={story.status === 'done' ? 'text-slate-400' : 'text-slate-100'}>
                {story.status === 'done' ? (
                  <span className="mr-1 text-emerald-400">✓</span>
                ) : null}
                {story.title}
              </div>
              {story.description && (
                <div className="mt-0.5 text-xs text-slate-500">{story.description}</div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {story.status === 'done' ? (
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-emerald-300">
                  {formatCard(story.estimate)}
                </span>
              ) : isHost ? (
                <button
                  onClick={() => run('round:start', { storyId: story.id })}
                  disabled={room.round !== null}
                  className="rounded bg-emerald-700 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
                >
                  Estimar
                </button>
              ) : null}
              {isHost && (
                <button
                  onClick={() => run('story:remove', { storyId: story.id })}
                  title="Remover story"
                  className="text-slate-600 hover:text-rose-400"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
      {room.stories.length === 0 && (
        <li className="text-sm text-slate-500">Nenhum story ainda.</li>
      )}
    </ul>
  )
}

function NewStoryForm({
  run,
}: {
  run: (event: string, payload?: unknown) => Promise<{ ok: boolean; error?: string }>
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [open, setOpen] = useState(false)

  async function submit() {
    if (!title.trim()) return
    const res = await run('story:add', { title, description })
    if (res.ok) {
      setTitle('')
      setDescription('')
      setOpen(false)
    }
  }

  return (
    <div className="mt-4 border-t border-slate-800 pt-3">
      {open ? (
        <div className="space-y-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título do story"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição / critérios de aceite (opcional)"
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={submit}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
            >
              Adicionar
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-lg border border-dashed border-slate-700 px-3 py-2 text-sm text-slate-400 hover:border-slate-500 hover:text-slate-200"
        >
          + Novo story
        </button>
      )}
    </div>
  )
}

function IdleView({ isHost }: { isHost: boolean }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center">
      <div className="text-5xl">🎴</div>
      {isHost ? (
        <>
          <h2 className="text-lg font-semibold text-slate-200">Pronto para estimar?</h2>
          <p className="max-w-md text-sm text-slate-400">
            Escolha um story no backlog e clique em <strong>Estimar</strong> para iniciar a rodada.
          </p>
        </>
      ) : (
        <p className="max-w-md text-sm text-slate-400">
          Aguardando o responsável iniciar uma rodada de estimativa…
        </p>
      )}
    </div>
  )
}

function RoundView({
  room,
  me,
  isHost,
  currentStory,
  selectedCount,
  allSelected,
  consensusPick,
  setConsensusPick,
  run,
}: {
  room: RoomState
  me: string
  isHost: boolean
  currentStory: { id: string; title: string; description: string; acceptanceCriteria: string }
  selectedCount: number
  allSelected: boolean
  consensusPick: number | null
  setConsensusPick: (v: number) => void
  run: (event: string, payload?: unknown) => Promise<{ ok: boolean; error?: string }>
}) {
  const round = room.round!
  const mySelection = round.selections[me]

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
            Rodada {round.number}
          </span>
          <span
            className={`rounded px-2 py-0.5 text-xs ${
              round.phase === 'estimating'
                ? 'bg-amber-900/60 text-amber-300'
                : 'bg-emerald-900/60 text-emerald-300'
            }`}
          >
            {round.phase === 'estimating' ? 'Escolhendo cartas' : 'Cartas reveladas'}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-white">{currentStory.title}</h2>
        {currentStory.description && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">
            {currentStory.description}
          </p>
        )}
        {currentStory.acceptanceCriteria && (
          <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">
            {currentStory.acceptanceCriteria}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          {selectedCount} de {room.participants.length} escolheram
        </span>
        {isHost && round.phase === 'estimating' && !allSelected && (
          <button
            onClick={() => run('round:reveal')}
            className="rounded-lg border border-amber-700 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-950"
          >
            Revegar agora
          </button>
        )}
      </div>

      {round.phase === 'estimating' ? (
        <CardGrid
          value={mySelection}
          onSelect={(v) => run('round:select', { value: v })}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {room.participants.map((p) => (
              <div
                key={p.name}
                className="flex flex-col items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-3"
              >
                <span className="max-w-full truncate text-xs text-slate-400" title={p.name}>
                  {p.name}
                  {p.name === room.hostName ? ' 👑' : ''}
                </span>
                <div
                  className={`flex h-16 w-12 items-center justify-center rounded-lg text-2xl font-bold ${
                    p.name === me
                      ? 'bg-emerald-900/70 text-emerald-200'
                      : 'bg-slate-800 text-slate-200'
                  }`}
                >
                  {formatCard(round.selections[p.name])}
                </div>
              </div>
            ))}
          </div>

          {isHost ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-200">
                Definir consenso final
              </h3>
              <div className="mb-3 flex flex-wrap gap-2">
                {CARD_VALUES.map((v) => (
                  <button
                    key={v}
                    onClick={() => setConsensusPick(v)}
                    className={`h-11 w-10 rounded-lg text-lg font-bold transition ${
                      consensusPick === v
                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                        : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {formatCard(v)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => run('round:consensus', { value: consensusPick })}
                  disabled={consensusPick === null}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
                >
                  Salvar consenso
                </button>
                <button
                  onClick={() => run('round:cancel')}
                  className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-slate-200"
                >
                  Cancelar rodada
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Discussam e o responsável define o consenso final…
            </p>
          )}
        </>
      )}
    </div>
  )
}

function CardGrid({
  value,
  onSelect,
}: {
  value: number | undefined
  onSelect: (v: number) => Promise<{ ok: boolean; error?: string }>
}) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-11">
      {CARD_VALUES.map((v) => (
        <button
          key={v}
          onClick={() => void onSelect(v)}
          className={`h-16 rounded-xl text-2xl font-bold transition ${
            value === v
              ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
              : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
          }`}
        >
          {formatCard(v)}
        </button>
      ))}
    </div>
  )
}

function SummaryView({
  room,
  token,
  onError,
}: {
  room: RoomState
  token: string | null
  onError: (msg: string) => void
}) {
  const done = room.stories.filter((s) => s.status === 'done')
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Resumo da sessão</h2>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try {
                await downloadCsv(room.roomId, room.code, token)
              } catch (err) {
                onError((err as Error).message)
              }
            }}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            ⬇ Exportar CSV
          </button>
        </div>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-slate-400">
            <th className="py-2 pr-4">Story</th>
            <th className="py-2 pr-4">Descrição</th>
            <th className="py-2">Estimativa</th>
          </tr>
        </thead>
        <tbody>
          {room.stories.map((s) => (
            <tr key={s.id} className="border-b border-slate-800/60">
              <td className="py-2 pr-4 font-medium text-slate-200">{s.title}</td>
              <td className="py-2 pr-4 text-slate-400">{s.description || '—'}</td>
              <td className="py-2">
                {s.status === 'done' ? (
                  <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-emerald-300">
                    {formatCard(s.estimate)}
                  </span>
                ) : (
                  <span className="text-slate-600">pendente</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-slate-500">
        {done.length} de {room.stories.length} stories estimados
      </p>
    </div>
  )
}
