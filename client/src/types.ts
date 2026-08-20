export const INFINITY = -1

export const CARD_VALUES = [0, 1, 2, 3, 5, 8, 13, 21, 34, 40, INFINITY]

export function formatCard(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return value === INFINITY ? '∞' : String(value)
}

export type Phase = 'estimating' | 'revealed'

export interface Participant {
  name: string
}

export interface Story {
  id: string
  title: string
  description: string
  acceptanceCriteria: string
  status: 'todo' | 'done'
  estimate: number | null
}

export interface Round {
  storyId: string
  number: number
  phase: Phase
  selections: Record<string, number>
}

export interface RoomState {
  roomId: string
  code: string
  hostName: string
  finished: boolean
  participants: Participant[]
  stories: Story[]
  round: Round | null
}

export interface SavedRoom {
  id: string
  code: string
  hostName: string
  createdAt: string
  finishedAt: string | null
  storyCount: number
  doneCount: number
}

export interface SavedEstimate {
  name: string
  value: number
}

export interface SavedRound {
  number: number
  consensus: number | null
  estimates: SavedEstimate[]
}

export interface SavedStory {
  id: string
  title: string
  description: string
  status: 'todo' | 'done'
  estimate: number | null
  rounds: SavedRound[]
}

export interface SavedRoomDetail extends SavedRoom {
  stories: SavedStory[]
}
