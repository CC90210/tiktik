import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const MAX_DESCRIPTORS = 10
const DESCRIPTOR_LENGTH = 128

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { teacher_id, descriptors } = body as { teacher_id: unknown; descriptors: unknown }

    if (!teacher_id || typeof teacher_id !== 'string') {
      return NextResponse.json({ error: 'teacher_id is required' }, { status: 400 })
    }

    if (!Array.isArray(descriptors) || descriptors.length === 0) {
      return NextResponse.json({ error: 'descriptors must be a non-empty array' }, { status: 400 })
    }

    for (let i = 0; i < descriptors.length; i++) {
      const d = descriptors[i]
      if (!Array.isArray(d) || d.length !== DESCRIPTOR_LENGTH) {
        return NextResponse.json(
          { error: `descriptors[${i}] must be an array of exactly ${DESCRIPTOR_LENGTH} numbers` },
          { status: 400 }
        )
      }
    }

    // Fetch teacher and verify ownership via center
    const { data: teacher, error: fetchError } = await supabase
      .from('teachers')
      .select('id, face_descriptors, centers!inner(user_id)')
      .eq('id', teacher_id)
      .single()

    if (fetchError || !teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    }

    // centers is returned as an array by Supabase even with !inner join — cast via unknown
    // to satisfy the TypeScript overlap check before narrowing to the shape we need.
    const centersRaw = teacher.centers as unknown
    const center = (Array.isArray(centersRaw) ? centersRaw[0] : centersRaw) as
      | { user_id: string }
      | null
    if (!center || center.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Merge new descriptors with existing ones, cap at MAX_DESCRIPTORS (keep newest)
    const existing: number[][] = Array.isArray(teacher.face_descriptors)
      ? (teacher.face_descriptors as number[][])
      : []

    const merged = [...existing, ...descriptors]
    const capped = merged.slice(-MAX_DESCRIPTORS)

    const { data: updated, error: updateError } = await supabase
      .from('teachers')
      .update({ face_descriptors: capped })
      .eq('id', teacher_id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json(updated)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
