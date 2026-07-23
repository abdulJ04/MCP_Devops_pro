import logging
import sys
from datetime import datetime

RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
MAGENTA = "\033[95m"
BLUE = "\033[94m"
WHITE = "\033[97m"

LEVEL_COLORS = {
    "INFO": GREEN,
    "WARNING": YELLOW,
    "ERROR": RED,
    "DEBUG": CYAN,
    "CRITICAL": MAGENTA + BOLD,
}


class SimLogger:
    def __init__(self, name="SIM"):
        self.name = name
        self._handler = logging.StreamHandler(sys.stdout)
        self._handler.setFormatter(logging.Formatter("%(message)s"))
        self._logger = logging.getLogger(name)
        self._logger.setLevel(logging.INFO)
        self._logger.handlers.clear()
        self._logger.addHandler(self._handler)
        self._logger.propagate = False

    def _format(self, level, msg, component=None):
        ts = datetime.now().strftime("%H:%M:%S")
        lc = LEVEL_COLORS.get(level, WHITE)
        comp = f"[{component}] " if component else ""
        return f"{BLUE}[{ts}]{RESET} {lc}{level:<8}{RESET} {BOLD}{comp}{msg}{RESET}"

    def info(self, msg, component=None):
        self._logger.info(self._format("INFO", msg, component))

    def warning(self, msg, component=None):
        self._logger.warning(self._format("WARNING", msg, component))

    def error(self, msg, component=None):
        self._logger.error(self._format("ERROR", msg, component))

    def debug(self, msg, component=None):
        self._logger.debug(self._format("DEBUG", msg, component))

    def critical(self, msg, component=None):
        self._logger.critical(self._format("CRITICAL", msg, component))

    def cost(self, service, amount):
        ts = datetime.now().strftime("%H:%M:%S")
        self._logger.info(
            f"{BLUE}[{ts}]{RESET} {YELLOW}COST    {RESET} {BOLD}{service}: +${amount:.2f}{RESET}"
        )

    def event(self, service, action, detail):
        ts = datetime.now().strftime("%H:%M:%S")
        self._logger.info(
            f"{BLUE}[{ts}]{RESET} {CYAN}EVENT   {RESET} {BOLD}[{service}] {action}: {detail}{RESET}"
        )


log = SimLogger()
