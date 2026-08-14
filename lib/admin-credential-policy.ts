export function normalizeAdminUsername(username: string) {
  return username.trim().toLowerCase()
}

export function getAdminUsernamePolicyError(username: string) {
  const normalized = normalizeAdminUsername(username)
  if (normalized.length < 3 || normalized.length > 40) return 'O login deve ter entre 3 e 40 caracteres.'
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    return 'Use apenas letras sem acento, numeros, ponto, hifen ou sublinhado.'
  }
  if (normalized.includes('@')) return 'O login nao pode ser um e-mail.'
  return null
}

export function getPasswordUtf8ByteLength(password: string) {
  return new TextEncoder().encode(password).length
}

export function getPasswordPolicyError(password: string) {
  if (password.length < 12) return 'A senha precisa ter pelo menos 12 caracteres.'
  if (getPasswordUtf8ByteLength(password) > 72) return 'A senha ultrapassa o limite seguro de 72 bytes.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Use letras maiusculas, minusculas e numeros.'
  }
  return null
}
