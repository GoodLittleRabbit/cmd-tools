import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { listCapacityFromRows, resolveListWindow } from './list-window.js'

describe('resolveListWindow', () => {
  it('fits entirely when length <= capacity', () => {
    assert.deepEqual(resolveListWindow(2, 5, 10, 0), {
      start: 0,
      end: 5,
      moreAbove: false,
      moreBelow: false,
    })
  })

  it('scrolls down when cursor leaves the bottom of the window', () => {
    // capacity 3, was showing 0..3, cursor → 3
    assert.deepEqual(resolveListWindow(3, 8, 3, 0), {
      start: 1,
      end: 4,
      moreAbove: true,
      moreBelow: true,
    })
  })

  it('scrolls up when cursor leaves the top of the window', () => {
    assert.deepEqual(resolveListWindow(1, 8, 3, 2), {
      start: 1,
      end: 4,
      moreAbove: true,
      moreBelow: true,
    })
  })

  it('keeps window when cursor stays inside', () => {
    assert.deepEqual(resolveListWindow(3, 8, 3, 2), {
      start: 2,
      end: 5,
      moreAbove: true,
      moreBelow: true,
    })
  })

  it('clamps empty list', () => {
    assert.deepEqual(resolveListWindow(0, 0, 5, 0), {
      start: 0,
      end: 0,
      moreAbove: false,
      moreBelow: false,
    })
  })
})

describe('listCapacityFromRows', () => {
  it('reserves chrome rows and keeps a minimum of 3 items', () => {
    assert.equal(listCapacityFromRows(12, 10, 2), 3)
    assert.equal(listCapacityFromRows(24, 10, 2), 7)
  })
})
