#!/usr/bin/env python3
"""Validate the durable sound worker and large-upload proxy contract."""

import re
import sys
from pathlib import Path


def location_blocks(source, path_pattern):
    for match in re.finditer(rf"location\s+{path_pattern}\s*\{{", source):
        depth = 1
        offset = match.end()
        while offset < len(source) and depth:
            depth += (source[offset] == "{") - (source[offset] == "}")
            offset += 1
        yield source[match.end():offset - 1]


def validate(worker_source, nginx_source, compose_source):
    for required in (
        '/venv/bin/flask --app app process-sound-uploads',
        'Nice=10',
        'IOSchedulingClass=idle',
        'Restart=on-failure',
        'SOUND_UPLOAD_ROOT=/home/ijohnson/Kachhapa/tmp/sound-uploads',
    ):
        if required not in worker_source:
            raise ValueError(f'sound worker is missing {required}')

    api_blocks = [block for block in location_blocks(nginx_source, r'/api/') if 'myapp.sock' in block]
    if len(api_blocks) != 2:
        raise ValueError('expected Kachhapa API locations on app and root hosts')
    for block in api_blocks:
        for required in ('client_max_body_size 2g;', 'client_body_timeout 3600s;',
                         'proxy_read_timeout 300s;', 'proxy_send_timeout 3600s;'):
            if required not in block:
                raise ValueError(f'Kachhapa API location is missing {required}')

    if not re.search(r'^\s{2}sound-worker:\s*$', compose_source, re.MULTILINE):
        raise ValueError('Docker Compose is missing sound-worker')
    if 'process-sound-uploads' not in compose_source:
        raise ValueError('Docker sound-worker does not run the queue command')
    if 'sound_upload_staging:/app/sound-uploads' not in compose_source:
        raise ValueError('Docker web and worker processes do not share private upload staging')


def main():
    if len(sys.argv) != 4:
        raise SystemExit('Usage: check-sound-upload-deployment.py WORKER_SERVICE NGINX_CONFIG COMPOSE_FILE')
    try:
        validate(*(Path(path).read_text() for path in sys.argv[1:]))
    except ValueError as error:
        raise SystemExit(f'Sound upload deployment check failed: {error}') from error
    print('Sound upload deployment configuration is valid.')


if __name__ == '__main__':
    main()
