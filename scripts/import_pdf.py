#!/usr/bin/env python3
"""
Dek PDF importer.

Converts a slide-export PDF into a Dek `deck.md`: extracts text blocks + images
per page, classifies each page into one of Dek's named layouts, maps the content
into that layout's fields, and emits the deck. Images are expected to already be
extracted into the assets dir as `M7_p{PAGE:03d}_img{N}.jpeg` (1-based page/index).

Usage:
  python scripts/import_pdf.py [PDF_PATH] [--assets DIR] [--out FILE] [--public-prefix /Assets]

Heuristics are a starting point — expect to fix a handful of slides in the editor.
"""
import argparse
import glob
import os
import re
import sys
import unicodedata

import fitz  # PyMuPDF
import yaml

W, H = 720.0, 405.0  # source page is 16:9

DEFAULT_PDF = r"D:\Google Drive\THRO\lectures\Film und Postproduktion\Input\M7 Film- und Postproduktion 2026 (1).pdf"

CONFIG = {
    "deck": "M7 Film- und Postproduktion",
    "ratio": "16:9",
    "paginate": True,
    "header": "HMKW – GDVK – M7 Film- und Postproduktion",
    "footer": "Prof. Seb Hirsch · M7 Film- und Postproduktion",
    "theme": {
        "bg": "#070809",
        "text": "#e6ecf2",
        "accent": "#7fc7ff",
        "accent2": "#ffb474",
        "glow": True,
        "fontHeading": "Cormorant Garamond",
        "fontBody": "JetBrains Mono",
    },
}


def page_image_files(assets, prefix, P):
    """Existing image files for 1-based page P, ordered by their img index."""
    files = glob.glob(os.path.join(assets, f"M7_p{P:03d}_img*.jpeg"))
    files.sort(key=lambda f: int(re.search(r"img(\d+)", f).group(1)))
    return [f"{prefix}/{os.path.basename(f)}" for f in files]


