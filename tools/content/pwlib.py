"""Shared helpers for CONTENT-3 builders (pathways, clinical, written, sections). Run scripts with -I."""
import json, os
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
C = os.path.join(ROOT, "content", "nsci3250")


class Deck:
    """Collects cards for one kind (pathway/clinical/...) across units."""

    def __init__(self, kind, topic_fmt, prefix, src_type):
        self.kind, self.topic_fmt, self.prefix, self.src_type = kind, topic_fmt, prefix, src_type
        self.cards = {"u1": [], "u2": [], "u3": []}
        self.pos = {"u1": 0, "u2": 0, "u3": 0}
        self.srcs = {}

    def src(self, key, *s):
        self.srcs[key] = list(s)

    def add(self, unit, group, step, prompt, answer, kw=None, accept=None, structure=None, fmt=None,
            choices=None, status="live", note=None, explain=None, vignette=None, extra=None, srcref=None):
        self.pos[unit] += 1
        slug = f"{self.prefix}-{unit}-{group}-{step}"
        n = sum(1 for c in self.cards[unit] if c["slug"] == slug or c["slug"].startswith(slug + "-"))
        if n:
            slug += f"-{n+1}"
        c = {"slug": slug, "kind": self.kind, "topic": self.topic_fmt.format(u=unit), "status": status,
             "position": self.pos[unit],
             "source": {"type": self.src_type, "ref": srcref or ", ".join(self.srcs.get(group, []))}}
        if structure:
            c["structure"] = structure
        if self.kind == "pathway":
            c["pathway"], c["step"] = group, step
        if vignette:
            c["vignette"] = vignette
        c.update({"prompt": prompt, "answer": answer, "accept": accept or [], "require_side": False})
        f = fmt or ("keywords" if kw else "type")
        c["format"] = f
        if kw:
            c["keywords"] = kw
        if choices:
            c["choices"] = choices
        c["tags"] = [self.kind, group]
        if explain:
            c["explain"] = explain
        if note:
            c["review_note"] = note
            c["status"] = "draft"
        if extra:
            c.update(extra)
        self.cards[unit].append(c)

    def dump(self, name):
        for u, cs in self.cards.items():
            for c in cs:
                if c["format"] == "keywords" and not c.get("keywords"):
                    c["format"] = "type"
            with open(os.path.join(C, "cards", f"{name}-{u}.json"), "w", encoding="utf8") as f:
                json.dump(cs, f, indent=1, ensure_ascii=False)
        print(name, {u: len(cs) for u, cs in self.cards.items()})
