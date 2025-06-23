import { describe, it, expect } from 'vitest'
import { createAutomergeApp } from '../src'

describe('@kalisio/feathers-automerge-server', () => {
  it('exports function', () => {
    expect(typeof createAutomergeApp).toBe('function')
  })
})
