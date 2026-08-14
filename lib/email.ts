type SendInviteEmailParams = {
  to: string
  inviteLink: string
  expiresAt: Date
}

export function isInviteEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.AUTH_EMAIL_FROM?.trim())
}

export async function sendAdminInviteEmail(params: SendInviteEmailParams) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.AUTH_EMAIL_FROM?.trim()
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'production') throw new Error('INVITE_EMAIL_NOT_CONFIGURED')
    return { delivered: false as const }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `brookie-admin-invite-${Buffer.from(params.inviteLink).toString('base64url').slice(-48)}`,
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: 'Finalize seu acesso administrativo à Brookie Pregiato',
      html: `<div style="font-family:Arial,sans-serif;color:#421C14;line-height:1.5"><h2>Acesso administrativo Brookie Pregiato</h2><p>Você recebeu um convite de uso único para criar seu acesso.</p><p><a href="${params.inviteLink}" style="display:inline-block;background:#40631A;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Finalizar cadastro seguro</a></p><p>O link expira em ${params.expiresAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Não encaminhe este e-mail.</p></div>`,
      text: `Finalize seu acesso administrativo à Brookie Pregiato: ${params.inviteLink}\n\nO link é de uso único e expira em ${params.expiresAt.toISOString()}.`,
    }),
  })
  if (!response.ok) throw new Error(`INVITE_EMAIL_DELIVERY_FAILED_${response.status}`)
  const data = await response.json().catch(() => null)
  return { delivered: true as const, id: data?.id ? String(data.id) : undefined }
}
