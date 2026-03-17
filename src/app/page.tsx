import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Check if they have a center
    const { data: center } = await supabase
      .from('centers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (center) {
      redirect('/admin')
    } else {
      redirect('/setup')
    }
  }

  redirect('/login')
}
