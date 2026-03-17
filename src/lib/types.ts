export interface Center {
  id: string
  name: string
  slug: string
  director_name: string
  email: string
  setup_complete: boolean
  tutorial_complete: boolean
  created_at: string
  user_id: string
}

export interface Teacher {
  id: string
  center_id: string
  name: string
  color: string
  created_at: string
}

export interface ClockEvent {
  id: string
  teacher_id: string
  center_id: string
  action: 'in' | 'out'
  photo_url: string | null
  timestamp: string
  date: string
}

export interface TeacherStatus extends Teacher {
  is_clocked_in: boolean
  last_event_time: string | null
  last_event_action: 'in' | 'out' | null
}

export const TEACHER_COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#48DBFB',
  '#0ABDE3', '#6C5CE7', '#A29BFE', '#00B894',
  '#E17055', '#74B9FF', '#55E6C1', '#FDA7DF',
] as const

export function getNextColor(existingCount: number): string {
  return TEACHER_COLORS[existingCount % TEACHER_COLORS.length]
}
