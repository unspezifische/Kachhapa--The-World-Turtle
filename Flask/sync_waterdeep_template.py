"""Synchronize a campaign's Waterdeep settlement with the packaged module template."""

import argparse

from app import Campaign, MEDIA_ROOT, MapPointOfInterest, PartyMapPosition, app, db, import_module_settlement
from module_templates import waterdeep_dragon_heist_template


def sync_campaign(campaign_name, commit=False):
    campaign = next(
        (item for item in Campaign.query.all() if item.name.strip().casefold() == campaign_name.strip().casefold()),
        None,
    )
    if not campaign:
        raise SystemExit(f'Campaign not found: {campaign_name}')
    template = waterdeep_dragon_heist_template(MEDIA_ROOT)
    existing = next((item for item in campaign_locations(campaign.id) if item.map_key == template['map_key'] or item.name.strip().casefold() == template['name'].casefold()), None)
    previous_map_key = existing.map_key if existing else template['map_key']
    location, result = import_module_settlement(campaign, template, 'override')
    # Keep this utility compatible with older deployed backends whose module
    # importer predates settlement environment/ward synchronization.
    location.environment = template.get('environment', {})
    location.map_key = template['map_key']
    for point in MapPointOfInterest.query.filter_by(campaign_id=campaign.id, map_key=previous_map_key).all():
        point.map_key = location.map_key
    party = PartyMapPosition.query.filter_by(campaign_id=campaign.id, map_key=previous_map_key).first()
    if party:
        party.map_key = location.map_key
    if commit:
        db.session.commit()
    else:
        db.session.rollback()
    return {
        'campaign_id': campaign.id, 'campaign': campaign.name, 'settlement_id': location.id,
        'result': result, 'roads': len(template['roads']),
        'wards': len(template['environment']['regions']),
        'walls': len(template['environment']['fortifications']), 'committed': commit,
    }


def campaign_locations(campaign_id):
    from app import WorldAtlasLocation
    return WorldAtlasLocation.query.filter_by(campaign_id=campaign_id).all()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--campaign', default='Test')
    parser.add_argument('--commit', action='store_true', help='Persist the replacement; otherwise perform a dry run.')
    args = parser.parse_args()
    with app.app_context():
        print(sync_campaign(args.campaign, args.commit))
