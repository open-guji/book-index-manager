import re
from typing import Optional, Union
from .id_generator import BookIndexIdGenerator, BookIndexType, base36_encode, smart_decode


class BidLink:
    r"""
    Component for handling Bid (Book Index ID) links.
    Format: [Title](bid:\\ID)
    """

    PROTOCOL = "bid:\\\\"
    PREFIX = "bid:\\\\"

    def __init__(self, id_val: Union[int, str], title: str = ""):
        self.title = title
        if isinstance(id_val, str):
            if id_val.startswith(self.PREFIX):
                id_val = id_val[len(self.PREFIX):]
            self.id_str = id_val
            try:
                self.id_int = smart_decode(id_val)
            except ValueError:
                self.id_int = 0
        else:
            self.id_int = id_val
            self.id_str = base36_encode(id_val)

        self._type = None
        if self.id_int > 0:
            try:
                components = BookIndexIdGenerator.parse(self.id_int)
                self._type = components.type
            except Exception:
                pass

    @property
    def type(self) -> Optional[BookIndexType]:
        return self._type

    def get_icon(self) -> str:
        if self._type is None:
            return ""
        if self._type == BookIndexType.Book:
            return "📖 "
        elif self._type == BookIndexType.Collection:
            return "📚 "
        elif self._type == BookIndexType.Work:
            return "📜 "
        return ""

    def render(self, with_icon: bool = False) -> str:
        icon = self.get_icon() if with_icon else ""
        return f"[{icon}{self.title}]({self.PREFIX}{self.id_str})"

    @staticmethod
    def parse_from_link(markdown_link: str) -> Optional['BidLink']:
        match = re.search(r'\[(.*?)\]\((.*?)\)', markdown_link)
        if match:
            title = match.group(1)
            url = match.group(2)
            if url.startswith(BidLink.PREFIX):
                id_part = url[len(BidLink.PREFIX):]
                return BidLink(id_part, title)
        return None

    @staticmethod
    def is_bid_link(url: str) -> bool:
        return url.startswith(BidLink.PREFIX)
