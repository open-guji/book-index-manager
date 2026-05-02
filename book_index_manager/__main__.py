import sys
import argparse
import json
import logging
import io

# 确保输出使用 UTF-8 编码
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from .id_generator import BookIndexStatus, BookIndexType, BookIndexIdGenerator, base36_encode, smart_decode
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
        type_map = {"book": BookIndexType.Book, "collection": BookIndexType.Collection, "work": BookIndexType.Work, "entity": BookIndexType.Entity}
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
        workers = getattr(self.args, "workers", 4)
        if target in ["official", "all"]:
            self.manager.storage.rebuild_index(BookIndexStatus.Official, workers=workers)
        if target in ["draft", "all"]:
            self.manager.storage.rebuild_index(BookIndexStatus.Draft, workers=workers)
        print(f"Deep reindex of {target} completed.")

    def handle_shadow_reindex(self):
        target = self.args.target
        workers = getattr(self.args, "workers", 8)
        if target in ["official", "all"]:
            self.manager.storage.shadow_reindex(BookIndexStatus.Official, workers=workers)
        if target in ["draft", "all"]:
            self.manager.storage.shadow_reindex(BookIndexStatus.Draft, workers=workers)
        print(f"Shadow reindex of {target} completed.")

    def handle_draft(self):
        type_map = {"book": BookIndexType.Book, "collection": BookIndexType.Collection, "work": BookIndexType.Work, "entity": BookIndexType.Entity}
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
            val = smart_decode(id_str)
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

    def handle_init_asset(self):
        id_str = self.args.bid
        # Verify entity exists
        metadata = self.manager.get_item(id_str)
        if not metadata:
            print(json.dumps({"status": "error", "message": f"Entity {id_str} not found"}, ensure_ascii=False))
            return

        asset_dir = self.manager.init_asset_dir(id_str)
        print(json.dumps({
            "status": "success",
            "id": id_str,
            "title": metadata.get("title", ""),
            "asset_dir": str(asset_dir).replace("\\", "/"),
        }, ensure_ascii=False))

    def handle_add_resource(self):
        bid = self.args.bid
        metadata = self.manager.get_item(bid)
        if not metadata:
            print(json.dumps({"status": "error", "message": f"Item {bid} not found"}, ensure_ascii=False))
            sys.exit(1)

        resource = {"name": self.args.name, "type": self.args.res_type}
        if self.args.id:
            resource["id"] = self.args.id
        if self.args.url:
            resource["url"] = self.args.url
            if not self.args.id:
                from .schema import extract_id_from_url
                resource["id"] = extract_id_from_url(self.args.url)
        if self.args.details:
            resource["details"] = self.args.details

        resources = metadata.get("resources", [])
        # Replace existing resource with same id, or append
        replaced = False
        if resource.get("id"):
            for i, r in enumerate(resources):
                if r.get("id") == resource["id"]:
                    resources[i] = resource
                    replaced = True
                    break
        if not replaced:
            resources.append(resource)

        metadata["resources"] = resources
        id_val = self.manager.decode_id(bid)
        type_val = BookIndexIdGenerator.parse(id_val).type
        self.manager.storage.save_item(type_val, id_val, metadata)
        action = "replaced" if replaced else "added"
        print(json.dumps({
            "status": "success",
            "action": action,
            "resource_id": resource.get("id", ""),
            "total_resources": len(resources),
        }, ensure_ascii=False))

    def handle_check_index(self):
        from .storage import BookIndexStatus
        target = self.args.target
        statuses = []
        if target in ["draft", "all"]:
            statuses.append(BookIndexStatus.Draft)
        if target in ["official", "all"]:
            statuses.append(BookIndexStatus.Official)

        total_missing = []
        for status in statuses:
            missing = self.manager.storage.check_index(status)
            total_missing.extend(missing)
            if missing:
                print(f"[{status.name}] {len(missing)} item(s) missing from index:")
                for item in missing:
                    print(f"  {item['id']}  {item['path']}")
            else:
                root = self.manager.storage.get_root_by_status(status)
                print(f"[{status.name}] index consistent ({root})")

        if total_missing:
            print(f"\n[FAIL] {len(total_missing)} item(s) not indexed. Run: book-index reindex")
            sys.exit(1)
        else:
            print("\n[OK] All items are indexed.")

    def handle_validate_lineage(self):
        """验证版本传承数据完整性：检查所有 Work 的 version_graph 中引用的 Book/hypothetical 节点。"""
        from pathlib import Path
        work_id = getattr(self.args, 'work_id', None)
        verbose = getattr(self.args, 'verbose', False)
        target = getattr(self.args, 'target', 'draft')

        # 确定根目录
        roots = []
        if target in ["draft", "all"]:
            roots.append(self.manager.storage.draft_root)
        if target in ["official", "all"]:
            roots.append(self.manager.storage.official_root)

        if not roots:
            print("No storage roots found")
            return

        # 缓存：book_id -> book_data
        book_cache = {}

        # 预加载所有 Books
        for root in roots:
            books_root = root / "Book"
            if books_root.exists():
                for json_file in books_root.rglob("*.json"):
                    try:
                        with open(json_file, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            # 跳过非 Book 类型的文件（如 juan_groups.json）
                            if isinstance(data, dict) and data.get("type") == "book":
                                book_id = data.get("id")
                                if book_id:
                                    book_cache[book_id] = data
                    except Exception as e:
                        pass  # 静默跳过错误的文件

        # 扫描 Works
        works_to_check = []
        for root in roots:
            work_dir = root / "Work"
            if work_dir.exists():
                for json_file in work_dir.rglob("*.json"):
                    try:
                        with open(json_file, 'r', encoding='utf-8') as f:
                            work_data = json.load(f)
                            if work_data.get("type") == "work":
                                # 如果指定了 work_id，只验证那一个
                                if work_id:
                                    if work_data.get("id") == work_id:
                                        works_to_check.append(work_data)
                                else:
                                    works_to_check.append(work_data)
                    except Exception as e:
                        logger.warning(f"Failed to read {json_file}: {e}")

        if not works_to_check:
            if work_id:
                print(f"Work {work_id} not found")
                sys.exit(1)
            else:
                print("No works found to validate")
                return

        total_errors = 0
        validated = 0

        for work in works_to_check:
            work_id = work.get("id")
            version_graph = work.get("version_graph")
            if not version_graph or not version_graph.get("enabled"):
                continue

            validated += 1
            errors = []

            # 该 work 关联的所有 books（从 version_graph.node_groups 的 key）
            excluded_books = set(version_graph.get("excluded_books", []))
            node_groups = version_graph.get("node_groups", {})
            book_ids_set = set(node_groups.keys())

            # 也检查 hypothetical_nodes 定义的书
            hypothetical_ids = set(h.get("id") for h in version_graph.get("hypothetical_nodes", []))
            all_valid_ids = (book_ids_set - excluded_books) | hypothetical_ids

            # 检查 derived_from 和 related_to 引用
            for book_id in book_ids_set:
                if book_id in excluded_books:
                    continue
                book = book_cache.get(book_id)
                if not book:
                    errors.append(f"Book {book_id} referenced but not found in storage")
                    continue

                lineage = book.get("lineage", {})
                if not lineage:
                    continue

                # 检查 derived_from
                for d in lineage.get("derived_from", []):
                    ref = d.get("ref")
                    if ref and ref not in all_valid_ids:
                        errors.append(f"Book {book_id}: derived_from.ref '{ref}' not found in books or hypothetical nodes")

                # 检查 related_to
                for r in lineage.get("related_to", []):
                    ref_book_id = r.get("book_id")
                    if ref_book_id and ref_book_id not in book_ids_set:
                        errors.append(f"Book {book_id}: related_to.book_id '{ref_book_id}' not in this work")

            # 检查 hypothetical_nodes 的 derived_from
            for hypo in version_graph.get("hypothetical_nodes", []):
                hypo_id = hypo.get("id")
                for d in hypo.get("derived_from", []):
                    ref = d.get("ref")
                    if ref and ref not in all_valid_ids:
                        errors.append(f"Hypothetical {hypo_id}: derived_from.ref '{ref}' not found")

            if errors:
                total_errors += len(errors)
                title = work.get('title', 'Unknown')
                print(f"\n[FAIL] Work {work_id} ({title}):")
                for error in errors:
                    print(f"  - {error}")
            elif verbose:
                title = work.get('title', 'Unknown')
                print(f"[OK] Work {work_id} ({title}): {len(book_ids_set)} books, {len(hypothetical_ids)} hypothetical nodes")

        summary = f"\nValidated {validated} work(s)"
        if total_errors:
            print(f"{summary}, {total_errors} error(s) found")
            sys.exit(1)
        else:
            print(f"{summary}, no errors")

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
    p.add_argument("--type", choices=["book", "work", "collection", "entity"], default="book")
    p.add_argument("--raw", action="store_true", help="Print only the Base58 ID")

    # reindex (deep)
    p = subparsers.add_parser("reindex", parents=[parent_parser])
    p.add_argument("--target", choices=["official", "draft", "all"], default="all")
    p.add_argument("--workers", type=int, default=4, help="Parallel worker threads (default: 4)")

    # shadow-reindex (fast, additive only)
    p = subparsers.add_parser("shadow-reindex", parents=[parent_parser],
                              help="Fast incremental reindex: only add files missing from index")
    p.add_argument("--target", choices=["official", "draft", "all"], default="all")
    p.add_argument("--workers", type=int, default=8, help="Parallel worker threads (default: 8)")

    # get
    p = subparsers.add_parser("get", parents=[parent_parser])
    p.add_argument("--bid", required=True, help="Item ID (Base58)")

    # get-config
    subparsers.add_parser("get-config", parents=[parent_parser])

    # draft
    p = subparsers.add_parser("draft", parents=[parent_parser])
    p.add_argument("title", help="Title of the work/book/collection")
    p.add_argument("--type", choices=["book", "work", "collection", "entity"], default="book")

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

    # init-asset
    p = subparsers.add_parser("init-asset", parents=[parent_parser],
                              help="Create asset directory for a book/work/collection")
    p.add_argument("--bid", required=True, help="Item ID (Base58)")

    # add-resource
    p = subparsers.add_parser("add-resource", parents=[parent_parser],
                              help="Add or replace a resource on an item")
    p.add_argument("--bid", required=True, help="Item ID (Base58)")
    p.add_argument("--id", default=None, help="Resource short ID (e.g. 'wikisource', 'archive')")
    p.add_argument("--name", required=True, help="Resource display name")
    p.add_argument("--url", default=None, help="Resource URL")
    p.add_argument("--type", dest="res_type", choices=["text", "image", "text+image", "physical"],
                   default="text", help="Resource type")
    p.add_argument("--details", default=None, help="Additional details")

    # check-index
    p = subparsers.add_parser("check-index", parents=[parent_parser],
                              help="Check that every item file has a corresponding index entry")
    p.add_argument("--target", choices=["official", "draft", "all"], default="draft")

    # validate-lineage
    p = subparsers.add_parser("validate-lineage", parents=[parent_parser],
                              help="Validate version lineage data integrity")
    p.add_argument("--work-id", default=None, help="Validate a specific work (if omitted, validate all)")
    p.add_argument("--target", choices=["official", "draft", "all"], default="draft")
    p.add_argument("--verbose", action="store_true", help="Print detailed validation info")

    # migrate
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
            "shadow-reindex": handler.handle_shadow_reindex,
            "get": handler.handle_get,
            "get-config": handler.handle_get_config,
            "draft": handler.handle_draft,
            "update": handler.handle_update,
            "save": handler.handle_save,
            "delete": handler.handle_delete,
            "parse-id": handler.handle_parse_id,
            "init-asset": handler.handle_init_asset,
            "add-resource": handler.handle_add_resource,
            "check-index": handler.handle_check_index,
            "validate-lineage": handler.handle_validate_lineage,
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
