import { NextResponse } from 'next/server'

export function handleApiError(context: string, error: unknown, message: string, status = 500) {
  console.error(`[${context}]`, error)
  return NextResponse.json({ error: message }, { status })
}
