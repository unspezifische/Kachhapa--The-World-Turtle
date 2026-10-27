"""Validation helpers shared by campaign catalog endpoints."""


def normalized_loot_box_items(items):
    """Coerce, combine, and discard invalid loot-box item payloads."""
    quantities = {}
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        try:
            item_id = int(item.get('id'))
            quantity = max(1, int(item.get('quantity', 1)))
        except (TypeError, ValueError):
            continue
        if item_id <= 0:
            continue
        quantities[item_id] = quantities.get(item_id, 0) + quantity
    return [{'id': item_id, 'quantity': quantity} for item_id, quantity in quantities.items()]
