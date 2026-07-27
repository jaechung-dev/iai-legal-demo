export type SearchResult = {
  content: string
  metadata: {
    citation?: string
    case_name?: string
    score: number
    source: string
  }
}

export type Mode = 'search' | 'ask'

export type SearchSource = 'legislation' | 'caselaw' | 'both' | 'case_events'

export type RecentSearch = {
  query: string
  mode: Mode
  source: SearchSource
  ts: number
}
