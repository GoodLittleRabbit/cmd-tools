import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseEnv, viteModeForEnv } from './config.js'
import { applyBuildMode } from './engine.js'

describe('parseEnv', () => {
  it('accepts test aliases', () => {
    assert.equal(parseEnv('test'), 'test')
    assert.equal(parseEnv('dev'), 'test')
    assert.equal(parseEnv('development'), 'test')
  })

  it('accepts prod aliases', () => {
    assert.equal(parseEnv('prod'), 'prod')
    assert.equal(parseEnv('production'), 'prod')
  })

  it('returns undefined when empty', () => {
    assert.equal(parseEnv(undefined), undefined)
    assert.equal(parseEnv(''), undefined)
  })

  it('rejects unknown values', () => {
    assert.throws(() => parseEnv('staging'), /--env 须是 test 或 prod/)
  })
})

describe('applyBuildMode', () => {
  it('adds --mode development after pnpm script --', () => {
    assert.equal(
      applyBuildMode('pnpm build:mp-weixin', 'test'),
      'pnpm build:mp-weixin -- --mode development',
    )
  })

  it('adds --mode production after pnpm script --', () => {
    assert.equal(
      applyBuildMode('pnpm build:mp-weixin', 'prod'),
      'pnpm build:mp-weixin -- --mode production',
    )
  })

  it('appends --mode directly to uni commands', () => {
    assert.equal(applyBuildMode('uni build -p mp-weixin', 'test'), 'uni build -p mp-weixin --mode development')
  })

  it('replaces an existing --mode', () => {
    assert.equal(
      applyBuildMode('pnpm build:mp-weixin -- --mode production', 'test'),
      'pnpm build:mp-weixin -- --mode development',
    )
  })

  it('maps env to vite mode', () => {
    assert.equal(viteModeForEnv('test'), 'development')
    assert.equal(viteModeForEnv('prod'), 'production')
  })
})
