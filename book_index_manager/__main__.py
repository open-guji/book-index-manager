import sys
import argparse
import json
import logging

from .id_generator import BookIndexStatus, BookIndexType, BookIndexIdGenerator, base58_encode, base58_decode
from .manager import BookIndexManager
from .config import AppConfig
from .logger import setup_logger, logger
from .exceptions import BookIndexError
from .migration import migrate_directory


class CLIHandler:
    def __init__(self, args):
        self.args = args

        if args.debug:
            setup_logger(level=logging.DEBUG)

        storage_root = args.root or ""
        if not storage_root:
            config = AppConfig(args.config)
            storage_root = config.storage_root
            machine_id = config.machine_id
        else:
            machine_id = 1

        if not storage_root:
            print("Error: --root is required or set BOOK_INDEX_STORAGE_ROOT env var", file=sys.stderr)
            sys.exit(1)

        self.manager = BookIndexManager(storage_root, machine_id)

    def handle_gen_id(self):
        status = BookIndexStatus.Official if self.args.status == "official" else BookIndexStatus.Draft
        type_map = {"book": BookIndexType.Book, "collection": BookIndexType.Collection, "work": BookIndexType.Work}
        id_val = self.manager.generate_id(type_map[self.args.type], status)
        id_str = self.manager.encode_id(id_val)
        if self.args.raw:
            print(id_str)
        else:
            print(f"Generated ID: {id_str} (int: {id_val})")

    def handle_get(self):
        metadata = self.manager.get_item(self.args.bid)
        if metadata:
            print(json.dumps(metadata, indent=2, ensure_ascii=False))
        else:
            print(json.dumps({"error": "Item not found"}, ensure_ascii=False))

    def handle_get_config(self):
        print(json.dumps({
            "storage_root": str(self.manager.storage.workspace_root),
            "official_root": str(self.manager.storage.official_root),
            "draft_root": str(self.manager.storage.draft_root),
        }, ensure_ascii=False))

    def handle_reindex(self):
        target = self.args.target
        if target in ["official", "all"]:
            self.manager.storage.rebuild_index(BookIndexStatus.Official)
        if target in ["draft", "all"]:
            self.manager.storage.rebuild_index(BookIndexStatus.Draft)
        print(f"Re-indexing of {target} completed.")

    def handle_draft(self):
        type_map = {"book": BookIndexType.Book, "collection": BookIndexType.Collection, "work": BookIndexType.Work}
        type_val = type_map[self.args.type]

        book_id = self.manager.generate_id(type_val, BookIndexStatus.Draft)
        id_str = self.manager.encode_id(book_id)

        metadata = {
            "id": id_str,
            "type": type_val.name.lower(),
            "title": self.args.title,
        }

        file_path = self.manager.storage.save_item(type_val, book_id, metadata)
        print(f"Draft saved to: {file_path}")

    def handle_update(self):
        id_str = self.args.bid
        metadata = self.manager.get_item(id_str)
        if not metadata:
            print(json.dumps({"error": f"Item {id_str} not found"}, ensure_ascii=False))
            return

        if self.args.title:
            metadata["title"] = self.args.title

        id_val = self.manager.decode_id(id_str)
        type_val = BookIndexIdGenerator.parse(id_val).type
        file_path = self.manager.storage.save_item(type_val, id_val, metadata)
        print(f"Updated: {file_path}")

    def handle_save(self):
        try:
            if self.args.metadata == '-':
                raw_data = sys.stdin.read()
                data = json.loads(raw_data)
            else:
                data = json.loads(self.args.metadata)

            file_path = self.manager.save_item(data)
            id_str = data.get("id") or data.get("ID")
            print(json.dumps({
                "status": "success",
                "path": str(file_path).replace("\\", "/"),
                "id": id_str,
            }, ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))
            sys.exit(1)

    def handle_delete(self):
        try:
            id_str = self.args.bid
            success = self.manager.delete_item(id_str)
            if success:
                print(json.dumps({"status": "success", "message": f"Deleted {id_str}"}, ensure_ascii=False))
            else:
                print(json.dumps({"status": "error", "message": f"Entity {id_str} not found"}, ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))
            sys.exit(1)

    def handle_parse_id(self):
        try:
            id_str = self.args.id
            val = base58_decode(id_str)
            comp = BookIndexIdGenerator.parse(val)
            dt = BookIndexIdGenerator.to_datetime(val)

            print(f"ID String: {id_str}")
            print(f"Integer Value: {val}")
            print("-" * 20)
            print(f"Status: {comp.status.name} ({comp.status.value})")
            print(f"Type: {comp.type.name} ({comp.type.value})")
            print(f"Creation Time: {dt.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
            print(f"Machine ID: {comp.machine_id}")
            print(f"Sequence: {comp.sequence}")
            print(f"Timestamp Bits: {comp.timestamp}")
        except Exception as e:
            print(f"Error: {e}")

    def handle_migrate(self):
        from pathlib import Path
        target = self.args.target
        dry_run = self.args.dry_run

        roots = []
        if target in ["draft", "all"]:
            roots.append(self.manager.storage.draft_root)
        if target in ["official", "all"]:
            roots.append(self.manager.storage.official_root)

        total_files = 0
        total_migrated = 0
        for root in roots:
            count, migrated = migrate_directory(root, dry_run=dry_run)
            total_files += count
            total_migrated += migrated
            print(f"{root.name}: {migrated}/{count} files {'would be ' if dry_run else ''}migrated")

        prefix = "[dry-run] " if dry_run else ""
        print(f"\n{prefix}Total: {total_migrated}/{total_files} files migrated")


def main():
    parent_parser = argparse.ArgumentParser(add_help=False)
    parent_parser.add_argument("--config", default=None, help="Config file path")
    parent_parser.add_argument("--root", default=None, help="Storage root directory")
    parent_parser.add_argument("--debug", action="store_true", help="Enable debug mode")

    parser = argparse.ArgumentParser(description="Book Index Manager CLI")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # gen-id
    p = subparsers.add_parser("gen-id", parents=[parent_parser])
    p.add_argument("--status", choices=["official", "draft"], default="draft")
    p.add_argument("--type", choices=["book", "work", "collection"], default="book")
    p.add_argument("--raw", action="store_true", help="Print only the Base58 ID")

    # reindex
    p = subparsers.add_parser("reindex", parents=[parent_parser])
    p.add_argument("--target", choices=["official", "draft", "all"], default="all")

    # get
    p = subparsers.add_parser("get", parents=[parent_parser])
    p.add_argument("--bid", required=True, help="Item ID (Base58)")

    # get-config
    subparsers.add_parser("get-config", parents=[parent_parser])

    # draft
    p = subparsers.add_parser("draft", parents=[parent_parser])
    p.add_argument("title", help="Title of the work/book/collection")
    p.add_argument("--type", choices=["book", "work", "collection"], default="book")

    # parse-id
    p = subparsers.add_parser("parse-id", parents=[parent_parser])
    p.add_argument("id", help="Book ID (Base58) to parse")

    # update
    p = subparsers.add_parser("update", parents=[parent_parser])
    p.add_argument("--bid", required=True, help="Item ID to update")
    p.add_argument("--title", help="New title")

    # save
    p = subparsers.add_parser("save", parents=[parent_parser])
    p.add_argument("metadata", help="Metadata JSON string or '-' for stdin")

    # delete
    p = subparsers.add_parser("delete", parents=[parent_parser])
    p.add_argument("--bid", required=True, help="Item ID to delete")

    # migrate (NEW)
    p = subparsers.add_parser("migrate", parents=[parent_parser],
                              help="Migrate old text_resources/image_resources to unified resources")
    p.add_argument("--target", choices=["official", "draft", "all"], default="all")
    p.add_argument("--dry-run", action="store_true", help="Preview changes without writing")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    try:
        handler = CLIHandler(args)
        cmd_map = {
            "gen-id": handler.handle_gen_id,
            "reindex": handler.handle_reindex,
            "get": handler.handle_get,
            "get-config": handler.handle_get_config,
            "draft": handler.handle_draft,
            "update": handler.handle_update,
            "save": handler.handle_save,
            "delete": handler.handle_delete,
            "parse-id": handler.handle_parse_id,
            "migrate": handler.handle_migrate,
        }

        if args.command in cmd_map:
            cmd_map[args.command]()
    except BookIndexError as e:
        logger.error(f"Task failed: {e}")
        sys.exit(1)
    except Exception as e:
        logger.exception(f"Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
