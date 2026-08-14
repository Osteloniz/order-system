import { redirect } from 'next/navigation'

export default function AdminPreAccessRoute() {
  redirect('/admin/login')
}
