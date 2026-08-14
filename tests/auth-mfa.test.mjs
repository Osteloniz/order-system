import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpCode,
  hashRecoveryCodes,
  normalizeRecoveryCode,
  verifyTotpCode,
} from '../lib/totp.ts'
import { getAdminUserLimit, getAllowedAdminEmails, isAdminAllowlistReady, isAllowedAdminEmail } from '../lib/admin-allowlist.ts'
import { createSignedAdminAccessCookie, hasSignedAdminAccessCookie, isValidAdminAccessKey } from '../lib/admin-access-token.ts'
import { createAdminMfaChallenge, readAdminMfaChallenge } from '../lib/login-challenge.ts'

const originalEnv = { ...process.env }

test.afterEach(() => {
  process.env = { ...originalEnv }
})

test('TOTP follows the RFC 6238 SHA-1 vector reduced to 6 digits', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  assert.equal(generateTotpCode(secret, 1), '287082')
  assert.equal(verifyTotpCode(secret, '287082', 59_000), 1)
})

test('TOTP accepts only one adjacent time step', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  const previous = generateTotpCode(secret, 9)
  assert.equal(verifyTotpCode(secret, previous, 10 * 30_000), 9)
  assert.equal(verifyTotpCode(secret, generateTotpCode(secret, 8), 10 * 30_000), null)
})

test('TOTP secret encryption is authenticated and rejects tampering', () => {
  process.env.AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  const encrypted = encryptTotpSecret('SECRET123')
  assert.equal(decryptTotpSecret(encrypted), 'SECRET123')
  assert.throws(() => decryptTotpSecret(`${encrypted.slice(0, -1)}A`))
})

test('authenticator URI identifies Brookie without exposing a password', () => {
  const uri = buildTotpUri({ email: 'admin@brookie.test', secret: 'ABCDEF234567' })
  assert.match(uri, /^otpauth:\/\/totp\//)
  assert.match(uri, /issuer=Brookie\+Pregiato/)
  assert.doesNotMatch(uri, /password/i)
})

test('recovery codes are unique, normalized and stored only as hashes', () => {
  process.env.TOKEN_PEPPER = 'pepper-for-tests-with-at-least-32-characters'
  const codes = generateRecoveryCodes()
  const hashes = hashRecoveryCodes(codes)
  assert.equal(codes.length, 8)
  assert.equal(new Set(codes).size, 8)
  assert.equal(hashes.length, 8)
  assert.ok(hashes.every((hash, index) => hash !== codes[index]))
  assert.equal(normalizeRecoveryCode(codes[0].toLowerCase().replace('-', '')), codes[0])
})

test('bootstrap allowlist accepts configured e-mails without limiting invited users', () => {
  process.env.NODE_ENV = 'production'
  process.env.ADMIN_ALLOWED_EMAILS = 'a@brookie.test,b@brookie.test'
  assert.deepEqual(getAllowedAdminEmails(), ['a@brookie.test', 'b@brookie.test'])
  assert.equal(isAdminAllowlistReady(), true)
  assert.equal(isAllowedAdminEmail('A@BROOKIE.TEST'), true)
  assert.equal(isAllowedAdminEmail('c@brookie.test'), false)
  process.env.ADMIN_USER_LIMIT = '10'
  assert.equal(getAdminUserLimit(), 10)
})

test('password challenge is encrypted, authenticated and short lived', () => {
  process.env.AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')
  const value = createAdminMfaChallenge({
    userId: 'user-1', tenantId: 'tenant-1', sessionVersion: 2,
    identifier: 'admin@brookie.test', ipHash: 'ip', userAgentHash: 'ua',
  })
  const challenge = readAdminMfaChallenge(value)
  assert.equal(challenge?.userId, 'user-1')
  assert.notEqual(value.includes('admin@brookie.test'), true)
  assert.equal(readAdminMfaChallenge(`${value.slice(0, -1)}x`), null)
})

test('pre-access cookie is signed and cannot be forged with a fixed value', async () => {
  process.env.ADMIN_ACCESS_KEY = 'private-admin-access-key'
  process.env.TOKEN_PEPPER = 'pepper-for-tests-with-at-least-32-characters'
  assert.equal(await isValidAdminAccessKey('private-admin-access-key'), true)
  assert.equal(await isValidAdminAccessKey('wrong-key'), false)

  const cookie = await createSignedAdminAccessCookie()
  assert.equal(await hasSignedAdminAccessCookie(cookie), true)
  assert.equal(await hasSignedAdminAccessCookie('ok'), false)
  assert.equal(await hasSignedAdminAccessCookie(`${cookie.slice(0, -1)}x`), false)
})

test('pre-access cookie fails closed when signing secrets are incomplete', async () => {
  process.env.ADMIN_ACCESS_KEY = 'private-admin-access-key'
  delete process.env.TOKEN_PEPPER
  assert.equal(await isValidAdminAccessKey('private-admin-access-key'), false)
  assert.equal(await hasSignedAdminAccessCookie('anything'), false)
  await assert.rejects(() => createSignedAdminAccessCookie(), /ADMIN_ACCESS_SIGNING_NOT_CONFIGURED/)
})
