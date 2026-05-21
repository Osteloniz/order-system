import { Suspense } from 'react'
import { InviteRegisterPage } from '@/components/auth/invite-register-page'

export default function AuthInvitePage() {
  return (
    <Suspense fallback={null}>
      <InviteRegisterPage />
    </Suspense>
  )
}
