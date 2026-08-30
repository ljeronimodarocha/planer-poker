# Plano — Testes Automatizados (node:test no server)

Status: ✅ concluído

## Resumo

O projeto não tem testes automatizados — a verificação é manual (fluxo do jogo + CSV + histórico). Toda a lógica do jogo está no server (`rooms.js`, `socket.js`, `routes.js`), então o plano adota o runner nativo `node:test` (Node 26, zero deps novas de runtime) com **SQLite real** via Prisma (um banco temporário por arquivo de teste, já gitignored por `*.db`). Cobre: lógica do jogo (unit/integration), eventos Socket.IO end-to-end e API REST/CSV. Client fica fora do escopo (decisão confirmada).

---

## Mudança 1 — `server/test/helpers.js` (novo)

```js
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverDir = path.resolve(__dirname, '..')

export async function setupDb(name) {
  process.env.DATABASE_URL = `file:./test-${name}.db`
    execFileSync('npx', ['prisma', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate'], { cwd: serverDir, stdio: 'pipe' })
  const { prisma } = await import('../src/db.js')
  return prisma
}

export async function clearTables(prisma) {
  for (const table of ['estimate', 'round', 'story', 'audit', 'session', 'room']) {
    await prisma.$executeRawUnsafe(`DELETE FROM ${table}`)
  }
}
```

- `setupDb` define o `DATABASE_URL` **antes** do import dinâmico do `db.js` (o PrismaClient lê a env na instanciação), cria o schema em `server/prisma/test-<name>.db` (caminho relativo ao schema) e retorna o client.
- Cada arquivo de teste usa seu próprio banco → os arquivos rodam em paralelo (`node --test` isola processos).
- `clearTables` apaga na ordem inversa das FKs (filhos primeiro), sem precisar de pragma por conexão.
- **Caso extremo:** `setupDb` é top-level await no topo do arquivo; se o schema mudar, `db push` recria as tabelas.

---

## Mudança 2 — `server/test/rooms.test.js` (novo)

Testes da lógica do jogo em `server/src/rooms.js`, com `beforeEach(clearTables)`:

- **createRoom**: retorna `{ room, hostToken }`; persiste `Room` com senha bcrypt; `code` de 5 chars do alfabeto. Erros: nome vazio, senha < 6, > 72.
- **joinRoom**: novo participante; rejoin com mesmo nome atualiza `socketId`; nome já em uso por outro socket → erro; sessão encerrada → erro; código inexistente → erro.
- **addStory/removeStory**: somente host (`assertHost`); persiste/remove no banco; título vazio → erro; remove story com rodada ativa cancela a rodada.
- **startRound**: cria rodada nº 1 `estimating`; segunda chamada → "Já existe uma rodada em andamento".
- **selectCard**: carta inválida → erro; fase errada → erro; **auto-reveal** quando todos os conectados escolheram (phase → `revealed`); sem auto-reveal enquanto falta alguém.
- **revealRound / cancelRound**: force-reveal e cancelamento.
- **consensus**: exige fase `revealed`; persiste `Round` + `Estimate`s; story fica `done` com `estimate`; `INFINITY = -1` funciona.
- **finishSession**: `finished` + `finishedAt` no banco.
- **leaveRoom**: host sai → reeleição (primeiro conectado por `joinedAt`); sala vazia → estado descartado (`getRoom` undefined); seleção do que saiu é removida da rodada.
- **transferHost**: atualiza `hostName` + linha `Audit` (`host:transfer`); alvo não participante → erro.
- **authenticate**: senha correta → `hostToken`; errada → "Senha irreconhecida".
- **snapshot / leanRound**: formato do payload (lean sem stories).

---

## Mudança 3 — `server/test/socket.test.js` (novo)

End-to-end com servidor real: Fastify + `createSocketServer(app.server)` em porta efêmera, cliente via `socket.io-client` com `{ path: '/realtime' }`. Helper `emitAck(socket, event, payload)` → Promise do ack.

