import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

interface CameraRow {
  proxy_stream_name: string
  rtsp_url: string | null
  rtsp_username: string | null
  rtsp_password: string | null
  channel: number | null
  subtype: number | null
}

function buildRtspSource(camera: CameraRow): string {
  const { rtsp_url, rtsp_username, rtsp_password, channel, subtype } = camera

  if (!rtsp_url) return ''

  // If the URL is already a full rtsp:// URI, use it as-is
  if (rtsp_url.startsWith('rtsp://')) {
    return rtsp_url
  }

  // Otherwise build the Dahua/Hikvision-style RTSP URL
  const ch = channel ?? 1
  const sub = subtype ?? 0
  const credentials =
    rtsp_username && rtsp_password
      ? `${encodeURIComponent(rtsp_username)}:${encodeURIComponent(rtsp_password)}@`
      : ''

  return `rtsp://${credentials}${rtsp_url}/cam/realmonitor?channel=${ch}&subtype=${sub}`
}

function buildYaml(cameras: CameraRow[]): string {
  const lines: string[] = ['streams:']

  for (const camera of cameras) {
    const source = buildRtspSource(camera)
    if (!source) continue
    // YAML scalar — no quoting needed for standard rtsp:// URLs
    lines.push(`  ${camera.proxy_stream_name}:`)
    lines.push(`    - ${source}`)
  }

  return lines.join('\n') + '\n'
}

// Internal endpoint consumed by the go2rtc proxy to auto-configure streams.
// Protected by a shared API key — not user-facing.
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.nextUrl.searchParams.get('api_key')
    const expectedKey = process.env.GO2RTC_API_KEY

    if (!expectedKey) {
      return NextResponse.json(
        { error: 'GO2RTC_API_KEY environment variable is not configured' },
        { status: 500 }
      )
    }

    if (!apiKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase
      .from('cameras')
      .select('proxy_stream_name, rtsp_url, rtsp_username, rtsp_password, channel, subtype')
      .eq('enabled', true)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const yaml = buildYaml((data as CameraRow[]) ?? [])

    return new NextResponse(yaml, {
      status: 200,
      headers: { 'Content-Type': 'text/yaml' },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
