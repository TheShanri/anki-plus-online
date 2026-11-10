# Where the atlas3 pipeline reads and writes. The work area holds course material (the unzipped decks, the canonical
# photos), so it lives under content-build/ (git-ignored), never in the repo or public/.
#   ATLAS3_WORK=<dir> overrides the default <repo>/content-build/atlas3/work
import os

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
BASE = os.environ.get("ATLAS3_WORK") or os.path.join(REPO, "content-build", "atlas3", "work")
