import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const centerId = request.nextUrl.searchParams.get('center_id')

    if (!centerId) {
      return NextResponse.json({ error: 'center_id required' }, { status: 400 })
    }

    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase
      .from('teachers')
      .select('id, name, color, face_descriptors')
      .eq('center_id', centerId)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Only return teachers who have at least one enrolled face descriptor
    const enrolled = (data ?? []).filter(
      (t) => Array.isArray(t.face_descriptors) && (t.face_descriptors as unknown[]).length > 0
    )

    return NextResponse.json(enrolled)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
