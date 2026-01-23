import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.delete('admin_session')
  
  console.log('[v0] Admin logout realizado')
  
  return NextResponse.json({ success: true })
}
