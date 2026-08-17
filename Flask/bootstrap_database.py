"""Bring the Docker database to a usable schema before starting Flask."""

from flask_migrate import stamp, upgrade
from sqlalchemy import inspect

from app import app, db


with app.app_context():
    if not inspect(db.engine).has_table("user"):
        # The historical migration chain assumes that the original tables
        # already exist. A completely new Docker volume therefore needs the
        # current model schema first, after which Alembic can track later runs.
        app.logger.warning("Database is empty; creating the application schema")
        db.create_all()
        stamp(revision="heads")
    else:
        upgrade()
