import json
from pathlib import Path


class I18n:
    def __init__(self) -> None:
        self.translations: dict[str, dict] = {}
        self._trans_dir = Path(__file__).parent / "translations"

    def trans(self, lang: str, key: str) -> str:
        if lang not in self.translations:
            self._load_translation(lang)
        return self.translations[lang].get(key, key)

    def _load_translation(self, lang: str) -> None:
        """load <lang>.json from `./translations` dir"""
        path = self._trans_dir / f"{lang}.json"
        try:
            with path.open(encoding="utf-8") as f:
                self.translations[lang] = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            self.translations[lang] = {}

    def get_lang(self) -> str | None:
        lang_file = Path.home() / ".cyanly_lang"
        if lang_file.exists():
            return lang_file.read_text(encoding="utf-8").strip()
        return None

    def set_lang(self, lang: str) -> None:
        lang_file = Path.home() / ".cyanly_lang"
        lang_file.write_text(lang, encoding="utf-8")


i18n = I18n()

def init_lang():
    import sys
    from rich.console import Console
    from rich.prompt import Prompt
    
    # Check for --lang arg
    cli_lang = None
    if "--lang" in sys.argv:
        idx = sys.argv.index("--lang")
        if idx + 1 < len(sys.argv):
            cli_lang = sys.argv[idx + 1]
            if cli_lang in ["en", "zh", "ja"]:
                i18n.set_lang(cli_lang)
                return cli_lang

    lang = i18n.get_lang()
    if not lang:
        console = Console()
        console.print("[cyan]Welcome to Chiyo Analytics![/cyan]")
        console.print("Please select your language / 请选择您的语言 / 言語を選択してください:")
        console.print("1. English (en)")
        console.print("2. 简体中文 (zh)")
        console.print("3. 日本語 (ja)")
        
        choice = "1"
        if "-y" not in sys.argv and "--yes" not in sys.argv:
            choice = Prompt.ask("Enter number", choices=["1", "2", "3"], default="1")
            
        lang_map = {"1": "en", "2": "zh", "3": "ja"}
        lang = lang_map[choice]
        i18n.set_lang(lang)
    return lang

def t(key: str) -> str:
    lang = i18n.get_lang() or "en"
    return i18n.trans(lang, key)
