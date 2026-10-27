#!/usr/bin/env python3
"""Prevent a Gunicorn/Socket.IO async-mode mismatch and split polling sessions."""
from pathlib import Path
import re,shlex
root=Path(__file__).resolve().parents[1]
service=(root/'MtG-webapp/backend/mtg-backend.service').read_text()
extensions=(root/'MtG-webapp/backend/app/extensions.py').read_text()
command=shlex.split(re.search(r'^ExecStart=(.*)$',service,re.M).group(1))
worker=command[command.index('--worker-class')+1]
workers=command[command.index('--workers')+1]
mode=re.search(r'os.getenv\("SOCKETIO_ASYNC_MODE",\s*"([^"]+)"\)',extensions).group(1)
expected='eventlet' if worker=='eventlet' else 'gevent' if 'GeventWebSocketWorker' in worker else None
if workers!='1' or expected is None or expected!=mode:
    raise SystemExit('MTG worker must use one process and match its Socket.IO async mode.')
if f'Environment="SOCKETIO_ASYNC_MODE={mode}"' not in service:
    raise SystemExit('MTG service must explicitly select its Socket.IO async mode.')
requirements=(root/'MtG-webapp/backend/requirements.txt').read_text()
if mode=='eventlet' and not re.search(r'^eventlet==',requirements,re.M):
    raise SystemExit('Pin the Eventlet dependency used by the deployed MTG worker.')
if mode=='gevent' and any(not re.search(r'^'+re.escape(package)+r'==',requirements,re.M)
                         for package in ('gevent', 'gevent-websocket')):
    raise SystemExit('Pin gevent and gevent-websocket for the deployed MTG worker.')
print('MTG Socket.IO worker and async mode match.')
