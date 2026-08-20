# AGENTS.md

Instruções para assistentes de IA (opencode, Claude, etc.) trabalharem neste projeto.

## Visão Geral

Planning Poker Web é uma aplicação fullstack para estimativas colaborativas em sessões de refinamento Agile. A equipe usa cartas Fibonacci para estimar stories e chega a um consenso.

## Stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS v4
- **Backend**: Fastify + Socket.IO + Prisma (SQLite)
- **Deploy**: Node.js 26+ com PM2 ou systemd

## Estrutura

```
planepoker/
├── client/src/
│   ├── screens/       # Home, Room, History
│   ├── types.ts       # Definições de tipos
│   ├── api.ts         # Chamadas REST
│   ├── App.tsx        # Componente raiz + socket.io
│   └── main.tsx       # Entry point
├── server/src/
│   ├── index.js       # Servidor Fastify
│   ├── socket.js      # Socket.IO
│   ├── routes.js      # API REST
│   ├── rooms.js       # Lógica do jogo (estado em memória)
│   └── db.js          # Prisma Client
└── prisma/schema.prisma
```

## Comandos Chave

```bash
# Desenvolvimento
npm run dev              # Inicia client + server em paralelo

# Build
npm run build            # Build do client (production)

# Server
npm start                # Inicia servidor (serving client/dist + API)

# Prisma
cd server && npx prisma migrate dev --name <name>
cd server && npx prisma generate
```

## Padrões de Código

### Backend (JavaScript ES Modules)

- Use `import/export` (ES modules)
- Socket.IO: cada conexão cria um handler com `socket.on(...)`
- Estado em memória: `Map<roomId, RoomState>`
- Persistência: apenas em consenso ou finishSession
- Erros: lance `RoomError` com mensagens em PT-BR

### Frontend (TypeScript React)

- Componentes funcionais com hooks
- Tailwind v4 com `@import "tailwindcss"` no CSS
- Socket.IO: `io('/realtime')` no browser
- Tipos centralizados em `types.ts`

### Socket.IO

- Path: `/realtime` (customizado)
- Events: `room:*`, `story:*`, `round:*`, `session:*`, `host:*`
- Ack callbacks para confirmação de ações
- Broadcast de `room:state` após cada mudança

## Fluxo do Jogo

1. Host cria sala → recebe `{ roomId, code }`
2. Membros juntam com `code` + `name`
3. Host adiciona stories no backlog
4. Host inicia rodada em um story
5. Membros selecionam cartas (0, 1, 2, 3, 5, 8, 13, 21, 34, 40, ∞)
6. Auto-reveal quando todos escolheram, ou force-reveal pelo host
7. Discussão → nova rodada (opcional)
8. Host define consenso → story marcado como `done`
9. Próximo story → repita
10. Finish session → persiste tudo no SQLite

## Testes

- Teste fluxo manual: criar sala → adicionar stories → iniciar rodada → selecionar cartas → revelar → consensus
- Verifique exportação CSV: `GET /api/rooms/:id/export.csv`
- Verifique histórico: `GET /api/rooms` retorna sessões salvas

## Deploy VPS

```bash
# Setup
npm install
npm run build

# PM2
pm2 start npm --name "planning-poker" -- start
pm2 save
pm2 startup

# systemd (alternativa)
# Criar /etc/systemd/system/planning-poker.service
```

## Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `PORT` | Porta do servidor | `3000` |
| `HOST` | Host bind | `0.0.0.0` |
| `LOG_LEVEL` | Nível de logging | `info` |
| `DATABASE_URL` | URL SQLite | `file:./dev.db` |

## Notas Importantes

- O estado do jogo (seleções, rodadas) fica em memória; persiste apenas no consenso
- `INFINITY = -1` representa ∞ nas cartas e no consenso
- Participants são identificados por `name` (case-insensitive)
- Host é o primeiro participante; pode ser transferido via socket
- SQLite é usado para persistência de sessões e stories
