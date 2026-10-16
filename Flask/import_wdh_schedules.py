"""Explicit, repeatable campaign import of the supplied WDH authoring bundle.

Run from Flask with the application environment. Defaults to preview only.
Does not create missing NPCs or infer location IDs from names.
"""
import argparse
import json
from pathlib import Path
from app import app, db, Campaign, NPC
from flask_jwt_extended import create_access_token

ALIASES = {'black-viper': 'esvele-rosznar', 'felrekt-lafeen': 'fel-rekt-lafeen',
           'krebbyg-masqilyr': 'krebbyg-masq-il-yr', 'narl-xibrindas': 'nar-l-xibrindas',
           'noska-urgray': 'noska-ur-gray'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--campaign', type=int, required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--replace-manshoon', action='store_true')
    parser.add_argument('--file', type=Path, default=Path(__file__).parents[1] / 'docs/npc-schedules/wdh-v1/character-schedules.jsonl')
    args = parser.parse_args()
    documents = [json.loads(line) for line in args.file.read_text().splitlines() if line.strip()]
    with app.app_context():
        campaign = db.session.get(Campaign, args.campaign)
        if not campaign:
            raise SystemExit('Campaign not found')
        if 'waterdeep' not in (campaign.module or '').lower() and not any(n.module_key == 'waterdeep_dragon_heist' for n in NPC.query.filter_by(campaign_id=campaign.id).all()):
            raise SystemExit('This campaign has no WDH module NPCs')
        headers = {'CampaignID': str(campaign.id), 'Authorization': 'Bearer ' + create_access_token(identity=campaign.owner.username)}
        client = app.test_client()
        report = []
        for document in documents:
            key = document['npc_key']
            if args.replace_manshoon and key in ('manshoon', 'manshoon-s-simulacrum'):
                report.append({'key':key, 'status':'excluded for personal replacement'})
                continue
            module = document['module_key']
            matches = [n for n in NPC.query.filter_by(campaign_id=campaign.id).all() if
                       (module == 'waterdeep_dragon_heist' and n.module_key == module and ALIASES.get(n.source_key, n.source_key) == key) or
                       (key == 'elion-uslagul' and n.source == 'Homebrew' and n.name.casefold() == 'elion uslagul')]
            if len(matches) != 1:
                report.append({'key':key, 'status':'unassigned', 'matches':len(matches)})
                continue
            npc = matches[0]
            if (npc.profile_metadata or {}).get('schedule_definition_id'):
                report.append({'key':key, 'npc_id':npc.id, 'status':'existing schedule preserved'})
                continue
            record = {'npc_id':npc.id, 'schedule':document, 'expected_revision':npc.revision}
            result = client.post('/api/npcs/schedules/import', json={'records':[record], 'apply':args.apply}, headers=headers)
            if result.status_code != 200:
                raise SystemExit(f'Import failed: {result.status_code} {result.json}')
            report.append({'key':key, **result.json['results'][0]})
        if args.replace_manshoon:
            for npc in NPC.query.filter_by(campaign_id=campaign.id).all():
                if npc.source_key in ('manshoon', 'manshoon-s-simulacrum') or 'manshoon' in npc.name.casefold():
                    if args.apply and not (npc.profile_metadata or {}).get('disabled'):
                        result = client.patch(f'/api/npcs/{npc.id}', json={'expected_revision':npc.revision, 'disabled':True}, headers=headers)
                        if result.status_code != 200:
                            raise SystemExit(f'Disable failed: {result.status_code} {result.json}')
                    report.append({'npc_id':npc.id, 'name':npc.name, 'status':'disabled' if args.apply else 'would disable'})
        print(json.dumps({'campaign_id':campaign.id, 'applied':args.apply, 'results':report}, indent=2))


if __name__ == '__main__':
    main()
