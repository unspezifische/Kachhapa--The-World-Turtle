# 5etools creature and adventure catalog

The bestiary and adventure source files live in `5etools-src/data`, which is
ignored by Git. The catalog importer stores complete source JSON in PostgreSQL;
the running app does not need the source tree after import.

To publish to the development Pi through Tailscale, from the repository root:

```sh
./publish.sh --hostname raspberrypii --tailscale-ip 100.72.241.53 \
  --kachhapa --catalog --skip-foundry-check --check
./publish.sh --hostname raspberrypii --tailscale-ip 100.72.241.53 \
  --kachhapa --catalog --skip-foundry-check
```

The publisher builds the frontend, backs up PostgreSQL, applies migrations,
transfers only the catalog JSON, imports it, and checks routes through the
Tailscale IP. It does not select the separate MTG or Nginx deployment steps.

The import updates rows by `(source, name)` for creatures and `source` for
adventures. Repeating it updates source records without duplicating them.
Creature search includes all creatures whose source is not an adventure. An
adventure's creatures become available after the campaign installs that
adventure. Existing Waterdeep and Lost Mine installations use their existing
module keys, and gain access to WDH and LMoP creatures after catalog import.

Adventure chapters are accessible only to the campaign DM or owner from the
installed modules screen. The import does not install adventures into every
campaign; DMs choose them per campaign.
