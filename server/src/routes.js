import { prisma } from './db.js'
import { validateToken } from './rooms.js'

export const INFINITY = -1

function formatEstimate(value) {
  if (value === null || value === undefined) return ''
  return value === INFINITY ? '∞' : String(value)
}

function csvEscape(text) {
  return `"${String(text ?? '').replace(/"/g, '""')}"`
}

export function registerApiRoutes(app) {
  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/rooms/:id/export.csv', async (req, reply) => {
    const auth = req.headers.authorization
    if (typeof auth !== 'string') return reply.status(401).send({ error: 'Acesso negado à sala' })
    const seat = await validateToken(auth.replace(/^Bearer\s+/i, ''), req.params.id, 'host')
    if (!seat) return reply.status(401).send({ error: 'Acesso negado à sala' })
    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: {
        stories: {
          orderBy: [{ order: 'asc' }],
          include: {
            rounds: {
              orderBy: { number: 'asc' },
              include: { estimates: true },
            },
          },
        },
      },
    })
    if (!room) {
      reply.status(404)
      return reply.send({ error: 'Sala não encontrada' })
    }

    const lines = [
      ['Story', 'Descrição', 'Estimativa final (pontos)'].map(csvEscape).join(';'),
    ]
    for (const story of room.stories) {
      lines.push(
        [
          csvEscape(story.title),
          csvEscape(story.description),
          csvEscape(story.status === 'done' ? formatEstimate(story.estimate) : ''),
        ].join(';'),
      )
      for (const round of story.rounds) {
        for (const estimate of round.estimates) {
          lines.push(
            [
              csvEscape(story.title),
              csvEscape(`Rodada ${round.number} – ${estimate.name}`),
              csvEscape(formatEstimate(estimate.value)),
            ].join(';'),
          )
        }
      }
    }
    const csv = lines.join('\n') + '\n'
    reply.header('content-type', 'text/csv; charset=utf-8')
    reply.header('content-disposition', `attachment; filename="planning-poker-${room.code}.csv"`)
    return reply.send(csv)
  })
}
