import logging
import sys

def setup_logger(name: str = "book-index", level: int = logging.WARNING):
    """Configure and return a logger instance."""
    logger = logging.getLogger(name)

    if logger.handlers:
        return logger

    logger.setLevel(level)

    handler = logging.StreamHandler(sys.stderr)
    formatter = logging.Formatter('[%(levelname)s] [%(name)s] %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    return logger

logger = setup_logger()
