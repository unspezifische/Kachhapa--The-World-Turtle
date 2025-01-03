from flask import Flask, request, jsonify, send_file
from flask import render_template ## For rendering wiki pages
from flask import redirect, url_for

## Server Admin Console
from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView
# import flask_monitoringdashboard as dashboard

## For database stuff
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import select, Numeric, text, func
from sqlalchemy.orm import joinedload
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from sqlalchemy.dialects.postgresql import JSONB, ARRAY, TSVECTOR

from flask_migrate import Migrate   ## For database migrations

from flask_compress import Compress

from fuzzywuzzy import fuzz, process

from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from werkzeug.exceptions import NotFound
from flask_cors import CORS
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity, decode_token, get_jwt, unset_jwt_cookies

from jwt import InvalidTokenError, ExpiredSignatureError
from flask_socketio import SocketIO, join_room, leave_room, emit, send, disconnect

from threading import Thread
from datetime import datetime, timedelta, timezone
import io
import os
import csv  ## For importing items from CSV
import json ## For sending JSON data


import logging ## For debug logging
import traceback

import markdown
from urllib.parse import unquote


app = Flask(__name__)
Compress(app)
# dashboard.bind(app)

app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'Library')
app.config['MAP_FOLDER'] = '/home/ijohnson/Downloads/Maps'
app.config['BATTLE_MAP_FOLDER'] = '/home/ijohnson/Downloads/battleMaps'
app.config['SECRET_KEY'] = 'secret-key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://admin:admin@postgres:5432/db'

## Token stuff
app.config['JWT_SECRET_KEY'] = 'jwt-secret-key'
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=5)
jwt = JWTManager(app)

app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024 * 1024 # 2Gb Upload size
app.config['PROPAGATE_EXCEPTIONS'] = True

## Database stuff
db = SQLAlchemy()

## Admin Console
admin = Admin(app, name='Kachhapa Admin')


# CORS(app, resources={r"/*": {"origins": "*"}})  # This header is added by Nginx

# # For INFO level
# app.logger.setLevel(logging.INFO)  # set the desired logging level
# handler = logging.StreamHandler()
# handler.setLevel(logging.INFO)  # set the desired logging level
# app.logger.addHandler(handler)
# app.debug = False

# For DEBUG level
app.logger.setLevel(logging.DEBUG)  # set the desired logging level to DEBUG
handler = logging.StreamHandler()
handler.setLevel(logging.DEBUG)  # set the desired logging level to DEBUG
app.logger.addHandler(handler)
app.debug = True

app.logger.debug("Debugging set to True")

socketio = SocketIO(
    app,
    message_queue='amqp://guest:guest@rabbitmq:5672//',
    cors_allowed_origins="*",
    logger=True,
    engineio_logger=True,
    ping_timeout=60000)
active_connections = {}

socketio.init_app(app)

db.init_app(app)


INTEGER_MIN = -2147483648
INTEGER_MAX = 2147483647



# Association table
campaign_members = db.Table('campaign_members',
    db.Column('userID', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('campaignID', db.Integer, db.ForeignKey('campaign.id'), primary_key=True),
    db.Column('characterID', db.Integer, db.ForeignKey('character.id'))
)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True)
    password = db.Column(db.String(100))
    is_online = db.Column(db.Boolean, default=False) ## Tracks if a user is currently signed in or not
    sid = db.Column(db.String(100), nullable=True)  ## Stores the web socket ID a user is connected from
    campaigns = db.relationship('Campaign', secondary=campaign_members, backref=db.backref('members', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'is_online': self.is_online,
            'sid': self.sid,
            'campaigns': [campaign.to_dict() for campaign in self.campaigns]
        }

class Character(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    icon = db.Column(db.String(120))  # icon filepath or name
    system = db.Column(db.String(50))  # e.g., 'D&D 5e', 'pathfinder'
    userID = db.Column(db.Integer, db.ForeignKey('user.id'))  # link to the User table
    user = db.relationship('User', backref='characters')  # relationship to the User model
    campaignID = db.Column(db.Integer, db.ForeignKey('campaign.id'))  # link to the Campaign table
    campaign = db.relationship('Campaign', backref='party_members')  # relationship to the Campaign model
    character_name = db.Column(db.String(50), nullable=True) # character's name
    Class = db.Column(db.String(50))  # name of the class (e.g., "Wizard")
    Background = db.Column(db.String(50))  # character's background (e.g., "Noble")
    Race = db.Column(db.String(50))  # character's race (e.g., "Elf")
    Alignment = db.Column(db.String(50))  # character's alignment (e.g., "Neutral Good")
    ExperiencePoints = db.Column(db.Integer)  # character's experience points
    strength = db.Column(db.Integer)  # ability scores
    dexterity = db.Column(db.Integer)
    constitution = db.Column(db.Integer)
    intelligence = db.Column(db.Integer)
    wisdom = db.Column(db.Integer)
    charisma = db.Column(db.Integer)
    PersonalityTraits = db.Column(db.Text)  # personality traits
    Ideals = db.Column(db.Text) # ideals
    Bonds = db.Column(db.Text)  # bonds
    Flaws = db.Column(db.Text)  # flaws
    Feats = db.Column(db.Text)
    Proficiencies = db.Column(db.Text)  # list of proficiencies
    CurrentHitPoints = db.Column(db.Integer)
    cp = db.Column(db.Integer)
    sp = db.Column(db.Integer)
    ep = db.Column(db.Integer)
    gp = db.Column(db.Integer)
    pp = db.Column(db.Integer)

     # Relationships
    inventory = db.relationship('InventoryItem', backref='character', lazy=True)
    journal_entries = db.relationship('Journal', backref='character', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'icon': self.icon,
            'userID': self.userID,
            'campaignID': self.campaignID,
            'campaign': self.campaign.name if self.campaign else None,
            'name': self.character_name,
            'Class': self.Class,
            'Background': self.Background,
            'Race': self.Race,
            'Alignment': self.Alignment,
            'ExperiencePoints': self.ExperiencePoints,
            'strength': self.strength,
            'dexterity': self.dexterity,
            'constitution': self.constitution,
            'intelligence': self.intelligence,
            'wisdom': self.wisdom,
            'charisma': self.charisma,
            'PersonalityTraits': self.PersonalityTraits,
            'Ideals': self.Ideals,
            'Bonds': self.Bonds,
            'Flaws': self.Flaws,
            'Proficiencies': json.loads(self.Proficiencies) if self.Proficiencies else [],
            'CurrentHitPoints': self.CurrentHitPoints,
            'cp': self.cp,
            'sp': self.sp,
            'ep': self.ep,
            'gp': self.gp,
            'pp': self.pp,
            'Feats': json.loads(self.Feats) if self.Feats else [],
        }

class Campaign(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    system = db.Column(db.String(50), nullable=False)    # e.g., 'D&D 5e', 'pathfinder'
    icon = db.Column(db.String(120))  # icon filepath or name
    description = db.Column(db.Text)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    dm_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    scribes = db.Column(ARRAY(db.Integer), default=[])  # List of user IDs who are scribes
    owner = db.relationship('User', foreign_keys=[owner_id], backref='owned_campaigns')
    dm = db.relationship('User', foreign_keys=[dm_id], backref='dm_campaigns')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'system': self.system,
            'description': self.description,
            'icon': self.icon,
            'owner': self.owner.username if self.owner else None,
            'owner_id': self.owner.id if self.owner else None,
            'dm': self.dm.username if self.dm else None,
            'dm_id': self.dm.id if self.dm else None,
            'scribes': self.scribes,
        }
  
class Page(db.Model):
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    title = db.Column(db.String(80), nullable=False)
    content = db.Column(db.Text, nullable=True)
    wiki_id = db.Column(db.Integer, db.ForeignKey('campaign.id'), nullable=False)
    wiki = db.relationship('Campaign', backref=db.backref('pages', lazy=True))
    tsv = db.Column(TSVECTOR)

class Revisions(db.Model):
    revision_id = db.Column(db.Integer, primary_key=True)
    page_id = db.Column(db.Integer, db.ForeignKey('page.id'), nullable=False)
    content = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=db.func.current_timestamp())
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('revisions', lazy=True))
    page = db.relationship('Page', backref='revisions')

# Loot association table
loot_box_items = db.Table('loot_box_items',
    db.Column('itemID', db.Integer, db.ForeignKey('item.id'), primary_key=True),
    db.Column('loot_boxID', db.Integer, db.ForeignKey('loot_box.id'), primary_key=True),
    db.Column('quantity', db.Integer)
)

class Item(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    type = db.Column(db.String(80), nullable=False)
    cost = db.Column(db.Integer, nullable=False)
    currency = db.Column(db.String(80), nullable=False)
    weight = db.Column(Numeric(10, 2))  # Changed to Numeric with precision and scale
    description = db.Column(db.Text)

    # The relationships
    armor = db.relationship('Armor', backref='item', cascade='all, delete-orphan')
    weapon = db.relationship('Weapon', backref='item', cascade='all, delete-orphan')
    spellItem = db.relationship('SpellItem', backref='item', cascade='all, delete-orphan')
    mountVehicle = db.relationship('MountVehicle', backref='item', cascade='all, delete-orphan')
    loot_boxes = db.relationship('LootBox', secondary=loot_box_items, backref=db.backref('items'), lazy=True)


    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'cost': self.cost,
            'currency': self.currency,
            'weight': self.weight,
            'description': self.description
        }

class Weapon(db.Model):
    itemID = db.Column(db.Integer, db.ForeignKey('item.id'), primary_key=True)
    weapon_type = db.Column(db.String(20), nullable=False)
    damage = db.Column(db.String(20), nullable=False)
    damage_type = db.Column(db.String(20), nullable=False)
    weapon_range = db.Column(db.Integer)

    def to_dict(self):
        return {
            'weapon_type': self.weapon_type,
            'damage': self.damage,
            'damage_type': self.damage_type,
            'weapon_range': self.weapon_range,
        }

class Armor(db.Model):
    itemID = db.Column(db.Integer, db.ForeignKey('item.id'), primary_key=True)
    armor_class = db.Column(db.Integer, nullable=False)
    armor_type = db.Column(db.String(20), nullable=False)
    strength_needed = db.Column(db.Integer)
    stealth_disadvantage = db.Column(db.Boolean)

    def to_dict(self):
        return {
            'armor_class': self.armor_class,
            'armor_type': self.armor_type,
            'strength_needed': self.strength_needed,
            'stealth_disadvantage': self.stealth_disadvantage,
        }

class Spell(db.Model):
    __tablename__ = 'spells'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    level = db.Column(db.String(80), nullable=False)
    casting_time = db.Column(db.String(80), nullable=False)
    range = db.Column(db.String(80), nullable=False)
    components = db.Column(db.String(80), nullable=False)
    duration = db.Column(db.String(80), nullable=False)
    description = db.Column(db.Text, nullable=False)
    classes = db.Column(db.String(80), nullable=False)
    school = db.Column(db.String(80), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'Name': self.name,
            'Level': self.level,
            'casting_time': self.casting_time,
            'Range': self.range,
            'Components': self.components.split(","),
            'Duration': self.duration,
            'Description': self.description,
            'Classes': self.classes.split(","),
            'School': self.school
        }

class SpellItem(db.Model):
    __tablename__ = 'spell_items'

    itemID = db.Column(db.Integer, db.ForeignKey('item.id'), primary_key=True)
    charges = db.Column(db.Integer)
    spell_id = db.Column(db.Integer, db.ForeignKey('spells.id'), nullable=True)  # Allow spell items without an associated spell


    def to_dict(self):
        return {
            'id': self.id,
            'charges': self.charges,
        }

class MountVehicle(db.Model):
    itemID = db.Column(db.Integer, db.ForeignKey('item.id'), primary_key=True)
    speed = db.Column(db.Integer, nullable=False)
    speed_unit = db.Column(db.String(20), nullable=False)
    capacity = db.Column(db.Integer, nullable=True)
    vehicle_type = db.Column(db.String(20), nullable=False)

    def to_dict(self):
        return {
            'speed': self.speed,
            'speed_unit': self.speed_unit,
            'capacity': self.capacity,
            'vehicle_type': self.vehicle_type
        }


