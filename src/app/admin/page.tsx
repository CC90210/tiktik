'use client'

import { useState, useEffect, useCallback } from 'react'
import { Center, Teacher } from '@/lib/types'
import { formatTime, getDateString, getPayPeriodDates } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import TutorialOverlay from './TutorialOverlay'

interface ClockEventRow {
  id: string
  teacher_id: string
  action: 'in' | 'out'
  photo_url: string | null
  timestamp: string
  teachers?: { name: string }
}

interface ExportDay {
  clockIn: string
  clockOut: string
  hours: number
  minutes: number
  decimal: number
}

interface ExportTeacherRow {
  teacher: string
  days: Record<string, ExportDay>
  total: string
}

interface ExportData {
  dates: string[]
  teachers: ExportTeacherRow[]
}

export default function AdminPage() {
  const router = useRouter()
  const [center, setCenter] = useState<Center | null>(null)
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [todayEvents, setTodayEvents] = useState<ClockEventRow[]>([])
  const [newTeacherName, setNewTeacherName] = useState('')
  const [showTutorial, setShowTutorial] = useState(false)
  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'export'>('today')
  const [exportRange, setExportRange] = useState<{ start: string; end: string }>(() => {
    const { start, end } = getPayPeriodDates()
    return { start: getDateString(start), end: getDateString(end) }
  })
  const [exportData, setExportData] = useState<ExportData | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string; action: string; time: string } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState({ name: '', director_name: '', email: '' })
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

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
        setSettingsForm({ name: data.name, director_name: data.director_name, email: data.email })
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
    const res = await fetch(`/api/clock-events?center_id=${center.id}&date=${getDateString()}`)
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
    await fetch('/api/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTeacherName.trim(), center_id: center.id }),
    })
    setNewTeacherName('')
    fetchTeachers()
    showToast(`${newTeacherName.trim()} added!`)
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
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
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
        start.setDate(now.getDate() - day + 1) // Monday
        end = now
        break
      }
      case 'lastweek': {
        const day = now.getDay()
        end = new Date(now)
        end.setDate(now.getDate() - day) // Last Sunday
        start = new Date(end)
        start.setDate(end.getDate() - 6) // Last Monday
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

  // Currently clocked in count
  const clockedInCount = todayEvents.reduce(
    (acc, event) => {
      if (!acc.seen.has(event.teacher_id)) {
        acc.seen.add(event.teacher_id)
        if (event.action === 'in') acc.count++
      }
      return acc
    },
    { count: 0, seen: new Set<string>() }
  ).count

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center">
        <div className="animate-pulse text-xl text-[#636E72]">Loading...</div>
      </div>
    )
  }

  if (!center) return null

  return (
    <div className="min-h-screen bg-[#F8F9FC]">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[60] bg-[#00B894] text-white px-6 py-3 rounded-xl shadow-lg animate-fade-in font-medium">
          {toast}
        </div>
      )}

      {/* Top bar */}
      <header className="bg-white border-b border-[#E9EEF2] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">
            <span className="text-[#00B894]">TIK</span>
            <span className="text-[#2D3436]">TIK</span>
            <span className="text-[#B2BEC3] font-normal ml-2">Admin</span>
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-[#2D3436]">{center.name}</p>
              <p className="text-xs text-[#636E72]">{center.director_name}</p>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="w-10 h-10 rounded-full bg-[#F1F2F6] flex items-center justify-center hover:bg-[#E9EEF2] transition-colors"
              aria-label="Open settings"
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Tab navigation */}
        <div className="flex gap-2">
          {(['today', 'week', 'export'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab)
                if (tab === 'export') fetchExport()
              }}
              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                activeTab === tab
                  ? 'bg-[#00B894] text-white shadow-md'
                  : 'bg-white text-[#636E72] hover:bg-[#F1F2F6] border border-[#E9EEF2]'
              }`}
            >
              {tab === 'today' ? "Today's Log" : tab === 'week' ? 'Week View' : 'Export'}
            </button>
          ))}
        </div>

        {/* TODAY'S LOG */}
        {activeTab === 'today' && (
          <div className="bg-white rounded-2xl border border-[#E9EEF2] overflow-hidden" data-tutorial="today-log">
            <div className="px-6 py-4 border-b border-[#E9EEF2]">
              <p className="text-sm text-[#636E72]">
                <span className="font-bold text-[#00B894] text-lg">{clockedInCount}</span>{' '}
                teacher{clockedInCount !== 1 ? 's' : ''} on duty right now
              </p>
            </div>
            <div className="divide-y divide-[#F1F2F6]">
              {todayEvents.length === 0 ? (
                <div className="px-6 py-12 text-center text-[#B2BEC3]">
                  No clock events today yet
                </div>
              ) : (
                todayEvents.map((event: ClockEventRow) => (
                  <div
                    key={event.id}
                    className="px-6 py-3 flex items-center gap-4 hover:bg-[#F8F9FC] transition-colors"
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
                      className="w-10 h-10 rounded-full overflow-hidden bg-[#F1F2F6] flex-shrink-0"
                      aria-label={`View photo for ${event.teachers?.name ?? 'Unknown'}`}
                    >
                      {event.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={event.photo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#B2BEC3] text-xs">
                          📷
                        </div>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#2D3436]">{event.teachers?.name ?? 'Unknown'}</p>
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        event.action === 'in' ? 'text-[#00B894]' : 'text-[#FF6B6B]'
                      }`}
                    >
                      Clocked {event.action === 'in' ? 'In' : 'Out'}
                    </span>
                    <span className="text-sm text-[#636E72] w-20 text-right">
                      {formatTime(event.timestamp)}
                    </span>
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
          <div
            className="bg-white rounded-2xl border border-[#E9EEF2] p-6 space-y-4"
            data-tutorial="export"
          >
            <div className="flex flex-wrap gap-2 items-center">
              {(['today', 'week', 'lastweek', 'payperiod'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setQuickRange(type)}
                  className="px-4 py-2 rounded-full text-sm bg-[#F1F2F6] text-[#636E72] hover:bg-[#E9EEF2] transition-colors"
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
              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="date"
                  value={exportRange.start}
                  onChange={e => setExportRange(prev => ({ ...prev, start: e.target.value }))}
                  className="px-3 py-2 border border-[#E9EEF2] rounded-lg text-sm"
                />
                <span className="text-[#B2BEC3]">to</span>
                <input
                  type="date"
                  value={exportRange.end}
                  onChange={e => setExportRange(prev => ({ ...prev, end: e.target.value }))}
                  className="px-3 py-2 border border-[#E9EEF2] rounded-lg text-sm"
                />
                <button
                  onClick={fetchExport}
                  className="px-4 py-2 bg-[#00B894] text-white rounded-lg text-sm font-medium hover:bg-[#00A884] transition-colors"
                >
                  Preview
                </button>
              </div>
            </div>

            {exportLoading && (
              <div className="py-8 text-center text-[#636E72]">Loading...</div>
            )}

            {exportData && !exportLoading && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E9EEF2]">
                        <th className="text-left py-3 px-3 text-[#636E72] font-medium">Teacher</th>
                        {exportData.dates.map((d: string) => (
                          <th key={d} className="text-center py-3 px-2 text-[#636E72] font-medium">
                            {new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'numeric',
                              day: 'numeric',
                            })}
                          </th>
                        ))}
                        <th className="text-right py-3 px-3 text-[#636E72] font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exportData.teachers.map((row: ExportTeacherRow, i: number) => (
                        <tr key={row.teacher} className={i % 2 === 0 ? 'bg-[#F8F9FC]' : ''}>
                          <td className="py-3 px-3 font-medium text-[#2D3436]">{row.teacher}</td>
                          {exportData.dates.map((d: string) => {
                            const day = row.days[d]
                            return (
                              <td key={d} className="text-center py-3 px-2 text-[#636E72]">
                                {day ? (
                                  <div>
                                    <div className="text-xs">
                                      {day.clockIn} – {day.clockOut || '...'}
                                    </div>
                                    <div className="font-medium text-[#2D3436]">
                                      {day.hours}h {day.minutes}m
                                    </div>
                                  </div>
                                ) : (
                                  '—'
                                )}
                              </td>
                            )
                          })}
                          <td className="text-right py-3 px-3 font-bold text-[#2D3436]">
                            {row.total}h
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3 pt-4 border-t border-[#E9EEF2]">
                  <button
                    onClick={downloadCSV}
                    className="px-5 py-2.5 bg-[#00B894] text-white rounded-xl font-medium hover:bg-[#00A884] transition-colors"
                  >
                    Download CSV
                  </button>
                  <button
                    onClick={() => {
                      // Dynamic import keeps jspdf out of the main bundle
                      import('jspdf').then(({ default: jsPDF }) => {
                        import('jspdf-autotable').then(({ default: autoTable }) => {
                          if (!exportData || !center) return
                          const doc = new jsPDF()
                          doc.setFontSize(18)
                          doc.text('TIKTIK — Staff Hours Report', 14, 22)
                          doc.setFontSize(12)
                          doc.setTextColor(99, 110, 114)
                          doc.text(center.name, 14, 30)
                          doc.text(`${exportRange.start} — ${exportRange.end}`, 14, 37)

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

                          const rows = exportData.teachers.map((row: ExportTeacherRow) => [
                            row.teacher,
                            ...exportData.dates.map((d: string) => {
                              const day = row.days[d]
                              return day ? `${day.hours}h ${day.minutes}m` : '—'
                            }),
                            `${row.total}h`,
                          ])

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
                    className="px-5 py-2.5 bg-white text-[#2D3436] border border-[#E9EEF2] rounded-xl font-medium hover:bg-[#F1F2F6] transition-colors"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={copyToClipboard}
                    className="px-5 py-2.5 bg-white text-[#2D3436] border border-[#E9EEF2] rounded-xl font-medium hover:bg-[#F1F2F6] transition-colors"
                  >
                    Copy to Clipboard
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* TEACHERS SECTION */}
        <div className="bg-white rounded-2xl border border-[#E9EEF2] p-6" data-tutorial="teachers">
          <h2 className="text-lg font-bold text-[#2D3436] mb-4">Teachers</h2>

          {/* Add teacher form */}
          <div className="flex gap-3 mb-4" data-tutorial="add-teacher">
            <input
              type="text"
              value={newTeacherName}
              onChange={e => setNewTeacherName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTeacher()}
              placeholder="Teacher name..."
              className="flex-1 px-4 py-2.5 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894]"
            />
            <button
              onClick={addTeacher}
              disabled={!newTeacherName.trim()}
              className="px-6 py-2.5 bg-[#00B894] text-white rounded-xl font-medium hover:bg-[#00A884] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              + Add
            </button>
          </div>

          {/* Teacher list */}
          <div className="space-y-2">
            {teachers.map(teacher => (
              <div
                key={teacher.id}
                className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-[#F8F9FC] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: teacher.color }}
                  />
                  <span className="font-medium text-[#2D3436]">{teacher.name}</span>
                </div>
                <button
                  onClick={() => removeTeacher(teacher.id, teacher.name)}
                  className="text-sm text-[#FF6B6B] hover:text-[#e55b5b] font-medium transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
            {teachers.length === 0 && (
              <p className="text-center text-[#B2BEC3] py-4">
                No teachers yet. Add your first teacher above!
              </p>
            )}
          </div>
        </div>

        {/* iPad link */}
        <div className="bg-white rounded-2xl border border-[#E9EEF2] p-6">
          <h2 className="text-lg font-bold text-[#2D3436] mb-2">iPad Clock-In Screen</h2>
          <p className="text-sm text-[#636E72] mb-3">
            Open this link on your iPad and bookmark it for the clock-in screen:
          </p>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-[#F1F2F6] px-4 py-2.5 rounded-xl text-sm text-[#2D3436] font-mono">
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
              className="px-4 py-2.5 bg-[#F1F2F6] rounded-xl text-sm font-medium hover:bg-[#E9EEF2] transition-colors"
            >
              Copy
            </button>
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
            className="bg-white rounded-2xl overflow-hidden max-w-lg w-full"
            onClick={e => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoModal.url} alt="" className="w-full aspect-video object-cover" />
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-bold text-[#2D3436]">{photoModal.name}</p>
                <p
                  className={`text-sm ${
                    photoModal.action === 'in' ? 'text-[#00B894]' : 'text-[#FF6B6B]'
                  }`}
                >
                  Clocked {photoModal.action === 'in' ? 'In' : 'Out'} at {photoModal.time}
                </p>
              </div>
              <button
                onClick={() => setPhotoModal(null)}
                className="text-[#B2BEC3] hover:text-[#636E72]"
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
            className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#2D3436]">Settings</h2>
            <div>
              <label className="block text-sm font-medium text-[#636E72] mb-1">Center Name</label>
              <input
                value={settingsForm.name}
                onChange={e => setSettingsForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-4 py-2.5 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#636E72] mb-1">
                Director Name
              </label>
              <input
                value={settingsForm.director_name}
                onChange={e =>
                  setSettingsForm(prev => ({ ...prev, director_name: e.target.value }))
                }
                className="w-full px-4 py-2.5 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#636E72] mb-1">Email</label>
              <input
                value={settingsForm.email}
                onChange={e => setSettingsForm(prev => ({ ...prev, email: e.target.value }))}
                className="w-full px-4 py-2.5 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={saveSettings}
                className="px-5 py-2.5 bg-[#00B894] text-white rounded-xl font-medium flex-1"
              >
                Save
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="px-5 py-2.5 bg-[#F1F2F6] rounded-xl font-medium"
              >
                Cancel
              </button>
            </div>
            <hr className="border-[#E9EEF2]" />
            <div>
              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="text-sm text-[#FF6B6B] hover:text-[#e55b5b]"
                >
                  Delete All Data
                </button>
              ) : (
                <div className="bg-[#FF6B6B]/10 p-3 rounded-xl">
                  <p className="text-sm text-[#FF6B6B] font-medium mb-2">
                    Are you absolutely sure? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-[#FF6B6B] text-white rounded-lg text-sm font-medium">
                      Yes, Delete Everything
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      className="px-4 py-2 bg-white border rounded-lg text-sm"
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

      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WeekView — inline component, lives in this file only
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
    return <div className="py-8 text-center text-[#636E72]">Loading week view...</div>
  }

  if (!weekData) return null

  return (
    <div className="bg-white rounded-2xl border border-[#E9EEF2] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E9EEF2] bg-[#F8F9FC]">
              <th className="text-left py-3 px-4 text-[#636E72] font-medium">Teacher</th>
              {weekData.dates.map((d: string) => (
                <th key={d} className="text-center py-3 px-3 text-[#636E72] font-medium">
                  {new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weekData.teachers.map((row: ExportTeacherRow, i: number) => (
              <tr key={row.teacher} className={i % 2 === 0 ? '' : 'bg-[#F8F9FC]'}>
                <td className="py-3 px-4 font-medium text-[#2D3436]">{row.teacher}</td>
                {weekData.dates.map((d: string) => {
                  const day = row.days[d]
                  return (
                    <td key={d} className="text-center py-3 px-3">
                      {day ? (
                        <span className="text-[#00B894]">
                          ✅ {day.hours}h {day.minutes}m
                        </span>
                      ) : (
                        <span className="text-[#FF6B6B]">❌</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
