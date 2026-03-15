/**
 * Snowflake ID 生成器
 * 翻译自 Python book_index_manager.id_generator
 * 复用 id.ts 的 buildId + base58Encode
 */

import type { IndexStatus, IndexType } from '../types';
import { buildId, base58Encode } from '../id';

const MASK_SEQUENCE = 0xFF; // 8 bits

export class IdGenerator {
    private machineId: number;
    private lastTimestamp = -1;
    private lastStatus: IndexStatus | null = null;
    private sequence = 0;

    constructor(machineId: number) {
        if (machineId < 0 || machineId > 2047) {
            throw new Error('Machine ID must be between 0 and 2047');
        }
        this.machineId = machineId;
    }

    /**
     * 生成下一个 ID（Base58 编码字符串）
     */
    nextId(status: IndexStatus, type: IndexType): string {
        let timestamp = this._getCurrentTimestamp(status);

        if (timestamp < this.lastTimestamp && status === this.lastStatus) {
            throw new Error('Clock moved backwards. Refusing to generate ID.');
        }

        if (timestamp === this.lastTimestamp && status === this.lastStatus) {
            this.sequence = (this.sequence + 1) & MASK_SEQUENCE;
            if (this.sequence === 0) {
                timestamp = this._tilNextUnit(this.lastTimestamp, status);
            }
        } else {
            this.sequence = 0;
        }

        this.lastTimestamp = timestamp;
        this.lastStatus = status;

        const id = buildId(status, type, BigInt(timestamp), this.machineId, this.sequence);
        return base58Encode(id);
    }

    /**
     * 生成下一个 ID（返回 bigint 原始值）
     */
    nextIdRaw(status: IndexStatus, type: IndexType): bigint {
        let timestamp = this._getCurrentTimestamp(status);

        if (timestamp < this.lastTimestamp && status === this.lastStatus) {
            throw new Error('Clock moved backwards. Refusing to generate ID.');
        }

        if (timestamp === this.lastTimestamp && status === this.lastStatus) {
            this.sequence = (this.sequence + 1) & MASK_SEQUENCE;
            if (this.sequence === 0) {
                timestamp = this._tilNextUnit(this.lastTimestamp, status);
            }
        } else {
            this.sequence = 0;
        }

        this.lastTimestamp = timestamp;
        this.lastStatus = status;

        return buildId(status, type, BigInt(timestamp), this.machineId, this.sequence);
    }

    private _getCurrentTimestamp(status: IndexStatus): number {
        const nowMs = Date.now();
        return status === 'draft' ? nowMs : Math.floor(nowMs / 1000);
    }

    private _tilNextUnit(lastTimestamp: number, status: IndexStatus): number {
        let timestamp = this._getCurrentTimestamp(status);
        while (timestamp <= lastTimestamp) {
            timestamp = this._getCurrentTimestamp(status);
        }
        return timestamp;
    }
}
