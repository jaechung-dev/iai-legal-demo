export type FileMeta = {
  name: string
  size: number
  category: string
  key: string | null
}

export type CaseSummary = {
  id: string
  matter: {
    matterType?: string
    subType?: string
    urgency?: string
    description?: string
    courtDate?: string
  }
  file_count: number
  created_at: string
}

export type CaseDetail = {
  id: string
  personal: Record<string, string>
  matter: Record<string, string>
  files: FileMeta[]
  created_at: string
}

export type UploadState = {
  id: string
  name: string
  size: number
  uploading: boolean
  error: string | null
}

export type CaseEvent = {
  id: string
  date: string
  category: string
  event_type: string
  subject: string
  summary: string
  content: string
  attachments: Array<{ key: string; name: string }>
}
