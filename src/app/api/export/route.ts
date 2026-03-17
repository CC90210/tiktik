import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { calculateHoursWorked, formatTime } from '@/lib/utils'

interface DaySummary {
  clockIn: string | null
  clockOut: string | null
  hours: number
  minutes: number
  decimal: number
}

interface TeacherExportRow {
  teacher: string
  days: Record<string, DaySummary | null>
  total: number
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const centerId = request.nextUrl.searchParams.get('center_id')
    const startDate = request.nextUrl.searchParams.get('start_date')
    const endDate = request.nextUrl.searchParams.get('end_date')
    const format = request.nextUrl.searchParams.get('format') || 'json'

    if (!centerId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'center_id, start_date, end_date required' },
        { status: 400 }
      )
    }

    // Get teachers ordered by name for consistent export ordering
    const { data: teachers } = await supabase
      .from('teachers')
      .select('*')
      .eq('center_id', centerId)
      .order('name')

    // Get all events in the requested date range
    const { data: events } = await supabase
      .from('clock_events')
      .select('*')
      .eq('center_id', centerId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('timestamp', { ascending: true })

    // Build contiguous date range
    const dates: string[] = []
    const current = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T00:00:00')
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0])
      current.setDate(current.getDate() + 1)
    }

    // Aggregate hours per teacher per day
    const exportData: TeacherExportRow[] = (teachers || []).map((teacher) => {
      const row: TeacherExportRow = { teacher: teacher.name, days: {}, total: 0 }

      for (const date of dates) {
        const dayEvents = (events || []).filter(
          (e) => e.teacher_id === teacher.id && e.date === date
        )

        if (dayEvents.length === 0) {
          row.days[date] = null
          continue
        }

        const { hours, minutes, decimal } = calculateHoursWorked(dayEvents)

        const firstIn = dayEvents.find((e) => e.action === 'in')
        const lastOut = [...dayEvents].reverse().find((e) => e.action === 'out')

        row.days[date] = {
          clockIn: firstIn ? formatTime(firstIn.timestamp) : null,
          clockOut: lastOut ? formatTime(lastOut.timestamp) : null,
          hours,
          minutes,
          decimal,
        }
        row.total += decimal
      }

      row.total = Math.round(row.total * 100) / 100
      return row
    })

    if (format === 'csv') {
      let csv = 'Teacher,Date,Clock In,Clock Out,Hours\n'
      for (const row of exportData) {
        for (const date of dates) {
          const day = row.days[date]
          if (day) {
            csv += `${row.teacher},${date},${day.clockIn ?? ''},${day.clockOut ?? ''},${day.decimal}\n`
          }
        }
      }
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename=tiktik-hours-${startDate}-to-${endDate}.csv`,
        },
      })
    }

    return NextResponse.json({ teachers: exportData, dates, startDate, endDate })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
