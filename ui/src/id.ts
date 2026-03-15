/**
 * Base58 ID encoding/decoding for book-index.
 * Port of Python book_index_manager.id_generator
 */

import type { IndexStatus, IndexType } from './types';

const STATUS_TO_INT: Record<IndexStatus, number> = { official: 0, draft: 1 };
const INT_TO_STATUS: Record<number, IndexStatus> = { 0: 'official', 1: 'draft' };

const TYPE_TO_INT: Record<IndexType, number> = { book: 0, collection: 2, work: 3 };
const INT_TO_TYPE: Record<number, IndexType> = { 0: 'book', 2: 'collection', 3: 'work' };

// --- Bit layout (64-bit) ---
// [0]    Sign      (1 bit): fixed 0
// [1]    Status    (1 bit): 0=Official, 1=Draft
// [2-4]  Type      (3 bits): 0=Book, 2=Collection, 3=Work
// [5-44] Timestamp (40 bits)
// [45-55] Machine  (11 bits)
// [56-63] Sequence (8 bits)

const SHIFT_STATUS = 62n;
const SHIFT_TYPE = 59n;
const SHIFT_TIMESTAMP = 19n;
const SHIFT_MACHINE = 8n;

const MASK_TIMESTAMP = (1n << 40n) - 1n;
const MASK_TYPE = (1n << 3n) - 1n;
const MASK_MACHINE = (1n << 11n) - 1n;
const MASK_SEQUENCE = (1n << 8n) - 1n;

// --- Base58 ---

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ALPHABET_MAP = new Map<string, bigint>();
for (let i = 0; i < ALPHABET.length; i++) {
  ALPHABET_MAP.set(ALPHABET[i], BigInt(i));
}

export function base58Encode(num: bigint): string {
  if (num === 0n) return ALPHABET[0];
  let result = '';
  while (num > 0n) {
    result = ALPHABET[Number(num % 58n)] + result;
    num = num / 58n;
  }
  return result;
}

export function base58Decode(s: string): bigint {
  let num = 0n;
  for (const char of s) {
    const val = ALPHABET_MAP.get(char);
    if (val === undefined) {
      throw new Error(`Invalid Base58 character: ${char}`);
    }
    num = num * 58n + val;
  }
  return num;
}

// --- ID Components ---

export interface IdComponents {
  status: IndexStatus;
  type: IndexType;
  timestamp: bigint;
  machineId: number;
  sequence: number;
}

export function parseId(id: bigint): IdComponents {
  const statusInt = Number((id >> SHIFT_STATUS) & 1n);
  const typeInt = Number((id >> SHIFT_TYPE) & MASK_TYPE);
  const timestamp = (id >> SHIFT_TIMESTAMP) & MASK_TIMESTAMP;
  const machineId = Number((id >> SHIFT_MACHINE) & MASK_MACHINE);
  const sequence = Number(id & MASK_SEQUENCE);

  return {
    status: INT_TO_STATUS[statusInt] ?? 'draft',
    type: INT_TO_TYPE[typeInt] ?? 'book',
    timestamp,
    machineId,
    sequence,
  };
}

export function buildId(
  status: IndexStatus,
  type: IndexType,
  timestamp: bigint,
  machineId: number,
  sequence: number,
): bigint {
  return (
    (BigInt(STATUS_TO_INT[status]) << SHIFT_STATUS) |
    (BigInt(TYPE_TO_INT[type]) << SHIFT_TYPE) |
    ((timestamp & MASK_TIMESTAMP) << SHIFT_TIMESTAMP) |
    (BigInt(machineId) << SHIFT_MACHINE) |
    BigInt(sequence)
  );
}

// --- Convenience ---

/** Decode a Base58 ID string and extract its components */
export function decodeIdString(encoded: string): IdComponents {
  return parseId(base58Decode(encoded));
}

/** Extract type from a Base58 ID string */
export function extractType(encoded: string): IndexType {
  return decodeIdString(encoded).type;
}

/** Extract status from a Base58 ID string */
export function extractStatus(encoded: string): IndexStatus {
  return decodeIdString(encoded).status;
}
