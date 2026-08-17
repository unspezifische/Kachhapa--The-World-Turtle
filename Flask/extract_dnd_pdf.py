#!/usr/bin/env python3
"""Extract verifiable sections and 5e-style creature stat blocks from a PDF.

This first-pass ETL tool deliberately writes JSON and cropped PNG images instead
of inserting into Postgres.  That makes the parsing result easy to inspect before
we commit a particular PDF's interpretation to the database.

The Player's Handbook has several layouts.  Ordinary book sections are detected
from heading typography, while Appendix D stat blocks are detected by a stronger
signature: a bold all-caps creature name immediately followed by an italicized
creature descriptor.  Stat blocks are treated as layout regions, not text
paragraphs, so their STR/DEX/... score rows retain their intended ordering.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable

import fitz  # PyMuPDF


ABILITY_NAMES = ("STR", "DEX", "CON", "INT", "WIS", "CHA")
MIN_CREATURE_NAME_SIZE = 10.0
STAT_BLOCK_MARGIN = 3.0


@dataclass(frozen=True)
class TextLine:
    text: str
    rect: fitz.Rect
    font_size: float
    font: str
    flags: int

    @property
    def is_bold(self) -> bool:
        return "bold" in self.font.lower() or bool(self.flags & 16)

    @property
    def is_italic(self) -> bool:
        return "italic" in self.font.lower() or bool(self.flags & 2)


@dataclass(frozen=True)
class StatBlockStart:
    name: str
    descriptor: str
    rect: fitz.Rect


def normalized_text(text: str) -> str:
    """Keep extracted text readable without attempting OCR correction."""
    return re.sub(r"\s+", " ", text).strip()


def page_lines(page: fitz.Page) -> list[TextLine]:
    """Read text in physical lines, preserving font and position information."""
    results: list[TextLine] = []
    for block in page.get_text("dict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            spans = line["spans"]
            text = normalized_text("".join(span["text"] for span in spans))
            if not text:
                continue
            dominant = max(spans, key=lambda span: len(span["text"].strip()))
            results.append(
                TextLine(
                    text=text,
                    rect=fitz.Rect(line["bbox"]),
                    font_size=float(dominant["size"]),
                    font=dominant["font"],
                    flags=int(dominant["flags"]),
                )
            )
    return results


def looks_like_creature_name(line: TextLine) -> bool:
    letters = re.sub(r"[^A-Za-z]", "", line.text)
    return (
        len(letters) >= 3
        and letters.isupper()
        and len(line.text) <= 45
        and line.font_size >= MIN_CREATURE_NAME_SIZE
        and line.is_bold
    )


def looks_like_creature_descriptor(line: TextLine) -> bool:
    # e.g. "Medium beast, unaligned" or "Tiny fiend (demon), chaotic evil"
    return (
        line.is_italic
        and 5 <= len(line.text) <= 110
        and "," in line.text
        and bool(re.search(r"\b(tiny|small|medium|large|huge|gargantuan)\b", line.text, re.I))
    )


def detect_stat_block_starts(lines: list[TextLine]) -> list[StatBlockStart]:
    """Find 5e stat-block headings using the name + descriptor signature."""
    starts: list[StatBlockStart] = []
    for name_line in lines:
        name_letters = re.sub(r"[^A-Za-z]", "", name_line.text)
        if (
            name_line.font_size < MIN_CREATURE_NAME_SIZE
            or len(name_letters) < 3
            or not name_letters.isupper()
            or len(name_line.text) > 45
        ):
            continue
        # A compound name can be split into spans.  Only the leftmost span may
        # start an entry, which prevents a duplicate "Snake" after "Poisonous".
        same_baseline = [
            candidate
            for candidate in lines
            if candidate.font_size >= MIN_CREATURE_NAME_SIZE
            and abs(candidate.rect.y0 - name_line.rect.y0) <= 3
            and name_line.rect.x0 - 220 <= candidate.rect.x0 <= name_line.rect.x0 + 220
            and re.sub(r"[^A-Za-z]", "", candidate.text).isupper()
        ]
        if any(candidate.rect.x0 < name_line.rect.x0 - 2 for candidate in same_baseline):
            continue
        name_parts = sorted(
            (
                candidate
                for candidate in same_baseline
                if name_line.rect.x0 - 2 <= candidate.rect.x0 <= name_line.rect.x0 + 220
            ),
            key=lambda item: item.rect.x0,
        )
        nearby = sorted(
            (
                candidate
                for candidate in lines
                if candidate.is_italic
                and name_line.rect.y1 - 2 <= candidate.rect.y0 <= name_line.rect.y1 + 24
                and name_line.rect.x0 - 5 <= candidate.rect.x0 <= name_line.rect.x0 + 250
            ),
            key=lambda item: (item.rect.y0, item.rect.x0),
        )
        if nearby:
            descriptor_parts = [
                candidate
                for candidate in nearby
                if abs(candidate.rect.y0 - nearby[0].rect.y0) <= 3
            ]
            descriptor_text = " ".join(part.text for part in descriptor_parts)
            if not re.search(r"\b(tiny|small|medium|large|huge|gargantuan)\b", descriptor_text, re.I):
                continue
            descriptor_rect = descriptor_parts[0].rect
            for part in descriptor_parts[1:]:
                descriptor_rect |= part.rect
            starts.append(
                StatBlockStart(
                    name=" ".join(part.text for part in name_parts).title(),
                    descriptor=descriptor_text,
                    rect=name_line.rect | descriptor_rect,
                )
            )
    return sorted(starts, key=lambda item: (item.rect.x0, item.rect.y0))


def column_bounds(page: fitz.Page, start: StatBlockStart, starts: list[StatBlockStart]) -> fitz.Rect:
    """Return the local layout region occupied by a stat block.

    Many PHB appendix pages have two columns, but the method works from the
    detected starts rather than assuming an exact page midpoint.  It remains
    safe for an isolated block by falling back to the usual inner page margins.
    """
    # The PHB's appendix uses two wide half-page columns.  A creature name is
    # left-aligned within its column, so a midpoint between name positions would
    # be too far left (it would cut the left block in half).  Use the actual page
    # centre as the gutter; the later crop uses the next heading's y-coordinate.
    x0, x1 = 42.0, page.rect.width - 42.0
    midpoint = page.rect.width / 2
    if start.rect.x0 < midpoint:
        x1 = midpoint - 4
    else:
        x0 = midpoint + 4
    return fitz.Rect(x0, 60.0, x1, page.rect.height - 32.0)


def stat_block_rect(page: fitz.Page, start: StatBlockStart, starts: list[StatBlockStart]) -> fitz.Rect:
    column = column_bounds(page, start, starts)
    following = [
        other
        for other in starts
        if other.rect.x0 >= column.x0 - 2
        and other.rect.x0 <= column.x1 + 2
        and other.rect.y0 > start.rect.y0 + 3
    ]
    bottom = min((other.rect.y0 for other in following), default=column.y1)
    return fitz.Rect(column.x0, start.rect.y0 - STAT_BLOCK_MARGIN, column.x1, bottom - STAT_BLOCK_MARGIN)


def lines_in_rect(lines: Iterable[TextLine], rect: fitz.Rect) -> list[TextLine]:
    return sorted(
        (line for line in lines if rect.intersects(line.rect) and rect.contains(line.rect)),
        key=lambda line: (round(line.rect.y0 / 3) * 3, line.rect.x0),
    )


def extract_ability_scores(lines: Iterable[TextLine]) -> dict[str, str]:
    """Read the labelled two-row ability-score grid without hard-coded columns."""
    rows: list[list[TextLine]] = []
    for line in sorted(lines, key=lambda item: (item.rect.y0, item.rect.x0)):
        if not rows or abs(rows[-1][0].rect.y0 - line.rect.y0) > 4:
            rows.append([line])
        else:
            rows[-1].append(line)

    for index in range(len(rows) - 1):
        header = sorted(rows[index], key=lambda item: item.rect.x0)
        header_text = " ".join(line.text for line in header)
        names = re.findall(r"\b(?:STR|DEX|CON|INT|WIS|CHA)\b", header_text.upper())
        # The PHB's text layer occasionally misreads individual labels (e.g.
        # STR -> SIR).  The two-row, six-cell geometry is still unambiguous, so
        # use positional labels as a fallback and retain the standard 5e order.
        header_cells = [line.text for line in header if len(line.text) <= 4]
        resembles_ability_row = len(header_cells) == 6 and sum(cell.isupper() for cell in header_cells) >= 4
        if (len(names) == 6 and tuple(names) == ABILITY_NAMES) or resembles_ability_row:
            values = sorted(rows[index + 1], key=lambda item: item.rect.x0)
            if abs(values[0].rect.y0 - header[0].rect.y1) > 25:
                continue
            value_text = " ".join(line.text for line in values)
            pairs = re.findall(r"[\dOG]+\s*[\(\{]\s*[+\-]?\s*[\dOG]+\s*[\)\}]", value_text)
            if len(pairs) == 6:
                cleaned = [pair.replace("O", "0").replace("G", "6").replace("{", "(").replace("}", ")") for pair in pairs]
                return dict(zip(ABILITY_NAMES, cleaned))
    return {}


def block_text(lines: Iterable[TextLine]) -> str:
    """Reassemble local lines in visual reading order for review and embedding."""
    return "\n".join(line.text for line in lines)


def detect_section_headings(lines: Iterable[TextLine]) -> list[dict[str, object]]:
    """Conservative typography-based heading candidates for ordinary prose pages."""
    headings = []
    for line in lines:
        is_short = len(line.text) <= 90
        has_body_size = line.font_size >= 11.0
        is_heading_case = line.text.isupper() or line.text == line.text.title()
        if is_short and has_body_size and is_heading_case and line.is_bold:
            headings.append({
                "text": line.text,
                "bbox": [round(value, 2) for value in line.rect],
                "font_size": round(line.font_size, 2),
            })
    return headings


def save_stat_block_image(page: fitz.Page, rect: fitz.Rect, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    pixmap = page.get_pixmap(clip=rect, dpi=180, alpha=False)
    pixmap.save(destination)


def process_pdf(pdf_path: Path, output_dir: Path, page_range: range, make_images: bool) -> None:
    document = fitz.open(pdf_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    entries_path = output_dir / "stat_blocks.jsonl"
    sections_path = output_dir / "section_candidates.json"
    all_sections: list[dict[str, object]] = []
    entries = 0

    with entries_path.open("w", encoding="utf-8") as output:
        for page_number in page_range:
            page = document[page_number - 1]
            lines = page_lines(page)
            starts = detect_stat_block_starts(lines)
            all_sections.append({"pdf_page": page_number, "headings": detect_section_headings(lines)})
            for start in starts:
                rect = stat_block_rect(page, start, starts)
                local_lines = lines_in_rect(lines, rect)
                image_name = f"p{page_number:03d}_{re.sub(r'[^a-z0-9]+', '_', start.name.lower()).strip('_')}.png"
                entry = {
                    "kind": "stat_block",
                    "source_pdf": pdf_path.name,
                    "pdf_page": page_number,
                    "name": start.name,
                    "descriptor": start.descriptor,
                    "bbox": [round(value, 2) for value in rect],
                    "ability_scores": extract_ability_scores(local_lines),
                    "text": block_text(local_lines),
                    "image": f"stat_blocks/{image_name}" if make_images else None,
                    "continues_to_next_page": rect.y1 >= page.rect.height - 40,
                }
                output.write(json.dumps(entry, ensure_ascii=False) + "\n")
                if make_images:
                    save_stat_block_image(page, rect, output_dir / "stat_blocks" / image_name)
                entries += 1

    sections_path.write_text(json.dumps(all_sections, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Detected {entries} stat-block regions.")
    print(f"Review JSON: {entries_path}")
    if make_images:
        print(f"Review crops: {output_dir / 'stat_blocks'}")


def parse_page_range(value: str, total_pages: int) -> range:
    match = re.fullmatch(r"(\d+)(?:-(\d+))?", value)
    if not match:
        raise argparse.ArgumentTypeError("Use PAGE or START-END, for example 305-312.")
    start = int(match.group(1))
    end = int(match.group(2) or start)
    if start < 1 or end < start or end > total_pages:
        raise argparse.ArgumentTypeError(f"Pages must be within 1-{total_pages}.")
    return range(start, end + 1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, default=Path("etl_review"))
    parser.add_argument("--pages", default="305-312", help="PDF page(s), such as 305-312")
    parser.add_argument("--no-images", action="store_true", help="Skip cropped PNG creation")
    args = parser.parse_args()
    if not args.pdf.is_file():
        parser.error(f"PDF does not exist: {args.pdf}")
    with fitz.open(args.pdf) as document:
        page_range = parse_page_range(args.pages, document.page_count)
    process_pdf(args.pdf, args.output, page_range, not args.no_images)


if __name__ == "__main__":
    main()
