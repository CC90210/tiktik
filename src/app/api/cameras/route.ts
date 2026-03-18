import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Columns returned to the frontend — rtsp_password is intentionally excluded
const CAMERA_SELECT =
  'id, center_id, name, location, rtsp_url, rtsp_username, channel, subtype, enabled, proxy_stream_name, created_at'

function buildProxyStreamName(centerId: string, channel: number): string {
  // e.g. center_abc123_cam_1  (UUIDs contain hyphens — replace for safe stream names)
  const safeId = centerId.replace(/-/g, '')
  return `center_${safeId}_cam_${channel}`
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: center, error: centerError } = await supabase
      .from('centers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (centerError || !center) {
      return NextResponse.json({ error: 'Center not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('cameras')
      .select(CAMERA_SELECT)
      .eq('center_id', center.id)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: center, error: centerError } = await supabase
      .from('centers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (centerError || !center) {
      return NextResponse.json({ error: 'Center not found' }, { status: 404 })
    }

    const { name, location, rtsp_url, rtsp_username, rtsp_password, channel, subtype } =
      await request.json()

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const channelNumber = channel ?? 1
    const proxy_stream_name = buildProxyStreamName(center.id, channelNumber)

    const { data, error } = await supabase
      .from('cameras')
      .insert({
        center_id: center.id,
        name,
        location: location ?? null,
        rtsp_url: rtsp_url ?? null,
        rtsp_username: rtsp_username ?? null,
        rtsp_password: rtsp_password ?? null,
        channel: channelNumber,
        subtype: subtype ?? 0,
        proxy_stream_name,
        enabled: true,
      })
      .select(CAMERA_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, rtsp_password, ...rest } = await request.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // Verify the camera belongs to this user's center before updating
    const { data: center, error: centerError } = await supabase
      .from('centers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (centerError || !center) {
      return NextResponse.json({ error: 'Center not found' }, { status: 404 })
    }

    // Build update payload — only include rtsp_password when it is a non-empty string
    const updates: Record<string, unknown> = { ...rest }
    if (typeof rtsp_password === 'string' && rtsp_password.length > 0) {
      updates.rtsp_password = rtsp_password
    }

    const { data, error } = await supabase
      .from('cameras')
      .update(updates)
      .eq('id', id)
      .eq('center_id', center.id)
      .select(CAMERA_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // Verify the camera belongs to this user's center before deleting
    const { data: center, error: centerError } = await supabase
      .from('centers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (centerError || !center) {
      return NextResponse.json({ error: 'Center not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('cameras')
      .delete()
      .eq('id', id)
      .eq('center_id', center.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
