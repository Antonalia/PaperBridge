# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 PaperBridge contributors.
"""Read local PDF text and return native, unrotated PDF annotation rectangles."""
import hashlib
import json
import math
import re
import sys
from pathlib import Path

import pymupdf

ANNOTATION_GEOMETRY = "compact-font-disjoint-v1"


def highlight_char_rect(char, span, horizontal=True):
    """Remove inflated font line-height padding, retaining original X edges.

    Leave already compact fonts and non-horizontal text alone. Each span uses
    its own baseline and font metrics, including superscripts and subscripts.
    """
    rect = list(char["bbox"])
    size, ascender, descender = span.get("size"), span.get("ascender"), span.get("descender")
    origin = char.get("origin")
    if not horizontal or not origin or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (size, ascender, descender)):
        return rect
    if size <= 0 or ascender <= descender or rect[3] - rect[1] <= size * 1.05 + 0.01:
        return rect
    bottom = origin[1] - size * descender / (ascender - descender)
    top = bottom - size
    # Do not expand uncertain/OCR font geometry beyond the source rectangle.
    top, bottom = max(rect[1], top), min(rect[3], bottom)
    if bottom > top:
        rect[1], rect[3] = top, bottom
    return rect


def disjoint_rect_union(rects):
    """Represent the identical covered area without double-painted overlaps.

    Normally returns the original line rectangles. Inline mathematics can make
    a compact line envelope touch its neighbour; split only those overlaps into
    nonoverlapping bands instead of cropping formula coverage.
    """
    def intersects(a, b):
        return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])
    if not any(intersects(a, b) for i, a in enumerate(rects) for b in rects[i + 1:]):
        return rects
    edges = sorted({r[1] for r in rects} | {r[3] for r in rects}, reverse=True)
    result, active = [], {}
    for top, bottom in zip(edges, edges[1:]):
        intervals = sorted((r[0], r[2]) for r in rects if r[1] < top and r[3] > bottom)
        merged = []
        for left, right in intervals:
            if merged and left <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], right)
            else:
                merged.append([left, right])
        current = {}
        for left, right in merged:
            key = (left, right)
            previous = active.get(key)
            if previous is not None and result[previous][1] == top:
                result[previous][1] = bottom
                current[key] = previous
            else:
                current[key] = len(result)
                result.append([left, bottom, right, top])
        active = current
    return result


