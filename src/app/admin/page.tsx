'use client'

import { useState, useEffect, useCallback } from 'react'
import { Center, Teacher } from '@/lib/types'
import { formatTime, formatDate, getDateString, getPayPeriodDates } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import TutorialOverlay from './TutorialOverlay'
import FaceEnrollModal from './FaceEnrollModal'
import CameraTab from './CameraTab'

interface ClockEventRow {
  id: string
  teacher_id: string
  action: 'in' | 'out'
  photo_url: string | null
  timestamp: string
  teachers?: { name: string; color?: string }
}

interface ExportDay {
  clockIn: string | null
  clockOut: string | null
  hours: number
  minutes: number
  decimal: number
}

interface ExportTeacherRow {
  teacher: string
  days: Record<string, ExportDay | null>
  total: string
}

interface ExportData {
  dates: string[]
  teachers: ExportTeacherRow[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return formatDate(timestamp)
}

function computeHoursToday(events: ClockEventRow[]): number {
  // Group by teacher, find earliest 'in' per teacher that is still active,
  // then sum (now - clockInTime) in minutes.
  const now = Date.now()
  const byTeacher: Record<string, ClockEventRow[]> = {}
  for (const e of events) {
    if (!byTeacher[e.teacher_id]) byTeacher[e.teacher_id] = []
    byTeacher[e.teacher_id].push(e)
  }

  let totalMinutes = 0
  for (const teacherEvents of Object.values(byTeacher)) {
    const sorted = [...teacherEvents].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
    // Walk pairs
    let lastIn: Date | null = null
    for (const ev of sorted) {
      if (ev.action === 'in') {
        lastIn = new Date(ev.timestamp)
      } else if (ev.action === 'out' && lastIn) {
        totalMinutes += (new Date(ev.timestamp).getTime() - lastIn.getTime()) / 60000
        lastIn = null
      }
    }
    // Still clocked in
    if (lastIn) {
      totalMinutes += (now - lastIn.getTime()) / 60000
    }
  }
  return totalMinutes
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: string
  value: string | number
  label: string
  color: string
  borderColor: string
  bgColor: string
}

function StatCard({ icon, value, label, color, borderColor, bgColor }: StatCardProps) {
  return (
    <div
      className={`bg-[#1A1D27] rounded-2xl border border-[#2E3345] shadow-sm p-5 flex items-center gap-4 border-l-4`}
      style={{ borderLeftColor: borderColor }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
        style={{ backgroundColor: bgColor }}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold leading-tight" style={{ color }}>
          {value}
        </p>
        <p className="text-xs text-[#8B92A5] font-medium mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const router = useRouter()
  const [center, setCenter] = useState<Center | null>(null)
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [todayEvents, setTodayEvents] = useState<ClockEventRow[]>([])
  const [newTeacherName, setNewTeacherName] = useState('')
  const [showTutorial, setShowTutorial] = useState(false)
  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'export' | 'staff' | 'cameras'>('today')
  const [exportRange, setExportRange] = useState<{ start: string; end: string }>(() => {
    const { start, end } = getPayPeriodDates()
    return { start: getDateString(start), end: getDateString(end) }
  })
  const [exportData, setExportData] = useState<ExportData | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [photoModal, setPhotoModal] = useState<{
    url: string
    name: string
    action: string
    time: string
  } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    director_name: '',
    email: '',
  })
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [enrollingTeacher, setEnrollingTeacher] = useState<Teacher | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // Fetch center
  useEffect(() => {
    fetch('/api/center')
      .then(res => res.json())
      .then(data => {
        if (!data || data.error) {
          router.push('/setup')
          return
        }
        setCenter(data)
        setSettingsForm({
          name: data.name,
          director_name: data.director_name,
          email: data.email,
        })
        if (!data.tutorial_complete) setShowTutorial(true)
      })
      .catch(() => router.push('/setup'))
      .finally(() => setLoading(false))
  }, [router])

  // Fetch teachers
  const fetchTeachers = useCallback(async () => {
    if (!center) return
    const res = await fetch(`/api/teachers?center_id=${center.id}`)
    const data = await res.json()
    if (Array.isArray(data)) setTeachers(data)
  }, [center])

  // Fetch today's events
  const fetchTodayEvents = useCallback(async () => {
    if (!center) return
    const res = await fetch(
      `/api/clock-events?center_id=${center.id}&date=${getDateString()}`
    )
    const data = await res.json()
    if (Array.isArray(data)) setTodayEvents(data)
  }, [center])

  useEffect(() => {
    fetchTeachers()
    fetchTodayEvents()
    const interval = setInterval(fetchTodayEvents, 30000)
    return () => clearInterval(interval)
  }, [fetchTeachers, fetchTodayEvents])

  // Add teacher
  const addTeacher = async () => {
    if (!newTeacherName.trim() || !center) return
    const name = newTeacherName.trim()
    await fetch('/api/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, center_id: center.id }),
    })
    setNewTeacherName('')
    fetchTeachers()
    showToast(`${name} added!`)
  }

