'use client'

import { useState, useEffect, useCallback } from 'react'
import { TeacherStatus } from '@/lib/types'
import { formatTime } from '@/lib/utils'
import CameraModal from './CameraModal'

interface CenterInfo {
  id: string
  name: string
  slug: string
}

export default function ClockInPage({ params }: { params: { slug: string } }) {
  const { slug } = params
  const [center, setCenter] = useState<CenterInfo | null>(null)
  const [teachers, setTeachers] = useState<TeacherStatus[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch center by slug
  useEffect(() => {
    fetch(`/api/center/by-slug?slug=${slug}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setCenter(data)
      })
      .catch(() => setError('Failed to load center'))
  }, [slug])

  // Fetch teacher statuses
  const fetchStatuses = useCallback(async () => {
    if (!center) return
    try {
      const res = await fetch(`/api/clock-events/status?center_id=${center.id}`)
      const data = await res.json()
      if (Array.isArray(data)) setTeachers(data)
    } catch {
      // Silently retry on next poll
    } finally {
      setLoading(false)
    }
  }, [center])

  useEffect(() => {
    fetchStatuses()
    const interval = setInterval(fetchStatuses, 10000)
    return () => clearInterval(interval)
  }, [fetchStatuses])

  // Update clock every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  const handleClockEvent = async (teacher: TeacherStatus, photoBase64: string) => {
    const action = teacher.is_clocked_in ? 'out' : 'in'
    await fetch('/api/clock-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacher_id: teacher.id,
        center_id: center!.id,
        action,
        photo_base64: photoBase64,
      }),
    })
    await fetchStatuses()
    setSelectedTeacher(null)
  }

  // Grid layout based on teacher count
  const getGridClass = (count: number) => {
    if (count <= 4) return 'grid-cols-2'
    if (count <= 9) return 'grid-cols-3'
    return 'grid-cols-4'
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-6">🏫</div>
          <h1 className="text-3xl font-bold text-[#2D3436] mb-3">Center Not Found</h1>
          <p className="text-[#636E72] text-lg">{error}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#00B894] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#636E72] text-xl font-medium">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#F8F9FC] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-5 bg-white border-b border-[#E9EEF2] shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-[#00B894]">TIK</span>
            <span className="text-[#2D3436]">TIK</span>
          </h1>
          {center && (
            <>
              <span className="text-[#B2BEC3] text-xl font-light">|</span>
              <span className="text-[#636E72] text-lg font-medium">{center.name}</span>
            </>
          )}
        </div>
        <div className="text-2xl font-semibold text-[#2D3436] tabular-nums">
          {currentTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })}
        </div>
      </div>

      {/* Teacher grid */}
      <div className={`flex-1 grid ${getGridClass(teachers.length)} gap-4 p-6 content-start`}>
        {teachers.map((teacher) => (
          <TeacherBubble
            key={teacher.id}
            teacher={teacher}
            onClick={() => setSelectedTeacher(teacher)}
          />
        ))}

        {teachers.length === 0 && (
          <div className="col-span-full flex items-center justify-center h-full">
            <div className="text-center text-[#B2BEC3]">
              <div className="text-6xl mb-4">👩‍🏫</div>
              <p className="text-2xl font-semibold mb-2">No teachers added yet</p>
              <p className="text-lg">Add teachers from the admin dashboard</p>
            </div>
          </div>
        )}
      </div>

      {/* Camera Modal */}
      {selectedTeacher && (
        <CameraModal
          teacher={selectedTeacher}
          onCapture={(photo) => handleClockEvent(selectedTeacher, photo)}
          onClose={() => setSelectedTeacher(null)}
        />
      )}

      <style jsx global>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 currentColor; }
          50%       { box-shadow: 0 0 24px 4px var(--glow-color); }
        }
        .teacher-bubble-in {
          animation: pulse-glow 2.4s ease-in-out infinite;
        }

        @keyframes press-bounce {
          0%   { transform: scale(1); }
          40%  { transform: scale(0.94); }
          70%  { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
        .teacher-bubble-active:active {
          animation: press-bounce 0.35s ease forwards;
        }
      `}</style>
    </div>
  )
}

// ─── TeacherBubble ────────────────────────────────────────────────────────────

interface TeacherBubbleProps {
  teacher: TeacherStatus
  onClick: () => void
}

function TeacherBubble({ teacher, onClick }: TeacherBubbleProps) {
  const isIn = teacher.is_clocked_in

  return (
    <button
      onClick={onClick}
      className={`
        teacher-bubble-active
        rounded-2xl flex flex-col items-center justify-center
        min-h-[140px] select-none
        transition-all duration-200 ease-out
        focus:outline-none focus:ring-4 focus:ring-offset-2
        ${isIn
          ? 'text-white shadow-lg hover:brightness-105 teacher-bubble-in'
          : 'bg-[#F1F2F6] text-[#2D3436] hover:bg-[#E8EAED] shadow-sm hover:shadow-md'
        }
      `}
      style={
        isIn
          ? {
              backgroundColor: teacher.color,
              ['--glow-color' as string]: `${teacher.color}66`,
            }
          : undefined
      }
    >
      <span className="text-2xl md:text-3xl lg:text-4xl font-bold mb-2 px-4 text-center leading-tight">
        {teacher.name}
      </span>
      <span
        className={`text-sm md:text-base font-medium px-3 py-1 rounded-full ${
          isIn
            ? 'bg-white/20 text-white'
            : 'bg-[#E1E4E8] text-[#636E72]'
        }`}
      >
        {isIn
          ? `In since ${formatTime(teacher.last_event_time!)}`
          : 'Tap to clock in'}
      </span>
    </button>
  )
}
