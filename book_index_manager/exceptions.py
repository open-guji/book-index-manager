class BookIndexError(Exception):
    """Base exception for all book-index-manager errors."""
    pass

class StorageError(BookIndexError):
    """Raised when storage operations fail."""
    pass

class IdGenerationError(BookIndexError):
    """Raised when ID generation fails."""
    pass

class ConfigError(BookIndexError):
    """Raised when configuration is invalid."""
    pass

class MigrationError(BookIndexError):
    """Raised when data migration fails."""
    pass
