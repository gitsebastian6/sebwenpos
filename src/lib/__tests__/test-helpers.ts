// ---------------------------------------------------------------------------
// Test helpers for API route testing with Prisma mocking
// ---------------------------------------------------------------------------

import { vi } from 'vitest'

/**
 * Create a mock NextRequest with JSON body for POST/PUT requests.
 */
export function mockPostRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

/**
 * Create a mock NextRequest for GET requests with query params.
 */
export function mockGetRequest(url: string, headers?: Record<string, string>): Request {
  return new Request(url, {
    method: 'GET',
    headers,
  })
}

/**
 * Parse a NextResponse or Response as JSON.
 */
export async function parseResponse(response: Response) {
  const status = response.status
  const json = await response.json()
  return { status, body: json }
}

/**
 * Create a mock Prisma client for testing.
 * Each method is a vi.fn() that can be configured per-test.
 */
export function createMockDb() {
  const mockTx = {
    order: {
      create: vi.fn(),
      count: vi.fn(),
    },
    product: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    inventoryMovement: {
      create: vi.fn(),
    },
    serviceTransaction: {
      create: vi.fn(),
    },
    customer: {
      update: vi.fn(),
    },
    ledgerAccount: {
      findFirst: vi.fn(),
    },
    journalEntry: {
      create: vi.fn(),
    },
    employee: {
      delete: vi.fn(),
    },
    user: {
      delete: vi.fn(),
    },
  }

  return {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    store: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    plan: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    service: {
      findMany: vi.fn(),
    },
    taxRate: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    cashRegister: {
      findFirst: vi.fn(),
    },
    order: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    inventoryMovement: {
      create: vi.fn(),
    },
    serviceTransaction: {
      create: vi.fn(),
    },
    ledgerAccount: {
      findFirst: vi.fn(),
    },
    journalEntry: {
      create: vi.fn(),
    },
    employee: {
      delete: vi.fn(),
    },
    $transaction: vi.fn((cb: Function) => cb(mockTx)),
  }
}