  // Remove teacher
  const removeTeacher = async (id: string, name: string) => {
    if (!confirm(`Remove ${name}? This will delete all their clock records.`)) return
    await fetch('/api/teachers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchTeachers()
    fetchTodayEvents()
    showToast(`${name} removed`)
  }

  // Fetch export data
  const fetchExport = useCallback(async () => {
    if (!center) return
    setExportLoading(true)
    const res = await fetch(
      `/api/export?center_id=${center.id}&start_date=${exportRange.start}&end_date=${exportRange.end}`
    )
    const data = await res.json()
    setExportData(data)
    setExportLoading(false)
  }, [center, exportRange])

  // Download CSV
  const downloadCSV = async () => {
    if (!center) return
    const res = await fetch(
      `/api/export?center_id=${center.id}&start_date=${exportRange.start}&end_date=${exportRange.end}&format=csv`
    )
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tiktik-hours-${exportRange.start}-to-${exportRange.end}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('CSV downloaded!')
  }

  // Copy to clipboard
  const copyToClipboard = () => {
    if (!exportData) return
    let text = 'Teacher\t'
    text += exportData.dates
      .map((d: string) => {
        const date = new Date(d + 'T00:00:00')
        return date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'numeric',
          day: 'numeric',
        })
      })
      .join('\t')
    text += '\tTotal\n'
    for (const row of exportData.teachers) {
      text += row.teacher + '\t'
      text += exportData.dates
        .map((d: string) => {
          const day = row.days[d]
          return day ? `${day.decimal}h` : '—'
        })
        .join('\t')
      text += `\t${row.total}h\n`
    }
    navigator.clipboard.writeText(text)
    showToast('Copied to clipboard!')
  }

  // Quick date selectors
  const setQuickRange = (type: string) => {
    const now = new Date()
    let start: Date
    let end: Date
    switch (type) {
      case 'today':
        start = now
        end = now
        break
      case 'week': {
        const day = now.getDay()
        start = new Date(now)
        start.setDate(now.getDate() - day + 1)
        end = now
        break
      }
      case 'lastweek': {
        const day = now.getDay()
        end = new Date(now)
        end.setDate(now.getDate() - day)
        start = new Date(end)
        start.setDate(end.getDate() - 6)
        break
      }
      case 'payperiod': {
        const pp = getPayPeriodDates()
        start = pp.start
        end = pp.end
        break
      }
      default:
        return
    }
    setExportRange({ start: getDateString(start), end: getDateString(end) })
  }

  // Save settings
  const saveSettings = async () => {
    await fetch('/api/center', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsForm),
    })
    setCenter(prev => (prev ? { ...prev, ...settingsForm } : null))
    setShowSettings(false)
    showToast('Settings saved!')
  }

  // Complete tutorial
  const completeTutorial = async () => {
    await fetch('/api/center', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tutorial_complete: true }),
    })
    setShowTutorial(false)
  }

  // Derived stats
  const clockedInTeacherIds = new Set<string>()
  const latestActionByTeacher: Record<string, 'in' | 'out'> = {}
  for (const event of todayEvents) {
    // todayEvents are ordered newest-first from the API; first seen = latest
    if (!(event.teacher_id in latestActionByTeacher)) {
      latestActionByTeacher[event.teacher_id] = event.action
    }
  }
  for (const [tid, action] of Object.entries(latestActionByTeacher)) {
    if (action === 'in') clockedInTeacherIds.add(tid)
  }

  const clockedInCount = clockedInTeacherIds.size
  const totalMinutesToday = computeHoursToday(todayEvents)
  const hoursToday = formatMinutes(totalMinutesToday)

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#00B894] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#8B92A5] text-sm font-medium">Loading dashboard…</p>
        </div>
      </div>
    )
  }

  if (!center) return null

  const tabs = [
    { id: 'today' as const, icon: '📋', label: "Today's Log" },
    { id: 'week' as const, icon: '📅', label: 'Week View' },
    { id: 'export' as const, icon: '📊', label: 'Export' },
    { id: 'staff' as const, icon: '👥', label: 'Staff' },
    { id: 'cameras' as const, icon: '📹', label: 'Cameras' },
  ]

  return (
    <div className="min-h-screen bg-[#0F1117]">
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-[60] bg-[#00B894] text-white px-6 py-3 rounded-xl shadow-lg animate-fade-in font-medium flex items-center gap-2">
          <span>✓</span>
          <span>{toast}</span>
        </div>
      )}

      {/* Top bar */}
      <header className="bg-[#1A1D27] border-b border-[#2E3345] px-6 py-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#00B894] rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">T</span>
            </div>
            <h1 className="text-xl font-bold">
              <span className="text-[#00B894]">TIK</span>
              <span className="text-[#EAEDF3]">TIK</span>
              <span className="text-[#5A6178] font-normal ml-2 text-base">Admin</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-semibold text-[#EAEDF3]">{center.name}</p>
              <p className="text-xs text-[#8B92A5]">{center.director_name}</p>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="w-9 h-9 rounded-full bg-[#242836] flex items-center justify-center hover:bg-[#2E3345] transition-colors text-base"
              aria-label="Open settings"
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            icon="🟢"
            value={clockedInCount}
            label="On Duty"
            color="#00B894"
            borderColor="#00B894"
            bgColor="rgba(0,184,148,0.15)"
          />
          <StatCard
            icon="👤"
            value={teachers.length}
            label="Total Staff"
            color="#0984E3"
            borderColor="#0984E3"
            bgColor="rgba(9,132,227,0.15)"
          />
          <StatCard
            icon="⏱"
            value={hoursToday}
            label="Hours Today"
            color="#6C5CE7"
            borderColor="#6C5CE7"
            bgColor="rgba(108,92,231,0.15)"
          />
          <StatCard
            icon="⚡"
            value={todayEvents.length}
            label="Events Today"
            color="#FF9F43"
            borderColor="#FF9F43"
            bgColor="rgba(255,159,67,0.15)"
          />
        </div>

        {/* Tab bar */}
        <div className="bg-[#1A1D27] rounded-2xl border border-[#2E3345] shadow-sm overflow-hidden">
          <div className="flex border-b border-[#2E3345] overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  if (tab.id === 'export') fetchExport()
                }}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'border-[#00B894] text-[#00B894] bg-[rgba(0,184,148,0.08)]'
                    : 'border-transparent text-[#8B92A5] hover:text-[#EAEDF3] hover:bg-[#242836]'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* TODAY'S LOG */}
          {activeTab === 'today' && (
            <div data-tutorial="today-log">
              {/* Sub-header */}
              <div className="px-6 py-4 flex items-center justify-between border-b border-[#2E3345]">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-[rgba(0,184,148,0.15)] text-[#00B894] px-3 py-1 rounded-full text-sm font-semibold">
                    <span className="w-2 h-2 bg-[#00B894] rounded-full animate-pulse inline-block" />
                    {clockedInCount} on duty
                  </span>
                  <span className="text-[#5A6178] text-sm hidden sm:inline">
                    · {todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''} today
                  </span>
                </div>
                <p className="text-xs text-[#5A6178]">
                  {new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>

              {/* Event list */}
              <div className="divide-y divide-[#2E3345]">
                {todayEvents.length === 0 ? (
                  <div className="px-6 py-16 flex flex-col items-center gap-3 text-center">
                    <div className="w-16 h-16 bg-[#242836] rounded-2xl flex items-center justify-center text-3xl">
                      🕐
                    </div>
                    <p className="font-semibold text-[#EAEDF3]">No clock events yet</p>
                    <p className="text-sm text-[#5A6178] max-w-xs">
                      When staff clock in on the iPad, their events will appear here in real time.
                    </p>
                  </div>
                ) : (
                  todayEvents.map((event: ClockEventRow) => (
                    <div
                      key={event.id}
                      className="px-6 py-3.5 flex items-center gap-4 hover:bg-[#242836] transition-colors group"
                    >
                      {/* Photo thumbnail */}
                      <button
                        onClick={() =>
                          event.photo_url &&
                          setPhotoModal({
                            url: event.photo_url,
                            name: event.teachers?.name ?? 'Unknown',
                            action: event.action,
                            time: formatTime(event.timestamp),
                          })
                        }
                        className="w-12 h-12 rounded-full overflow-hidden bg-[#242836] flex-shrink-0 ring-2 ring-transparent group-hover:ring-[#2E3345] transition-all"
                        aria-label={`View photo for ${event.teachers?.name ?? 'Unknown'}`}
                        disabled={!event.photo_url}
                      >
                        {event.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={event.photo_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#5A6178]">
                            <span className="text-lg">👤</span>
                          </div>
                        )}
                      </button>

                      {/* Name + time */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#EAEDF3] truncate">
                          {event.teachers?.name ?? 'Unknown'}
                        </p>
                        <p className="text-xs text-[#5A6178] mt-0.5">
                          {formatTime(event.timestamp)}
                          <span className="mx-1">·</span>
                          {getRelativeTime(event.timestamp)}
                        </p>
                      </div>

                      {/* Badge */}
                      {event.action === 'in' ? (
                        <span className="inline-flex items-center gap-1.5 bg-[rgba(0,184,148,0.15)] text-[#00B894] text-xs font-semibold px-3 py-1 rounded-full flex-shrink-0">
                          <span className="w-1.5 h-1.5 bg-[#00B894] rounded-full" />
                          Clocked In
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 bg-[rgba(255,107,107,0.15)] text-[#FF6B6B] text-xs font-semibold px-3 py-1 rounded-full flex-shrink-0">
                          <span className="w-1.5 h-1.5 bg-[#FF6B6B] rounded-full" />
                          Clocked Out
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* WEEK VIEW */}
          {activeTab === 'week' && (
            <WeekView centerId={center.id} teachers={teachers} />
          )}

          {/* EXPORT */}
          {activeTab === 'export' && (
            <div className="p-6 space-y-5" data-tutorial="export">
              {/* Date range controls */}
              <div>
                <p className="text-sm font-semibold text-[#EAEDF3] mb-3">Date Range</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {(['today', 'week', 'lastweek', 'payperiod'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setQuickRange(type)}
                      className="px-4 py-2 rounded-full text-sm font-medium bg-[#242836] text-[#8B92A5] hover:bg-[#2E3345] hover:text-[#EAEDF3] transition-colors"
                    >
                      {type === 'today'
                        ? 'Today'
                        : type === 'week'
                        ? 'This Week'
                        : type === 'lastweek'
                        ? 'Last Week'
                        : 'This Pay Period'}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="date"
                      value={exportRange.start}
                      onChange={e =>
                        setExportRange(prev => ({ ...prev, start: e.target.value }))
                      }
                      className="px-3 py-2 bg-[#1A1D27] border border-[#2E3345] rounded-xl text-sm text-[#EAEDF3] focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] [color-scheme:dark]"
                    />
                    <span className="text-[#5A6178] text-sm">→</span>
                    <input
                      type="date"
                      value={exportRange.end}
                      onChange={e =>
                        setExportRange(prev => ({ ...prev, end: e.target.value }))
                      }
                      className="px-3 py-2 bg-[#1A1D27] border border-[#2E3345] rounded-xl text-sm text-[#EAEDF3] focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] [color-scheme:dark]"
                    />
                  </div>
                  <button
                    onClick={fetchExport}
                    className="px-5 py-2 bg-[#00B894] text-white rounded-xl text-sm font-semibold hover:bg-[#00A884] transition-colors"
                  >
                    Preview
                  </button>
                </div>
              </div>

              {exportLoading && (
                <div className="py-12 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-4 border-[#00B894] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-[#8B92A5]">Generating report…</p>
                </div>
              )}

              {exportData && !exportLoading && (
                <>
                  {/* Preview table */}
                  <div className="rounded-xl border border-[#2E3345] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[#1A1D27] border-b border-[#2E3345]">
                            <th className="sticky left-0 bg-[#1A1D27] text-left py-3 px-4 text-[#8B92A5] font-semibold">
                              Teacher
                            </th>
                            {exportData.dates.map((d: string) => (
                              <th
                                key={d}
                                className="text-center py-3 px-3 text-[#8B92A5] font-semibold whitespace-nowrap"
                              >
                                {new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'numeric',
                                  day: 'numeric',
                                })}
                              </th>
                            ))}
                            <th className="text-right py-3 px-4 text-[#8B92A5] font-semibold">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {exportData.teachers.map((row: ExportTeacherRow, i: number) => (
                            <tr
                              key={row.teacher}
                              className={`border-b border-[#2E3345] ${
                                i % 2 === 1 ? 'bg-[#171A23]' : 'bg-[#1A1D27]'
                              }`}
                            >
                              <td className="py-3 px-4 font-semibold text-[#EAEDF3]">
                                {row.teacher}
                              </td>
                              {exportData.dates.map((d: string) => {
                                const day = row.days[d]
                                return (
                                  <td key={d} className="text-center py-3 px-3">
                                    {day ? (
                                      <div>
                                        <div className="text-xs text-[#5A6178]">
                                          {day.clockIn} – {day.clockOut || '...'}
                                        </div>
                                        <div className="font-semibold text-[#EAEDF3] mt-0.5">
                                          {day.hours}h {day.minutes}m
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-[#2E3345] text-lg">—</span>
                                    )}
                                  </td>
                                )
                              })}
                              <td className="text-right py-3 px-4">
                                <span className="bg-[rgba(0,184,148,0.15)] text-[#00B894] font-bold px-3 py-1 rounded-full text-sm">
                                  {row.total}h
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-[#242836]">
                            <td
                              colSpan={exportData.dates.length + 2}
                              className="py-2 px-4 text-right text-xs text-[#5A6178]"
                            >
                              {exportData.teachers.length} staff · {exportData.dates.length} days
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Export buttons */}
                  <div className="flex flex-wrap gap-3 pt-2 border-t border-[#2E3345]">
                    <button
                      onClick={downloadCSV}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#00B894] text-white rounded-xl font-semibold hover:bg-[#00A884] transition-colors shadow-sm"
                    >
                      <span>📥</span>
                      <span>Download CSV</span>
                    </button>
                    <button
                      onClick={() => {
                        import('jspdf').then(({ default: jsPDF }) => {
                          import('jspdf-autotable').then(({ default: autoTable }) => {
                            if (!exportData || !center) return
                            const doc = new jsPDF()
                            doc.setFontSize(18)
                            doc.text('TIKTIK — Staff Hours Report', 14, 22)
                            doc.setFontSize(12)
                            doc.setTextColor(99, 110, 114)
                            doc.text(center.name, 14, 30)
                            doc.text(
                              `${exportRange.start} — ${exportRange.end}`,
                              14,
                              37
                            )

                            const headers = [
                              'Teacher',
                              ...exportData.dates.map((d: string) =>
                                new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'numeric',
                                  day: 'numeric',
                                })
                              ),
                              'Total',
                            ]

                            const rows = exportData.teachers.map(
                              (row: ExportTeacherRow) => [
                                row.teacher,
                                ...exportData.dates.map((d: string) => {
                                  const day = row.days[d]
                                  return day ? `${day.hours}h ${day.minutes}m` : '—'
                                }),
                                `${row.total}h`,
                              ]
                            )

                            autoTable(doc, {
                              head: [headers],
                              body: rows,
                              startY: 44,
                              styles: { fontSize: 9 },
                              headStyles: { fillColor: [0, 184, 148] },
                            })

                            doc.setFontSize(8)
                            doc.setTextColor(178, 190, 195)
                            doc.text(
                              `Generated ${new Date().toLocaleString()}`,
                              14,
                              doc.internal.pageSize.height - 10
                            )

                            doc.save(
                              `tiktik-hours-${exportRange.start}-to-${exportRange.end}.pdf`
                            )
                            showToast('PDF downloaded!')
                          })
                        })
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#242836] text-[#EAEDF3] border border-[#2E3345] rounded-xl font-semibold hover:bg-[#2E3345] transition-colors shadow-sm"
                    >
                      <span>📄</span>
                      <span>Download PDF</span>
                    </button>
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#242836] text-[#EAEDF3] border border-[#2E3345] rounded-xl font-semibold hover:bg-[#2E3345] transition-colors shadow-sm"
                    >
                      <span>📋</span>
                      <span>Copy to Clipboard</span>
                    </button>
                  </div>
                </>
              )}

              {!exportData && !exportLoading && (
                <div className="py-12 flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 bg-[#242836] rounded-2xl flex items-center justify-center text-3xl">
                    📊
                  </div>
                  <p className="font-semibold text-[#EAEDF3]">No data loaded yet</p>
                  <p className="text-sm text-[#5A6178]">
                    Select a date range above and click Preview.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* CAMERAS TAB */}
          {activeTab === 'cameras' && center && (
            <CameraTab centerId={center.id} showToast={showToast} />
          )}

          {/* STAFF TAB */}
          {activeTab === 'staff' && (
            <div className="p-6 space-y-5" data-tutorial="teachers">
              {/* Add teacher */}
              <div data-tutorial="add-teacher">
                <p className="text-sm font-semibold text-[#EAEDF3] mb-3">Add Staff Member</p>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newTeacherName}
                    onChange={e => setNewTeacherName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addTeacher()}
                    placeholder="Enter teacher name…"
                    className="flex-1 px-4 py-2.5 bg-[#1A1D27] border border-[#2E3345] rounded-xl text-sm text-[#EAEDF3] focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] placeholder-[#5A6178]"
                  />
                  <button
                    onClick={addTeacher}
                    disabled={!newTeacherName.trim()}
                    className="px-6 py-2.5 bg-[#00B894] text-white rounded-xl font-semibold hover:bg-[#00A884] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Staff cards grid */}
              {teachers.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 bg-[#242836] rounded-2xl flex items-center justify-center text-3xl">
                    👥
                  </div>
                  <p className="font-semibold text-[#EAEDF3]">No staff yet</p>
                  <p className="text-sm text-[#5A6178]">
                    Add your first team member above to get started.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {teachers.map(teacher => {
                    const isOnDuty = clockedInTeacherIds.has(teacher.id)
                    // Compute today's completed hours for this teacher
                    const teacherEvents = todayEvents.filter(
                      e => e.teacher_id === teacher.id
                    )
                    const sortedEvts = [...teacherEvents].sort(
                      (a, b) =>
                        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    )
                    let completedMins = 0
                    let lastIn: Date | null = null
                    for (const ev of sortedEvts) {
                      if (ev.action === 'in') {
                        lastIn = new Date(ev.timestamp)
                      } else if (ev.action === 'out' && lastIn) {
                        completedMins +=
                          (new Date(ev.timestamp).getTime() - lastIn.getTime()) / 60000
                        lastIn = null
                      }
                    }
                    if (lastIn) {
                      completedMins += (Date.now() - lastIn.getTime()) / 60000
                    }

                    return (
                      <div
                        key={teacher.id}
                        className="bg-[#1A1D27] rounded-2xl border border-[#2E3345] p-4 flex items-center gap-4"
                      >
                        {/* Color avatar */}
                        <div
                          className="w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-base shadow-sm"
                          style={{ backgroundColor: teacher.color }}
                        >
                          {teacher.name.charAt(0).toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[#EAEDF3] truncate">
                            {teacher.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {isOnDuty ? (
                              <span className="inline-flex items-center gap-1 bg-[rgba(0,184,148,0.15)] text-[#00B894] text-xs font-semibold px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 bg-[#00B894] rounded-full animate-pulse" />
                                On Duty
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-[#242836] text-[#5A6178] text-xs font-semibold px-2 py-0.5 rounded-full">
                                Off Duty
                              </span>
                            )}
                            {completedMins > 0 && (
                              <span className="text-xs text-[#8B92A5]">
                                {formatMinutes(completedMins)} today
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Enroll Face */}
                        <button
                          onClick={() => setEnrollingTeacher(teacher)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors flex-shrink-0 ${
                            (teacher as Teacher & { face_descriptors?: unknown[] }).face_descriptors?.length
                              ? 'bg-[rgba(0,184,148,0.15)] text-[#00B894] hover:bg-[rgba(0,184,148,0.25)]'
                              : 'bg-[rgba(255,159,67,0.15)] text-[#FF9F43] hover:bg-[rgba(255,159,67,0.25)]'
                          }`}
                          aria-label={`Enroll face for ${teacher.name}`}
                        >
                          {(teacher as Teacher & { face_descriptors?: unknown[] }).face_descriptors?.length
                            ? '🔓 Face Enrolled'
                            : '📷 Enroll Face'}
                        </button>

                        {/* Remove */}
                        <button
                          onClick={() => removeTeacher(teacher.id, teacher.name)}
                          className="text-[#5A6178] hover:text-[#FF6B6B] transition-colors text-lg flex-shrink-0"
                          aria-label={`Remove ${teacher.name}`}
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* iPad Clock-In Link */}
        <div className="rounded-2xl overflow-hidden shadow-sm">
          <div
            className="p-6"
            style={{
              background: 'linear-gradient(135deg, #00B894 0%, #00CEC9 100%)',
            }}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0">
                📱
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-base mb-0.5">
                  iPad Clock-In Screen
                </p>
                <p className="text-white/70 text-sm mb-3">
                  Bookmark this URL on your iPad for the staff clock-in kiosk.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white/20 text-white px-4 py-2.5 rounded-xl text-sm font-mono truncate backdrop-blur-sm">
                    {typeof window !== 'undefined'
                      ? `${window.location.origin}/c/${center.slug}/clockin`
                      : `/c/${center.slug}/clockin`}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/c/${center.slug}/clockin`
                      )
                      showToast('Link copied!')
                    }}
                    className="px-4 py-2.5 bg-white text-[#00B894] rounded-xl text-sm font-bold hover:bg-white/90 transition-colors flex-shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Photo lightbox modal */}
      {photoModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPhotoModal(null)}
        >
          <div
            className="bg-[#1A1D27] rounded-2xl overflow-hidden max-w-lg w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoModal.url} alt="" className="w-full aspect-video object-cover" />
            <div className="p-5 flex items-center justify-between">
              <div>
                <p className="font-bold text-[#EAEDF3] text-base">{photoModal.name}</p>
                <p
                  className={`text-sm font-medium mt-0.5 ${
                    photoModal.action === 'in' ? 'text-[#00B894]' : 'text-[#FF6B6B]'
                  }`}
                >
                  Clocked {photoModal.action === 'in' ? 'In' : 'Out'} at {photoModal.time}
                </p>
              </div>
              <button
                onClick={() => setPhotoModal(null)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-[#242836] text-[#8B92A5] hover:bg-[#2E3345] transition-colors font-medium"
                aria-label="Close photo"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-[#242836] rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#EAEDF3]">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1A1D27] text-[#8B92A5] hover:bg-[#2E3345] transition-colors"
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#8B92A5] mb-1.5">
                Center Name
              </label>
              <input
                value={settingsForm.name}
                onChange={e => setSettingsForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-4 py-2.5 bg-[#1A1D27] border border-[#2E3345] rounded-xl text-sm text-[#EAEDF3] focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#8B92A5] mb-1.5">
                Director Name
              </label>
              <input
                value={settingsForm.director_name}
                onChange={e =>
                  setSettingsForm(prev => ({ ...prev, director_name: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-[#1A1D27] border border-[#2E3345] rounded-xl text-sm text-[#EAEDF3] focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#8B92A5] mb-1.5">
                Email
              </label>
              <input
                value={settingsForm.email}
                onChange={e =>
                  setSettingsForm(prev => ({ ...prev, email: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-[#1A1D27] border border-[#2E3345] rounded-xl text-sm text-[#EAEDF3] focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894]"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={saveSettings}
                className="flex-1 px-5 py-2.5 bg-[#00B894] text-white rounded-xl font-semibold hover:bg-[#00A884] transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="px-5 py-2.5 bg-[#1A1D27] text-[#8B92A5] rounded-xl font-semibold hover:bg-[#2E3345] transition-colors"
              >
                Cancel
              </button>
            </div>

            <hr className="border-[#2E3345]" />

            <div>
              <p className="text-xs font-semibold text-[#5A6178] uppercase tracking-wider mb-3">
                Danger Zone
              </p>
              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="text-sm text-[#FF6B6B] hover:text-[#e55b5b] font-medium transition-colors"
                >
                  Delete All Data
                </button>
              ) : (
                <div className="bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.2)] p-4 rounded-xl">
                  <p className="text-sm text-[#FF6B6B] font-semibold mb-3">
                    Are you absolutely sure? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-[#FF6B6B] text-white rounded-lg text-sm font-semibold hover:bg-[#e55b5b] transition-colors">
                      Yes, Delete Everything
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      className="px-4 py-2 bg-[#1A1D27] border border-[#2E3345] rounded-lg text-sm font-medium text-[#8B92A5] hover:bg-[#2E3345] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tutorial */}
      {showTutorial && (
        <TutorialOverlay onComplete={completeTutorial} centerSlug={center.slug} />
      )}

      {/* Face Enrollment Modal */}
      {enrollingTeacher && center && (
        <FaceEnrollModal
          teacher={enrollingTeacher}
          centerId={center.id}
          onComplete={() => {
            setEnrollingTeacher(null)
            fetchTeachers()
            showToast(`${enrollingTeacher.name}'s face enrolled!`)
          }}
          onClose={() => setEnrollingTeacher(null)}
        />
      )}

      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.25s ease-out;
        }
      `}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WeekView — inline component
// ---------------------------------------------------------------------------

interface WeekViewProps {
  centerId: string
  teachers: Teacher[]
}

function WeekView({ centerId }: WeekViewProps) {
  const [weekData, setWeekData] = useState<ExportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    const day = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
    const friday = new Date(monday)
    friday.setDate(monday.getDate() + 4)

    const startDate = getDateString(monday)
    const endDate = getDateString(friday)

    fetch(`/api/export?center_id=${centerId}&start_date=${startDate}&end_date=${endDate}`)
      .then(res => res.json())
      .then(data => {
        setWeekData(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [centerId])

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-[#00B894] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#8B92A5]">Loading week view…</p>
      </div>
    )
  }

  if (!weekData) return null

  // Compute totals per teacher — filter null days to prevent crash
  const teacherTotals: Record<string, number> = {}
  for (const row of weekData.teachers) {
    let mins = 0
    for (const day of Object.values(row.days).filter(Boolean) as ExportDay[]) {
      mins += day.hours * 60 + day.minutes
    }
    teacherTotals[row.teacher] = mins
  }

  return (
    <div>
      <div className="px-6 py-4 border-b border-[#2E3345]">
        <p className="text-sm text-[#8B92A5]">
          Week of{' '}
          <span className="font-semibold text-[#EAEDF3]">
            {weekData.dates.length > 0
              ? new Date(weekData.dates[0] + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                })
              : '—'}
          </span>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#1A1D27] border-b border-[#2E3345]">
              <th className="text-left py-3 px-5 text-[#8B92A5] font-semibold">Staff</th>
              {weekData.dates.map((d: string) => {
                const date = new Date(d + 'T00:00:00')
                const isToday = getDateString() === d
                return (
                  <th
                    key={d}
                    className={`text-center py-3 px-3 font-semibold ${
                      isToday ? 'text-[#00B894]' : 'text-[#8B92A5]'
                    }`}
                  >
                    <div>{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className="text-xs font-normal mt-0.5">
                      {date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                    </div>
                  </th>
                )
              })}
              <th className="text-right py-3 px-5 text-[#8B92A5] font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {weekData.teachers.map((row: ExportTeacherRow, i: number) => (
              <tr
                key={row.teacher}
                className={`border-b border-[#2E3345] ${
                  i % 2 === 1 ? 'bg-[#171A23]' : 'bg-[#1A1D27]'
                }`}
              >
                <td className="py-3.5 px-5 font-semibold text-[#EAEDF3]">{row.teacher}</td>
                {weekData.dates.map((d: string) => {
                  const day = row.days[d]
                  return (
                    <td key={d} className="text-center py-3.5 px-3">
                      {day ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1 bg-[rgba(0,184,148,0.15)] text-[#00B894] text-xs font-semibold px-2.5 py-1 rounded-full">
                            {day.hours}h {day.minutes}m
                          </span>
                          <span className="text-xs text-[#5A6178]">
                            {day.clockIn}–{day.clockOut || '…'}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center justify-center w-7 h-7 bg-[rgba(255,107,107,0.1)] text-[#FF6B6B] rounded-full text-xs font-bold">
                          –
                        </span>
                      )}
                    </td>
                  )
                })}
                <td className="text-right py-3.5 px-5">
                  <span className="bg-[#242836] text-[#EAEDF3] font-bold px-3 py-1 rounded-full text-xs">
                    {row.total}h
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          {weekData.teachers.length > 0 && (
            <tfoot>
              <tr className="bg-[#1A1D27] border-t-2 border-[#2E3345]">
                <td className="py-3 px-5 text-xs font-bold text-[#5A6178] uppercase tracking-wider">
                  Summary
                </td>
                {weekData.dates.map((d: string) => {
                  const dayTotal = weekData.teachers.reduce((sum, row) => {
                    const day = row.days[d]
                    return sum + (day ? day.hours * 60 + day.minutes : 0)
                  }, 0)
                  return (
                    <td key={d} className="text-center py-3 px-3">
                      {dayTotal > 0 ? (
                        <span className="text-xs font-semibold text-[#8B92A5]">
                          {Math.floor(dayTotal / 60)}h {dayTotal % 60}m
                        </span>
                      ) : (
                        <span className="text-[#2E3345] text-xs">—</span>
                      )}
                    </td>
                  )
                })}
                <td className="text-right py-3 px-5">
                  <span className="text-xs font-bold text-[#00B894]">
                    {formatMinutes(
                      weekData.teachers.reduce(
                        (sum, row) => sum + (teacherTotals[row.teacher] ?? 0),
                        0
                      )
                    )}
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
