import os
import configparser
from .logger import logger


class AppConfig:
    def __init__(self, config_path=None, storage_root=None):
        self.storage_root = storage_root or ""
        self.machine_id = 1
        self.debug = False

        if config_path and os.path.isfile(config_path):
            self.load_from_file(config_path)
        else:
            self.load_from_env()

    def load_from_file(self, path):
        config = configparser.ConfigParser()
        config.read(path, encoding="utf-8")

        if "Storage" in config:
            section = config["Storage"]
            if not self.storage_root:
                self.storage_root = section.get("root", self.storage_root)
            self.machine_id = section.getint("machine_id", self.machine_id)

        if "General" in config:
            section = config["General"]
            self.debug = section.getboolean("debug", self.debug)

    def load_from_env(self):
        self.storage_root = os.getenv("BOOK_INDEX_STORAGE_ROOT", self.storage_root)
        self.machine_id = int(os.getenv("BOOK_INDEX_MACHINE_ID", str(self.machine_id)))
        self.debug = os.getenv("BOOK_INDEX_DEBUG", str(self.debug)).lower() == "true"
