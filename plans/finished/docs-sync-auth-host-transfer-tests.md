# Plano — Sincronização de Documentação (auth, transferência de host, testes)

Status: ✅ concluído

## Resumo

Desde a última atualização de docs (`ccc58f8`), entraram no código:

1. **Autenticação de host** — senha da sala na criação (bcrypt), tokens efêmeros (TTL 24h, modelo `Session`), ações de host + exportação CSV exigem token Bearer, novo evento `room:authenticate`.
2. **Transferência automática de host** — ao desconectar, o primeiro participante conectado assume; transferência manual revoga o token antigo e emite novo (`host:token`).
3. **Payloads lean** — `round:select`/`round:reveal` fazem broadcast de `room:delta` (só a rodada) em vez do estado completo.
4. **Testes automatizados** — node:test em `server/test/`, comando raiz `npm test`.
5. **CORS** — nova variável `ALLOWED_ORIGINS`.

O README e o AGENTS.md estão desatualizados: documentam endpoints REST removidos (`GET /api/rooms`, `GET /api/rooms/:id`), a tela History (removida em `9fa142f`), e faltam eventos, variáveis e comandos novos.

---

## Mudança 1 — README.md

- **Funcionalidades**: criação de sala agora exige senha (mín. 6); remove item "Histórico"; adiciona "Autenticação do responsável" e "Transferência automática de host".
- **Estrutura do Projeto**: `screens/` → Home, Room (sem History).
- **Variáveis de Ambiente**: adiciona `ALLOWED_ORIGINS` (padrão `http://localhost:5173`).
- **Fluxo do Jogo**: passo 1 menciona a senha.
- **API REST**: apenas `GET /api/health` e `GET /api/rooms/:id/export.csv` (com token Bearer de host); remove `GET /api/rooms` e `GET /api/rooms/:id`.
- **Socket.IO Events**: payloads atualizados (`authorization` nas ações de host/participante), adiciona `room:authenticate` (C→S) e `host:token`, `room:delta`, `rate:limited` (S→C).
- **Instalação/Deploy**: migrations já commitadas → `npx prisma migrate deploy` (substitui `migrate dev --name init`); passo de migration adicionado ao Deploy na VPS.

### Caso extremo

- A exportação CSV via navegador usa `fetch` com header `Authorization` (o link direto não funciona sem token).

---

## Mudança 2 — AGENTS.md

- **Comandos Chave**: adiciona `npm test`.
- **Padrões de Código → Socket.IO**: token no payload (`authorization`), delta lean para `round:select`/`round:reveal`, novos eventos.
- **Fluxo do Jogo**: senha na criação; transferência automática ao desconectar; revogação de token na transferência manual.
- **Testes**: testes automatizados com node:test em `server/test/` — rodar com `npm test`.
- **Variáveis de Ambiente**: adiciona `ALLOWED_ORIGINS`.
- **Notas Importantes**: tokens efêmeros (TTL 24h) na tabela `Session`; exportação CSV exige token Bearer de host.

### Caso extremo

- Testes usam banco SQLite em memória/arquivo temporário via `server/test/helpers.js`; não dependem de servidor subido (o socket roda sobre o Fastify em teste).

---

## Verificação

- [x] `grep -n "History\|/api/rooms" README.md AGENTS.md` → sem referências obsoletas
- [x] `npm test` → 44 testes passando (comando documentado funciona)
