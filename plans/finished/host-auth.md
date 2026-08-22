# Plano — Autenticação de Controle e Exportação (Host) — `planepoker`

Status: ✅ concluído

## Escopo (decisão do usuário)

- **Sem login (facilidade):** entrar/sair, jogar cartas, visualizar backlog/resumo/CSV preview.
- **Com login (host):** ações de controle (`round:start`, `story:add/remove`, `round:consensus`, `round:cancel`, `session:finish`, `host:transfer`) + exportação CSV.

**Decisões:** Q1=(a) creator→host + senha na criação · Q2=senha obrigatória · Q3=token efêmero por join, ligado a `name`+`socket`.

## Resumo

Introduzida uma camada mínima de autenticação: a sala passa a exigir uma **senha de host** na criação (armazenada hash-ead), e cada conexão recebe um **token efêmero** ligado a `name`+`socketId`. Ações de host e a exportação CSV passam a exigir um token de host válido; o restante da aplicação continua anônimo. CORS escopado + rate limiting complementam a proteção.

---

## Mudança 1 — Modelos de dados — `server/prisma/schema.prisma` (nova migração `add_auth`)

```prisma
model Room {
  ...
  passwordHash   String   // bcrypt do host; nunca em plaintext
  creatorName    String
}

model Session {
  id         String   @id @default(cuid())
  token      String   @unique
  roomName   String
  name       String
  socketId   String
  role       String   // 'host' | 'participant'
  expiresAt  DateTime
  createdAt  DateTime @default(now())
}

model Audit {
  id        String   @id @default(cuid())
  roomName  String
  actor     String
  action    String
  createdAt DateTime @default(now())
}
```

- **Caso extremo:** `passwordHash` deve respeitar o limite de tamanho do campo DB (bcrypt ~60 chars); validar senhas >72 chars → erro.

---

## Mudança 2 — Criação de sala exige senha + emite host token — `server/src/rooms.js` + `server/src/socket.js`

```js
// rooms.js — createRoom
export async function createRoom(name, password, socketId) {
  if (!password || password.length < 6) throw new RoomError('Senha muito curta (mín. 6 caracteres)')
  if (String(name).trim().length === 0) throw new RoomError('Informe seu nome')
  const id = crypto.randomUUID()
  const code = randomCode()
  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.room.create({ data: { id, code, hostName: name, creatorName: name, passwordHash } })
  const hostToken = issueHostToken(id, name, socketId)
  return { room, hostToken }
}
```

- `socket.js` `room:create` responde `{ roomId, code, hostToken }`.
- `room:join` responde `{ roomId, code, participantToken }`.
- **Caso extremo:** senhas longas (>72 chars) → `400` antes de hash; nome vazio → `400`.

---

## Mudança 3 — Ações de host exigem token válido — `server/src/socket.js`

```js
// Em cada handler de host:
socket.on('round:start', handleAuth((roomId, name, payload, token) => {
  const seat = validateHostToken(token, roomId)
  if (!seat) return ack({ ok: false, error: 'Não autenticado como host' })
  return rooms.startRound(roomId, name, payload.storyId)
}))
```

- `validateHostToken(token, roomId)` verifica: token existe, não expirado, `role==='host'` e `roomName===roomId`.
- `round:reveal`, `round:consensus`, `story:add/remove`, `session:finish`, `host:transfer` seguem o mesmo padrão.
- **Caso extremo:** token expirado → `401`; token de participant tentando ação de host → `403`.

---

## Mudança 4 — Exportação CSV exige token de host — `server/src/routes.js`

```js
app.get('/api/rooms/:id/export.csv', async (req, reply) => {
  const seat = validateHostToken(req.headers.authorization?.replace('Bearer ','') ?? '', req.params.id)
  if (!seat) return reply.status(401).send({ error: 'Acesso negado à sala' })
  ...
})
```

- **Caso extremo:** sala `finished` → negar export mesmo com token válido.

---

## Mudança 5 — CORS escopado — `server/src/index.js:21`

```js
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map((o)=>o.trim())
await app.register(cors, { origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? true : false), credentials: true })
```

---

## Mudança 6 — Rate limiting + auditoria — `server/src/socket.js` + `server/src/rooms.js`

- Contador por IP (debounce): máx. N criações/conn/minuto → `429`.
- `host:transfer` e exportação registrem em `Audit` (nova tabela).

---

## Arquivos afetados

| Arquivo | Alteração |
|---|---|
| `server/prisma/schema.prisma` | `Room.passwordHash/creatorName`, `Session`, `Audit` |
| `server/src/rooms.js` | Criação com senha, validação, auditoria |
| `server/src/socket.js` | Tokens efêmeros, host-only handlers, rate limiting |
| `server/src/routes.js` | Authorization no CSV |
| `server/src/index.js` | CORS escopado |
| `client/src/App.tsx` | Capturar e armazenar tokens (host/participant) |
| `client/src/screens/Room.tsx` | Enviar `Authorization` em ações de host |

---

## Verificação

- [ ] `cd client && npm run build` compila sem errors TS
- [ ] `cd server && npx prisma migrate dev --name add_auth` aplica migração
- [ ] `room:create` sem senha / senha < 6 → `400`
- [ ] `room:create` OK → retorna `hostToken`; sem token → ações de host → `401/403`
- [ ] `room:join` → retorna `participantToken`; ações de participant anônimas
- [ ] `GET /api/rooms/:id/export.csv` sem token → `401`; com host token válido → `text/csv`
- [ ] CORS de origem não listada bloqueia `/realtime` e `/api`
- [ ] 50+ criações/IP/minuto → `429`
- [ ] `host:transfer` registra entrada em `Audit`
