import { useState } from 'react'

interface HomeProps {
  error: string | null
  onCreate: (name: string) => Promise<unknown>
  onJoin: (code: string, name: string) => Promise<unknown>
  onHistory: () => void
}

export default function Home({ error, onCreate, onJoin, onHistory }: HomeProps) {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  function canCreate() {
    return name.trim().length > 0
  }

  function canJoin() {
    return code.trim().length > 0 && name.trim().length > 0
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mb-2 text-5xl">🃏</div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Planning Poker</h1>
        <p className="mt-2 text-sm text-slate-400">
          Estime stories em equipe, em tempo real, durante o refinamento.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-950 p-1">
          <button
            onClick={() => setTab('create')}
            className={`rounded-lg py-2 text-sm font-medium ${
              tab === 'create' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Criar sala
          </button>
          <button
            onClick={() => setTab('join')}
            className={`rounded-lg py-2 text-sm font-medium ${
              tab === 'join' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Entrar com código
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-800 bg-rose-950 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (tab === 'create') {
              canCreate() && void onCreate(name.trim())
            } else {
              canJoin() && void onJoin(code.trim(), name.trim())
            }
          }}
        >
          {tab === 'create' ? (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm text-slate-400">Seu nome</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Ana"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={!canCreate()}
                className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                Criar sala
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm text-slate-400">Código da sala</span>
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Ex.: A3F9K"
                  maxLength={5}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-center font-mono text-lg tracking-[0.4em] placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-slate-400">Seu nome</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Ana"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={!canJoin()}
                className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                Entrar na sala
              </button>
            </div>
          )}
        </form>
      </div>

      <button
        onClick={onHistory}
        className="mx-auto mt-6 text-sm text-slate-500 hover:text-slate-300"
      >
        Histórico de sessões
      </button>
    </div>
  )
}
