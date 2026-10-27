"""Markdown and print-ready PDF exports for campaign historical timelines."""

import io
import base64
import json
import re

import fitz


INK = (0.12, 0.14, 0.16)
MUTED = (0.38, 0.40, 0.43)
PAPER = (0.985, 0.976, 0.945)
CARD = (1.0, 1.0, 0.985)
RULE = (0.72, 0.67, 0.56)
DEFAULT_ACCENT = (0.78, 0.48, 0.20)


def _clean_pdf_text(value):
    return (str(value or '')
            .replace('\u2013', '-').replace('\u2014', '-').replace('\u2011', '-')
            .replace('\u2018', "'").replace('\u2019', "'")
            .replace('\u201c', '"').replace('\u201d', '"').replace('\u00b7', '-'))


def _markdown_text(value):
    return str(value or '').replace('\r\n', '\n').replace('\r', '\n')


def _safe_heading(value):
    return re.sub(r'([#*_`\\])', r'\\\1', _markdown_text(value).strip())


def timeline_export_event(event):
    end_date = None
    if event.get('end_year') is not None:
        end_date = {
            'year': event.get('end_year'), 'season': event.get('end_season'),
            'month_index': event.get('end_month_index'), 'day': event.get('end_day'),
        }
    return {
        'name': event.get('name'),
        'description': event.get('description'),
        'color': event.get('color'),
        'is_player_visible': bool(event.get('is_player_visible')),
        'date': {
            'year': event.get('year'), 'season': event.get('season'),
            'month_index': event.get('month_index'), 'day': event.get('day'),
        },
        'end_date': end_date,
        'characters': [{'name': character.get('name')} for character in event.get('characters') or []],
    }


def build_timeline_json(calendar_name, format_slug, events):
    return json.dumps({
        'schema': 'kachhapa.timeline',
        'version': 1,
        'calendar': {'name': calendar_name, 'format_slug': format_slug},
        'events': [timeline_export_event(event) for event in events],
    }, ensure_ascii=False, indent=2) + '\n'


