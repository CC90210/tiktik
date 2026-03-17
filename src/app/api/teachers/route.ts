import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getNextColor } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const centerId = request.nextUrl.searchParams.get('center_id')

    if (!centerId) {
      return NextResponse.json({ error: 'center_id required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('teachers')
      .select('*')
      .eq('center_id', centerId)
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, center_id } = await request.json()
    if (!name || !center_id) {
      return NextResponse.json({ error: 'Name and center_id required' }, { status: 400 })
    }

    // Get existing teacher count for color assignment
    const { count } = await supabase
      .from('teachers')
      .select('*', { count: 'exact', head: true })
      .eq('center_id', center_id)

    const color = getNextColor(count || 0)

    const { data, error } = await supabase
      .from('teachers')
      .insert({ name, center_id, color })
      .select()
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'Teacher id required' }, { status: 400 })

    // Delete clock events first to satisfy foreign key constraint
    await supabase.from('clock_events').delete().eq('teacher_id', id)

    const { error } = await supabase.from('teachers').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
