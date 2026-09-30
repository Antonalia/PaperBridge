# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 PaperBridge contributors.
"""Render a PDF page or a visually selected rectangle, without changing the PDF."""
import base64
import json
import sys
from pathlib import Path
import pymupdf
from extract_pdf import file_hash, geometry, native_rect

def process(request):
    source = Path(request['path'])
    if not source.is_file() or source.stat().st_size > 200 * 1024 * 1024:
        raise ValueError('PDF unavailable or exceeds 200 MB')
    before = file_hash(source)
    if request.get('file_sha256') and request['file_sha256'] != before:
        raise ValueError('PDF changed since rendering; render the page again')
    with pymupdf.open(source) as doc:
        if not doc.is_pdf or doc.needs_pass:
            raise ValueError('Only unencrypted PDFs are supported')
        number = request['page']
        if type(number) is not int or not 1 <= number <= len(doc):
            raise ValueError('Invalid physical page')
        page = doc[number - 1]
        box, unit = geometry(doc, page)
        original_rotation = page.rotation
        page.set_rotation(0)  # Display canonical unrotated geometry; never save.
        scale = 2
        if page.rect.width * scale > 5000 or page.rect.height * scale > 5000:
            scale = min(5000 / page.rect.width, 5000 / page.rect.height)
        full = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        clip = request.get('crop_pixels')
        native = None
        if clip is not None:
            if len(clip) != 4 or not all(type(x) in (int, float) for x in clip):
                raise ValueError('Invalid crop pixels')
            x0, y0, x1, y1 = clip
            if not 0 <= x0 < x1 <= full.width or not 0 <= y0 < y1 <= full.height:
                raise ValueError('Crop is outside rendered page')
            points = [x0 / scale, y0 / scale, min(page.rect.width, x1 / scale), min(page.rect.height, y1 / scale)]
            native = native_rect(points, box, unit)
            full = page.get_pixmap(matrix=pymupdf.Matrix(3, 3), clip=pymupdf.Rect(points), alpha=False)
        png = full.tobytes('png')
        if len(png) > 6 * 1024 * 1024:
            raise ValueError('PNG exceeds 6 MB; choose a smaller region')
        result = dict(file_sha256=before, page_count=len(doc), page_index=number-1,
                      page_label=page.get_label() or str(number), view_box=box,
                      width=full.width, height=full.height, scale=scale,
                      rotation_original=original_rotation, rect=native,
                      png_base64=base64.b64encode(png).decode())
    if file_hash(source) != before:
        raise ValueError('PDF changed during rendering')
    return result

if __name__ == '__main__':
    try:
        print(json.dumps(process(json.loads(sys.stdin.read())), ensure_ascii=True, allow_nan=False))
    except Exception as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=True))
        sys.exit(1)