def build_timeline_markdown(calendar_name, events):
    lines = [f'# {_safe_heading(calendar_name)} - Historical Timeline', '']
    if not events:
        lines.extend(['_No historical events have been recorded._', ''])
    for event in events:
        metadata = json.dumps(timeline_export_event(event), ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        encoded = base64.urlsafe_b64encode(metadata).decode('ascii').rstrip('=')
        lines.extend([f'<!-- kachhapa-timeline-event:{encoded} -->',
                      f"## {_safe_heading(event.get('name') or 'Untitled event')}", '',
                      f"**Date:** {_markdown_text(event.get('date_label'))}", ''])
        description = _markdown_text(event.get('description')).strip()
        if description:
            lines.extend([description, ''])
        characters = event.get('characters') or []
        if characters:
            lines.extend(['**Characters:**', ''])
            for character in characters:
                lines.append(f"- {_safe_heading(character.get('name'))}: {_markdown_text(character.get('label'))}")
            lines.append('')
    return '\n'.join(lines).rstrip() + '\n'


def _accent(value):
    if isinstance(value, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', value):
        return tuple(int(value[index:index + 2], 16) / 255 for index in (1, 3, 5))
    return DEFAULT_ACCENT


def _wrap(value, width_points, font='helv', size=8.5):
    text = _clean_pdf_text(value).strip()
    if not text:
        return []
    output = []
    for paragraph in text.splitlines() or ['']:
        words = paragraph.split()
        if not words:
            output.append('')
            continue
        line = words.pop(0)
        for word in words:
            candidate = f'{line} {word}'
            if fitz.get_text_length(candidate, fontname=font, fontsize=size) <= width_points:
                line = candidate
            else:
                output.append(line)
                line = word
        output.append(line)
    return output


def _event_blocks(event, card_width, max_body_lines):
    inner_width = card_width - 24
    description = _wrap(event.get('description'), inner_width, size=8.5)
    character_text = ', '.join(
        f"{_clean_pdf_text(character.get('name'))} ({_clean_pdf_text(character.get('label'))})"
        for character in event.get('characters') or []
    )
    character_lines = _wrap(f'Characters: {character_text}', inner_width, font='helv', size=7.5) if character_text else []
    body = [('description', line) for line in description]
    if description and character_lines:
        body.append(('space', ''))
    body.extend(('characters', line) for line in character_lines)
    if not body:
        body = [('description', '')]
    chunks = [body[index:index + max_body_lines] for index in range(0, len(body), max_body_lines)]
    return [{
        'event': event,
        'continued': index > 0,
        'body': chunk,
    } for index, chunk in enumerate(chunks)]


def _new_page(document, rect, title, orientation, page_number):
    page = document.new_page(width=rect.width, height=rect.height)
    page.draw_rect(page.rect, fill=PAPER, color=PAPER)
    page.insert_text((42, 31), _clean_pdf_text(title), fontname='tiro', fontsize=15, color=INK)
    page.insert_text((42, 46), f'Historical Timeline - {orientation.title()}', fontname='helv', fontsize=7.5, color=MUTED)
    footer = f'{page_number}'
    page.insert_text((rect.width - 42 - fitz.get_text_length(footer, fontsize=7), rect.height - 20), footer,
                     fontname='helv', fontsize=7, color=MUTED)
    return page


def _draw_card(page, block, rect):
    event = block['event']
    accent = _accent(event.get('color'))
    page.draw_rect(rect, color=RULE, fill=CARD, width=.7, radius=.04)
    page.draw_rect(fitz.Rect(rect.x0, rect.y0, rect.x0 + 4, rect.y1), color=accent, fill=accent)
    x = rect.x0 + 12
    y = rect.y0 + 16
    if block['continued']:
        label = f"{_clean_pdf_text(event.get('name'))} (continued)"
        page.insert_text((x, y), label, fontname='tibo', fontsize=9.5, color=INK)
        y += 14
    else:
        page.insert_text((x, y), _clean_pdf_text(event.get('date_label')).upper(),
                         fontname='hebo', fontsize=6.7, color=accent)
        y += 16
        title_lines = _wrap(event.get('name'), rect.width - 24, font='tibo', size=11)
        for line in title_lines[:2]:
            page.insert_text((x, y), line, fontname='tibo', fontsize=11, color=INK)
            y += 13
        y += 2
    for kind, line in block['body']:
        if kind == 'space':
            y += 4
            continue
        font = 'hebo' if kind == 'characters' and line.startswith('Characters:') else 'helv'
        size = 7.5 if kind == 'characters' else 8.5
        color = MUTED if kind == 'description' else INK
        page.insert_text((x, y), line, fontname=font, fontsize=size, color=color)
        y += 10


def _portrait_pdf(document, title, events):
    rect = fitz.paper_rect('a4')
    margin, gutter, header = 42, 42, 66
    card_width = (rect.width - margin * 2 - gutter) / 2
    blocks = []
    for event in events:
        blocks.extend(_event_blocks(event, card_width, 48))
    page_number, page, y = 0, None, header
    for index, block in enumerate(blocks):
        title_lines = 1 if block['continued'] else min(2, max(1, len(_wrap(block['event'].get('name'), card_width - 24, font='tibo', size=11))))
        card_height = (32 if block['continued'] else 36 + title_lines * 13) + len(block['body']) * 10 + 14
        if page is None or y + card_height > rect.height - 34:
            page_number += 1
            page = _new_page(document, rect, title, 'portrait', page_number)
            page.draw_line((rect.width / 2, header - 8), (rect.width / 2, rect.height - 34), color=RULE, width=1)
            y = header
        left = index % 2 == 0
        x0 = margin if left else rect.width / 2 + gutter / 2
        card_rect = fitz.Rect(x0, y, x0 + card_width, y + card_height)
        _draw_card(page, block, card_rect)
        node_y = y + 18
        page.draw_line((card_rect.x1 if left else rect.width / 2, node_y),
                       (rect.width / 2 if left else card_rect.x0, node_y), color=RULE, width=.8)
        page.draw_circle((rect.width / 2, node_y), 4, color=_accent(block['event'].get('color')),
                         fill=_accent(block['event'].get('color')))
        y += card_height + 13


def _landscape_pdf(document, title, events):
    portrait = fitz.paper_rect('a4')
    rect = fitz.Rect(0, 0, portrait.height, portrait.width)
    margin, gap, header = 42, 28, 62
    card_width = (rect.width - margin * 2 - gap) / 2
    rail_y = rect.height / 2 + 8
    max_body_lines = 14
    blocks = []
    for event in events:
        blocks.extend(_event_blocks(event, card_width, max_body_lines))
    for page_start in range(0, len(blocks), 2):
        page_number = page_start // 2 + 1
        page = _new_page(document, rect, title, 'landscape', page_number)
        page.draw_line((margin - 8, rail_y), (rect.width - margin + 8, rail_y), color=RULE, width=1.2)
        for slot, block in enumerate(blocks[page_start:page_start + 2]):
            x0 = margin + slot * (card_width + gap)
            title_lines = 1 if block['continued'] else min(2, max(1, len(_wrap(block['event'].get('name'), card_width - 24, font='tibo', size=11))))
            card_height = (32 if block['continued'] else 36 + title_lines * 13) + len(block['body']) * 10 + 14
            above = (page_start + slot) % 2 == 0
            y0 = rail_y - 24 - card_height if above else rail_y + 24
            card_rect = fitz.Rect(x0, y0, x0 + card_width, y0 + card_height)
            _draw_card(page, block, card_rect)
            node_x = x0 + card_width / 2
            page.draw_line((node_x, card_rect.y1 if above else card_rect.y0),
                           (node_x, rail_y), color=RULE, width=.8)
            page.draw_circle((node_x, rail_y), 4, color=_accent(block['event'].get('color')),
                             fill=_accent(block['event'].get('color')))


def build_timeline_pdf(calendar_name, events, orientation='portrait'):
    if orientation not in {'portrait', 'landscape'}:
        raise ValueError('PDF orientation must be portrait or landscape.')
    document = fitz.open()
    if orientation == 'portrait':
        _portrait_pdf(document, calendar_name, events)
    else:
        _landscape_pdf(document, calendar_name, events)
    if not events:
        rect = fitz.paper_rect('a4')
        if orientation == 'landscape':
            rect = fitz.Rect(0, 0, rect.height, rect.width)
        page = _new_page(document, rect, calendar_name, orientation, 1)
        page.insert_text((42, 95), 'No historical events have been recorded.', fontname='tiro', fontsize=12, color=MUTED)
    output = io.BytesIO(document.tobytes(garbage=4, deflate=True))
    document.close()
    output.seek(0)
    return output
