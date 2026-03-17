import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getDateString } from '@/lib/utils'
import type { TeacherStatus } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    // Service role used here — kiosk reads status without an authenticated session
    const supabase = await createServiceRoleClient()
    const centerId = request.nextUrl.searchParams.get('center_id')

    if (!centerId) {
      return NextResponse.json({ error: 'center_id required' }, { status: 400 })
    }

    // Get all teachers for this center
    const { data: teachers, error: teacherError } = await supabase
      .from('teachers')
      .select('*')
      .eq('center_id', centerId)
      .order('created_at', { ascending: true })

    if (teacherError) return NextResponse.json({ error: teacherError.message }, { status: 500 })

    // Get today's events
    const today = getDateString()
    const { data: events, error: eventError } = await supabase
      .from('clock_events')
      .select('*')
      .eq('center_id', centerId)
      .eq('date', today)
      .order('timestamp', { ascending: false })

    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })

    // Build teacher status — most recent event per teacher determines clocked-in state
    const statuses: TeacherStatus[] = (teachers || []).map((teacher) => {
      const teacherEvents = (events || []).filter((e) => e.teacher_id === teacher.id)
      const lastEvent = teacherEvents[0] ?? null

      return {
        ...teacher,
        is_clocked_in: lastEvent?.action === 'in',
        last_event_time: lastEvent?.timestamp ?? null,
        last_event_action: lastEvent?.action ?? null,
      }
    })

    return NextResponse.json(statuses)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
