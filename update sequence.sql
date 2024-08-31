SELECT pg_get_serial_sequence('inventory', 'id');
SELECT setval('public.inventory_id_seq', (SELECT COALESCE(MAX(id), 1) FROM inventory));