- **room:create** → ack com `roomId/code/hostToken` + evento `room:created` + broadcast `room:state`.
- **room:join** (código + nome) → participante entra e recebe snapshot.
- **story:add** (token host) → story aparece no estado.
- **round:start** → rodada `estimating` no estado.
- **round:select** de 2 jogadores → auto-reveal via `room:delta` (payload lean, sem stories).
- **round:consensus** → snapshot completo com story `done`, `round: null`; linhas no banco.
- **ack error**: jogador comum chamando `story:add` → `{ ok: false }` com erro PT-BR.
- **disconnect do host** → reeleição refletida no broadcast (hostName muda).
- **Caso extremo — rate limit (30/min/IP):** manter total de conexões no arquivo < 30 (pool de sockets reutilizado entre testes).

---

## Mudança 4 — `server/test/routes.test.js` (novo)

API REST via `app.inject()` (sem rede): Fastify + `registerApiRoutes`.

- **GET /api/health** → `{ ok: true }`.
- **CSV export**: seed via prisma (room + story + round + estimates, incluindo `INFINITY`) com token host Bearer → 200 `text/csv`, header `content-disposition` com o código da sala, linhas com `;`, `∞` para `-1`, aspas escapadas.
- Sem Authorization → 401; token de participant (role errada) → 401; sala inexistente → 404.

---

## Mudança 5 — `server/package.json` + raiz

```json
"scripts": { "test": "node --test test/rooms.test.js test/socket.test.js test/routes.test.js" },
"devDependencies": { "socket.io-client": "^4.8.1" }
```

- Lista explícita de arquivos evita que `helpers.js` seja tratado como teste.
- Raiz (`package.json`): `"test": "npm run test -w server"`.

---

## Arquivos

| Arquivo | Ação |
|---|---|
| `server/test/helpers.js` | novo |
| `server/test/rooms.test.js` | novo |
| `server/test/socket.test.js` | novo |
| `server/test/routes.test.js` | novo |
| `server/package.json` | editar (script test + devDep socket.io-client) |
| `package.json` (raiz) | editar (script test) |
| `server/src/rooms.js` | corrigir typo (ver abaixo) |

### Correção em `src/` descoberta pelos testes

- `server/src/rooms.js:320` e `:333`: `'Acesso restrido'` → `'Acesso restrito ao responsável pela sala'` (typo "restrido"). Era o único ajuste em código fonte; o resto passou com o comportamento atual.

### Ajustes nos testes após a 1ª execução

- `rooms.test.js`: funções síncronas (`startRound`, `selectCard`) exigem `assert.throws(() => …)` (não `assert.rejects`); teste de rejoin reescrito (host sai → estado descartado → rebuild do banco → rejoin atualiza `socketId`).
- `socket.test.js`: erro real de `story:add` com token de participant é `'Acesso restrito ao responsável pela sala'` (via `requireHostToken`); sockets conectados são rastreados e todos desconectados no `after()` (evita processo pendurado por websocket vazado em teste que falha).
- `routes.test.js`: tokens seed precisam ter ≥ 16 chars (`validateToken` rejeita tokens curtos); linhas do CSV são **totalmente** escapadas por `csvEscape` (todas as células entre aspas); teste de 404 cria FK pendurada (deletar a sala com `PRAGMA foreign_keys = OFF` mantendo o token).

---

## Verificação

- [x] `npm install` (hoisting do socket.io-client) e `npm test` na raiz passam todos os casos (43/43)
- [x] `npm run build -w client` continua compilando (client intocado) — vite build OK
- [x] `git status` limpo de bancos: `server/prisma/test-*.db` ignorados por `*.db` (confirmando via `git check-ignore`)
- [x] Rodar `npm test` duas vezes seguidas (idempotência: `db push` + `clearTables`) — 43/43 nas duas execuções
