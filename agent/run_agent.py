"""Entry point for the PyInstaller build (a script, not `python -m`)."""

import sys

from reignroom_agent.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