def body_blocks(page):
    """Text blocks minus the running header, with bbox + max font size."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        x0, y0, x1, y1 = b["bbox"]
        text, size = "", 0.0
        for line in b["lines"]:
            for span in line["spans"]:
                text += span["text"]
                size = max(size, span["size"])
            text += "\n"
        # NFKC folds typographic ligatures (ﬀ→ff, ﬁ→fi) back to plain ASCII
        text = unicodedata.normalize("NFKC", text).strip()
        if not text:
            continue
        if y0 < 22 and x0 < 170 and "HMKW" in text:  # running header
            continue
        out.append({"bbox": (x0, y0, x1, y1), "text": text, "size": size,
                    "cy": (y0 + y1) / 2, "cx": (x0 + x1) / 2})
    out.sort(key=lambda b: b["bbox"][1])  # top to bottom
    return out


def page_videos(page):
    vids = []
    for l in page.get_links():
        uri = l.get("uri", "")
        if re.search(r"youtube|youtu\.be|vimeo", uri, re.I):
            r = l["from"]
            vids.append({"uri": uri, "area": (r[2] - r[0]) * (r[3] - r[1])})
    return vids


def img_coverage(page):
    """(max area fraction, is_fullbleed, center_x_fraction of largest image)."""
    best = 0.0
    fullbleed = False
    cx = 0.5
    for im in page.get_image_info():
        x0, y0, x1, y1 = im["bbox"]
        frac = ((x1 - x0) / W) * ((y1 - y0) / H)
        if (x1 - x0) >= 0.92 * W and (y1 - y0) >= 0.9 * H:
            fullbleed = True
        if frac > best:
            best = frac
            cx = ((x0 + x1) / 2) / W
    return best, fullbleed, cx


BULLET_RE = re.compile(r"^[\s■•▪◦·▶▸\-–—\*]+")
NUM_RE = re.compile(r"^\d+[\.\)]\s*")


def split_items(text):
    items = []
    for line in text.split("\n"):
        s = NUM_RE.sub("", BULLET_RE.sub("", line)).strip()
        if s:
            items.append(s)
    return items


def oneline(text):
    return re.sub(r"\s+", " ", text.replace("\n", " ")).strip()


def classify(page, pn, assets, prefix):
    P = pn + 1
    blocks = body_blocks(page)
    files = page_image_files(assets, prefix, P)
    vids = page_videos(page)
    cov, fullbleed, cx = img_coverage(page)
    big_vid = max((v for v in vids if v["area"] > 0.25 * W * H), key=lambda v: v["area"], default=None)

    # 1) Cover (first page) — usually a single oversized mark.
    if pn == 0:
        title = blocks[0]["text"] if blocks else "Title"
        return {"layout": "cover", "title": oneline(title), "subtitle": "", "byline": ""}

    # 2) Video page: a large youtube/vimeo link, poster = the page's image.
    if big_vid and files:
        cap = ""
        # a short text block (not a heading) becomes the caption
        shorts = [b for b in blocks if len(b["text"]) < 90]
        if shorts:
            cap = oneline(shorts[-1]["text"])
        return {"layout": "video-embed", "video": big_vid["uri"], "poster": files[0], "caption": cap}

    # 3) Pages with image(s)
    if files:
        if len(files) >= 2:
            items = [{"image": f} for f in files]
            # attach short labels if their count lines up
            labels = [oneline(b["text"]) for b in blocks if len(b["text"]) < 30]
            if len(labels) == len(files):
                items = [{"image": f, "label": l} for f, l in zip(files, labels)]
            title = ""
            heads = [b for b in blocks if len(b["text"]) < 40 and b["size"] >= 18]
            if heads and len(labels) != len(files):
                title = oneline(heads[0]["text"])
            return {"layout": "gallery", "title": title, "columns": "auto", "items": items}

        # exactly one image
        if fullbleed and len(blocks) <= 1:
            slide = {"layout": "image-full", "image": files[0]}
            if blocks:
                b = blocks[0]
                key = "title" if b["cy"] < H * 0.35 else "caption"
                slide[key] = oneline(b["text"])
            slide["focus"] = {"x": 0, "y": 0, "scale": 1}
            return slide

        if len(blocks) >= 2:
            title = oneline(blocks[0]["text"])
            items = []
            for b in blocks[1:]:
                items += split_items(b["text"])
            side = "right" if cx >= 0.5 else "left"
            return {"layout": "bullets-image", "title": title, "side": side,
                    "image": files[0], "items": items or [""],
                    "focus": {"x": 0, "y": 0, "scale": 1}}

        # one image, at most one text block -> framed image + caption
        cap = oneline(blocks[0]["text"]) if blocks else ""
        return {"layout": "image-caption", "image": files[0], "caption": cap,
                "captionPos": "bottom-right", "focus": {"x": 0, "y": 0, "scale": 1}}

    # 4) No images
    if not blocks:
        return {"layout": "section", "title": ""}

    if len(blocks) == 1:
        b = blocks[0]
        txt = oneline(b["text"])
        if b["size"] >= 40 or (len(txt) <= 24 and b["size"] >= 24):
            return {"layout": "section", "title": txt}
        return {"layout": "statement", "text": txt, "cite": ""}

    # heading + list
    title = oneline(blocks[0]["text"])
    items = []
    for b in blocks[1:]:
        items += split_items(b["text"])
    return {"layout": "bullets", "title": title, "items": items or [""]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", nargs="?", default=DEFAULT_PDF)
    ap.add_argument("--assets", default=os.path.join(os.path.dirname(__file__), "..", "public", "Assets"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "deck.md"))
    ap.add_argument("--public-prefix", default="/Assets")
    args = ap.parse_args()

    assets = os.path.abspath(args.assets)
    doc = fitz.open(args.pdf)
    slides = []
    counts = {}
    for pn in range(len(doc)):
        s = classify(doc[pn], pn, assets, args.public_prefix)
        counts[s["layout"]] = counts.get(s["layout"], 0) + 1
        slides.append(s)

    dump = lambda d: yaml.safe_dump(d, allow_unicode=True, sort_keys=False, width=10000).rstrip()
    parts = ["---\n" + dump(CONFIG)]
    for s in slides:
        parts.append("---\n" + dump(s))
    out = os.path.abspath(args.out)
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(parts) + "\n")

    print(f"Imported {len(slides)} slides -> {out}")
    for k, v in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {v:4d}  {k}")


if __name__ == "__main__":
    sys.exit(main())
