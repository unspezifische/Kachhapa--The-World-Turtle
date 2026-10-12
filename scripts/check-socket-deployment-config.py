#!/usr/bin/env python3
"""Reject Socket.IO deployments that split polling sessions across workers."""

import re
import sys
from pathlib import Path


def validate_service(source):
    command = re.search(r"^ExecStart=([^\n]*(?:\n[ \t]+[^\n]*)*)", source, re.MULTILINE)
    if not command:
        raise ValueError("Kachhapa service has no ExecStart command")
    tokens = command.group(1).replace("\\\n", " ").split()
    worker_counts = [tokens[index + 1] for index, token in enumerate(tokens[:-1])
                     if token in ("-w", "--workers")]
    worker_counts += [token.split("=", 1)[1] for token in tokens
                      if token.startswith("--workers=")]
    if worker_counts != ["1"]:
        raise ValueError("Socket.IO Gunicorn must use exactly one worker (-w 1)")
    if "geventwebsocket.gunicorn.workers.GeventWebSocketWorker" not in tokens:
        raise ValueError("Kachhapa service must use the gevent WebSocket worker")


def location_blocks(source):
    for match in re.finditer(r"location\s+/socket\.io/\s*\{", source):
        depth = 1
        offset = match.end()
        while offset < len(source) and depth:
            depth += (source[offset] == "{") - (source[offset] == "}")
            offset += 1
        yield source[match.end():offset - 1]


def validate_nginx(source):
    if not re.search(r"listen\s+80\s+default_server\s*;", source):
        raise ValueError("Raw-IP requests must reach the Kachhapa default server")
    if not re.search(r"map\s+\$http_upgrade\s+\$connection_upgrade\s*\{", source):
        raise ValueError("Missing conditional WebSocket upgrade map")
    log_format = re.search(r"log_format\s+socket_access\s+([^;]+);", source)
    if not log_format or "$uri" not in log_format.group(1) or re.search(
            r"\$(?:request_uri|args|query_string|request)(?![\w])", log_format.group(1)):
        raise ValueError("Socket access log must omit request query strings")
    blocks = [block for block in location_blocks(source)
              if "myapp.sock" in block]
    if len(blocks) != 2:
        raise ValueError("Expected Kachhapa Socket.IO locations on app and root hosts")
    for block in blocks:
        for directive in (
                "proxy_http_version 1.1;",
                "proxy_set_header Upgrade $http_upgrade;",
                "proxy_set_header Connection $connection_upgrade;",
                "access_log /var/log/nginx/ws_access.log socket_access;",
        ):
            if directive not in block:
                raise ValueError(f"Kachhapa Socket.IO location is missing {directive}")


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: check-socket-deployment-config.py SERVICE_FILE NGINX_CONFIG")
    try:
        validate_service(Path(sys.argv[1]).read_text())
        validate_nginx(Path(sys.argv[2]).read_text())
    except ValueError as error:
        raise SystemExit(f"Socket.IO deployment check failed: {error}") from error
    print("Socket.IO deployment configuration is valid.")


if __name__ == "__main__":
    main()
