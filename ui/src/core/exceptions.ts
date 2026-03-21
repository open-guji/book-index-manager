/**
 * Exception classes for book-index-manager.
 * Port of Python book_index_manager.exceptions
 */

export class BookIndexError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'BookIndexError';
    }
}

export class StorageError extends BookIndexError {
    constructor(message?: string) {
        super(message);
        this.name = 'StorageError';
    }
}

export class IdGenerationError extends BookIndexError {
    constructor(message?: string) {
        super(message);
        this.name = 'IdGenerationError';
    }
}

export class ConfigError extends BookIndexError {
    constructor(message?: string) {
        super(message);
        this.name = 'ConfigError';
    }
}

export class MigrationError extends BookIndexError {
    constructor(message?: string) {
        super(message);
        this.name = 'MigrationError';
    }
}
