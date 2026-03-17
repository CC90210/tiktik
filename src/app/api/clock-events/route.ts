import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getDateString } from '@/lib/utils'

export async function POST(request: NextRequest) {
  try {
    // Service role used here — clock-in kiosk (iPad) operates without an authenticated session
    const supabase = await createServiceRoleClient()
    const { teacher_id, center_id, action, photo_base64 } = await request.json()

    if (!teacher_id || !center_id || !action) {
      return NextResponse.json(
        { error: 'teacher_id, center_id, and action required' },
        { status: 400 }
      )
    }

    let photo_url: string | null = null

    // Upload photo to Supabase Storage if provided
    if (photo_base64) {
      const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      const fileName = `${center_id}/${teacher_id}/${Date.now()}.jpg`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('clock-photos')
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: false,
        })

      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage
          .from('clock-photos')
          .getPublicUrl(fileName)
        photo_url = urlData.publicUrl
      }
    }

    const now = new Date()
    const { data, error } = await supabase
      .from('clock_events')
      .insert({
        teacher_id,
        center_id,
        action,
        photo_url,
        timestamp: now.toISOString(),
        date: getDateString(now),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    // Service role used here — kiosk reads events without an authenticated session
    const supabase = await createServiceRoleClient()
    const centerId = request.nextUrl.searchParams.get('center_id')
    const date = request.nextUrl.searchParams.get('date') || getDateString()
    const startDate = request.nextUrl.searchParams.get('start_date')
    const endDate = request.nextUrl.searchParams.get('end_date')

    if (!centerId) {
      return NextResponse.json({ error: 'center_id required' }, { status: 400 })
    }

    let query = supabase
      .from('clock_events')
      .select('*, teachers(name, color)')
      .eq('center_id', centerId)
      .order('timestamp', { ascending: false })

    if (startDate && endDate) {
      query = query.gte('date', startDate).lte('date', endDate)
    } else {
      query = query.eq('date', date)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
