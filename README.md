# Planning Poker Web

Aplicação web para realização de Planning Poker em sessões de refinamento de backlog. Permite que equipes Agile estimem stories de forma colaborativa e em tempo real.

## Funcionalidades

- **Criação de salas**: Host cria uma sala com código de 5 caracteres
- **Participação**: Membros da equipe entram com nome + código da sala
- **Gestão de stories**: Host adiciona e remove stories do backlog
- **Estimativa colaborativa**: Cartas Fibonacci (0, 1, 2, 3, 5, 8, 13, 21, 34, 40, ∞)
- **Revelação simultânea**: Cartas são mostradas apenas quando todos escolheram
- **Consenso**: Host define o valor final da estimativa
- **Histórico**: Sessões salvas com detalhes de todas as rodadas
- **Exportação CSV**: Download dos resultados em formato CSV

## Stack Técnica

- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS
- **Backend**: Fastify + Socket.IO + Prisma (SQLite)
- **Deploy**: Node.js 26+ com PM2 ou systemd

## Estrutura do Projeto

```
planepoker/
├── client/          # Frontend (Vite + React + TypeScript + Tailwind)
│   ├── src/
│   │   ├── screens/     # Componentes de tela (Home, Room, History)
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

# Gerar client Prisma e criar migration
cd server
npx prisma migrate dev --name init

# Voltar à raiz
cd ..
```

## Desenvolvimento

```bash
# Iniciar ambos os servidores (client + server)
npm run dev

# Client: http://localhost:5173
# Server: http://localhost:3000
```

O Vite proxy redireciona `/api` e `/realtime` para o servidor Fastify.

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
4. Use PM2 para gerenciar o processo:
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
| `DATABASE_URL` | URL do banco SQLite | `file:./dev.db` |

## Fluxo do Jogo

1. **Lobby**: Host cria sala → recebe código + link
2. **Participação**: Membros entram com nome + código
3. **Backlog**: Host adiciona stories (título + descrição + critérios de aceite)
4. **Estimativa**: Host inicia rodada → membros escolhem carta → revelação automática
5. **Discussão**: Time discute → nova rodada (se necessário)
6. **Consenso**: Host define valor final → story marcado como done
7. **Resumo**: Tabela de stories com estimativas + exportação CSV

## API REST

### Listar sessões
```http
GET /api/rooms
```

### Detalhes da sessão
```http
GET /api/rooms/:id
```

### Exportar CSV
```http
GET /api/rooms/:id/export.csv
```

## Socket.IO Events

### Cliente → Servidor

| Evento | Payload | Descrição |
|--------|---------|-----------|
| `room:create` | `{ name }` | Criar nova sala |
| `room:join` | `{ code, name }` | Entrar em sala existente |
| `room:leave` | — | Sair da sala |
| `story:add` | `{ title, description, acceptanceCriteria? }` | Adicionar story (host) |
| `story:remove` | `{ storyId }` | Remover story (host) |
| `round:start` | `{ storyId }` | Iniciar rodada (host) |
| `round:select` | `{ value }` | Escolher carta |
| `round:reveal` | — | Forçar revelação (host) |
| `round:consensus` | `{ value }` | Definir consenso (host) |
| `round:cancel` | — | Cancelar rodada (host) |
| `session:finish` | — | Encerrar sessão (host) |
| `host:transfer` | `{ targetName }` | Transferir host para outro participante |

### Servidor → Cliente

| Evento | Descrição |
|--------|-----------|
| `room:state` | Estado atual da sala (broadcast) |
| `room:created` | Confirmação de criação (ack) |

## Licença

MIT
