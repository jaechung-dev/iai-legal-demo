export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatSource = {
  citation: string
  content: string
  score: number
  source_type: string
}

export type ConvSummary = {
  id: string
  title: string
  updated_at: string
  case_id: string | null
}
