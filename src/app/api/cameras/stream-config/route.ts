import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

// Kiosk-facing endpoint — returns only the info needed to connect to the go2rtc proxy.
// No RTSP credentials are returned here; the kiosk only needs the stream name.
export async function GET(request: NextRequest) {
  try {
    // Service role used — kiosk operates without an authenticated session
    const supabase = await createServiceRoleClient()
    const centerId = request.nextUrl.searchParams.get('center_id')

    if (!centerId) {
      return NextResponse.json({ error: 'center_id required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('cameras')
      .select('id, name, location, proxy_stream_name, enabled')
      .eq('center_id', centerId)
      .eq('enabled', true)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
