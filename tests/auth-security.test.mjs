import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildUsernameCandidateFromEmail,
  generateSecureToken,
  hashOpaqueToken,
  maskEmail,
  normalizeEmail,
} from '../lib/auth-security.ts'
import { resolveInviteStatus } from '../lib/invite-status.ts'

test('normalizeEmail lowercases and trims', () => {
  assert.equal(normalizeEmail('  Joao.Murat30@Gmail.com '), 'joao.murat30@gmail.com')
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
