export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
  })
}

export function calculateHoursWorked(
  events: { action: string; timestamp: string }[]
): { hours: number; minutes: number; decimal: number; isStillIn: boolean } {
  let totalMinutes = 0
  let isStillIn = false

  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  let clockInTime: Date | null = null

  for (const event of sorted) {
    if (event.action === 'in') {
      clockInTime = new Date(event.timestamp)
    } else if (event.action === 'out' && clockInTime) {
      const clockOutTime = new Date(event.timestamp)
      totalMinutes += (clockOutTime.getTime() - clockInTime.getTime()) / 60000
      clockInTime = null
    }
  }

  if (clockInTime) {
    isStillIn = true
    // Don't count ongoing shift in totals
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = Math.round(totalMinutes % 60)
  const decimal = Math.round((totalMinutes / 60) * 100) / 100

  return { hours, minutes, decimal, isStillIn }
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function getDateString(date?: Date): string {
  const d = date || new Date()
  return d.toISOString().split('T')[0]
}

export function getPayPeriodDates(): { start: Date; end: Date } {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const end = new Date(now)
  // Find most recent Sunday
  end.setDate(now.getDate() - day)
  end.setHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setDate(end.getDate() - 13)
  start.setHours(0, 0, 0, 0)
  return { start, end }
}