def file_hash(path):
    with open(path, "rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def inherited(doc, xref, key):
    visited = set()
    while xref and xref not in visited:
        visited.add(xref)
        kind, value = doc.xref_get_key(xref, key)
        if kind != "null":
            if kind == "xref":
                value = doc.xref_object(int(value.split()[0]), compressed=True)
            return value
        kind, parent = doc.xref_get_key(xref, "Parent")
        xref = int(parent.split()[0]) if kind == "xref" else 0
    return None


def geometry(doc, page):
    def box(key):
        value = inherited(doc, page.xref, key)
        values = [float(n) for n in re.findall(r"[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?", value or "")]
        if len(values) != 4:
            raise ValueError(f"Unsupported PDF {key}")
        return pymupdf.Rect(values).normalize()
    media = box("MediaBox")
    crop = box("CropBox") if inherited(doc, page.xref, "CropBox") else media
    crop = crop & media
    unit = float(inherited(doc, page.xref, "UserUnit") or 1)
    if not math.isfinite(unit) or unit <= 0 or crop.is_empty:
        raise ValueError("Unsupported PDF page geometry")
    return list(crop), unit


def native_rect(rect, view_box, unit):
    x0, y0, x1, y1 = rect
    left, bottom, right, top = view_box
    result = [left + x0 / unit, top - y1 / unit, left + x1 / unit, top - y0 / unit]
    result = [max(left, result[0]), max(bottom, result[1]), min(right, result[2]), min(top, result[3])]
    if result[2] <= result[0] or result[3] <= result[1]:
        return None
    return [round(number, 5) for number in result]


def lines(page, view_box, unit):
    offset = 0
    output = []
    for block in page.get_text("rawdict", sort=True)["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            horizontal = line.get("wmode", 0) == 0 and abs(line.get("dir", (1, 0))[1]) < 0.00001
            chars = [{**char, "highlight_bbox": highlight_char_rect(char, span, horizontal)}
                     for span in line["spans"] for char in span.get("chars", [])]
            text = "".join(char["c"] for char in chars)
            if text.strip():
                character_boxes = [pymupdf.Rect(char["highlight_bbox"]) for char in chars]
                envelope = character_boxes[0]
                for extra in character_boxes[1:]:
                    envelope |= extra
                rect = native_rect(list(envelope), view_box, unit)
                if rect:
                    output.append({"text": text, "rects": [rect], "offset": offset, "chars": chars})
            offset += len(text) + 1
    return output


def find_matches(page_lines, query, view_box, unit):
    # Collapse whitespace while retaining a source-character map for exact boxes.
    stream, mapping = [], []
    for line_index, line in enumerate(page_lines):
        for char in line["chars"]:
            for value in char["c"]:
                value = " " if value.isspace() else value
                if value == " " and (not stream or stream[-1] == " "):
                    continue
                stream.append(value)
                mapping.append((line_index, char))
        if stream and stream[-1] != " ":
            stream.append(" ")
            mapping.append(None)
    haystack = "".join(stream)
    needle = " ".join(query.split())
    if not needle:
        raise ValueError("Search text must not be empty")
    start = 0
    matches = []
    while (found := haystack.find(needle, start)) >= 0:
        grouped = {}
        for point in mapping[found:found + len(needle)]:
            if point is not None:
                line_index, char = point
                grouped.setdefault(line_index, []).append(pymupdf.Rect(char["highlight_bbox"]))
        rects = []
        for rectangles in grouped.values():
            rectangle = rectangles[0]
            for extra in rectangles[1:]:
                rectangle |= extra
            converted = native_rect(list(rectangle), view_box, unit)
            if converted:
                rects.append(converted)
        if rects:
            matches.append({"text": haystack[found:found + len(needle)], "rects": disjoint_rect_union(rects), "offset": found})
        start = found + len(needle)
        if len(matches) >= 100:
            break
    return matches


def extract(request):
    path = Path(request["path"])
    if not path.is_file() or path.stat().st_size > 200 * 1024 * 1024:
        raise ValueError("PDF is unavailable or larger than 200 MB")
    before = file_hash(path)
    with pymupdf.open(path) as doc:
        if not doc.is_pdf or doc.needs_pass:
            raise ValueError("Only unencrypted local PDFs are supported")
        start, end = request.get("start_page", 1), request.get("end_page", 10)
        if isinstance(start, bool) or isinstance(end, bool) or not isinstance(start, int) or not isinstance(end, int) or start < 1 or start > len(doc) or end < start or end - start >= 20:
            raise ValueError("Read 1–20 valid physical pages at a time")
        pages = []
        for index in range(start - 1, min(end, len(doc))):
            page = doc[index]
            view_box, unit = geometry(doc, page)
            page_lines = lines(page, view_box, unit)
            passages = find_matches(page_lines, request["query"], view_box, unit) if "query" in request else page_lines
            pages.append({
                "page": index + 1, "page_index": index, "page_label": page.get_label() or str(index + 1),
                "view_box": view_box, "rotation": page.rotation, "needs_ocr": not bool(page_lines),
                "passages": [{key: value for key, value in passage.items() if key != "chars"} for passage in passages],
            })
        result = {"file_sha256": before, "page_count": len(doc), "annotation_geometry": ANNOTATION_GEOMETRY, "pages": pages}
    if file_hash(path) != before:
        raise ValueError("PDF changed during extraction; read it again")
    return result


if __name__ == "__main__":
    try:
        result = extract(json.loads(sys.stdin.read()))
        print(json.dumps(result, ensure_ascii=True, allow_nan=False))
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=True))
        sys.exit(1)
