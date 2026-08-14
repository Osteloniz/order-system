import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildUsernameCandidateFromEmail,
  generateSecureToken,
  hashOpaqueToken,
  getPasswordPolicyError,
  getAdminUsernamePolicyError,
  maskEmail,
  needsPasswordRehash,
  normalizeEmail,
  normalizeAdminUsername,
} from '../lib/auth-security.ts'
import { resolveInviteStatus } from '../lib/invite-status.ts'

test('normalizeEmail lowercases and trims', () => {
  assert.equal(normalizeEmail('  Joao.Murat30@Gmail.com '), 'joao.murat30@gmail.com')
})

test('admin username is normalized and restricted to a safe portable format', () => {
  assert.equal(normalizeAdminUsername('  Joao.Murat '), 'joao.murat')
  assert.equal(getAdminUsernamePolicyError('joao.murat'), null)
  assert.match(getAdminUsernamePolicyError('joão murat'), /sem acento/)
  assert.match(getAdminUsernamePolicyError('ab'), /entre 3 e 40/)
})

test('generateSecureToken returns unpredictable hex-sized token', () => {
  const tokenA = generateSecureToken()
  const tokenB = generateSecureToken()

  assert.equal(tokenA.length, 64)
  assert.equal(tokenB.length, 64)
  assert.notEqual(tokenA, tokenB)
})

test('hashOpaqueToken never returns the raw token and is deterministic', () => {
  const token = 'token-super-seguro'
  const hashA = hashOpaqueToken(token)
  const hashB = hashOpaqueToken(token)

  assert.notEqual(hashA, token)
  assert.equal(hashA, hashB)
  assert.equal(hashA.length, 64)
})

test('maskEmail hides most of the local part', () => {
  assert.equal(maskEmail('joao.murat30@gmail.com'), 'jo***@gmail.com')
})

test('buildUsernameCandidateFromEmail sanitizes unsafe characters', () => {
  assert.equal(buildUsernameCandidateFromEmail('Joao+Admin@Test.com'), 'joao-admin')
})

test('needsPasswordRehash upgrades legacy bcrypt costs', () => {
  process.env.BCRYPT_ROUNDS = '12'
  assert.equal(needsPasswordRehash('$2a$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'), true)
  assert.equal(needsPasswordRehash('$2b$12$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'), false)
})

test('password policy enforces length, composition and bcrypt byte limit', () => {
  assert.match(getPasswordPolicyError('short'), /12/)
  assert.match(getPasswordPolicyError('somenteletrasminusculas'), /maiusculas/)
  assert.match(getPasswordPolicyError(`Aa1${'ç'.repeat(35)}`), /72 bytes/)
  assert.equal(getPasswordPolicyError('BrookieSegura2026'), null)
})

test('resolveInviteStatus marks used invites as used', () => {
  const status = resolveInviteStatus({
    status: 'USED',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: new Date(),
    revokedAt: null,
  })

  assert.equal(status, 'USED')
})

test('resolveInviteStatus marks expired invites as expired', () => {
  const status = resolveInviteStatus({
    status: 'PENDING',
    expiresAt: new Date(Date.now() - 60_000),
    usedAt: null,
    revokedAt: null,
  })

  assert.equal(status, 'EXPIRED')
})

test('resolveInviteStatus keeps valid pending invites pending', () => {
  const status = resolveInviteStatus({
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    revokedAt: null,
  })

  assert.equal(status, 'PENDING')
})
