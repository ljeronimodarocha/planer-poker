# Planning Poker Web

Aplicação web para realização de Planning Poker em sessões de refinamento de backlog. Permite que equipes Agile estimem stories de forma colaborativa e em tempo real.

## Funcionalidades

- **Criação de salas**: Host cria uma sala com código de 5 caracteres + senha (mín. 6)
- **Participação**: Membros da equipe entram com nome + código da sala
- **Gestão de stories**: Host adiciona e remove stories do backlog
- **Estimativa colaborativa**: Cartas Fibonacci (0, 1, 2, 3, 5, 8, 13, 21, 34, 40, ∞)
- **Revelação simultânea**: Cartas são mostradas apenas quando todos escolheram
- **Consenso**: Host define o valor final da estimativa
- **Autenticação do host**: Ações de controle e exportação exigem token de host (obtido com a senha da sala)
- **Transferência automática de host**: Se o host sair, o primeiro participante conectado assume
- **Exportação CSV**: Download dos resultados em formato CSV (autenticado)

## Stack Técnica

- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS
- **Backend**: Fastify + Socket.IO + Prisma (SQLite)
- **Deploy**: Node.js 26+ com PM2 ou systemd

## Estrutura do Projeto

```
planepoker/
├── client/          # Frontend (Vite + React + TypeScript + Tailwind)
│   ├── src/
│   │   ├── screens/     # Componentes de tela (Home, Room)
│   │   ├── types.ts     # Tipos TypeScript
│   │   ├── api.ts       # Funções de API
│   │   ├── main.tsx     # Entry point
│   │   └── index.css    # Estilos Tailwind
│   ├── vite.config.ts
│   └── package.json
├── server/          # Backend (Fastify + Socket.IO + Prisma)
│   ├── src/
│   │   ├── index.js     # Entry point do servidor
│   │   ├── socket.js    # Lógica Socket.IO
│   │   ├── routes.js    # Rotas REST
│   │   ├── rooms.js     # Estado em memória + lógica do jogo
│   │   └── db.js        # Instância do Prisma Client
│   └── prisma/
│       └── schema.prisma
└── package.json       # Workspace root
```

## Instalação

```bash
# Instalar dependências
npm install

# Aplicar as migrations do Prisma (SQLite)
cd server && npx prisma migrate deploy
```

## Desenvolvimento

```bash
# Iniciar ambos os servidores (client + server)
npm run dev

# Client: http://localhost:5173
# Server: http://localhost:3000
```

O Vite proxy redireciona `/api` e `/realtime` para o servidor Fastify.

## Testes

```bash
# Testes automatizados (node:test, server/test/)
npm test
```

## Produção

```bash
# Build do client
npm run build

# Iniciar servidor (serving client/dist + API + Socket.IO)
npm start
```

## Deploy na VPS

1. Clone o repositório na VPS
2. Instale dependências: `npm install`
3. Build: `npm run build`
4. Aplique as migrations: `cd server && npx prisma migrate deploy`
5. Use PM2 para gerenciar o processo:
   ```bash
   pm2 start npm --name "planning-poker" -- start
   pm2 save
   pm2 startup
   ```

## Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `PORT` | Porta do servidor | `3000` |
| `HOST` | Host bind | `0.0.0.0` |
| `LOG_LEVEL` | Nível de logging | `info` |
| `ALLOWED_ORIGINS` | Origens CORS permitidas (separadas por vírgula) | `http://localhost:5173` |
| `DATABASE_URL` | URL do banco SQLite | `file:./dev.db` |

## Fluxo do Jogo

1. **Lobby**: Host cria sala (nome + senha) → recebe código
2. **Participação**: Membros entram com nome + código
3. **Backlog**: Host adiciona stories (título + descrição + critérios de aceite)
4. **Estimativa**: Host inicia rodada → membros escolhem carta → revelação automática
5. **Discussão**: Time discute → nova rodada (se necessário)
6. **Consenso**: Host define valor final → story marcado como done
7. **Resumo**: Tabela de stories com estimativas + exportação CSV (exige token de host)

Se o host sair da sala, o primeiro participante conectado assume automaticamente. Qualquer participante pode se autenticar como host informando a senha da sala.

## API REST

### Health check
```http
GET /api/health
```

### Exportar CSV (exige token Bearer de host)
```http
GET /api/rooms/:id/export.csv
Authorization: Bearer <hostToken>
```

## Socket.IO Events

Ações de host exigem o token no campo `authorization` do payload; `round:select` usa o token de participante.

### Cliente → Servidor

| Evento | Payload | Descrição |
|--------|---------|-----------|
| `room:create` | `{ name, password }` | Criar nova sala (ack retorna `hostToken`) |
| `room:join` | `{ code, name }` | Entrar em sala existente (ack retorna `participantToken`) |
| `room:leave` | — | Sair da sala |
| `room:authenticate` | `{ name, password }` | Autenticar como host (ack retorna `hostToken`) |
| `story:add` | `{ title, description, acceptanceCriteria?, authorization }` | Adicionar story (host) |
| `story:remove` | `{ storyId, authorization }` | Remover story (host) |
| `round:start` | `{ storyId, authorization }` | Iniciar rodada (host) |
| `round:select` | `{ value, authorization }` | Escolher carta |
| `round:reveal` | `{ authorization }` | Forçar revelação (host) |
| `round:consensus` | `{ value, authorization }` | Definir consenso (host) |
| `round:cancel` | `{ authorization }` | Cancelar rodada (host) |
| `session:finish` | `{ authorization }` | Encerrar sessão (host) |
| `host:transfer` | `{ targetName, authorization }` | Transferir host para outro participante |

### Servidor → Cliente

| Evento | Descrição |
|--------|-----------|
| `room:state` | Estado atual da sala (broadcast) |
| `room:delta` | Atualização lean com apenas a rodada (`round:select`, `round:reveal`) |
| `room:created` | Confirmação de criação (ack) |
| `host:token` | Novo token de host após transferência |
| `rate:limited` | Muitas conexões por minuto (socket é desconectado) |

## Licença

MIT