class InventoryItem(db.Model):
    __tablename__ = 'inventory'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    characterID = db.Column(db.Integer, db.ForeignKey('character.id'), nullable=False)
    itemID = db.Column(db.Integer, db.ForeignKey('item.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    equipped = db.Column(db.Boolean)

    # Relationship to the Item table
    item = db.relationship('Item', backref='inventory_items')

    def to_dict(self):
        item_dict = {
            'id': self.id,
            'name': self.name,
            'itemID': self.itemID,
            'quantity': self.quantity,
            'equipped': self.equipped,
            'type': self.item.type,
            'description': self.item.description,
        }

        # If the item is a weapon, include the damage details
        if self.item.type == 'Weapon' and self.item.weapon:
            item_dict['weaponType'] = self.item.weapon[0].weapon_type
            item_dict['damage'] = self.item.weapon[0].damage
            item_dict['damageType'] = self.item.weapon[0].damage_type
            item_dict['range'] = self.item.weapon[0].weapon_range

        # If the item is armor, include the armor class details
        if self.item.type == 'Armor' and self.item.armor:
            item_dict['AC'] = self.item.armor[0].armor_class
            item_dict['armorType'] = self.item.armor[0].armor_type

        return item_dict

class Spellbook(db.Model):
    __tablename__ = 'spellbook'

    id = db.Column(db.Integer, primary_key=True)
    characterID = db.Column(db.Integer, db.ForeignKey('character.id'), nullable=False)
    spell_id = db.Column(db.Integer, db.ForeignKey('spells.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    equipped = db.Column(db.Boolean)

    # Relationship to the Spell table
    spell = db.relationship('Spell', backref='spellbook_items')

    def to_dict(self):
        return {
            'id': self.id,
            'characterID': self.characterID,
            'SpellID': self.spell_id,
            'Quantity': self.quantity,
            'Name': self.spell.name,
            'Level': self.spell.level,
            'casting_time': self.spell.casting_time,
            'Range': self.spell.range,
            'Components': self.spell.components.split(","),
            'Duration': self.spell.duration,
            'Description': self.spell.description,
            'Classes': self.spell.classes.split(","),
            'School': self.spell.school,
            'equipped': self.equipped,
        }

class Journal(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    userID = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    campaignID = db.Column(db.Integer, db.ForeignKey('campaign.id'), nullable=False)
    characterID = db.Column(db.Integer, db.ForeignKey('character.id'), nullable=True)
    title = db.Column(db.String(100), nullable=False)
    entry = db.Column(db.Text, nullable=False)
    date_created = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    date_modified = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    campaign_id = db.Column(db.Integer, db.ForeignKey('campaign.id'), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    recipient_ids = db.Column(db.String, nullable=False)  # This would be a comma-separated string of IDs.
    group_id = db.Column(db.String, nullable=False)  # New field: group_id
    message_type = db.Column(db.String(50), nullable=False)  # e.g. 'item_transfer', 'chat', etc.
    item_id = db.Column(db.Integer, db.ForeignKey('item.id'), nullable=True)
    item = db.relationship('Item', backref='messages', lazy=True)  # Add for ORM relationship
    message_text = db.Column(db.Text, nullable=False)  # The actual message text.
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'campaign_id': self.campaign_id,
            'sender_id': self.sender_id,
            'group_id': self.group_id,
            'recipient_ids': self.recipient_ids.split(','),
            'message_type': self.message_type,
            'item_id': self.item_id,
            'message_text': self.message_text,
            'timestamp': self.timestamp.isoformat(),
        }


class NPC(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    campaign_id = db.Column(db.Integer, db.ForeignKey('campaign.id'), nullable=False)
    name = db.Column(db.String(80), nullable=False)
    size = db.Column(db.String(20), nullable=False)  # Example: "Medium"
    creature_type = db.Column(db.String(50), nullable=False)  # Example: "humanoid"
    creature_subtype = db.Column(db.String(50), nullable=True)  # Example: "goblinoid"
    alignment = db.Column(db.String(50), nullable=False)  # Example: "chaotic evil"
    
    ac = db.Column(db.String(50), nullable=False)  # Armor Class
    hp = db.Column(db.String(50), nullable=False)  # Hit Points
    speed = db.Column(db.Integer, nullable=False)  # Speed (in feet)
    
    # Stats
    strength = db.Column(db.Integer, nullable=False)
    dexterity = db.Column(db.Integer, nullable=False)
    constitution = db.Column(db.Integer, nullable=False)
    intelligence = db.Column(db.Integer, nullable=False)
    wisdom = db.Column(db.Integer, nullable=False)
    charisma = db.Column(db.Integer, nullable=False)
    
    # Skills and Senses
    saving_throws = db.Column(db.String(120), nullable=True)  # Example: "Int +5, Wis +3"
    skills = db.Column(db.String(120), nullable=True)  # Example: "Stealth +6, Survival +2"
    immunities = db.Column(db.String(120), nullable=True)
    resistance = db.Column(db.String(120), nullable=True)
    senses = db.Column(db.String(120), nullable=True)  # Example: "darkvision 60 ft, passive Perception 10"
    languages = db.Column(db.String(120), nullable=True)  # Example: "Common, Goblin"
    challenge = db.Column(db.String(50), nullable=True)  # Challenge Rating and XP

    # Traits
    traits = db.Column(db.String(1000), nullable=True)  # Example: "Brute, Surprise Attack"
    
    # Actions (simple example with a single attack, but can be more complex)
    actions = db.Column(db.String(1000), nullable=True)  # Example: "Morningstar: +4 to hit, 11 (2d8+2) piercing damage"

    description = db.Column(db.Text, nullable=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'campaign_id': self.campaign_id,
            'name': self.name,
            'size': self.size,
            'creature_type': self.creature_type,
            'creature_subtype': self.creature_subtype,
            'alignment': self.alignment,
            'ac': self.ac,
            'hp': self.hp,
            'speed': self.speed,
            'strength': self.strength,
            'dexterity': self.dexterity,
            'constitution': self.constitution,
            'intelligence': self.intelligence,
            'wisdom': self.wisdom,
            'charisma': self.charisma,
            'saving_throws': self.saving_throws,
            'skills': self.skills,
            'immunities': self.immunities,
            'resistance': self.resistance,
            'senses': self.senses,
            'languages': self.languages,
            'challenge': self.challenge,
            'traits': self.traits,
            'actions': self.actions,
            'description': self.description,
        }

class GameElement(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    system = db.Column(db.String(50))  # e.g., 'D&D 5e', 'pathfinder'
    element_type = db.Column(db.String(50))  # e.g., 'class', 'race', 'character_background', 'character_sheet'
    module = db.Column(db.String(50), nullable=True)  # Specific module, if applicable
    setting = db.Column(db.String(50), nullable=True)  # Specific setting, if applicable
    name = db.Column(db.String(50), unique=True)
    data = db.Column(JSONB)

    def __repr__(self):
        return f'<GameElement {self.element_type} {self.name}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'system': self.system,
            'element_type': self.element_type,
            'module': self.module,
            'setting': self.setting,
            'name': self.name,
            'data': self.data,
        }

class Document(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    data = db.Column(db.LargeBinary, nullable=False)  # Use LargeBinary for binary data
    mimetype = db.Column(db.String(50), nullable=False)  # Store the MIME type
    campaignID = db.Column(db.Integer, db.ForeignKey('campaign.id'), nullable=False)  # Add campaignID column

class LootBox(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False) ## Which lootbox the item is in

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
        }

class RandomTable(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)  # Table Name
    description = db.Column(db.Text, nullable=True)  # Optional description of table
    dice_type = db.Column(db.String(20), nullable=False)  # Example: "1d100"
    table_entries = db.relationship('TableEntry', backref='random_table', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'dice_type': self.dice_type,
            'table_entries': [entry.to_dict() for entry in self.table_entries]
        }

class TableEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    table_id = db.Column(db.Integer, db.ForeignKey('random_table.id'), nullable=False)
    min_roll = db.Column(db.Integer, nullable=False)  # Minimum roll value for this entry
    max_roll = db.Column(db.Integer, nullable=True)  # Maximum roll value for this entry
    result = db.Column(db.Text, nullable=False)  # The result of the roll

    def to_dict(self):
        return {
            'id': self.id,
            'table_id': self.table_id,
            'min_roll': self.min_roll,
            'max_roll': self.max_roll,
            'result': self.result
        }

## Add all the models to the admin console
admin.add_view(ModelView(User, db.session))
admin.add_view(ModelView(Character, db.session))
admin.add_view(ModelView(Campaign, db.session))
admin.add_view(ModelView(Page, db.session))
admin.add_view(ModelView(Revisions, db.session))
admin.add_view(ModelView(Item, db.session))
admin.add_view(ModelView(InventoryItem, db.session))
admin.add_view(ModelView(Spell, db.session))
admin.add_view(ModelView(SpellItem, db.session))
admin.add_view(ModelView(MountVehicle, db.session))
admin.add_view(ModelView(Armor, db.session))
admin.add_view(ModelView(Weapon, db.session))
admin.add_view(ModelView(Journal, db.session))
admin.add_view(ModelView(Message, db.session))
admin.add_view(ModelView(LootBox, db.session))
admin.add_view(ModelView(NPC, db.session))
admin.add_view(ModelView(GameElement, db.session))
admin.add_view(ModelView(Document, db.session))


def normalize_keys(d):
    if isinstance(d, dict):
        new_dict = {}
        for k, v in d.items():
            new_key = k.lower().replace(' ', '_')
            if k.endswith('n') and not new_key.endswith('n'):
                app.logger.error(f"Key '{k}' was transformed to '{new_key}' incorrectly.")
            new_dict[new_key] = normalize_keys(v)
        return new_dict
    elif isinstance(d, list):
        return [normalize_keys(i) for i in d]
    else:
        return d

def load_json_files(directory):
    elements = []
    if os.path.exists(directory):
        for filename in os.listdir(directory):
            if filename.endswith('.json'):
                with open(os.path.join(directory, filename), 'r') as file:
                    try:
                        data = json.load(file)
                        normalized_data = normalize_keys(data)
                        elements.append((filename.rstrip('.json'), normalized_data))
                        app.logger.debug("Loaded %s from %s", filename, directory)
                    except json.JSONDecodeError:
                        app.logger.error(f"Error decoding JSON from file {filename}")
                    except UnicodeDecodeError:
                        app.logger.error(f"Error decoding Unicode from file {filename}")    
    return elements

def insert_elements(system, element_type, directory):
    if not os.path.exists(directory):
        app.logger.warn(f"Directory {directory} does not exist. Skipping...")
        return
    elements = load_json_files(directory)
    app.logger.debug(f"Loading Elements from {directory}")  # Print the elements
    with db.session.no_autoflush:
        for name, data in elements:
            existing_element = GameElement.query.filter_by(name=name).first()
            if existing_element is None:
                new_element = GameElement(name=name, system=system, element_type=element_type, data=data, setting='Faerun')
                # app.logger.debug(f"New element: {new_element}")  # Print the new element
                db.session.add(new_element)
    db.session.commit()

def populate_game_elements():
    insert_elements('D&D 5e', 'race', './GameElements/races')
    insert_elements('D&D 5e', 'class', './GameElements/classes')
    insert_elements('D&D 5e', 'character_background', './GameElements/characterBackgrounds')
    insert_elements('D&D 5e', 'character_sheet', './GameElements/characterSheets')


def set_all_users_offline():
    users = User.query.all()

    for user in users:
        user.is_online = False
        # campaign.members.append(user)   ## Temporary
    db.session.commit()


## Fuzzy Logic for mapping incoming data to model columns
def get_table_columns(model):
    """Get the column names for a given SQLAlchemy model."""
    return [column.name for column in model.__table__.columns]

def map_fields(data, model):
    """Map incoming data fields to model columns using fuzzy matching."""
    app.logger.debug(f"Mapping fields for {model.__name__}")

    valid_fields = get_table_columns(model)
    mapped_data = {}
    matched_fields = set()

    for key, value in data.items():
        best_match = None
        for score_cutoff in range(100, 75, -5):
            match = process.extractOne(key, valid_fields, score_cutoff=score_cutoff)
            if match and match[0] not in matched_fields:
                best_match = match
                app.logger.debug(f"Score cutoff: {score_cutoff}, Mapping {key} to {best_match[0]}")
                break

        if best_match:
            mapped_data[best_match[0]] = value
            matched_fields.add(best_match[0])
        else:
            mapped_data[key] = value  # Keep original if no match found
            app.logger.debug(f"No match found for {key}")

        # Stop if all valid fields have been matched
        if len(matched_fields) == len(valid_fields):
            break

    # app.logger.debug("Mapped data: %s", mapped_data)
    return mapped_data


with app.app_context():
    db.create_all()
    set_all_users_offline()
    populate_game_elements()

migrate = Migrate(app, db)


@app.route('/')
def index():
    return "Flask Websocket Server"


# Global error handler
@app.errorhandler(Exception)
def handle_exception(e):
    tb = traceback.format_exc()
    app.logger.error(f"An error occurred: {str(e)}")
    app.logger.error(f"Request data: {request.data}")
    app.logger.error(f"Traceback: {tb}")
    
    # Return a JSON response with a generic error message and traceback
    response = {
        "error": "An unexpected error occurred",
        "details": str(e),
        "traceback": tb
    }
    return jsonify(response), 500

@app.errorhandler(NotFound)
def handle_not_found(e):
    app.logger.error(f"404 Not Found: {request.url}")
    app.logger.error(f"Request method: {request.method}")
    app.logger.error(f"Request headers: {request.headers}")
    app.logger.error(f"Request data: {request.data}")
    
    # Return a JSON response with a 404 error message
    response = {
        "error": "The requested URL was not found on the server.",
        "details": str(e)
    }
    return jsonify(response), 404

@app.after_request
def refresh_expiring_jwts(response):
    try:
        exp_timestamp = get_jwt()["exp"]
        now = datetime.now(timezone.utc)
        target_timestamp = datetime.timestamp(now + timedelta(minutes=30))
            
        if target_timestamp > exp_timestamp:
            print(target_timestamp, ">", exp_timestamp)
            access_token = create_access_token(identity=get_jwt_identity())
            response.set_cookie('access_token', access_token)  # Set the new token in a cookie
            
            # Get the JSON data from the response
            data = response.get_json()
            
            # Check if data is a list
            if isinstance(data, list):
                # Add the new token to each dictionary in the list
                for item in data:
                    if isinstance(item, dict):
                        item['new_token'] = access_token
            elif isinstance(data, dict):
                # Add the new token to the data dictionary
                data['new_token'] = access_token
            
            # Create a new response with the updated JSON data
            response = jsonify(data)
        return response
    
    except (RuntimeError, KeyError):
        # Case where there is not a valid JWT. Just return the original response
        return response

## Verify a user's JWT token
@app.route('/api/verify', methods=['POST'])
def verify_token():
    # app.logger.debug("/api/verify: %s", request.json)
    data = request.get_json()
    origin = request.headers.get('Origin')
    token = data.get('token')
    app.logger.debug("Token: %s", token)
    # app.logger.debug("Origin: %s", origin)
    try:
        decoded_token = decode_token(token)
        app.logger.debug("Decoded Token:", decoded_token)

        user = User.query.filter_by(username=decoded_token['sub']).first()
        if user is None:
            print("Invalid user")
            app.logger.info("Invalid user")
            return jsonify({'error': 'Invalid user'}), 401
        return jsonify({'success': True, "id": user.id, "username": user.username})
    except InvalidTokenError:
        return jsonify({'error': 'InvalidTokenError- POST /api/verify'}), 401
    except ExpiredSignatureError:
        print("Expired token")
        app.logger.info("Expired token")
        return jsonify({'error': 'Expired token- ExpiredSignatureError'}), 401

## Used to log in a new user
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    if 'username' not in data or 'password' not in data:
        return jsonify({'message': 'Username and password are required!'}), 400
    user = User.query.filter_by(username=data['username'].lower()).first()
    if not user:
        return jsonify({'message': 'Invalid Username'}), 401
    elif not check_password_hash(user.password, data['password']):
        return jsonify({'message': 'Incorrect Password'}), 401
    print("Creating Access Token for", user.username)
    # app.logger.info("Creating Access Token for %s", user.username)
    access_token = create_access_token(identity=user.username)

    user.is_online = True
    db.session.commit()
    # campaign_id = request.args.get('campaignID')  # Retrieve the campaignID from the request arguments
    # emit_active_users(campaign_id)
    return jsonify({
        'message': 'Login successful!', 
        'access_token': access_token,
        'userID': user.id  # Include the user's ID in the response
    }), 200

@app.route('/api/register', methods=['POST'])
def register():
    ## app.logger.debug("/api/register: %s", request.json)
    data = request.get_json()
    if 'username' not in data or 'password' not in data:
        return jsonify({'message': 'Username and password are required!'}), 400

    # Check if a user with the given username already exists
    existing_user = User.query.filter_by(username=data['username'].lower()).first()
    if existing_user:
        return jsonify({'message': 'A user with this username already exists.'}), 400

    hashed_password = generate_password_hash(data['password'], method='sha256')
    new_user = User(username=data['username'].lower(), password=hashed_password)
    # new_user.is_online = True ## Only set the user online once they select a campaign
    db.session.add(new_user)
    db.session.commit()
    ## app.logger.debug(new_user.is_online)
    access_token = create_access_token(identity=new_user.username)
    return jsonify({
        'message': 'Registration successful!', 
        'access_token': access_token,
        'userID': new_user.id  # Include the user's ID in the response
    })

## Get a user's profile information
@app.route('/api/profile', methods=['GET'])
@jwt_required()
def get_profile():
    try:
        username = get_jwt_identity()
        user = User.query.filter_by(username=username).first()
        campaignID = request.headers.get('CampaignID')
        if campaignID:
            character = Character.query.filter_by(userID=user.id, campaignID=campaignID).first()
            if character:
                return jsonify({'username': user.username, 'id': user.id, 'character': character.to_dict()})
            else:
                return jsonify({'username': user.username, 'id': user.id, 'character': None})
        else:
            return jsonify({'username': user.username, 'id': user.id})
    except InvalidTokenError:
        return jsonify({'error': 'InvalidTokenError- GET /api/profile'}), 401
    except ExpiredSignatureError:
        return jsonify({'error': 'Expired token'}), 401

## Get all users in a campaign
@app.route('/api/campaigns', methods=['GET', 'POST'])
@jwt_required()
def campaigns():
    if request.method == 'GET':
        username = get_jwt_identity()
        user = User.query.filter_by(username=username).first()
        campaigns = user.campaigns
        campaign_list = [campaign.to_dict() for campaign in campaigns]
        app.logger.debug("CAMPAIGNS- campaigns: %s", campaign_list)
        return jsonify(campaign_list)
    
    elif request.method == 'POST':
        data = request.get_json()
        username = get_jwt_identity()
        app.logger.debug("CAMPAIGN- username: %s", username)
    
        user = User.query.filter_by(username=username).first()
        app.logger.debug("CAMPAIGN- user: %s", user.to_dict())
    
        # Create a new campaign with all necessary values
        campaign = Campaign(
            name=data['name'],
            system=data['system'],
            owner_id=user.id,
            dm_id=user.id,
            icon=data.get('icon', None),
            description=data.get('description', None),
            scribes=data.get('scribes', [])
        )
        db.session.add(campaign)
        db.session.flush()  # Ensure the campaign ID is generated
    
        app.logger.debug("Creating new campaign %s", campaign.to_dict())
    
        # Check if the user wants to use a module
        if 'module' in data and data['module']:
            # Retrieve the module's information from the GameElements table
            pages = GameElement.query.filter_by(name=data['module'], element_type="wiki").all()
            for page in pages:
                if page:
                    # Pre-populate the wiki with the module's information
                    wiki = Page(title=page.data.title, content=page.data.content, campaignID=campaign.id)
                    db.session.add(wiki)
            # Create the Main Page entry indicating the use of a module
            main_page_content = f"This campaign is using the {data['module']} module."
        else:
            # Create a generic Main Page entry using the campaign's description
            main_page_content = campaign.description or "Welcome to the campaign!"
    
        # Add the Main Page entry to the Page table
        main_page = Page(title="Main Page", content=main_page_content, campaignID=campaign.id)
        db.session.add(main_page)
    
        # Add the campaign creator as a member of their own campaign
        app.logger.debug("Adding user %s to campaign %s", user.id, campaign.id)
        db.session.execute(campaign_members.insert().values(userID=user.id, campaignID=campaign.id))
    
        # Get all users except the current user
        other_users = User.query.filter(User.id != user.id).all()
        app.logger.debug("other_users- %s", other_users)
        for other_user in other_users:
            # Add each user to the campaign's members
            db.session.execute(campaign_members.insert().values(userID=other_user.id, campaignID=campaign.id))
    
        db.session.commit()
        return jsonify(campaign.to_dict()), 201



@app.route('/api/characters', methods=['GET', 'POST'])
@jwt_required()
def get_user_characters():
    if request.method == 'GET':
        username = get_jwt_identity()
        user = User.query.filter_by(username=username).first()
        characters = Character.query.filter_by(userID=user.id).all()
        character_list = [character.to_dict() for character in characters]
        return jsonify(character_list)
    
    elif request.method == 'POST':
        data = request.get_json()
        username = get_jwt_identity()
        user = User.query.filter_by(username=username).first()

        # Map fields for the Character model using fuzzy matching
        data = map_fields(data, Character)

        # Validate required fields
        required_fields = ['character_name', 'Class', 'Background', 'Race', 'Alignment', 'ExperiencePoints', 
                           'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
        for field in required_fields:
            if field not in data:
                return jsonify({'message': f'{field} is required!'}), 400

        # Create a new character
        new_character = Character(
            icon=data.get('icon'),
            system=data.get('system', 'D&D 5e'),  # Default to 'D&D 5e' if not provided
            userID=user.id,
            campaignID=data.get('campaignID'),
            character_name=data['character_name'],
            Class=data['Class'],
            Background=data['Background'],
            Race=data['Race'],
            Alignment=data['Alignment'],
            ExperiencePoints=data['ExperiencePoints'],
            strength=data['strength'],
            dexterity=data['dexterity'],
            constitution=data['constitution'],
            intelligence=data['intelligence'],
            wisdom=data['wisdom'],
            charisma=data['charisma'],
            PersonalityTraits=data.get('PersonalityTraits'),
            Ideals=data.get('Ideals'),
            Bonds=data.get('Bonds'),
            Flaws=data.get('Flaws'),
            Feats=json.dumps(data.get('Feats', [])),
            Proficiencies=json.dumps(data.get('Proficiencies', [])),
            CurrentHitPoints=data.get('CurrentHitPoints', 0),
            cp=data.get('cp', 0),
            sp=data.get('sp', 0),
            ep=data.get('ep', 0),
            gp=data.get('gp', 0),
            pp=data.get('pp', 0)
        )

        # Add the new character to the session and commit
        db.session.add(new_character)
        db.session.commit()

        return jsonify(new_character.to_dict()), 201


@app.route('/api/characterSheet')
def get_characterSheet():
    # Determine the System in use
    campaignID = request.headers.get('CampaignID')
    campaign = Campaign.query.filter_by(id=campaignID).first()
    system = campaign.system if campaign else 'D&D 5e'

    characterSheet = GameElement.query.filter_by(element_type='character_sheet', system=system).first()
    app.logger.debug("CharacterSheet- %s", [c.data for c in characterSheet])
    return jsonify([c.data for c in characterSheet])

@app.route('/api/classes')
def get_class_listing():
    # Determine the System in use
    campaignID = request.headers.get('CampaignID')
    campaign = Campaign.query.filter_by(id=campaignID).first()
    system = campaign.system if campaign else 'D&D 5e'

    classes = GameElement.query.filter_by(element_type='class', system=system).all()
    # print("Classes:", [c.to_dict() for c in classes])
    return jsonify([c.to_dict() for c in classes])

@app.route('/api/classes/<class_name>')
def get_class_info(class_name):
    # Determine the System in use
    campaignID = request.headers.get('CampaignID')
    campaign = Campaign.query.filter_by(id=campaignID).first()
    system = campaign.system if campaign else 'D&D 5e'

    game_element = GameElement.query.filter_by(name=class_name, element_type='class', system=system).first()
    if game_element:
        return jsonify(game_element.data)
    else:
        return jsonify({"error": f"No class named '{class_name}' found"}), 404

@app.route('/api/races', methods=['GET'])
def get_race_listing():
    # Determine the System in use
    campaignID = request.headers.get('CampaignID')
    campaign = Campaign.query.filter_by(id=campaignID).first()
    system = campaign.system if campaign else 'D&D 5e'
    
    races = GameElement.query.filter_by(element_type='race', system=system).all()
    # print([r.to_dict() for r in races])
    return jsonify([r.to_dict() for r in races])

@app.route('/api/races/<race_name>', methods=['GET'])
def get_race_info(race_name):
    # Determine the System in use
    campaignID = request.headers.get('CampaignID')
    campaign = Campaign.query.filter_by(id=campaignID).first()
    system = campaign.system if campaign else 'D&D 5e'
    
    game_element = GameElement.query.filter_by(name=race_name, element_type='race', system=system).first()
    if game_element:
        return jsonify(game_element.data)
    else:
        return jsonify({'error': 'Resource not found'}), 404

@app.route('/api/backgrounds', methods=['GET'])
def get_background_listing():
    # Determine the System in use
    campaignID = request.headers.get('CampaignID')
    campaign = Campaign.query.filter_by(id=campaignID).first()
    system = campaign.system if campaign else 'D&D 5e'
    
    backgrounds = GameElement.query.filter_by(element_type='character_background', system=system).all()
    return jsonify([b.to_dict() for b in backgrounds])

@app.route('/api/backgrounds/<background_name>', methods=['GET'])
def get_background_info(background_name):
    # Determine the System in use
    campaignID = request.headers.get('CampaignID')
    campaign = Campaign.query.filter_by(id=campaignID).first()
    system = campaign.system if campaign else 'D&D 5e'
    
    game_element = GameElement.query.filter_by(name=background_name, element_type='character_background', system=system).first()
    if game_element:
        return jsonify(game_element.data)
    else:
        return jsonify({'error': 'Resource not found'}), 404


## GET Character Profile
@app.route('/api/character', methods=['GET'])
@jwt_required()
def get_character():
    # print("Get Character Profile:", request.headers)
    try:
        username = get_jwt_identity()
        user = User.query.filter_by(username=username).first()
        campaignID = request.headers.get('CampaignID')

        stmt = select(campaign_members.c.characterID).where(
            campaign_members.c.campaignID == campaignID, 
            campaign_members.c.userID == user.id
        )

        result = db.session.execute(stmt).first()

        characterID = result.characterID if result else None

        character = Character.query.filter_by(id=characterID).first()

        return jsonify(character.to_dict()), 200

    except InvalidTokenError:
        return jsonify({'error': 'InvalidTokenError- GET /api/character'}), 401
    except ExpiredSignatureError:
        return jsonify({'error': 'Expired token'}), 401

## Update a user's Character Profile
@app.route('/api/character', methods=['PUT'])
@jwt_required()
def update_character():
    try:
        userID = request.headers.get('userID')
        campaignID = request.headers.get('CampaignID')

        app.logger.debug("UPDATE CHARACTER- userID: %s", userID)
        app.logger.debug("UPDATE CHARACTER- campaignID: %s", campaignID)

        stmt = select(campaign_members.c.characterID).where(
            campaign_members.c.campaignID == campaignID, 
            campaign_members.c.userID == userID
        )

        result = db.session.execute(stmt).first()

        characterID = result.characterID if result else None

        character = Character.query.filter_by(id=characterID).first()

        # app.logger.debug("Character from database- %s", character.to_dict())

        data = request.json
        # app.logger.debug("Character JSON for Updating:")
        # for key, value in data.items():
        #     app.logger.debug("%s: %s", key, value)

        # Hardcode the mapping
        character.system = data.get('system')
        character.Class = data.get('Class')
        character.Background = data.get('Background')
        character.Race = data.get('Race')
        character.Alignment = data.get('Alignment')
        character.ExperiencePoints = data.get('ExperiencePoints')
        character.CurrentHitPoints = data.get('CurrentHitPoints')

        ability_scores = data.get('abilityScores', {})
        character.strength = int(ability_scores.get('strength')) if ability_scores.get('strength') else 0
        character.dexterity = int(ability_scores.get('dexterity')) if ability_scores.get('dexterity') else 0
        character.constitution = int(ability_scores.get('constitution')) if ability_scores.get('constitution') else 0
        character.intelligence = int(ability_scores.get('intelligence')) if ability_scores.get('intelligence') else 0
        character.wisdom = int(ability_scores.get('wisdom')) if ability_scores.get('wisdom') else 0
        character.charisma = int(ability_scores.get('charisma')) if ability_scores.get('charisma') else 0

        wealth = data.get('Wealth', {})
        character.cp = int(wealth.get('cp')) if wealth.get('cp') else 0
        character.sp = int(wealth.get('sp')) if wealth.get('sp') else 0
        character.ep = int(wealth.get('ep')) if wealth.get('ep') else 0
        character.gp = int(wealth.get('gp')) if wealth.get('gp') else 0
        character.pp = int(wealth.get('pp')) if wealth.get('pp') else 0

        character.PersonalityTraits = data.get('PersonalityTraits')
        character.Ideals = data.get('Ideals')
        character.Bonds = data.get('Bonds')
        character.Flaws = data.get('Flaws')
        character.Feats = json.dumps(data.get('Feats', []))

        db.session.commit()
        # app.logger.debug("Updated character: %s", character.to_dict())
        return jsonify(character.to_dict()), 200

    except InvalidTokenError:
        return jsonify({'error': 'InvalidTokenError- PUT /api/character'}), 401
    except ExpiredSignatureError:
        return jsonify({'error': 'Expired token'}), 401


@app.route('/api/users', methods=['GET'])
@jwt_required()
def get_users():
    campaignID = request.headers.get('CampaignID')
    users = User.query.join(campaign_members, User.id == campaign_members.c.userID).filter(campaign_members.c.campaignID == campaignID).all()
    return jsonify({'users': [user.character_name for user in users]})

@app.route('/api/players', methods=['GET'])
@jwt_required()
def get_players():
    app.logger.debug("GET PLAYERS- Called")
    username = get_jwt_identity()
    user = User.query.filter_by(username=username).first()

    if user is None:
        app.logger.error("User not found.")
        return jsonify({'error': 'User not found.'}), 404

    campaignID = request.headers.get('CampaignID')

    if campaignID is None:
        app.logger.error("Campaign ID not provided in the request header: %s", request.headers)
        return jsonify({'error': 'Campaign ID not provided in the request header.'}), 400
    
    # Find the character associated with the user and the campaign
    stmt = select(campaign_members.c.characterID, campaign_members.c.userID).where(
        campaign_members.c.campaignID == campaignID
    )
    result = db.session.execute(stmt).all()

    # Separate the character IDs and user IDs into two lists
    characterIDs, userIDs = zip(*result)

    # Get the DM's user ID
    dm_id = Campaign.query.filter_by(id=campaignID).first().dm_id

    # Filter out invalid character IDs
    valid_characterIDs = [characterID for characterID in characterIDs if characterID != user.id and characterID != dm_id and characterID is not None]

    # Get the players for the valid character IDs
    players = [User.query.get(userID) for userID in userIDs]
    app.logger.debug("GET PLAYERS- players: %s", players)

    # Get the character name for each player
    players_info = []
    for i, characterID in enumerate(characterIDs):
        player = players[i]
        if player is not None:
            # app.logger.debug("player: %s", player.to_dict())
            character = Character.query.filter_by(id=characterID).first()
            character_name = character.character_name if character else "DM"
            players_info.append({
                'username': player.username,
                'character_name': character_name,
                'id': characterID,
                'userID': player.id  # Add userID to the response
            })

    return jsonify({'players': players_info if players_info else []})

## GET basic item info for the DM and POST new items
@app.route('/api/items', methods=['GET', 'POST'])
@jwt_required()
def items():
    if request.method == 'GET':
        app.logger.info("FLASK- Getting items for the DM")
        try:
            items = Item.query.all()

            item_data = []
            # item_data_list = []

            for item in items:
                item_data.append(item.to_dict())

            #     if item.type == 'Weapon':
            #         weapon = Weapon.query.filter_by(itemID=item.id).first()
            #         if weapon:
            #             item_data.update(weapon.to_dict())
            #     elif item.type == 'Armor':
            #         armor = Armor.query.filter_by(itemID=item.id).first()
            #         if armor:
            #             item_data.update(armor.to_dict())
            #     elif item.type == 'MountVehicle':
            #         mountVehicle = MountVehicle.query.filter_by(itemID=item.id).first()
            #         if mountVehicle:
            #             item_data.update(mountVehicle.to_dict())
            #     # elif item.type in ['Ring', 'Wand', 'Scroll']:
            #     #     magic_item = SpellItem.query.filter_by(itemID=item.id).first()
            #     #     if magic_item:
            #     #         item_data.update(magic_item.to_dict())

            #     item_data_list.append(item_data)

            # return jsonify({'items': item_data_list}), 200
            return jsonify({'items': item_data}), 200

        except Exception as e:
            app.logger.error(f"Error getting items: {e}")
            return jsonify({'error': 'Server error: ' + str(e)}), 500

    elif request.method == 'POST':
        data = request.get_json()
        # print("POST to items- data:", data)
        app.logger.info("POST to items- data: %s", data)

        try:
            # Validate required fields
            required_fields = ['name', 'type', 'cost', 'currency', 'weight', 'description']
            for field in required_fields:
                if field not in data:
                    raise ValueError(f"Missing required field: {field}")
            
            name = data.get('name')
            type = data.get('type')
            cost = data.get('cost')
            currency = data.get('currency')
            weight = data.get('weight')
            description = data.get('description')
            
            # Define the range for PostgreSQL INTEGER type
            INTEGER_MIN = -2147483648
            INTEGER_MAX = 2147483647
            
            # Validate cost and weight
            if not (INTEGER_MIN <= int(cost) <= INTEGER_MAX):
                raise ValueError(f"Cost value {cost} is out of range for type integer. Must be between {INTEGER_MIN} and {INTEGER_MAX}")
            if not (INTEGER_MIN <= float(weight) <= INTEGER_MAX):
                raise ValueError(f"Weight value {weight} is out of range for type integer. Must be between {INTEGER_MIN} and {INTEGER_MAX}")
            
            item = Item(name=name, type=type, cost=cost, currency=currency, weight=weight, description=description)
            db.session.add(item)
            db.session.flush()
            app.logger.debug(f"New item ID: {item.id}")

        
            if type == 'Weapon':
                weapon = Weapon.query.filter_by(itemID=item.id).first()
                damage = data.get('damage')
                damage_type = data.get('damageType')
                weapon_type = data.get('weaponType')
                weapon_range = data.get('weaponRange')
                if weapon:
                    weapon.damage = damage
                    weapon.damage_type = damage_type
                    weapon.weapon_type = weapon_type
                    weapon.weapon_range = weapon_range
                else:
                    weapon = Weapon(itemID=item.id, damage=damage, damage_type=damage_type, weapon_type=weapon_type, weapon_range=weapon_range)
                    db.session.add(weapon)
                # db.session.commit()
            elif type == 'Armor':
                armor = Armor.query.filter_by(itemID=item.id).first()
                ac = data.get('ac')
                armor_type = data.get('armorType')
                stealth_disadvantage = data.get('stealthDisadvantage', False)
                strength_needed = data.get('strengthNeeded', None)
            
                # Validate strength_needed
                if strength_needed is not None:
                    try:
                        strength_needed = int(strength_needed)
                    except ValueError:
                        strength_needed = None  # Set to None if not a valid integer
            
                if armor:
                    # Update existing record
                    armor.armor_class = ac
                    armor.armor_type = armor_type
                    armor.stealth_disadvantage = stealth_disadvantage
                    armor.strength_needed = strength_needed
                else:
                    # Insert new record
                    armor = Armor(
                        itemID=item.id,
                        armor_class=ac,
                        armor_type=armor_type,
                        stealth_disadvantage=stealth_disadvantage,
                        strength_needed=strength_needed
                    )
                    db.session.add(armor)
                # db.session.commit()
            # elif type in ['Ring', 'Wand', 'Scroll']:
            #     spellItem = SpellItem.query.filter_by(itemID=item.id).first()
            #     spell = data.get('spell')
            #     charges = data.get('charges')
            #     if spellItem:
            #         spellItem.spell = spell
            #         spellItem.charges = charges
            #     else:
            #         magic_item = SpellItem(itemID=item.id, spell=spell, charges=charges)
            #         db.session.add(magic_item)
            #     db.session.commit()
            elif type == 'MountVehicle':  # Handle MountVehicle items
                mountVehicle = MountVehicle.query.filter_by(itemID=item.id).first()
                speed = data.get('speed')
                speed_unit = data.get('speedUnit')
                capacity = data.get('capacity')
                if mountVehicle:
                    mountVehicle.speed = speed
                    mountVehicle.speed_unit = speed_unit
                    mountVehicle.capacity = capacity
                else:
                    mount_vehicle = MountVehicle(itemID=item.id, speed=speed, speed_unit=speed_unit, capacity=capacity)
                    db.session.add(mount_vehicle)
                db.session.commit()
            
            db.session.commit()
            return jsonify({'item': item.to_dict()}), 201
        except IntegrityError as ie:
            # Rollback the session if any operation fails
            db.session.rollback()
            app.logger.error(f"Integrity Error while attempting to create new item: {ie}")
            return jsonify({'message': str(ie)}), 400
        except ValueError as ve:
            app.logger.error(f"Validation error: {ve}")
            return jsonify({'message': str(ve)}), 400
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error creating item: {e}")
            return jsonify({'error': 'Server error: ' + str(e)}), 500


## Update details for an Item entry
@app.route('/api/items/<int:itemID>', methods=['PUT'])
@jwt_required()
def update_item(itemID):
    data = request.get_json()
    item = Item.query.get(itemID)
    # item = Item.query.filter_by(id=itemID).first()
    if not item:
        return jsonify({'message': 'Item not found!'}), 404
    item.name = data.get('name', item.name)
    item.type = data.get('type', item.type)
    item.cost = data.get('cost', item.cost)
    item.currency = data.get('currency', item.currency)
    item.description = data.get('description', item.description)
    db.session.commit()
    return jsonify({'message': 'Item updated!', 'item': item.to_dict()})

## Delete a specific Item entry
@app.route('/api/items/<int:itemID>', methods=['DELETE'])
@jwt_required()
def delete_item(itemID):
    app.logger.info("Deleting Item: %s", itemID)
    item = Item.query.get(itemID)
    if not item:
        return jsonify({'message': 'Item not found!'}), 404
    
    try:
        db.session.delete(item)
        db.session.commit()
        return jsonify({'message': 'Item deleted!'})
    except Exception as e:
        app.logger.error(f"Error deleting item: {e}")
        db.session.rollback()
        return jsonify({'error': 'Server error: ' + str(e)}), 500
    
## Upload CSV for bulk item creation
@app.route('/api/upload_csv', methods=['POST'])
def upload_csv():
    if 'file' not in request.files:
        return 'No file part', 400
    file = request.files['file']
    csv_data = csv.reader(file.stream)
    items = [row for row in csv_data]

## Save items from a CSV
@app.route('/api/save_items', methods=['POST'])
def save_items():
    data = request.get_json()

    if not data or not isinstance(data, dict):
        return jsonify(error='Invalid JSON'), 400

    items = data.get('items')
    if not items or not isinstance(items, list):
        return jsonify(error='Invalid items'), 400

    try:
        for item in items:
            # Map fields for the Item model using fuzzy matching
            item = map_fields(item, Item)
            app.logger.debug("SAVE CSV- Mapped item: %s", item)

            if not all(k in item for k in ('name', 'type', 'cost', 'currency')):  # Match mapped keys
                return jsonify(error='Missing item fields'), 400

            existing_item = Item.query.filter_by(name=item['name']).first()

            if existing_item is None:
                new_item = Item(name=item['name'], type=item['type'], cost=item['cost'], currency=item['currency'],
                                weight=item.get('weight'), description=item.get('description'))
                app.logger.debug("SAVE CSV- Adding new item: %s", new_item.to_dict())
                db.session.add(new_item)
                db.session.commit()

                item_name = item['name']
                item_type = item['type']    # Save the item type for further processing cause it's about to get removed from the item dict
                itemID = new_item.id

                ## Remove the fields that are already saved in the Item model
                item.pop('name', None)
                item.pop('type', None)
                item.pop('cost', None)
                item.pop('currency', None)
                item.pop('weight', None)
                item.pop('description', None)

                if item_type == 'Weapon':
                    app.logger.debug("SAVE CSV- %s is Weapon", item_name)
                    # Map fields for the Weapon model
                    weapon_data = map_fields(item, Weapon)
                    app.logger.debug("SAVE CSV- Weapon Data: %s", weapon_data)
                    weapon = Weapon(itemID=itemID, damage=weapon_data.get('damage'),
                                    damage_type=weapon_data.get('damage_type'),
                                    weapon_type=weapon_data.get('weapon_type'),
                                    weapon_range=weapon_data.get('range'))
                    db.session.add(weapon)

                elif item_type == 'Armor':
                    app.logger.debug("SAVE CSV- %s is Armor", item_name)
                    # Map fields for the Armor model
                    armor_data = map_fields(item, Armor)
                    app.logger.debug("SAVE CSV- Armor Data: %s", armor_data)
                    armor = Armor(itemID=itemID, armor_class=armor_data.get('armor_class'),
                                  armor_type=armor_data.get('armor_type'),
                                  stealth_disadvantage=armor_data.get('stealth'),
                                  strength_needed=armor_data.get('strength'))
                    db.session.add(armor)

                elif item_type in ['Ring', 'Wand', 'Scroll']:
                    app.logger.debug("SAVE CSV- %s is a Magic Item", item_name)
                    # Map fields for the SpellItem model
                    spell_data = map_fields(item, SpellItem)
                    magic_item = SpellItem(itemID=itemID, spell=spell_data.get('spell'),
                                           charges=spell_data.get('charges'))
                    db.session.add(magic_item)

                elif item_type == 'Mounts and Vehicles':
                    app.logger.debug("SAVE CSV- %s is a Mount or Vehicle", item_name)
                    # Map fields for the MountVehicle model
                    mount_data = map_fields(item, MountVehicle)
                    mount_vehicle = MountVehicle(itemID=itemID, speed=mount_data.get('speed'),
                                                 speed_unit=mount_data.get('speed_unit'),
                                                 capacity=mount_data.get('capacity'),
                                                 vehicle_type=mount_data.get('vehicle_type'))
                    db.session.add(mount_vehicle)

                db.session.commit()
            else:
                app.logger.debug("SAVE CSV- Item %s already exists in the database. Skipping...", item['name'])

        socketio.emit('items_updated')
        return jsonify(message='Items saved'), 200

    except Exception as e:
        app.logger.exception("Failed to save items")
        return jsonify(error=str(e)), 400

@app.route('/api/inventory', methods=['GET', 'POST'], endpoint='inventory')
@jwt_required()
def inventory():
    if request.method == 'GET':
        app.logger.info("**** Getting Inventory ****")
        # app.logger.info("GET INVENTORY- headers: %s", request.headers)

        if request.headers.get('Character-ID'):
            inventory_items = InventoryItem.query.filter_by(characterID=request.headers.get('Character-ID')).all()
            inventory = []

            for inventory_item in inventory_items:
                item = Item.query.get(inventory_item.itemID)
                if item is not None:
                    item_details = {
                        'id': inventory_item.itemID,
                        'name': inventory_item.name,
                        'type': item.type,
                        'cost': item.cost,
                        'currency': item.currency,
                        'quantity': inventory_item.quantity,
                        'description': item.description,
                        'weight': item.weight,
                        'equipped': inventory_item.equipped if inventory_item.equipped is not None else False
                    }

                    # Get additional item details based on item type
                    if item.type == 'Weapon':
                        weapon = Weapon.query.get(item.id)
                        if weapon is not None:
                            item_details.update({
                                'damage': weapon.damage,
                                'damage_type': weapon.damage_type,
                                'weapon_range': weapon.weapon_range
                            })
                    elif item.type == 'Armor':
                        armor = Armor.query.get(item.id)
                        if armor is not None:
                            item_details.update({
                                'armor_class': armor.armor_class,
                                'armor_type': armor.armor_type,
                                'strength_needed': armor.strength_needed,
                                'stealth_disadvantage': armor.stealth_disadvantage
                            })
                    elif item.type == 'SpellItem':
                        spellItem = SpellItem.query.get(item.id)
                        if spellItem is not None:
                            item_details.update({
                                'charges': spellItem.charges,
                                'spell_id': spellItem.spell_id
                            })
                    elif item.type == 'MountVehicle':
                        mountVehicle = MountVehicle.query.get(item.id)
                        if mountVehicle is not None:
                            item_details.update({
                                'speed': mountVehicle.speed,
                                'speed_unit': mountVehicle.speed_unit,
                                'capacity': mountVehicle.capacity
                            })

                    inventory.append(item_details)

            return jsonify({'inventory': inventory})

        else:    
            username = get_jwt_identity()
            user = User.query.filter_by(username=username).first()

            if user is None:
                return jsonify({'error': 'User not found.'}), 404
            
            app.logger.info("GET INVENTORY- user from JWT: %s", user.to_dict())

            campaignID = request.headers.get('CampaignID')

            if campaignID is None:
                return jsonify({'error': 'Campaign ID not provided in the request header.'}), 400
            
            app.logger.info("GET INVENTORY- campaignID: %s", campaignID)
            
            # Find the character associated with the user and the campaign
            stmt = select(campaign_members.c.characterID).where(
                campaign_members.c.campaignID == campaignID, 
                campaign_members.c.userID == user.id
            )
            result = db.session.execute(stmt).first()

            if result is None:
                return jsonify({'error': 'Character not found.'}), 404

            characterID = result.characterID if result else None

            app.logger.debug("GET INVENTORY- characterID based on JWT: %s", characterID)

            inventory_items = InventoryItem.query.filter_by(characterID=characterID).all()
            inventory = []

            for inventory_item in inventory_items:
                item = Item.query.get(inventory_item.itemID)
                if item is not None:
                    item_details = {
                        'id': inventory_item.itemID,
                        'name': inventory_item.name,
                        'type': item.type,
                        'cost': item.cost,
                        'currency': item.currency,
                        'quantity': inventory_item.quantity,
                        'description': item.description,
                        'weight': item.weight,
                        'equipped': inventory_item.equipped if inventory_item.equipped is not None else False
                    }

                    # Get additional item details based on item type
                    if item.type == 'Weapon':
                        weapon = Weapon.query.get(item.id)
                        if weapon is not None:
                            item_details.update({
                                'damage': weapon.damage,
                                'damage_type': weapon.damage_type,
                                'weapon_range': weapon.weapon_range
                            })
                    elif item.type == 'Armor':
                        armor = Armor.query.get(item.id)
                        if armor is not None:
                            item_details.update({
                                'armor_class': armor.armor_class,
                                'armor_type': armor.armor_type,
                                'strength_needed': armor.strength_needed,
                                'stealth_disadvantage': armor.stealth_disadvantage
                            })
                    elif item.type == 'SpellItem':
                        spellItem = SpellItem.query.get(item.id)
                        if spellItem is not None:
                            item_details.update({
                                'charges': spellItem.charges,
                                'spell_id': spellItem.spell_id
                            })
                    elif item.type == 'MountVehicle':
                        mountVehicle = MountVehicle.query.get(item.id)
                        if mountVehicle is not None:
                            item_details.update({
                                'speed': mountVehicle.speed,
                                'speed_unit': mountVehicle.speed_unit,
                                'capacity': mountVehicle.capacity
                            })

                    inventory.append(item_details)

            return jsonify({'inventory': inventory})

    elif request.method == 'POST':
        print("**** Giving Item to Player ****")
        data = request.get_json()
        app.logger.debug("POST INVENTORY- data: %s", data)

        current_user = User.query.filter_by(username=get_jwt_identity()).first()

        if 'characterID' in data and current_user.character_name != 'DM':
            return jsonify({'message': 'Only DMs can issue items to other players!'}), 403
        characterID = data['characterID']

        character = Character.query.filter_by(id=characterID).first()
        app.logger.debug("POST ITEM to Player- character:", character.character_name)
        if character is None:
            return jsonify({'message': 'Character not found'}), 404

        item = Item.query.get(data['itemID'])
        print("FLASK- item:", item.name)
        if item is None:
            return jsonify({'message': 'Item not found'}), 404

        inventory_item = InventoryItem.query.filter_by(characterID=character.id, itemID=item.id).first()
        if inventory_item:
            inventory_item.quantity += int(data['quantity'])
        else:
            inventory_item = InventoryItem(characterID=character.id, itemID=item.id, quantity=data['quantity'])
            db.session.add(inventory_item)
        db.session.commit()

        print("FLASK- Emitting inventory update")
        socketio.emit('inventory_update', {'character_name': character.character_name, 'itemID': data['itemID'], 'quantity': data['quantity']}, to=character.user.sid)

        return jsonify({'message': 'Item added to inventory!'})


@app.route('/api/inventory/<int:itemID>', methods=['GET'])
@jwt_required()
def get_inventoryItem(itemID):
    username = get_jwt_identity()
    user = User.query.filter_by(username=username).first()

    if user is None:
        return jsonify({'error': 'User not found.'}), 404

    campaignID = request.headers.get('CampaignID')

    if campaignID is None:
        return jsonify({'error': 'Campaign ID not provided in the request header.'}), 400
    
    # Get the DM's user ID
    dm_id = Campaign.query.filter_by(id=campaignID).first().dm_id

    if user.id != dm_id:
        # Find the character associated with the user and the campaign
        stmt = select(campaign_members.c.characterID).where(
            campaign_members.c.campaignID == campaignID, 
            campaign_members.c.userID == user.id
        )
        result = db.session.execute(stmt).first()

        if result is None:
            return jsonify({'error': 'Character not found.'}), 404

        characterID = result.characterID if result else None

        inventory_item = InventoryItem.query.filter_by(characterID=characterID, itemID=itemID).first()
        if not inventory_item:
            return jsonify({'message': 'Item not found in inventory!'}), 404

        item = Item.query.get(itemID)

        if item is None:
            return jsonify({'message': 'Item not found!'}), 404

        item_details = {
            'id': itemID,
            'name': inventory_item.name,
            'type': item.type,
            'cost': item.cost,
            'currency': item.currency,
            'quantity': inventory_item.quantity,
            'description': item.description,
            'weight': item.weight,
            'equipped': inventory_item.equipped if inventory_item.equipped is not None else False
        }

    else: ## If the user is the DM
        item = Item.query.get(itemID)

        if item is None:
            return jsonify({'message': 'Item not found!'}), 404

        item_details = {
            'id': itemID,
            'name': item.name,
            'type': item.type,
            'cost': item.cost,
            'currency': item.currency,
            'description': item.description,
            'weight': item.weight,
        }

    # Get additional item details based on item type
    if item.type == 'Weapon':
        weapon = Weapon.query.get(item.id)
        if weapon is not None:
            item_details.update({
                'damage': weapon.damage,
                'damage_type': weapon.damage_type,
                'weapon_range': weapon.weapon_range
            })
    elif item.type == 'Armor':
        armor = Armor.query.get(item.id)
        if armor is not None:
            item_details.update({
                'armor_class': armor.armor_class,
                'armor_type': armor.armor_type,
                'strength_needed': armor.strength_needed,
                'stealth_disadvantage': armor.stealth_disadvantage
            })
    elif item.type == 'SpellItem':
        spellItem = SpellItem.query.get(item.id)
        if spellItem is not None:
            item_details.update({
                'charges': spellItem.charges,
                'spell_id': spellItem.spell_id
            })
    elif item.type == 'MountVehicle':
        mountVehicle = MountVehicle.query.get(item.id)
        if mountVehicle is not None:
            item_details.update({
                'speed': mountVehicle.speed,
                'speed_unit': mountVehicle.speed_unit,
                'capacity': mountVehicle.capacity
            })


    return jsonify({'item': item_details})


## When a player wants to nickname or equip an item from their inventory
@app.route('/api/inventory/<int:itemID>', methods=['PUT'])
@jwt_required()
def update_inventoryItem(itemID):
    username = get_jwt_identity()
    user = User.query.filter_by(username=username).first()

    if user is None:
        return jsonify({'error': 'User not found.'}), 404

    campaignID = request.headers.get('CampaignID')

    if campaignID is None:
        return jsonify({'error': 'Campaign ID not provided in the request header.'}), 400
    
    # Find the character associated with the user and the campaign
    stmt = select(campaign_members.c.characterID).where(
        campaign_members.c.campaignID == campaignID, 
        campaign_members.c.userID == user.id
    )
    result = db.session.execute(stmt).first()

    if result is None:
        return jsonify({'error': 'Character not found.'}), 404

    characterID = result.characterID if result else None

    inventory_item = InventoryItem.query.filter_by(characterID=characterID, itemID=itemID).first()
    if not inventory_item:
        return jsonify({'message': 'Item not found in inventory!'}), 404

    data = request.get_json()
    nickname = data.get('name')
    equipped = data.get('equipped')

    if nickname is not None:
        inventory_item.name = nickname
    if equipped is not None:
        inventory_item.equipped = equipped

    db.session.add(inventory_item)
    db.session.commit()
    return jsonify({'message': 'Item updated!'})

@app.route('/api/inventory/<int:itemID>', methods=['DELETE'])
@jwt_required()
def drop_item(itemID):
    username = get_jwt_identity()
    user = User.query.filter_by(username=username).first()

    if user is None:
        return jsonify({'error': 'User not found.'}), 404
    
    app.logger.info("DROP ITEM- user from JWT: %s", user.to_dict())

    campaignID = request.headers.get('CampaignID')

    if campaignID is None:
        return jsonify({'error': 'Campaign ID not provided in the request header.'}), 400
    
    app.logger.info("DROP ITEM- campaignID: %s", campaignID)
    
    # Find the character associated with the user and the campaign
    stmt = select(campaign_members.c.characterID).where(
        campaign_members.c.campaignID == campaignID, 
        campaign_members.c.userID == user.id
    )
    result = db.session.execute(stmt).first()

    if result is None:
        return jsonify({'error': 'Character not found.'}), 404

    characterID = result.characterID if result else None

    app.logger.debug("DROP ITEM- characterID based on JWT: %s", characterID)
    
    app.logger.debug("DROP ITEM- campaignID: %s", campaignID)
    app.logger.debug("DROP ITEM- characterID: %s", characterID)
    
    # Query the campaign_members table and join with the Character table
    # character = db.session.query(Character).join(campaign_members, campaign_members.c.characterID == Character.id).filter(
    #     campaign_members.c.campaignID == campaignID,
    #     campaign_members.c.userID == userID
    # ).first()

    character = Character.query.filter_by(id=characterID).first()
    
    if not character:
        return jsonify({'message': 'Character not found!'}), 404
    
    inventory_item = InventoryItem.query.filter_by(characterID=characterID, itemID=itemID).first()
    if not inventory_item:
        return jsonify({'message': 'Item not found in inventory!'}), 404

    drop_quantity = request.get_json().get('quantity', 1)
    drop_quantity = int(drop_quantity)
    
    if inventory_item.quantity > drop_quantity:
        inventory_item.quantity -= drop_quantity
    else:
        db.session.delete(inventory_item)
    
    db.session.commit()
    return jsonify({'message': 'Item dropped!'})

@app.route('/api/equipment', methods=['GET'])
@jwt_required()
def get_equipment():
    username = get_jwt_identity()
    user = User.query.filter_by(username=username).first()

    campaignID = request.headers.get('CampaignID')

    print('Equipment: campaignID:', campaignID)
    print("Equipment: userID:", user.id)

    stmt = select(campaign_members.c.characterID).where(
        campaign_members.c.campaignID == campaignID, 
        campaign_members.c.userID == user.id
    )

    result = db.session.execute(stmt).first()

    characterID = result.characterID if result else None

    equippedItems = InventoryItem.query.filter_by(characterID=characterID, equipped=True).all()

    # Convert the SQLAlchemy objects to dictionaries
    equippedItems = [item.to_dict() for item in equippedItems]

    return jsonify({'equipment': equippedItems})


## These functions do Journal stuff
@app.route('/api/journal', methods=['POST'])
@jwt_required()
def create_journal_entry():
    # app.logger.debug("JOURNAL- headers: %s", request.headers)
    data = request.get_json()
    if 'title' not in data or 'entry' not in data:
        return jsonify({'message': 'Title and Entry are required!'}), 400

    username = get_jwt_identity()
    user = User.query.filter_by(username=username).first()

    if user is None:
        return jsonify({'error': 'User not found.'}), 404

    campaignID = request.headers.get('CampaignID')

    if campaignID is None:
        return jsonify({'error': 'Campaign ID not provided in the request header.'}), 400
    else:
        app.logger.debug("JOURNAL- campaignID: %s", campaignID)
    
    # Find the character associated with the user and the campaign
    stmt = select(campaign_members.c.characterID).where(
        campaign_members.c.campaignID == campaignID, 
        campaign_members.c.userID == user.id
    )
    result = db.session.execute(stmt).first()

    if result is None:
        return jsonify({'error': 'Character not found.'}), 404

    characterID = result.characterID if result else None
    app.logger.debug("JOURNAL- characterID: %s", characterID)

    new_journal_entry = Journal(
        userID=user.id,
        campaignID=campaignID,
        characterID=characterID,
        title=data['title'],
        entry=data['entry'],
        date_created=datetime.utcnow(),
        date_modified=datetime.utcnow()
    )
    db.session.add(new_journal_entry)
    db.session.commit()

    return jsonify({'message': 'New journal entry created!'})

@app.route('/api/journal', methods=['GET'])
@jwt_required()
def get_journal_entries():
    username = get_jwt_identity()
    user = User.query.filter_by(username=username).first()

    if user is None:
        return jsonify({'error': 'User not found.'}), 404

    campaignID = request.headers.get('CampaignID')

    if campaignID is None:
        return jsonify({'error': 'Campaign ID not provided in the request header.'}), 400
    
    # Find the character associated with the user and the campaign
    stmt = select(campaign_members.c.characterID).where(
        campaign_members.c.campaignID == campaignID, 
        campaign_members.c.userID == user.id
    )
    result = db.session.execute(stmt).first()

    if result is None:
        return jsonify({'error': 'Character not found.'}), 404

    characterID = result.characterID if result else None

    entries = Journal.query.filter_by(characterID=characterID).order_by(Journal.date_created.desc()).all()
    return jsonify({'entries': [{
        'id': entry.id,
        'title': entry.title,
        'date_created': entry.date_created.strftime("%m/%d/%Y, %H:%M:%S"),
        'date_modified': entry.date_modified.strftime("%m/%d/%Y, %H:%M:%S"),
        'content': entry.entry
    } for entry in entries]})

@app.route('/api/journal/<entry_id>', methods=['PUT'])
@jwt_required()
def update_journal_entry(entry_id):
    data = request.get_json()
    username = get_jwt_identity()
    user = User.query.filter_by(username=username).first()

    if user is None:
        return jsonify({'error': 'User not found.'}), 404

    campaignID = request.headers.get('CampaignID')

    if campaignID is None:
        return jsonify({'error': 'Campaign ID not provided in the request header.'}), 400
    
    # Find the character associated with the user and the campaign
    stmt = select(campaign_members.c.characterID).where(
        campaign_members.c.campaignID == campaignID, 
        campaign_members.c.userID == user.id
    )
    result = db.session.execute(stmt).first()

    if result is None:
        return jsonify({'error': 'Character not found.'}), 404

    characterID = result.characterID if result else None
    entry = Journal.query.filter_by(id=entry_id, characterID=characterID).first()

    if entry is None:
        return jsonify({'message': 'Journal entry not found'}), 404

    if 'title' in data:
        entry.title = data['title']
    if 'entry' in data:
        entry.entry = data['entry']
    entry.date_modified = datetime.utcnow()

    db.session.commit()
    return jsonify({'message': 'Journal entry updated'}), 200

@app.route('/api/journal/<entry_id>', methods=['DELETE'])
@jwt_required()
def delete_journal_entry(entry_id):
    username = get_jwt_identity()
    user = User.query.filter_by(username=username).first()

    if user is None:
        return jsonify({'error': 'User not found.'}), 404

    campaignID = request.headers.get('CampaignID')

    if campaignID is None:
        return jsonify({'error': 'Campaign ID not provided in the request header.'}), 400
    
    # Find the character associated with the user and the campaign
    stmt = select(campaign_members.c.characterID).where(
        campaign_members.c.campaignID == campaignID, 
        campaign_members.c.userID == user.id
    )
    result = db.session.execute(stmt).first()

    if result is None:
        return jsonify({'error': 'Character not found.'}), 404

    characterID = result.characterID if result else None

    entry = Journal.query.filter_by(id=entry_id, characterID=characterID).first()

    if entry is None:
        return jsonify({'message': 'Journal entry not found'}), 404

    db.session.delete(entry)
    db.session.commit()
    return jsonify({'message': 'Journal entry deleted'}), 200


## Library Stuff
@app.route('/api/library', methods=['GET', 'POST'])
def library():
    campaign_id = request.headers.get('CampaignID')
    if not campaign_id:
        return jsonify({'error': 'Campaign ID is required'}), 400

    if request.method == 'GET':
        # Query the database for all documents
        documents = Document.query.filter_by(campaignID=campaign_id).all()
        app.logger.debug('Found %d documents in the database', len(documents))
        
        # Construct the file information
        file_info = []
        for document in documents:
            fileName, fileType = os.path.splitext(document.name)
            displayName = fileName.replace("_", " ")
            file_info.append({
                'name': displayName,
                'type': fileType[1:],  # fileType[1:] to remove the leading dot
                'originalName': document.name,
                'id': document.id  # Include the ID for future reference
            })
        
        return { 'files': file_info }, 200

    elif request.method == 'POST':
        # Save the uploaded file to the Documents table        
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        new_file = Document(
            name=file.filename,
            data=file.read(),
            mimetype=file.mimetype,
            campaignID=campaign_id
        )
        db.session.add(new_file)
        db.session.commit()

        # emit an event to all connected clients
        socketio.emit('library_update')

        return { 'file': { 'name': file.filename } }, 201

@app.route('/api/library/<int:file_id>', methods=['GET'])
def get_file_by_id(file_id):
    app.logger.debug("GET FILE BY ID: %s", file_id)

    campaign_id = request.headers.get('CampaignID')
    # app.logger.debug("GET FILE BY ID- headers: %s", request.headers)
    if not campaign_id:
        app.logger.error("GET FILE BY ID- Campaign ID is required")
        return jsonify({'error': 'Campaign ID is required'}), 400
    else:
        app.logger.debug("GET FILE BY ID- campaignID: %s", campaign_id)

    try:
        # Log the request for the file
        app.logger.debug('Getting file with ID %d from the database', file_id)

        # Query the database for the document
        document = Document.query.filter_by(id=file_id, campaignID=campaign_id).first()

        if document is None:
            app.logger.error('File not found in the database: %d', file_id)
            return jsonify({'error': 'File not found'}), 404

        # Send the requested file
        return send_file(
            io.BytesIO(document.data),
            mimetype=document.mimetype,
            as_attachment=True,
            download_name=document.name
        )
    except Exception as e:
        app.logger.error('Error getting file with ID %d: %s', file_id, str(e))
        return jsonify({'error': 'Server error: ' + str(e)}), 500

@app.route('/api/library/<int:file_id>', methods=['DELETE'])
def delete_file_by_id(file_id):
    campaign_id = request.headers.get('CampaignID')
    if not campaign_id:
        return jsonify({'error': 'Campaign ID is required'}), 400

    try:
        # Log the request for the file
        app.logger.debug('Deleting file with ID %d from the database', file_id)

        # Query the database for the document
        document = Document.query.filter_by(id=file_id, campaignID=campaign_id).first()

        if document is None:
            app.logger.error('File not found in the database: %d', file_id)
            return jsonify({'error': 'File not found'}), 404

        # Delete the document
        db.session.delete(document)
        db.session.commit()

        # emit an event to all connected clients
        socketio.emit('library_update')

        return jsonify({'message': 'File deleted successfully'})
    except Exception as e:
        app.logger.error('Error deleting file with ID %d: %s', file_id, str(e))
        return jsonify({'error': 'Server error: ' + str(e)}), 500


##************************##
## **      Spells      ** ##
##************************##
@app.route('/api/spellbook', methods=['GET'])
@jwt_required()
def get_spellbook():
    ## Get a player's spellbook
    campaignID = request.headers.get('CampaignID')
    userID = request.headers.get('userID')
    character = campaign_members.query.filter_by(campaignID=campaignID, userID=userID).first().character

    if not character:
        return jsonify({"error": "Character not found"}), 404

    spellbook_items = Spellbook.query.filter_by(characterID=character.id).all()
    return jsonify({"spellbook": [item.to_dict() for item in spellbook_items]})

@app.route('/api/spells', methods=['GET'])
@jwt_required()
def get_all_spells():
    ## Get all the defined spells for the DM
    campaignID = request.headers.get('CampaignID')
    userID = request.headers.get('userID')
    character = campaign_members.query.filter_by(campaignID=campaignID, userID=userID).first().character

    if character.character_name != 'DM':
        return jsonify({"error": "Unauthorized"}), 403

    spells = Spell.query.all()
    return jsonify([spell.to_dict() for spell in spells])

@app.route('/api/prepared_spells', methods=['GET'])
@jwt_required()
def get_prepared_spells():
    try:
        campaignID = request.headers.get('CampaignID')
        username = get_jwt_identity()
        user = User.query.filter_by(username=username).first()

        userID = request.headers.get('userID')

        stmt = select(campaign_members.c.characterID).where(
            campaign_members.c.campaignID == campaignID, 
            campaign_members.c.userID == user.id
        )

        result = db.session.execute(stmt).first()

        characterID = result.characterID if result else None


        preparedSpells = Spellbook.query.filter_by(characterID=characterID, equipped=True).all()

        # Convert the SQLAlchemy objects to dictionaries
        preparedSpells = [spell.to_dict() for spell in preparedSpells]

        return jsonify({'spells': preparedSpells})

    except InvalidTokenError:
        return jsonify({'error': 'InvalidTokenError- GET /api/prepared_spells'}), 401
    except ExpiredSignatureError:
        return jsonify({'error': 'Expired token'}), 401

@app.route('/api/spells', methods=['POST'])
@jwt_required()
def create_spell():
    # Create a new spell
    campaignID = request.headers.get('CampaignID')
    userID = request.headers.get('userID')
    character = campaign_members.query.filter_by(campaignID=campaignID, userID=userID).first().character

    if character.character_name != 'DM':
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json

    # Convert lists to unique lists (to remove duplicates)
    data['components'] = list(set(data['components']))
    data['Classes'] = list(set(data['Classes']))

    # Convert lists to CSV strings for specific keys
    if 'components' in data:
        data['components'] = ",".join(data['components'])
        print('components:', data['components'])
        app.logger.info('components: %s', data['components'])
    if 'Classes' in data:
        data['Classes'] = ",".join(data['Classes'])
        print('Classes:', data['Classes'])
        app.logger.info('Classes: %s', data['Classes'])

    new_spell = Spell(
        name=data['name'],
        level=data['level'],
        casting_time=data['casting_time'],
        range=data['range'],
        components=data['components'],  # Use the value from the data dictionary
        duration=data['duration'],
        description=data['description'],
        classes=data['Classes'],       # Use the value from the data dictionary
        school=data['school']
    )


    db.session.add(new_spell)
    db.session.commit()
    return jsonify(new_spell.to_dict()), 201

@app.route('/api/save_spells', methods=['POST'])
@jwt_required()
def save_spells_to_spellbook():
    # Saves to Spellbook
    campaignID = request.headers.get('CampaignID')
    userID = request.headers.get('userID')
    character = campaign_members.query.filter_by(campaignID=campaignID, userID=userID).first().character

    data = request.json
    spells = data['spells']
    for spell_data in spells:
        spellbook_item = Spellbook(
            userID=userID,
            spell_id=spell_data['spell_id'],
            quantity=spell_data.get('quantity', 1)  # Defaults to 1 if not provided
        )
        db.session.add(spellbook_item)
    db.session.commit()
    return jsonify({"message": "Spells saved successfully"}), 201

@app.route('/api/spellbook/<int:spellID>', methods=['DELETE'])
@jwt_required()
def drop_spell_from_spellbook(spellID):
    campaignID = request.headers.get('CampaignID')
    userID = request.headers.get('userID')
    character = campaign_members.query.filter_by(campaignID=campaignID, userID=userID).first().character

    spellbook_item = Spellbook.query.filter_by(userID=userID).first()
    if not spellbook_item or spellbook_item.userID != userID:
        return jsonify({"error": "Spellbook item not found or unauthorized"}), 404

    data = request.json
    quantity_to_remove = data.get('quantity', 1)  # Defaults to removing 1 if not provided
    spellbook_item = Spellbook.query.get(spellID)
    if not spellbook_item:
        return jsonify({"error": "Spellbook item not found"}), 404
    if spellbook_item.quantity <= quantity_to_remove:
        db.session.delete(spellbook_item)
    else:
        spellbook_item.quantity -= quantity_to_remove
    db.session.commit()
    return jsonify({"message": "Spell removed successfully"})

@app.route('/api/spells/<int:spellID>', methods=['DELETE'])
@jwt_required()
def delete_spell(spellID):
    campaignID = request.headers.get('CampaignID')
    userID = request.headers.get('userID')
    character = campaign_members.query.filter_by(campaignID=campaignID, userID=userID).first().character

    if character.character_name != 'DM':
        return jsonify({"error": "Unauthorized"}), 403

    spell = Spell.query.get(spellID)
    if not spell:
        return jsonify({"error": "Spell not found"}), 404
    db.session.delete(spell)
    db.session.commit()
    return jsonify({"message": "Spell deleted successfully"})

@app.route('/api/spells/<int:spellID>', methods=['PUT'])
@jwt_required()
def update_spell(spellID):
    ## Used for the DM to update a spell's details
    campaignID = request.headers.get('CampaignID')
    userID = request.headers.get('userID')
    character = campaign_members.query.filter_by(campaignID=campaignID, userID=userID).first().character

    if character.character_name != 'DM':
        return jsonify({"error": "Unauthorized"}), 403

    spell = Spell.query.get(spellID)
    if not spell:
        return jsonify({"error": "Spell not found"}), 404
    data = request.json

    # Convert lists to unique lists (to remove duplicates)
    data['components'] = list(set(data['components']))
    data['Classes'] = list(set(data['Classes']))

    # Convert lists to CSV strings for specific keys
    if 'components' in data:
        data['components'] = ",".join(data['components'])
    if 'Classes' in data:
        data['Classes'] = ",".join(data['Classes'])

    for key, value in data.items():
        setattr(spell, key, value)
    db.session.commit()
    return jsonify(spell.to_dict())


@app.route('/api/spellbook/<int:spellID>', methods=['PUT'])
@jwt_required()
def update_spellbook_item(spellID):
    ## Isn't this so the DM can give spells to a player? Or is this for updating spells?
    username = get_jwt_identity()
    user = User.query.filter_by(username=username).first()

    spellbook_item = Spellbook.query.filter_by(userID=user.id).first()
    if not spellbook_item or spellbook_item.userID != user.id:
        return jsonify({"error": "Spellbook item not found or unauthorized"}), 404

    data = request.json
    spellbook_item.name = data['name']
    spellbook_item.equipped = data['equipped']
    db.session.commit()
    return jsonify(spellbook_item.to_dict())


##************************##
## **    Loot Boxes    ** ##
##************************##
@app.route('/api/lootboxes', methods=['GET'])
def get_all_loot_boxes():
    loot_boxes = LootBox.query.all()
    return jsonify({'lootBoxes': [box.to_dict() for box in loot_boxes]})

@app.route('/api/lootboxes', methods=['POST'])
def create_loot_box():
    data = request.get_json()
    loot_box_name = data['name']
    items = data['items']  # This is now a list of dictionaries

    # Create the LootBox
    loot_box = LootBox(name=loot_box_name)
    db.session.add(loot_box)
    db.session.commit()

    for item in items:
        itemID = item['id']
        quantity = item['quantity']
        # itemDB = Item.query.get(itemID)
        itemDB = Item.query.filter_by(id=itemID).first()
        if itemDB:
            association = loot_box_items.insert().values(loot_boxID=loot_box.id, itemID=itemDB.id, quantity=quantity)
            db.session.execute(association)
            db.session.commit()  # Commit after each iteration

    return jsonify({'message': 'Loot box created successfully'})

## Save a Loot Box
@app.route('/api/lootboxes/<int:box_id>', methods=['PUT'])
def update_loot_box(box_id):
    data = request.get_json()
    # print("data:", data)
    app.logger.info("data: %s", data)
    loot_box_name = data['name']
    items = data['items']

    # Get the LootBox
    # loot_box = LootBox.query.get(box_id)
    loot_box = LootBox.query.filter_by(id=box_id).first()
    if loot_box is None:
        return jsonify({'message': 'Loot box not found'}), 404

    # Update the name
    loot_box.name = loot_box_name

    # Clear the current items
    loot_box.items = []

    db.session.execute(loot_box_items.delete().where(loot_box_items.c.loot_boxID == box_id))
    db.session.commit()

    # Add the new items
    for item in items:
        itemID = item['id']
        quantity = item['quantity']
        # itemDB = Item.query.get(itemID)
        itemDB = Item.query.filter_by(id=itemID).first()
        if itemDB:
            association = loot_box_items.insert().values(loot_boxID=loot_box.id, itemID=itemDB.id, quantity=quantity)
            db.session.execute(association)
            db.session.commit()  # Commit after each iteration

    return jsonify({'message': 'Loot box updated successfully'})

@app.route('/api/lootboxes/<int:box_id>', methods=['DELETE'])
def delete_loot_box(box_id):
    # Get the LootBox
    loot_box = LootBox.query.filter_by(id=box_id).first()
    if loot_box is None:
        return jsonify({'message': 'Loot box not found'}), 404

    db.session.delete(loot_box)
    db.session.commit()

    return jsonify({'message': 'Loot box deleted successfully'})

## Get list of loot in a lootbox
@app.route('/api/lootboxes/<int:box_id>', methods=['GET'])
def get_loot_box(box_id):
    # loot_box = LootBox.query.get(box_id)
    loot_box = LootBox.query.filter_by(id=box_id).first()
    if loot_box:
        # Use the association table to get the items in this loot box along with their quantities
        items_with_quantities = db.session.query(Item, loot_box_items.c.quantity).filter(
            loot_box_items.c.loot_boxID == loot_box.id,
            loot_box_items.c.itemID == Item.id
        ).all()
        return jsonify({'items': [{'id': item.id, 'name': item.name, 'quantity': quantity} for item, quantity in items_with_quantities]})
    else:
        return jsonify({'message': 'Loot box not found'}), 404

## Issue loot box to player
@app.route('/api/lootboxes/<int:box_id>', methods=['POST'])
@jwt_required()
def issue_loot_box(box_id):
    app.logger.debug("ISSUE LOOT BOX- box_id: %s", box_id)
    app.logger.debug("ISSUE LOOT BOX- request json: %s", request.json)
    
    selectedPlayer = request.json.get('player')
    character_id = selectedPlayer.get('id')
    character_name = selectedPlayer.get('character_name')
    username = selectedPlayer.get('username')
    campaignID = request.headers.get('CampaignID')

    # Get the LootBox instance
    loot_box = LootBox.query.filter_by(id=box_id).first()
    if loot_box is None:
        return jsonify({'message': 'Loot box not found.'}), 404

    # Use the association table to get the items in this loot box along with their quantities
    items_with_quantities = db.session.query(Item, loot_box_items.c.quantity).filter(
        loot_box_items.c.loot_boxID == box_id,
        loot_box_items.c.itemID == Item.id
    ).all()

    for item, quantity in items_with_quantities:
        # Update recipient's inventory
        recipient_inventory_item = InventoryItem.query.filter_by(characterID=character_id, itemID=item.id).first()
        if recipient_inventory_item:
            recipient_inventory_item.quantity += quantity
        else:
            new_inventory_item = InventoryItem(characterID=character_id, itemID=item.id, name=item.name, quantity=quantity)
            db.session.add(new_inventory_item)

    db.session.commit()

    # Emit an inventory_update event to the recipient
    socketio.emit('inventory_update', {'character_name': character_name, 'items': [item.to_dict() for item, _ in items_with_quantities]}, to=selectedPlayer.get('sid'))

    # Send a message to the recipient that they got a new loot box
    reception_message = {
        'type': 'text_message',
        'text': f'You received {loot_box.name}!',
        'sender': 'System',
        'recipients': [character_name],
    }
    socketio.emit('message', reception_message, to=selectedPlayer.get('sid'))

    return jsonify({'message': 'Loot box issued successfully.'})


##************************##
## **       NPCs       ** ##
##************************##
@app.route('/api/npcs', methods=['POST'])
@jwt_required()
def create_npc():
    data = request.json
    campaignID = request.headers.get('CampaignID')
    # app.logger.debug("CREATE NPC- campaignID from headers: %s", campaignID)
    
    name = data.get('name')
    description = data.get('description')
    size = data.get('size')
    creature_type = data.get('creatureType')
    creature_subtype = data.get('creatureSubtype')
    alignment = data.get('alignment')
    ac = data.get('ac')
    hp = data.get('hp')
    speed = data.get('speed')
    strength = data.get('strength')
    dexterity = data.get('dexterity')
    constitution = data.get('constitution')
    intelligence = data.get('intelligence')
    wisdom = data.get('wisdom')
    charisma = data.get('charisma')
    saving_throws = data.get('saving_throws')
    skills = data.get('skills')
    immunities = data.get('immunities')
    resistance = data.get('resistance')
    senses = data.get('senses')
    languages = data.get('languages')
    challenge = data.get('challenge')
    traits = data.get('traits')
    actions = data.get('actions')

    new_npc = NPC(
        campaign_id=campaignID,
        name=name,
        description=description,
        size=size,
        creature_type=creature_type,
        creature_subtype=creature_subtype,
        alignment=alignment,
        ac=ac,
        hp=hp,
        speed=speed,
        strength=strength,
        dexterity=dexterity,
        constitution=constitution,
        intelligence=intelligence,
        wisdom=wisdom,
        charisma=charisma,
        saving_throws=saving_throws,
        skills=skills,
        immunities=immunities,
        resistance=resistance,
        senses=senses,
        languages=languages,
        challenge=challenge,
        traits=traits,
        actions=actions
    )
    db.session.add(new_npc)
    db.session.commit()

    return jsonify(new_npc.to_dict()), 201

@app.route('/api/npcs', methods=['GET'])
@jwt_required()
def get_npcs():
    campaignID = request.headers.get('CampaignID')
    npcs = NPC.query.filter_by(campaign_id=campaignID).all()
    return jsonify([npc.to_dict() for npc in npcs]), 200

##************************##
## **  Random Tables   ** ##
##************************##

## Create a new table
@app.route('/api/random_tables', methods=['POST'])
@jwt_required()
def create_random_table():
    data = request.json
    app.logger.debug("CREATE RANDOM TABLE- data: %s", data)
    name = data.get('name')
    description = data.get('description')
    dice_type = data.get('diceType')
    entries_data = data.get('entries', [])

    if not name or not dice_type:
        return jsonify({'error': 'Name and dice_type are required'}), 400

    new_random_table = RandomTable(
        name=name,
        description=description,
        dice_type=dice_type
    )
    db.session.add(new_random_table)
    db.session.flush()  # Ensure new_random_table.id is available

    # Create and add table entries
    for entry_data in entries_data:
        min_roll = entry_data.get('min_roll')
        max_roll = entry_data.get('max_roll')
        result = entry_data.get('result')

        if min_roll is None or max_roll is None or result is None:
            return jsonify({'error': 'Each table entry must have min_roll, max_roll, and result'}), 400

        new_entry = TableEntry(
            table_id=new_random_table.id,
            min_roll=min_roll,
            max_roll=max_roll,
            result=result
        )
        db.session.add(new_entry)

    db.session.commit()

    app.logger.debug("New Table created: %s", new_random_table.to_dict())
    return jsonify(new_random_table.to_dict()), 201

## Update existing table
@app.route('/api/random_tables/<int:table_id>', methods=['PUT'])
@jwt_required()
def update_random_table(table_id):
    data = request.json
    app.logger.debug("UPDATE RANDOM TABLE- data: %s", data)
    name = data.get('name')
    description = data.get('description')
    dice_type = data.get('diceType')
    entries_data = data.get('entries', [])

    if not name or not dice_type:
        return jsonify({'error': 'Name and dice_type are required'}), 400

    # Fetch the existing table
    random_table = RandomTable.query.get_or_404(table_id)
    random_table.name = name
    random_table.description = description
    random_table.dice_type = dice_type

    # Clear existing entries
    TableEntry.query.filter_by(table_id=table_id).delete()

    # Create and add new table entries
    for entry_data in entries_data:
        min_roll = entry_data.get('min_roll')
        max_roll = entry_data.get('max_roll')
        result = entry_data.get('result')
    
        if min_roll is None or result is None:
            return jsonify({'error': 'Each table entry must have min_roll, max_roll, and result'}), 400
        
        # Set max_roll to None if it is an empty string
        if max_roll == '':
            max_roll = None
    
        new_entry = TableEntry(
            table_id=table_id,
            min_roll=min_roll,
            max_roll=max_roll,
            result=result
        )
        db.session.add(new_entry)

    db.session.commit()

    app.logger.debug("Table updated: %s", random_table.to_dict())
    return jsonify(random_table.to_dict()), 200

@app.route('/api/random_tables', methods=['GET'])
@jwt_required()
def get_random_tables():
    random_tables = RandomTable.query.all()
    return jsonify([{
        'id': table.id,
        'name': table.name,
        'description': table.description,
        'dice_type': table.dice_type
    } for table in random_tables]), 200

@app.route('/api/random_tables/<int:table_id>', methods=['GET'])
@jwt_required()
def get_random_table_entries(table_id):
    random_table = RandomTable.query.get_or_404(table_id)
    return jsonify(random_table.to_dict()), 200

@app.route('/api/random_tables/<int:table_id>', methods=['DELETE'])
@jwt_required()
def delete_random_table(table_id):
    random_table = RandomTable.query.get_or_404(table_id)
    app.logger.debug("DELETE RANDOM TABLE- table_id: %s", table_id)

    # Delete associated table entries
    TableEntry.query.filter_by(table_id=table_id).delete()

    # Delete the random table
    db.session.delete(random_table)
    db.session.commit()

    app.logger.debug("Table deleted: %s", random_table.to_dict())
    return jsonify({'message': 'Table deleted successfully'}), 200

##************************##
## **    Wiki Stuff    ** ##
##************************##
@app.route('/wiki/<campaign_name>/search', methods=['GET'])
def search(campaign_name):
    app.logger.debug("campaign_name: %s", campaign_name)
    app.logger.debug("request: %r", request)
    query = request.args.get('q')
    app.logger.debug("search query: %s", query)
    if not query:
        app.logger.warning("No query provided")
        return jsonify([])

    search_query = db.session.query(Page).filter(Page.tsv.match(query)).all()
    results = [{'id': page.id, 'title': page.title} for page in search_query]
    app.logger.debug("search results: %s", results)

    if not results:
        return jsonify({'message': 'No results found', 'create_option': True})

    return jsonify(results) 

import re

def preprocess_content(content):
    # This regular expression matches Markdown links like [display text](URL)
    pattern = r'\[(.*?)\]\((.*?)\)'
    # This function will be used to replace each match
    def replacer(match):
        display_text = match.group(1)
        return f'[{display_text}]({display_text})'
    # Use the sub function to replace each match
    return re.sub(pattern, replacer, content)

@app.route('/wiki/<campaign_name>/<page_title>', methods=['GET'])
def wiki_page(campaign_name, page_title):
    app.logger.debug("campaign_name: %s", campaign_name)
    app.logger.debug("page_title: %s", page_title)

    # Get the campaign ID from the campaign name
    campaign = Campaign.query.filter_by(name=campaign_name).first()
    app.logger.debug("campaign ID: %s", campaign.id)

    # Get the page using the Campaign ID and the page title
    page = Page.query.join(Campaign, Page.wiki_id == Campaign.id).filter(Page.title == page_title, Campaign.name == campaign_name).first()

    if page is None:
        app.logger.error("Page %s not found", page_title)
        # Call the create_page function directly
        return create_page(campaign_name, page_title)

    preprocessed_content = preprocess_content(page.content)
    html_content = markdown.markdown(preprocessed_content)

    return render_template('page.html', campaign_name=campaign_name, content=html_content, page_title=page.title)

@app.route('/wiki/<campaign_name>/<page_title>/create', methods=['GET', 'POST'])
def create_page(campaign_name, page_title):
    app.logger.debug("Creating %s page for %s wiki", page_title, campaign_name)
    # Get the campaign ID from the campaign name
    campaign = Campaign.query.filter_by(name=campaign_name).first()

    # # Ensure the sequence is correctly set
    # max_id_result = db.session.execute(text("SELECT MAX(id) FROM page"))
    # max_id = max_id_result.scalar()
    # db.session.execute(text(f"SELECT setval('page_id_seq', {max_id + 1})"))
    # db.session.commit()

    if request.method == 'POST':
        content = request.form['content']

        try:
            # Create a new page entry with the provided content
            new_page = Page(title=page_title, content=content, wiki_id=campaign.id)
            db.session.add(new_page)
            db.session.commit()

            # Redirect to the editable version of the new page
            return redirect(url_for('edit_page', campaign_name=campaign_name, page_title=page_title))
        except SQLAlchemyError as e:
            db.session.rollback()
            return f"An error occurred while creating the page: {str(e)}", 500

    try:
        # Create a blank page in the database
        new_page = Page(title=page_title, content='', wiki_id=campaign.id)
        db.session.add(new_page)
        db.session.commit()

        # Redirect to the edit page
        app.logger.info("Redirecting client to edit page")
        return render_template('edit_page.html', campaign_name=campaign_name, content=f"<h1>{page_title}</h1><p><br></p>", page_title=page_title)
    except SQLAlchemyError as e:
        db.session.rollback()
        return f"An error occurred while creating the page: {str(e)}", 500
    
@app.route('/wiki/<campaign_name>/<page_title>/edit', methods=['GET', 'POST'])
def edit_page(campaign_name, page_title):
    page = Page.query.join(Campaign, Page.wiki_id == Campaign.id).filter(Page.title==page_title, Campaign.name==campaign_name).first()
    if not page:
        return "Page not found", 404

    # Handle POST request for saving edits
    if request.method == "POST":
        app.logger.info("Edit Page POST: %s", request)
        content = request.form.get('content')
        userID = request.headers.get('userID')
        app.logger.info("Edit Page- userID: %s", userID)

        # Save the current state of the page to the Revisions table
        new_revision = Revisions(
            page_id=page.id,
            content=page.content,
            user_id=userID  # Store the user ID
        )
        db.session.add(new_revision)

        # Update the page content
        page.content = content

        try:
            db.session.commit()
            app.logger.info(f"Database commit successful for page_id: {page.id}, user_id: {userID}")
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Database commit failed for page_id: {page.id}, user_id: {userID}. Error: {e}")
            raise

        # Send a response with success: true
        return jsonify(success=True)

    # Handle GET request for displaying the edit page
    elif request.method == "GET":
        html_content = markdown.markdown(page.content)
        return render_template('edit_page.html', campaign_name=campaign_name, content=html_content, page_title=page.title)


## Chat Function (more in SocketIO stuff)
@app.route('/api/chat_history', methods=['GET'])
@jwt_required()
def get_chat_history():
    username = get_jwt_identity()
    user = User.query.filter_by(username=username).first()
    campaignID = request.headers.get('CampaignID')

    # Get the character ID for the user in the specified campaign
    stmt = select(campaign_members.c.characterID).where(
        campaign_members.c.campaignID == campaignID, 
        campaign_members.c.userID == user.id
    )

    result = db.session.execute(stmt).first()
    characterID = result.characterID if result else None

    if characterID is None:
        return jsonify({'message': 'Character not found'}), 404

    # Create a dictionary mapping user IDs to character IDs for the specified campaign
    user_to_character_map = {}
    campaign_memberships = db.session.execute(
        select(campaign_members.c.userID, campaign_members.c.characterID).where(
            campaign_members.c.campaignID == campaignID
        )
    ).fetchall()

    for membership in campaign_memberships:
        user_to_character_map[membership.userID] = membership.characterID

    def message_to_client_format(message):
        # Get sender's character name
        sender_character = Character.query.filter_by(id=user_to_character_map.get(message.sender_id)).first()
        sender_name = sender_character.character_name if sender_character else 'Unknown'
    
        # Get recipients' character names
        recipient_ids = message.recipient_ids.split(',')
        recipient_names = []
        for id in recipient_ids:
            if id:
                recipient_character = Character.query.filter_by(id=user_to_character_map.get(int(id))).first()
                recipient_names.append(recipient_character.character_name if recipient_character else 'Unknown')
    
        # Get item details
        item = Item.query.filter_by(id=message.item_id).first() if message.item_id else None
        item_details = {'id': item.id, 'name': item.name} if item else None
    
        return {
            'campaignID': campaignID,
            'group_id': message.group_id,
            'item': item_details,
            'recipient_character_names': recipient_names,
            'recipients': [int(id) for id in recipient_ids if id],
            'sender': message.sender_id,
            'sender_character_name': sender_name,
            'text': message.message_text,
            'type': message.message_type,
        }
    
    # Fetch all messages for the user from the specified campaign
    sent_messages = Message.query.filter_by(sender_id=user.id, campaign_id=campaignID).all()
    received_messages = Message.query.filter(Message.recipient_ids.contains(str(user.id)), Message.campaign_id == campaignID).all()

    # Combine, sort by timestamp, and convert to JSON-friendly format
    messages = sorted(sent_messages + received_messages, key=lambda msg: msg.timestamp)
    messages_json = [message_to_client_format(message) for message in messages]

    return jsonify(messages_json), 200


##************************##
## **  SocketIO Stuff  ** ##
##************************##

def emit_active_users(campaign_id):
    """
    Emits the list of active users in the specified campaign room.
    """
    if not campaign_id:
        app.logger.error("ONLINE USERS - Campaign ID is missing")
        return
    
    app.logger.debug("ONLINE USERS - Fetching active users for campaign_id: %s", campaign_id)
    
    # Query to get all user/character pairs for the given campaign
    stmt = (
        db.session.query(
            campaign_members.c.userID, 
            campaign_members.c.characterID
        )
        .filter(campaign_members.c.campaignID == campaign_id)
        .subquery()
    )
    
    # Query users who are online and part of the campaign
    active_users_query = (
        db.session.query(User.id, User.username, Character.character_name)
        .join(stmt, stmt.c.userID == User.id)
        .join(Character, Character.id == stmt.c.characterID)
        .filter(User.is_online == True)
    )
    active_users = active_users_query.all()

    app.logger.debug("ONLINE USERS - Active users for campaign_id %s: %s", campaign_id, active_users)

    # Prepare the data to emit
    active_user_info = [
        {
            'username': user.username,
            'character_name': user.character_name,
            'userID': user.id
        }
        for user in active_users
    ]
    
    # Emit the active users to the specific campaign room
    socketio.emit('active_users', active_user_info, to=campaign_id)

@socketio.on("request_active_users")
def handle_request_active_users(data):
    campaign_id = data.get('campaignID')
    app.logger.debug("Request Active Users - campaign_id: %s", campaign_id)
    if campaign_id:
        emit_active_users(campaign_id)
    else:
        app.logger.error("Request Active Users - Missing campaign ID")

@socketio.on("connect")
def connected():
    """event listener when client connects to the server"""
    app.logger.info("Socket Connection Triggered")
    try:
        token = request.args.get('token')  # Get the token from the request arguments
        if not token:
            app.logger.error("CONNECT- No token provided")
            socketio.disconnect()
            return

        app.logger.info("CONNECT- Received a token")
        if token and request.args.get("username"):
            username = request.args.get("username")
            if username in active_connections:
                app.logger.info(f"Disconnecting duplicate connection for user: {username}")
                socketio.disconnect()
                return

            user = User.query.filter_by(username=username).first()
            app.logger.info("CONNECT- username: %s", username)
            app.logger.info("CONNECT- user: %s", user)
            if user:
                app.logger.info("CONNECT- setting %s to online", user)
                user.is_online = True
                user.sid = request.sid  # Update the SID associated with this user
                campaign_id = request.args.get('campaignID')  # Retrieve the campaignID from the request arguments

                if not campaign_id:
                    app.logger.info("CONNECT- No campaign ID provided, requesting from client")
                    socketio.emit('request_campaignID')
                else:
                    app.logger.debug("CONNECT- campaign_id: %s", campaign_id)
                    emit_active_users(campaign_id)
            else:
                app.logger.error("CONNECT- User not found")
                socketio.disconnect()
    except jwt.ExpiredSignatureError:
        app.logger.error("CONNECT- Token is expired")
        socketio.emit('token_expired')
        socketio.disconnect()
    except Exception as e:
        app.logger.error(f"CONNECT- An error occurred: {e}")
        socketio.disconnect()

@socketio.on('join_room')
def handle_join_room(data):
    app.logger.debug('JOIN ROOM- User connected: %s', data['username'])
    user = User.query.filter_by(username=data['username']).first()
    campaign_id = data.get('campaign_id')  # From the client
    user_id = request.sid  # Unique session ID for each connection

    if campaign_id:
        join_room(campaign_id)  # Add the user to the room
        socketio.emit('status', {'message': f'User {user.username} joined room {campaign_id}'}, to=campaign_id)
        app.logger.debug("JOIN ROOM- User %s joined room %s", user.username, campaign_id)

    if user:
        app.logger.debug("JOIN ROOM- user's initial status: %s", user.is_online)
        if data['username'] in active_connections:
            app.logger.info(f"Disconnecting duplicate connection for user: {data['username']}")
            socketio.disconnect()

        if not user.is_online:
            user.is_online = True
            user.sid = request.sid  # Set the sid field
            active_connections[data['username']] = request.sid
            db.session.commit()
            app.logger.info("JOIN ROOM- %s is now online", user.username)
        else:
            user.sid = request.sid  # Set the sid field
            active_connections[data['username']] = request.sid
            db.session.commit()
            app.logger.info("JOIN ROOM- %s is already online", user.username)


@socketio.on('leave_room')
def handle_leave_room(data):
    campaign_id = data.get('campaign_id')  # From the client
    user_id = request.sid
    if campaign_id:
        leave_room(campaign_id)  # Remove the user from the room
        socketio.emit('status', {'message': f'User {user_id} left room {campaign_id}'}, to=campaign_id)

@socketio.on('send_campaignID')
def handle_send_campaignID(data):
    campaignID = data.get('campaignID')
    app.logger.info(f"Received campaign ID from client: {campaignID}")

    if campaignID:
        user = User.query.filter_by(sid=request.sid).first()
        if user:
            app.logger.info(f"Updating campaign ID for user: {user.username}")
            emit_active_users(campaignID)
        else:
            app.logger.error("User not found for the given SID")
            socketio.disconnect()
    else:
        app.logger.error("No campaign ID received from client")
        socketio.disconnect()


@socketio.on('sendMessage')
def handle_send_message(messageObj):
    app.logger.debug("MESSAGE- messageObj: %s", messageObj)

    message = messageObj['text']
    sender = messageObj['sender']   # 'sender' should be the userID
    recipients = messageObj['recipients']

    campaignID = messageObj['campaignID']
    # campaignID = request.headers.get('CampaignID')
    app.logger.debug("MESSAGE- campaignID: %s", campaignID)
    app.logger.debug("MESSAGE- recipients: %s", recipients)

    recipient_characters = []
    
    if isinstance(recipients, dict):
        recipients = [recipients]
    
    for recipient in recipients:
        try:
            app.logger.debug("MESSAGE- Trying: %s", recipient["userID"])
            recipient_character = Character.query.join(User, User.id == Character.userID).join(campaign_members, Character.id == campaign_members.c.characterID).filter(User.id == recipient["userID"], campaign_members.c.campaignID == campaignID).first()
        except:
            app.logger.debug("MESSAGE- Using: %s", recipient)
            recipient_character = Character.query.join(User, User.id == Character.userID).join(campaign_members, Character.id == campaign_members.c.characterID).filter(User.id == recipient, campaign_members.c.campaignID == campaignID).first()
        if recipient_character:
            recipient_characters.append(recipient_character)
    
    app.logger.debug("MESSAGE- sender: %s", sender)
    
    # # Step 1: Get the userID from the User table using the sender's username
    # user = User.query.filter_by(username=sender.lower()).first()
    # if not user:
    #     app.logger.error("MESSAGE- sender user not found")
    #     return jsonify({'message': 'Sender user not found'}), 404
    
    # app.logger.debug("MESSAGE- Sending user found in database: %s", user.to_dict())
    
    # Step 2: Get the characterID from the campaign_members table using userID and campaignID
    campaign_member = db.session.query(campaign_members).filter_by(userID=sender, campaignID=campaignID).first()
    if not campaign_member:
        app.logger.error("MESSAGE- sender character not found in campaign")
        return jsonify({'message': 'Sender character not found in campaign'}), 404
    
    # Step 3: Get the Character entry using the characterID
    stmt = select(campaign_members.c.characterID).where(
        campaign_members.c.campaignID == campaignID, 
        campaign_members.c.userID == sender
    )

    result = db.session.execute(stmt).first()

    characterID = result.characterID if result else None

    app.logger.debug("CharacterID- %s", characterID)
    
    sender_character = Character.query.filter_by(id=characterID).first()
    if not sender_character:
        app.logger.error("MESSAGE- sender character not found")
        return jsonify({'message': 'Sender character not found'}), 404
    
    # app.logger.debug("MESSAGE- sender_character: %s", sender_character.to_dict())
    

    sender_user = User.query.filter_by(id=sender).first()
    app.logger.debug("MESSAGE- sender_user: %s", sender_user.username)


    # Update the messageObj with character names before emitting
    recipient_character_names = [character.character_name for character in recipient_characters]
    messageObj['recipient_character_names'] = recipient_character_names
    messageObj['sender_character_name'] = sender_character.character_name

    if messageObj['type'] == 'item_transfer':
        handle_item_transfer(messageObj, recipient_character, sender_character)

    elif messageObj['type'] == 'spell_transfer':
        handle_spell_transfer(messageObj, recipient_character, sender_character)

    else:
        recipient_ids = [character.user.id for character in recipient_characters]
        recipient_ids_str = [str(id) for id in recipient_ids]

        group_id = "-".join(sorted([str(sender)] + recipient_ids_str, key=int))

        new_message = Message(
            sender_id=sender,
            campaign_id=campaignID,
            recipient_ids=",".join(recipient_ids_str),
            message_type=messageObj['type'],
            message_text=messageObj['text'],
            group_id=group_id,
            item_id=messageObj['item']['id'] if messageObj['item'] else None,  # Store item_id
        )
        db.session.add(new_message)
        db.session.commit()

        for recipient_character in recipient_characters:
            socketio.emit('message', messageObj, to=recipient_character.user.sid)

        # Emit the message back to the sender
        socketio.emit('message', messageObj, to=sender_user.sid)

def handle_item_transfer(messageObj, recipient_character, sender_character):
    app.logger.debug("MESSAGE- ITEM TRANSFER- messageObj: %s", messageObj)
    campaignID = messageObj['campaignID']

    app.logger.debug("MESSAGE- ITEM TRANSFER- recipient_character: %s", recipient_character.character_name)
    recipient_user = User.query.filter_by(id=recipient_character.userID).first()
    app.logger.debug("MESSAGE- ITEM TRANSFER- recipient_user: %s", recipient_user.username)

    app.logger.debug("MESSAGE- ITEM TRANSFER- sender_character: %s", sender_character.character_name)
    sender_user = User.query.filter_by(id=sender_character.userID).first()
    app.logger.debug("MESSAGE- ITEM TRANSFER- sender_user: %s", sender_user.username)
    
    item = messageObj['item']
    quantity = item['quantity']

    # Update recipient's inventory here
    if recipient_user is None:
        return jsonify({'message': 'User not found'}), 404

    db_item = Item.query.filter_by(id=item['id']).first()
    app.logger.debug("ITEM TRANSFER- Item located in database: %s", db_item.to_dict())
    
    if db_item is None:
        return jsonify({'message': 'Item not found'}), 404
    
    # Update recipient's inventory
    recipient_inventory_item = InventoryItem.query.filter_by(characterID=recipient_character.id, itemID=db_item.id).first()
    app.logger.debug("ITEM TRANSFER- recipient_inventory_item: %s", recipient_inventory_item)
    
    if recipient_inventory_item:
        app.logger.debug("ITEM TRANSFER- old quantity: %s", recipient_inventory_item.quantity)
        recipient_inventory_item.quantity += int(quantity)
        app.logger.debug("ITEM TRANSFER- new quantity: %s", recipient_inventory_item.quantity)
    else: 
        new_inventory_item = InventoryItem(characterID=recipient_character.id, itemID=db_item.id, name=db_item.name, quantity=int(quantity), item=db_item)
        db.session.add(new_inventory_item)
        app.logger.debug("new_inventory_item: %s", new_inventory_item.to_dict())
    
    db.session.commit()

    # Emit an inventory_update event to the recipient
    socketio.emit('inventory_update', {'character_name': recipient_character.character_name, 'item': item}, to=recipient_user.sid)

    # Send a message to the recipient that they got a new item
    reception_message = {
        'type': 'text_message',
        'text': f'{sender_character.character_name} gave you {quantity} {db_item.name}',
        'sender': 'System',
        'recipient_character_names': [recipient_character.character_name],
        'recipients': [recipient_user.id],
    }
    socketio.emit('message', reception_message, to=recipient_user.sid)

    # Update sender's inventory only if the sender is not a DM
    if sender_character.character_name != 'DM' and sender_character.character_name != 'Admin':
        sender_inventory_item = InventoryItem.query.filter_by(characterID=sender_character.id, itemID=db_item.id).first()
        if sender_inventory_item and sender_inventory_item.quantity > int(quantity):
            sender_inventory_item.quantity -= int(quantity)
        elif sender_inventory_item.quantity == int(quantity):
            db.session.delete(sender_inventory_item)
        else:
            return jsonify({'message': 'Not enough quantity in inventory'}), 400

        db.session.commit()

        # Emit an inventory_update event to the sender
        socketio.emit('inventory_update', {'character_name': sender_character.character_name, 'item': item}, to=sender_user.sid)

        # Notify the DMs and owners, by getting their user IDs from the campaign
        campaign = Campaign.query.filter_by(id=campaignID).first()
        
        if campaign:
            dm_id = campaign.dm_id
            owner_id = campaign.owner_id
        
            # Get the DM and owner users
            dm_user = User.query.filter_by(id=dm_id).first()
            owner_user = User.query.filter_by(id=owner_id).first()
        
            # If any DM or owner users are found, send them a message
            if dm_user or owner_user:
                notification_message = {
                    'type': 'text_message',
                    'text': f"{sender_character.character_name} gave {recipient_character.character_name} {quantity} {db_item.name}",
                    'sender': 'System',
                    'recipients': []
                }
        
                if dm_user:
                    notification_message['recipients'].append(dm_user.id)
                if owner_user and owner_user.id != dm_user.id:
                    notification_message['recipients'].append(owner_user.id)
        
                socketio.emit('message', notification_message)

    else:
        app.logger.info("MESSAGE- ITEM TRANSFER- Sender is DM or Admin")

    # Send a confirmation message to the sender.
    confirmation_message = {
        'type': 'text_message',
        'text': f"You gave {recipient_character.character_name} {quantity} {db_item.name}",
        'sender': 'System',
        'recipient_character_names': [sender_character.character_name],
        'recipients': [sender_user.id],
    }
    socketio.emit('message', confirmation_message, to=sender_user.sid)

    # Save the transaction message to the database
    new_reception_message = Message(
        sender_id=sender_user.id,
        campaign_id=campaignID,
        recipient_ids=str(recipient_user.id),
        message_type='item_transfer',
        message_text=f'{quantity} {db_item.name}',
        group_id=f"0-{sender_user.id}-{recipient_user.id}",
        item_id=None
    )
    db.session.add(new_reception_message)
    db.session.commit()

def handle_spell_transfer(messageObj, recipient_users, sender):
    # Assuming recipient_users contains only one recipient for a spell_transfer
    recipient = recipient_users[0]
    recipient_user = User.query.filter_by(username=recipient['username']).first()
    sender_user = User.query.filter_by(id=sender.userID).first()
    spell = messageObj['spell']

    # Update recipient's spellbook
    recipient_spellbook_item = Spellbook.query.filter_by(userID=recipient['id'], spell_id=spell['id']).first()

    if not recipient_spellbook_item:
        new_spellbook_item = Spellbook(userID=recipient['id'], spell_id=spell['id'], quantity=1)
        db.session.add(new_spellbook_item)
    else:
        # Assuming that spell details like name, etc. are not modified during transfer
        pass

    db.session.commit()

    # Emit a spellbook_update event to the recipient
    socketio.emit('spellbook_update', {'character_name': recipient['character_name'], 'spell': spell}, to=recipient_user.sid)

    # Notify the recipient about the new spell
    reception_message = {
        'type': 'text_message',
        'text': f'Now you the know spell {spell["name"]}',
        'sender': 'System',
        'recipients': [f"{recipient['character_name']}"],
    }
    socketio.emit('message', reception_message, to=recipient_user.sid)

    # Send a confirmation message to the sender.
    confirmation_message = {
        'type': 'text_message',
        'text': f"{recipient['character_name']} knows the spell {spell['name']}",
        'sender': 'System',
        'recipients': [f'{sender.character_name}'],
    }
    socketio.emit('message', confirmation_message, to=sender_user.sid)


## Initiative Tracking
@socketio.on('Roll for initiative!')
def roll_initiative():
    # Include authentication or other logic here

    # Emit the "Roll for initiative!" event to all connected clients
    socketio.emit('Roll for initiative!')

@socketio.on('initiative roll')
def handle_initiative_roll(data):
    # Include validation or other logic here

    # Emit the initiative roll to the DM (or all clients, depending on your design)
    socketio.emit('initiative roll', data)

@socketio.on('update turn')
def handle_update_turn(data):
    # The data object might include information like:
    # {
    #     'current': 'Current Character Name',
    #     'next': 'Next Character Name'
    # }

    # Broadcast the current and next turn information to all clients
    socketio.emit('turn update', data)

@socketio.on('combatants')
def handle_combatants(data):
    # Broadcast the current and next turn information to all clients
    socketio.emit('combatants', data)

@socketio.on('end of combat')
def end_combat():
    socketio.emit('end of combat')


@socketio.on('heartbeat')
def handle_heartbeat():
    username = request.args.get('username')
    if username in active_connections:
        app.logger.info(f"Heartbeat received from: {username}")

@socketio.on('user_disconnected')
def handle_user_disconnected(data):
    campaign_id = data.get('campaign_id')
    user_id = data.get('user_id')

    app.logger.info(f"User {user_id} is disconnecting from campaign {campaign_id}")
    # Update the list of active users
    user = User.query.filter_by(id=user_id).first()
    if user:
        user.is_online = False
        user.sid = None
        db.session.commit()
        sid = active_connections.pop(user.username, None)  # Remove the mapping
        emit_active_users(campaign_id)

@socketio.on('disconnect')
def handle_disconnect():
    """event listener when client disconnects to the server"""
    app.logger.debug("DISCONNECT- request.sid: %s", request.sid)
    app.logger.debug("DISCONNECT- request.args: %s", request.args)

    user = User.query.filter_by(sid=request.sid).first()
    if user:
        app.logger.info("DISCONNECT- %s is logging off!", user.username)

        if user.username in active_connections:
            del active_connections[user.username]
            app.logger.info(f"Active connections: {active_connections}")
        user.is_online = False
        db.session.commit()

        campaign_id = request.args.get('campaignID')  # Retrieve the campaignID from the request arguments

        if campaign_id != 'null':
            emit_active_users(campaign_id)
            socketio.emit("disconnect",f"user {user.username} disconnected", room='/')
            app.logger.info("DISCONNECT- %s disconnected", user.username)


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5001)
