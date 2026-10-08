try:
    from ._version import version as __version__
except ImportError:
    # _version.py 由 setuptools-scm 在 pip install/build 时生成。
    # 直接 git clone 后未 install 时会缺失，此时退化为 unknown。
    __version__ = "0.0.0+unknown"

from .id_generator import (
    BookIndexStatus,
    BookIndexType,
    BookIndexIdGenerator,
    base36_encode,
    base36_decode,
    base58_decode,
    smart_decode,
    encode_id,
    decode_id,
)
from .manager import BookIndexManager
from .storage import BookIndexStorage, strip_nulls
from .storage_base import IndexStorage, PageResult, LoadOptions
from .storage_github import GithubStorage, GithubStorageConfig
from .schema import ResourceEntry
from .schema_fields import (
    Vocab,
    build_vocab,
    classification_ok,
    classification_dir_problems,
    EDITION_TYPES,
    edition_type_ok,
    provenance_ok,
    physical_description_ok,
    BASE_EDITION_ROLES,
    base_edition_ok,
    dates_ok,
    external_ids_ok,
    MEMBER_TYPES,
    derive_member_type,
    member_type_ok,
    validate_work_fields,
    validate_book_fields,
    validate_entity_fields,
    validate_collection_fields,
)
from .bid_link import BidLink
from .exceptions import BookIndexError, StorageError, IdGenerationError, ConfigError, MigrationError
