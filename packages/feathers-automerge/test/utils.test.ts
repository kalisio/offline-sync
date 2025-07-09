import { describe, test, expect } from 'vitest'
import { generateObjectId, generateUUID } from '../src/utils.js'

describe('utils', () => {
  describe('generateObjectId', () => {
    test('generates a valid ObjectId-like string', () => {
      const id = generateObjectId()

      // Should be 24 characters long (8 + 6 + 4 + 6)
      expect(id).toHaveLength(24)

      // Should be a valid hexadecimal string
      expect(id).toMatch(/^[0-9a-f]{24}$/)
    })

    test('generates unique IDs', () => {
      const ids = new Set()

      // Generate multiple IDs and ensure they're unique
      for (let i = 0; i < 1000; i++) {
        const id = generateObjectId()
        expect(ids.has(id)).toBe(false)
        ids.add(id)
      }
    })

    test('timestamp part reflects current time', () => {
      const beforeTimestamp = Math.floor(Date.now() / 1000)
      const id = generateObjectId()
      const afterTimestamp = Math.floor(Date.now() / 1000)

      // Extract timestamp from first 8 characters
      const idTimestamp = parseInt(id.substring(0, 8), 16)

      expect(idTimestamp).toBeGreaterThanOrEqual(beforeTimestamp)
      expect(idTimestamp).toBeLessThanOrEqual(afterTimestamp)
    })

    test('has correct structure', () => {
      const id = generateObjectId()

      // Timestamp (8 hex chars)
      const timestamp = id.substring(0, 8)
      expect(timestamp).toMatch(/^[0-9a-f]{8}$/)

      // Machine ID (6 hex chars)
      const machineId = id.substring(8, 14)
      expect(machineId).toMatch(/^[0-9a-f]{6}$/)

      // Process ID (4 hex chars)
      const processId = id.substring(14, 18)
      expect(processId).toMatch(/^[0-9a-f]{4}$/)

      // Counter (6 hex chars)
      const counter = id.substring(18, 24)
      expect(counter).toMatch(/^[0-9a-f]{6}$/)
    })
  })

  describe('generateUUID', () => {
    test('generates a valid UUID v4', () => {
      const uuid = generateUUID()

      // Should match UUID v4 format
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    test('generates unique UUIDs', () => {
      const uuids = new Set()

      // Generate multiple UUIDs and ensure they're unique
      for (let i = 0; i < 1000; i++) {
        const uuid = generateUUID()
        expect(uuids.has(uuid)).toBe(false)
        uuids.add(uuid)
      }
    })

    test('has correct length', () => {
      const uuid = generateUUID()

      // Standard UUID length is 36 characters (32 hex + 4 hyphens)
      expect(uuid).toHaveLength(36)
    })

    test('has correct version', () => {
      const uuid = generateUUID()

      // Version should be 4 (at position 14)
      expect(uuid.charAt(14)).toBe('4')
    })

    test('has correct variant', () => {
      const uuid = generateUUID()

      // Variant should be 8, 9, A, or B (at position 19)
      expect(['8', '9', 'a', 'b', 'A', 'B']).toContain(uuid.charAt(19))
    })
  })

  describe('both generators', () => {
    test('generate different types of IDs', () => {
      const objectId = generateObjectId()
      const uuid = generateUUID()

      // Should be different formats
      expect(objectId).not.toEqual(uuid)
      expect(objectId).toHaveLength(24)
      expect(uuid).toHaveLength(36)

      // ObjectId should be only hex chars
      expect(objectId).toMatch(/^[0-9a-f]{24}$/)

      // UUID should have hyphens
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })
  })
})
