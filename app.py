from flask import Flask, abort, request, jsonify, send_from_directory
from flask import render_template ## For rendering Wiki pages
from flask import redirect, url_for

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import select
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from flask_cors import CORS
# from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity, decode_token
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity, decode_token, get_jwt, unset_jwt_cookies

from jwt import InvalidTokenError, ExpiredSignatureError
from flask_socketio import SocketIO, send, emit

from threading import Thread
from datetime import datetime, timedelta, timezone
# import datetime
import os
import csv  ## For importing items from CSV
import json ## For sending JSON data

import logging ## For debug logging
import traceback

import markdown
from urllib.parse import unquote


db = SQLAlchemy()

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = '/home/ijohnson/Downloads/Library'
app.config['MAP_FOLDER'] = '/home/ijohnson/Downloads/Maps'
app.config['BATTLE_MAP_FOLDER'] = '/home/ijohnson/Downloads/battleMaps'
app.config['SECRET_KEY'] = 'secret-key'
# app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///db.sqlite'
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://admin:admin@localhost/db'

## Token stuff
app.config['JWT_SECRET_KEY'] = 'jwt-secret-key'
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=5)
jwt = JWTManager(app)

app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024 * 1024 # 2Gb Upload size
app.config['PROPAGATE_EXCEPTIONS'] = True


CORS(app, resources={r"/*": {"origins": "*"}})

# For INFO level
app.logger.setLevel(logging.INFO)  # set the desired logging level
handler = logging.StreamHandler()
handler.setLevel(logging.INFO)  # set the desired logging level
app.logger.addHandler(handler)
# app.debug = False  # optional, it sets the level to WARNING


print("Debugging set to True")
socketio = SocketIO(app, message_queue='amqp://guest:guest@localhost:5672//', cors_allowed_origins="*", logger=True, engineio_logger=True, ping_timeout=60000)

socketio.init_app(app)

db.init_app(app)

# Association table
campaign_members = db.Table('campaign_members',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('campaign_id', db.Integer, db.ForeignKey('campaign.id'), primary_key=True),
    db.Column('character_id', db.Integer, db.ForeignKey('character.id'))  # new column
)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True)
    password = db.Column(db.String(100))
    is_online = db.Column(db.Boolean, default=False) ## Tracks if a user is signed in currently or not
    sid = db.Column(db.String(100), nullable=True)  ## Stores the web socket a user is connected from
    campaigns = db.relationship('Campaign', secondary=campaign_members, backref=db.backref('members', lazy='dynamic'))

    def to_dict(self):
        return {
            'username': self.username,
            'is_online': self.is_online,
            'sid': self.sid,
            'campaigns': [campaign.to_dict() for campaign in self.campaigns]
        }


class Campaign(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    system = db.Column(db.String(50), nullable=False)
    description = db.Column(db.Text)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    dm_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    owner = db.relationship('User', foreign_keys=[owner_id], backref='owned_campaigns')
    dm = db.relationship('User', foreign_keys=[dm_id], backref='dm_campaigns')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'system': self.system,
            'description': self.description,
            'owner': self.owner.username,
            'owner_id': self.owner.id,
            'dm': self.dm.username,
            'dm_id': self.dm.id,
        }

class Character(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    # userID = db.Column(db.Integer, db.ForeignKey('user.id'))  # link to the User table
    # campaignID = db.Column(db.Integer, db.ForeignKey('campaign.id'))  # link to the Campaign table
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
            # 'userID': self.userID,
            # 'campaignID': self.campaignID,
            'characterName': self.character_name,
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


class Page(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(80), nullable=False)
    content = db.Column(db.Text, nullable=False)
    wiki_id = db.Column(db.Integer, db.ForeignKey('campaign.id'), nullable=False)
    wiki = db.relationship('Campaign', backref=db.backref('pages', lazy=True))

class Revisions(db.Model):
    revision_id = db.Column(db.Integer, primary_key=True)
    page_id = db.Column(db.Integer, db.ForeignKey('page.id'), nullable=False)
    content = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=db.func.current_timestamp())
    editor_firebase_id = db.Column(db.Text)

# Loot association table
loot_box_items = db.Table('loot_box_items',
    db.Column('item_id', db.Integer, db.ForeignKey('item.id'), primary_key=True),
    db.Column('loot_box_id', db.Integer, db.ForeignKey('loot_box.id'), primary_key=True),
    db.Column('quantity', db.Integer)
)

class Item(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    type = db.Column(db.String(80), nullable=False)
    cost = db.Column(db.Integer, nullable=False)
    currency = db.Column(db.String(80), nullable=False)
    weight = db.Column(db.Integer)
    description = db.Column(db.String(120))

    # The relationships
    armor = db.relationship('Armor', backref='item', cascade='all, delete-orphan')
    weapon = db.relationship('Weapon', backref='item', cascade='all, delete-orphan')
    spellItem = db.relationship('SpellItem', backref='item', cascade='all, delete-orphan')
    mountVehicle = db.relationship('MountVehicle', backref='item', cascade='all, delete-orphan')
    loot_boxes = db.relationship('LootBox', secondary=loot_box_items, backref=db.backref('items'))


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
    item_id = db.Column(db.Integer, db.ForeignKey('item.id'), primary_key=True)
    weapon_type = db.Column(db.String(20), nullable=False)
    damage = db.Column(db.String(20), nullable=False)
    damage_type = db.Column(db.String(20), nullable=False)
    weapon_range = db.Column(db.Integer, nullable=False)

    def to_dict(self):
        return {
            'weapon_type': self.weapon_type,
            'damage': self.damage,
            'damage_type': self.damage_type,
            'weapon_range': self.weapon_range,
        }

class Armor(db.Model):
    item_id = db.Column(db.Integer, db.ForeignKey('item.id'), primary_key=True)
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

    item_id = db.Column(db.Integer, db.ForeignKey('item.id'), primary_key=True)
    charges = db.Column(db.Integer)
    spell_id = db.Column(db.Integer, db.ForeignKey('spells.id'), nullable=True)  # Allow spell items without an associated spell


    def to_dict(self):
        return {
            'id': self.id,
            'charges': self.charges,
        }

class MountVehicle(db.Model):
    item_id = db.Column(db.Integer, db.ForeignKey('item.id'), primary_key=True)
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
    character_id = db.Column(db.Integer, db.ForeignKey('character.id'), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey('item.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    equipped = db.Column(db.Boolean)

    # Relationship to the Item table
    item = db.relationship('Item', backref='inventory_items')

    def to_dict(self):
        item_dict = {
            'id': self.id,
            'name': self.name,
            'user_id': self.user_id,
            'item_id': self.item_id,
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
    character_id = db.Column(db.Integer, db.ForeignKey('character.id'), nullable=False)
    spell_id = db.Column(db.Integer, db.ForeignKey('spells.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    equipped = db.Column(db.Boolean)

    # Relationship to the Spell table
    spell = db.relationship('Spell', backref='spellbook_items')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
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
    character_id = db.Column(db.Integer, db.ForeignKey('character.id'), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    entry = db.Column(db.Text, nullable=False)
    date_created = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    date_modified = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('character.id'), nullable=False)
    recipient_ids = db.Column(db.String, nullable=False)  # This would be a comma-separated string of IDs.
    group_id = db.Column(db.String, nullable=False)  # New field: group_id
    message_type = db.Column(db.String(50), nullable=False)  # e.g. 'item_transfer', 'chat', etc.
    message_text = db.Column(db.Text, nullable=False)  # The actual message text.
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'sender_id': self.sender_id,
            'group_id': self.group_id,
            'recipient_ids': self.recipient_ids.split(','),
            'message_type': self.message_type,
            'message_text': self.message_text,
            'timestamp': self.timestamp.isoformat(),
        }


class LootBox(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False) ## Which lootbox the item is in

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
        }


class NPC(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    ac = db.Column(db.Integer, nullable=False)
    hp = db.Column(db.Integer, nullable=False)
    attack_stats = db.Column(db.String(120), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'ac': self.ac,
            'hp': self.hp,
            'attack_stats': self.attack_stats,
        }


def set_all_users_offline():
    users = User.query.all()

    # Get the campaign with ID 1
    # campaign = Campaign.query.get(1)    ## Temporary

    for user in users:
        user.is_online = False
        # campaign.members.append(user)   ## Temporary
    db.session.commit()

with app.app_context():
    db.create_all()
    set_all_users_offline()


@app.after_request
def refresh_expiring_jwts(response):
    try:
        exp_timestamp = get_jwt()["exp"]
        now = datetime.now(timezone.utc)
        target_timestamp = datetime.timestamp(now + timedelta(minutes=30))
            
        if target_timestamp > exp_timestamp:
            access_token = create_access_token(identity=get_jwt_identity())
            response.set_cookie('access_token', access_token)  # Set the new token in a cookie
            response.json['new_token'] = access_token  # Include the new token in the response body
        return response
    
    except (RuntimeError, KeyError):
        # Case where there is not a valid JWT. Just return the original respone
        return response

## Verify a user's JWT token
@app.route('/api/verify', methods=['POST'])
def verify_token():
    data = request.get_json()
    token = data.get('token')
    print("Token:", token)
    try:
        decoded_token = decode_token(token)
        print("Decoded Token:", decoded_token)
        user = User.query.filter_by(username=decoded_token['sub']).first()
        if user is None:
            print("Invalid user")
            return jsonify({'error': 'Invalid user'}), 401
        return jsonify({'success': True, "id": user.id, "username": user.username})
    except InvalidTokenError:
        print("Invalid token")
        return jsonify({'error': 'Invalid token- InvalidTokenError'}), 401
    except ExpiredSignatureError:
        print("Expired token")
        return jsonify({'error': 'Expired token- ExpiredSignatureError'}), 401

## Used to log in a new user
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    if 'username' not in data or 'password' not in data:
        return jsonify({'message': 'Username and password are required!'}), 400
    user = User.query.filter_by(username=data['username'].lower()).first()
    if not user:
        return jsonify({'message': 'invalid username'}), 401
    elif not check_password_hash(user.password, data['password']):
        return jsonify({'message': 'Incorrect Password'}), 401
    print("Creating Access Token for", user.username)
    access_token = create_access_token(identity=user.username)

    user.is_online = True
    db.session.commit()
    emit_active_users()
    return jsonify({
        'message': 'Login successful!', 
        'access_token': access_token,
        'user_id': user.id  # Include the user's ID in the response
    })

@app.route('/api/register', methods=['POST'])
def register():
    ## app.logger.info("/api/register: %s", request.json)  # ## app.logger.info the incoming request
    print("/api/register:", request.json)
    data = request.get_json()
    if 'username' not in data or 'password' not in data or 'character_name' not in data or 'account_type' not in data:
        return jsonify({'message': 'Username, password, character name, and account type are required!'}), 400

    # Check if a user with the given username already exists
    existing_user = User.query.filter_by(username=data['username'].lower()).first()
    if existing_user:
        return jsonify({'message': 'A user with this username already exists.'}), 400

    hashed_password = generate_password_hash(data['password'], method='sha256')
    new_user = User(username=data['username'].lower(), password=hashed_password, account_type=data['account_type'])
    new_user.is_online = True
    db.session.add(new_user)
    db.session.commit()
    emit_active_users()
    ## app.logger.info(new_user.is_online)   ## For test purposes
    access_token = create_access_token(identity=new_user.username)
    return jsonify({
        'message': 'Login successful!', 
        'access_token': access_token,
        'user_id': new_user.id  # Include the user's ID in the response
    })


## Get a specific user profile
@app.route('/api/profile', methods=['GET'])
@jwt_required()
def get_profile():
    try:
        username = get_jwt_identity()
        user = User.query.filter_by(username=username).first()
        print("PROFILE- user:", user.to_dict())
        return jsonify({'username': user.username})
    except InvalidTokenError:
        return jsonify({'error': 'Invalid token'}), 401
    except ExpiredSignatureError:
        return jsonify({'error': 'Expired token'}), 401


@app.route('/api/campaigns', methods=['GET'])
@jwt_required()
def get_user_campaigns():
    username = get_jwt_identity()
    user = User.query.filter_by(username=username).first()
    print("CAMPAIGNS- user:", user.to_dict())
    campaigns = user.campaigns
    campaign_list = [campaign.to_dict() for campaign in campaigns]
    return jsonify(campaign_list)

## List defined classes
@app.route('/api/classes')
def get_class_listing():
    # List the files in the 'classes' directory
    files = os.listdir('classes')
    # Remove the '.json' extension from each filename
    class_names = [file[:-5] for file in files if file.endswith('.json')]
    return jsonify(class_names or [])

## Get Class info
@app.route('/api/classes/<class_name>')
def get_class_info(class_name):
    try:
        # Attempt to open the JSON file for the specified class
        with open(f'classes/{class_name}.json', 'r') as f:
            class_info = json.load(f)
        return jsonify(class_info)
    except FileNotFoundError:
        # If the file doesn't exist, return an error message
        return jsonify({"error": f"No class named '{class_name}' found"}), 404

## List defined races
@app.route('/api/races', methods=['GET'])
def get_race_listing():
    races = [f.replace('.json', '') for f in os.listdir('races') if f.endswith('.json')]
    return jsonify(races or [])

## Get Race info
@app.route('/api/races/<race>', methods=['GET'])
def get_race_info(race):
    try:
        with open(f'races/{race}.json') as f:
            race_info = json.load(f)
        return jsonify(race_info)
    except FileNotFoundError:
        abort(404, description="Resource not found")

## GET Character Profile
@app.route('/api/character', methods=['GET'])
@jwt_required()
def get_character():
    # print("Get Character Profile:", request.headers)
    try:
        username = get_jwt_identity()
        user = User.query.filter_by(username=username).first()
        campaign_id = request.headers.get('Campaign-ID')

        stmt = select(campaign_members.c.character_id).where(
            campaign_members.c.campaign_id == campaign_id, 
            campaign_members.c.user_id == user.id
        )

        result = db.session.execute(stmt).first()

        character_id = result.character_id if result else None

        character = Character.query.filter_by(id=character_id).first()
        # if character is None:
        #     print("Creating new Character entry")
        #     # Create a new character with default values
        #     character = Character(character_id=character_id)
        #     db.session.add(character)
        #     db.session.commit()
        print("Getting character profile:", character.to_dict())
        return jsonify(character.to_dict()), 200

    except InvalidTokenError:
        return jsonify({'error': 'Invalid token'}), 401
    except ExpiredSignatureError:
        return jsonify({'error': 'Expired token'}), 401


## Update a user's Character Profile
@app.route('/api/character', methods=['PUT'])
@jwt_required()
def update_character():
    print("Saving Character Profile:", request.headers)
    try:
        campaign_id = request.headers.get('Campaign-ID')
        user_id = request.headers.get('User-ID')
        character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character
        if character is None:
            print("Making a new Character entry")
            # Create a new character if it doesn't exist
            character = Character(user_id=user_id)
            db.session.add(character)
        data = request.json
        print("Character- data:", data)

        # Hardcode the mapping
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
        print("Updated character:", character.to_dict())
        return jsonify(character.to_dict()), 200

    except InvalidTokenError:
        return jsonify({'error': 'Invalid token'}), 401
    except ExpiredSignatureError:
        return jsonify({'error': 'Expired token'}), 401

@app.route('/api/users', methods=['GET'])
@jwt_required()
def get_users():
    campaign_id = request.headers.get('Campaign-ID')
    users = User.query.join(campaign_members, User.id == campaign_members.user_id).filter(campaign_members.campaign_id == campaign_id).all()
    return jsonify({'users': [user.character_name for user in users]})

@app.route('/api/players', methods=['GET'])
@jwt_required()
def get_players():
    campaign_id = request.headers.get('Campaign-ID')
    players = User.query.join(campaign_members, User.id == campaign_members.user_id).filter(campaign_members.campaign_id == campaign_id, User.account_type == 'Player').all()
    print("players:", players)
    return jsonify({'players': [{'username': player.username, 'character_name': player.character_name} for player in players] if players else []})


@app.route('/api/items', methods=['GET', 'POST']) ##, endpoint='items')
@jwt_required()
def items():
    if request.method == 'GET':
        app.logger.info("FLASK- Getting items for the DM")
        try:
            items = Item.query.all()
            # print("ITEMS- items:", items)

            item_data_list = []

            for item in items:
                item_data = item.to_dict()

                if item.type == 'Weapon':
                    weapon = Weapon.query.filter_by(item_id=item.id).first()
                    if weapon:
                        item_data.update(weapon.to_dict())
                elif item.type == 'Armor':
                    armor = Armor.query.filter_by(item_id=item.id).first()
                    if armor:
                        item_data.update(armor.to_dict())
                elif item.type == 'MountVehicle':
                    mountVehicle = MountVehicle.query.filter_by(item_id=item.id).first()
                    if mountVehicle:
                        item_data.update(mountVehicle.to_dict())
                elif item.type in ['Ring', 'Wand', 'Scroll']:
                    magic_item = SpellItem.query.filter_by(item_id=item.id).first()
                    if magic_item:
                        item_data.update(magic_item.to_dict())

                item_data_list.append(item_data)

            return jsonify({'items': item_data_list}), 200

        except Exception as e:
            app.logger.error(f"Error getting items: {e}")
            return jsonify({'message': 'Server error'}), 500

    elif request.method == 'POST':
        data = request.get_json()
        # app.logger.info("POST to items- data: %s", data)
        print("POST to items- data:", data)

        name = data.get('name')
        type = data.get('type')
        cost = data.get('cost')
        currency = data.get('currency')
        weight = data.get('weight')
        description = data.get('description')

        item = Item(name=name, type=type, cost=cost, currency=currency, weight=weight, description=description)
        db.session.add(item)
        db.session.commit()
        print(f"New item ID: {item.id}")

        try:
            if type == 'Weapon':
                weapon = Weapon.query.filter_by(item_id=item.id).first()
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
                    weapon = Weapon(item_id=item.id, damage=damage, damage_type=damage_type, weapon_type=weapon_type, weapon_range=weapon_range)
                    db.session.add(weapon)
                db.session.commit()
            elif type == 'Armor':
                armor = Armor.query.filter_by(item_id=item.id).first()
                ac = data.get('ac')
                armor_type = data.get('armorType')
                stealth_disadvantage = data.get('stealthDisadvantage', False)
                strength_needed = data.get('strengthNeeded', None) or None
                if armor:
                    # Update existing record
                    armor.armor_class = ac
                    armor.armor_type = armor_type
                    armor.stealth_disadvantage = stealth_disadvantage
                    armor.strength_needed = strength_needed
                else:
                    # Insert new record
                    armor = Armor(item_id=item.id, armor_class=ac, armor_type=armor_type, stealth_disadvantage=stealth_disadvantage, strength_needed=strength_needed)
                    db.session.add(armor)
                db.session.commit()

            elif type in ['Ring', 'Wand', 'Scroll']:
                spellItem = SpellItem.query.filter_by(item_id=item.id).first()
                spell = data.get('spell')
                charges = data.get('charges')
                if spellItem:
                    spellItem.spell = spell
                    spellItem.charges = charges
                else:
                    magic_item = SpellItem(item_id=item.id, spell=spell, charges=charges)
                    db.session.add(magic_item)
                db.session.commit()
            elif type == 'MountVehicle':  # Handle MountVehicle items
                mountVehicle = MountVehicle.query.filter_by(item_id=item.id).first()
                speed = data.get('speed')
                speed_unit = data.get('speedUnit')
                capacity = data.get('capacity')
                if mountVehicle:
                    mountVehicle.speed = speed
                    mountVehicle.speed_unit = speed_unit
                    mountVehicle.capacity = capacity
                else:
                    mount_vehicle = MountVehicle(item_id=item.id, speed=speed, speed_unit=speed_unit, capacity=capacity)
                    db.session.add(mount_vehicle)
                db.session.commit()

            return jsonify({'item': item.to_dict()}), 201
        except Exception as e:
            # app.logger.error(f"Error creating item: {e}")
            print("Error creating item:", e)
            # app.logger.error(f"Error occurred: {traceback.format_exc()}")
            print(f"Error occurred: {traceback.format_exc()}")
            return jsonify({'message': e}), 500


## Update details for an Item entry
@app.route('/api/items/<int:item_id>', methods=['PUT'])
@jwt_required()
def update_item(item_id):
    data = request.get_json()
    # item = Item.query.get(item_id)
    item = Item.query.filter_by(id=item_id).first()
    item = Item.query.filter_by(id=item_id).first()
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
@app.route('/api/items/<int:item_id>', methods=['DELETE'])
@jwt_required()
def delete_item(item_id):
    print("Deleteing Item:", item_id)
    # item = Item.query.get(item_id)
    item = Item.query.filter_by(id=item_id).first()
    if not item:
        return jsonify({'message': 'Item not found!'}), 404
    db.session.delete(item)
    db.session.commit()
    return jsonify({'message': 'Item deleted!'})

## Upload CSV for bulk item creation
@app.route('/api/upload_csv', methods=['POST'])
def upload_csv():
    if 'file' not in request.files:
        return 'No file part', 400
    file = request.files['file']
    csv_data = csv.reader(file.stream)
    items = [row for row in csv_data]
    # now you can emit items back to the client via socketio.emit

## Used to save the newly created (and verified) items
@app.route('/api/save_items', methods=['POST'])
def save_items():
    data = request.get_json()
    ## app.logger.info("SAVE CSV- data: %s", data)
    # print("SAVE CSV- data:", data)

    if not data or not isinstance(data, dict):
        return jsonify(error='Invalid JSON'), 400

    items = data.get('items')
    ## app.logger.info("SAVE CSV- items received: %s", items)
    print("SAVE CSV- items received:", items)

    if not items or not isinstance(items, list):
        return jsonify(error='Invalid items'), 400

    try:
        # # app.logger.info("SAVE CSV- Recieving items: %s", items)
        # print("SAVE CSV- Receiving items:", items)
        for item in items:
            if not all(k in item for k in ('Name', 'Type', 'Cost', 'Currency')):
                return jsonify(error='Missing item fields'), 400

            existing_item = Item.query.filter_by(name=item['Name']).first()

            if existing_item is None:
                new_item = Item(name=item['Name'], type=item['Type'], cost=item['Cost'], currency=item['Currency'], weight=item.get('Weight'), description=item.get('Description'))
                db.session.add(new_item)
                db.session.commit()

                item_type = item['Type']
                item_id = new_item.id

                if item_type == 'Weapon':
                    print(item, "is a Weapon")
                    weapon = Weapon(item_id=item_id, damage=item.get('Damage'), damage_type=item.get('DamageType'),
                    weapon_type=item.get('Weapon type'), weapon_range=item.get('Range'))
                    db.session.add(weapon)
                elif item_type == 'Armor':
                    print(item, "is Armor")
                    armor = Armor(item_id=item_id, armor_class=item.get('Armor class'), armor_type=item.get('Armor type'), stealth_disadvantage=item.get('Stealth'), strength_needed=item.get('Strength'))
                    db.session.add(armor)
                elif item_type in ['Ring', 'Wand', 'Scroll']:
                    print(item, "is a Magic Item")
                    magic_item = SpellItem(item_id=item_id, spell=item.get('Spell'), charges=item.get('Charges'))
                    db.session.add(magic_item)
                elif item_type == 'Mounts and Vehicles':
                    print(item, "is a Mount or Vehicle")
                    mount_vehicle = MountVehicle(item_id=item_id, speed=item.get('Speed'), speed_unit=item.get('Units'), capacity=item.get('Capacity'), vehicle_type=item.get('Vehicle type'))
                    db.session.add(mount_vehicle)

                db.session.commit()
            else:
                print("SAVE CSV- Item", {item['Name']}, "already exists in the database. Skipping...")

        socketio.emit('items_updated')
        return jsonify(message='Items saved'), 200

    except Exception as e:
        # Log full exception info
        app.logger.exception("Failed to save items")
        return jsonify(error=str(e)), 400


@app.route('/api/inventory', methods=['GET', 'POST'], endpoint='inventory')
def inventory():
    if request.method == 'GET':
        campaign_id = request.headers.get('Campaign-ID')
        user_id = request.headers.get('User-ID')
        if campaign_id is None or user_id is None:
            return jsonify({'error': 'Campaign ID or User ID not provided in the request header.'}), 400

        # Find the character associated with the user and the campaign
        character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character
        if character is None:
            return jsonify({'error': 'Character not found.'}), 404

        inventory_items = InventoryItem.query.filter_by(character_id=character.id).all()
        inventory = []
        for inventory_item in inventory_items:
            item = Item.query.get(inventory_item.item_id)
            if item is not None:
                item_details = {
                    'id': inventory_item.item_id,
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
        print("POST INVENTORY- data:", data)

        current_user = User.query.filter_by(username=get_jwt_identity()).first()
        if 'character_id' in data and current_user.account_type != 'DM':
            return jsonify({'message': 'Only DMs can issue items to other players!'}), 403
        character_id = data['character_id']

        character = Character.query.get(character_id)
        print("FLASK- character:", character.character_name)
        if character is None:
            return jsonify({'message': 'Character not found'}), 404

        item = Item.query.get(data['item_id'])
        print("FLASK- item:", item.name)
        if item is None:
            return jsonify({'message': 'Item not found'}), 404

        inventory_item = InventoryItem.query.filter_by(character_id=character.id, item_id=item.id).first()
        if inventory_item:
            inventory_item.quantity += int(data['quantity'])
        else:
            inventory_item = InventoryItem(character_id=character.id, item_id=item.id, quantity=data['quantity'])
            db.session.add(inventory_item)
        db.session.commit()

        print("FLASK- Emitting inventory update")
        socketio.emit('inventory_update', {'character_name': character.character_name, 'item_id': data['item_id'], 'quantity': data['quantity']}, to=character.user.sid)

        return jsonify({'message': 'Item added to inventory!'})


## When a player wants to nickname or equip an item from their inventory
@app.route('/api/inventory/<int:item_id>', methods=['PUT'])
@jwt_required()
def update_inventoryItem(item_id):
    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character
    inventory_item = InventoryItem.query.filter_by(character_id=character.id, item_id=item_id).first()
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

@app.route('/api/inventory/<int:item_id>', methods=['DELETE'])
@jwt_required()
def drop_item(item_id):
    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character
    inventory_item = InventoryItem.query.filter_by(character_id=character.id, item_id=item_id).first()
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

    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    print('Equipment: campaign_id:', campaign_id)
    print("Equipment: user_id:", user.id)

    stmt = select(campaign_members.c.character_id).where(
        campaign_members.c.campaign_id == campaign_id, 
        campaign_members.c.user_id == user.id
    )

    result = db.session.execute(stmt).first()

    character_id = result.character_id if result else None

    equippedItems = InventoryItem.query.filter_by(character_id=character_id, equipped=True).all()

    # Convert the SQLAlchemy objects to dictionaries
    equippedItems = [item.to_dict() for item in equippedItems]

    return jsonify({'equipment': equippedItems})

## These functions do Journal stuff
@app.route('/api/journal', methods=['POST'])
@jwt_required()
def create_journal_entry():
    data = request.get_json()
    if 'title' not in data or 'entry' not in data:
        return jsonify({'message': 'Title and Entry are required!'}), 400

    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character

    new_journal_entry = Journal(
        character_id=character.id,
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
    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character

    entries = Journal.query.filter_by(character_id=character.id).order_by(Journal.date_created.desc()).all()
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
    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character
    entry = Journal.query.filter_by(id=entry_id, character_id=character.id).first()

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
    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character
    entry = Journal.query.filter_by(id=entry_id, character_id=character.id).first()

    if entry is None:
        return jsonify({'message': 'Journal entry not found'}), 404

    db.session.delete(entry)
    db.session.commit()
    return jsonify({'message': 'Journal entry deleted'}), 200


## Handles the Library stuff
@app.route('/api/library', methods=['GET', 'POST'])
def library():
    if request.method == 'GET':
        # Return the list of files
        files = os.listdir(app.config['UPLOAD_FOLDER'])
        file_info = []
        for file in files:
            fileName, fileType = os.path.splitext(file)
            displayName = fileName.replace("_", " ")
            file_info.append({'name': displayName, 'type': fileType[1:], 'originalName': file})  # fileType[1:] to remove the leading dot
        return { 'files': file_info }

    elif request.method == 'POST':
        # Save the uploaded file
        file = request.files['file']
        filename = secure_filename(file.filename)
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))

        # emit an event to all connected clients
        socketio.emit('library_update')

        return { 'file': { 'name': filename } }

@app.route('/api/library/<filename>')
def get_file(filename):
    # Send the requested file
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/chat_history', methods=['GET'])
@jwt_required()
def get_chat_history():
    username = get_jwt_identity()

    # Fetch the user
    user = User.query.filter_by(username=username).first()

    if user is None:
        return jsonify({'message': 'User not found'}), 404

    def message_to_client_format(message):
        # Get sender's character name
        sender_user = User.query.filter_by(id=message.sender_id).first()
        sender_name = sender_user.character_name if sender_user else 'Unknown'

        # Get recipients' character names
        recipient_ids = message.recipient_ids.split(',')
        recipient_names = []
        for id in recipient_ids:
            if id:
                recipient_user = User.query.filter_by(id=int(id)).first()
                recipient_names.append(recipient_user.character_name if recipient_user else 'Unknown')

        return {
            'sender': sender_name,
            'text': message.message_text,
            'recipients': recipient_names,
            'group_id': message.group_id,
        }

    # Fetch the messages sent by the user and received by the user
    sent_messages = Message.query.filter_by(sender_id=user.id).all()
    received_messages = Message.query.filter(Message.recipient_ids.contains(str(user.id))).all()

    # Combine, sort by timestamp, and convert to JSON-friendly format
    messages = sorted(sent_messages + received_messages, key=lambda msg: msg.timestamp)
    messages_json = [message_to_client_format(message) for message in messages]

    return jsonify(messages_json), 200


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
        item_id = item['id']
        quantity = item['quantity']
        # itemDB = Item.query.get(item_id)
        itemDB = Item.query.filter_by(id=item_id).first()
        if itemDB:
            association = loot_box_items.insert().values(loot_box_id=loot_box.id, item_id=itemDB.id, quantity=quantity)
            db.session.execute(association)
            db.session.commit()  # Commit after each iteration

    return jsonify({'message': 'Loot box created successfully'})

## Save a Loot Box
@app.route('/api/lootboxes/<int:box_id>', methods=['PUT'])
def update_loot_box(box_id):
    data = request.get_json()
    print("data:", data)
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

    db.session.execute(loot_box_items.delete().where(loot_box_items.c.loot_box_id == box_id))
    db.session.commit()

    # Add the new items
    for item in items:
        item_id = item['id']
        quantity = item['quantity']
        # itemDB = Item.query.get(item_id)
        itemDB = Item.query.filter_by(id=item_id).first()
        if itemDB:
            association = loot_box_items.insert().values(loot_box_id=loot_box.id, item_id=itemDB.id, quantity=quantity)
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
            loot_box_items.c.loot_box_id == loot_box.id,
            loot_box_items.c.item_id == Item.id
        ).all()
        return jsonify({'items': [{'id': item.id, 'name': item.name, 'quantity': quantity} for item, quantity in items_with_quantities]})
    else:
        return jsonify({'message': 'Loot box not found'}), 404

## Issue loot box to player
@app.route('/api/lootboxes/<int:box_id>', methods=['POST'])
@jwt_required()
def issue_loot_box(box_id):
    player_username = request.json.get('player')
    recipient_user = User.query.filter_by(username=player_username).first()
    if recipient_user is None:
        return jsonify({'message': 'User not found'}), 404

    # Get the LootBox instance
    # loot_box = LootBox.query.get(box_id)
    loot_box = LootBox.query.filter_by(id=box_id).first()
    if loot_box is None:
        return jsonify({'message': 'Loot box not found.'}), 404

    # Use the association table to get the items in this loot box along with their quantities
    items_with_quantities = db.session.query(Item, loot_box_items.c.quantity).filter(
        loot_box_items.c.loot_box_id == box_id,
        loot_box_items.c.item_id == Item.id
    ).all()

    for item, quantity in items_with_quantities:
        # Update recipient's inventory
        recipient_inventory_item = InventoryItem.query.filter_by(user_id=recipient_user.id, item_id=item.id).first()
        if recipient_inventory_item:
            recipient_inventory_item.quantity += quantity
        else:
            new_inventory_item = InventoryItem(user_id=recipient_user.id, item_id=item.id, name=item.name, quantity=quantity)
            db.session.add(new_inventory_item)

    db.session.commit()

    # Emit an inventory_update event to the recipient
    socketio.emit('inventory_update', {'character_name': recipient_user.character_name, 'items': [item.to_dict() for item, _ in items_with_quantities]}, to=recipient_user.sid)

    # Send a message to the recipient that they got a new loot box
    reception_message = {
        'type': 'text_message',
        'text': f'You received {loot_box.name}!',
        'sender': 'System',
        'recipients': [f'{recipient_user.character_name}'],
    }
    socketio.emit('message', reception_message, to=recipient_user.sid)

    return jsonify({'message': 'Loot box issued successfully.'})


## Spell stuff. Finally!
@app.route('/api/spellbook', methods=['GET'])
@jwt_required()
def get_spellbook():
    ## Get a player's spellbook
    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character

    if not character:
        return jsonify({"error": "Character not found"}), 404

    spellbook_items = Spellbook.query.filter_by(character_id=character.id).all()
    return jsonify({"spellbook": [item.to_dict() for item in spellbook_items]})

@app.route('/api/spells', methods=['GET'])
@jwt_required()
def get_all_spells():
    ## Get all the defined spells for the DM
    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character

    if character.account_type != 'DM':
        return jsonify({"error": "Unauthorized"}), 403

    spells = Spell.query.all()
    return jsonify([spell.to_dict() for spell in spells])

@app.route('/api/prepared_spells', methods=['GET'])
@jwt_required()
def get_prepared_spells():
    try:
        campaign_id = request.headers.get('Campaign-ID')
        username = get_jwt_identity()
        user = User.query.filter_by(username=username).first()

        user_id = request.headers.get('User-ID')

        stmt = select(campaign_members.c.character_id).where(
            campaign_members.c.campaign_id == campaign_id, 
            campaign_members.c.user_id == user.id
        )

        result = db.session.execute(stmt).first()

        character_id = result.character_id if result else None


        preparedSpells = Spellbook.query.filter_by(character_id=character_id, equipped=True).all()

        # Convert the SQLAlchemy objects to dictionaries
        preparedSpells = [spell.to_dict() for spell in preparedSpells]

        return jsonify({'spells': preparedSpells})

    except InvalidTokenError:
        return jsonify({'error': 'Invalid token'}), 401
    except ExpiredSignatureError:
        return jsonify({'error': 'Expired token'}), 401

@app.route('/api/spells', methods=['POST'])
@jwt_required()
def create_spell():
    # Create a new spell
    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character

    if character.account_type != 'DM':
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json

    # Convert lists to unique lists (to remove duplicates)
    data['components'] = list(set(data['components']))
    data['Classes'] = list(set(data['Classes']))

    # Convert lists to CSV strings for specific keys
    if 'components' in data:
        data['components'] = ",".join(data['components'])
        print('components:', data['components'])
    if 'Classes' in data:
        data['Classes'] = ",".join(data['Classes'])
        print('Classes:', data['Classes'])

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
    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character

    data = request.json
    spells = data['spells']
    for spell_data in spells:
        spellbook_item = Spellbook(
            user_id=user_id,
            spell_id=spell_data['spell_id'],
            quantity=spell_data.get('quantity', 1)  # Defaults to 1 if not provided
        )
        db.session.add(spellbook_item)
    db.session.commit()
    return jsonify({"message": "Spells saved successfully"}), 201

@app.route('/api/spellbook/<int:spell_id>', methods=['DELETE'])
@jwt_required()
def drop_spell_from_spellbook(spell_id):
    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character

    spellbook_item = Spellbook.query.filter_by(user_id=user_id).first()
    if not spellbook_item or spellbook_item.user_id != user_id:
        return jsonify({"error": "Spellbook item not found or unauthorized"}), 404

    data = request.json
    quantity_to_remove = data.get('quantity', 1)  # Defaults to removing 1 if not provided
    spellbook_item = Spellbook.query.get(spell_id)
    if not spellbook_item:
        return jsonify({"error": "Spellbook item not found"}), 404
    if spellbook_item.quantity <= quantity_to_remove:
        db.session.delete(spellbook_item)
    else:
        spellbook_item.quantity -= quantity_to_remove
    db.session.commit()
    return jsonify({"message": "Spell removed successfully"})

@app.route('/api/spells/<int:spell_id>', methods=['DELETE'])
@jwt_required()
def delete_spell(spell_id):
    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character

    if character.account_type != 'DM':
        return jsonify({"error": "Unauthorized"}), 403

    spell = Spell.query.get(spell_id)
    if not spell:
        return jsonify({"error": "Spell not found"}), 404
    db.session.delete(spell)
    db.session.commit()
    return jsonify({"message": "Spell deleted successfully"})

@app.route('/api/spells/<int:spell_id>', methods=['PUT'])
@jwt_required()
def update_spell(spell_id):
    ## Used for the DM to update a spell's details
    campaign_id = request.headers.get('Campaign-ID')
    user_id = request.headers.get('User-ID')
    character = campaign_members.query.filter_by(campaign_id=campaign_id, user_id=user_id).first().character

    if character.account_type != 'DM':
        return jsonify({"error": "Unauthorized"}), 403

    spell = Spell.query.get(spell_id)
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


@app.route('/api/spellbook/<int:spell_id>', methods=['PUT'])
@jwt_required()
def update_spellbook_item(spell_id):
    ## Isn't this so the DM can give spells to a player? Or is this for updating spells?
    username = get_jwt_identity()
    user = User.query.filter_by(username=username).first()

    spellbook_item = Spellbook.query.filter_by(user_id=user.id).first()
    if not spellbook_item or spellbook_item.user_id != user.id:
        return jsonify({"error": "Spellbook item not found or unauthorized"}), 404

    data = request.json
    spellbook_item.name = data['name']
    spellbook_item.equipped = data['equipped']
    db.session.commit()
    return jsonify(spellbook_item.to_dict())


##************************##
## **  SocketIO Stuff  ** ##
##************************##

def emit_active_users():
    print("FLASK- Emitting Active Users")
    active_users = db.session.query(User, Character).join(Character, User.id == Character.userID).filter(User.is_online == True).all()
    active_user_info = [{'username': user.username, 'character_name': character.character_name} for user, character in active_users]
    print("FLASK- active_user_info:", active_user_info)
    socketio.emit('active_users', active_user_info)


@socketio.on("connect")
def connected():
    """event listener when client connects to the server"""
    ## app.logger.info("CONNECT- New Socket Connection")
    try:
        token = request.args.get('token')  # Get the token from the request arguments
        app.logger.info("CONNECT- token: %s", token)
        app.logger.info("CONNECT- request: %s", request)
        if token:
            user = User.query.filter_by(username=request.args.get("username")).first()
            app.logger.info("CONNECT- user: %s", user)
            ## app.logger.info("CONNECT- user: %s", user)
            # print("CONNECT- user:", user)
            if user:
                ## app.logger.info("CONNECT- setting %s to online", user)
                print("CONNECT- setting", user, "to online")
                user.is_online = True
                user.sid = request.sid  # Update the SID associated with this user
                db.session.commit()
                emit_active_users()
    except jwt.ExpiredSignatureError:
        # emit a custom event to notify client about the expired token
        socketio.emit('token_expired')
        ## app.logger.info("CONNECT- token is expired")


@socketio.on('user_connected')
def handle_user_connected(data):
    # ## app.logger.info("HANDLE CONNETION- user_connected- data: %s", data)
    ## app.logger.info('HANDLE CONNETION- User connected: %s', data['username'])
    print('HANDLE CONNETION- User connected:', data['username'])
    # You can now associate the username with the current socket connection
    user = User.query.filter_by(username=data['username']).first()
    if user:
        ## app.logger.info("HANDLE CONNETION- user status: %s", user.is_online)
        print("HANDLE CONNETION- user status:", user.is_online)
        if not user.is_online:
            user.is_online = True
            user.sid = request.sid  # Set the sid field
            db.session.commit()
            emit_active_users()
        else:
            user.sid = request.sid  # Set the sid field
            db.session.commit()
            emit_active_users()
            ## app.logger.info("HANDLE CONNETION- %s is already online", user.username)
            print("HANDLE CONNETION-", user.username, "is already online")


@socketio.on('sendMessage')
def handle_send_message(messageObj):
    print("MESSAGE- messageObj:", messageObj)
    message = messageObj['text']
    sender = messageObj['sender']
    recipients = messageObj['recipients']
    print("recipients:", recipients)

    recipient_users = []

    if isinstance(recipients, dict):
        print("** Wrapping 'recipients' in a list **")
        recipients = [recipients]

    for recipient in recipients:
        try:
            print("Trying:", recipient["username"])
            recipient_user = User.query.filter_by(username=recipient["username"]).first()
        except:
            print("Using", recipient)
            recipient_user = User.query.filter_by(username=recipient).first()
        if recipient_user:
            recipient_users.append(recipient_user)

    print('sender:', sender)
    senderID = User.query.filter_by(username=sender.lower()).first()
    print("MESSAGE- senderID:", senderID.to_dict())

    # Update the messageObj with character names before emitting
    recipient_character_names = [user.character_name for user in recipient_users]
    messageObj['recipients'] = recipient_character_names
    messageObj['sender'] = senderID.character_name

    if messageObj['type'] == 'item_transfer':
        handle_item_transfer(messageObj, recipient_users, senderID)

    elif messageObj['type'] == 'spell_transfer':
        handle_spell_transfer(messageObj, recipient_users, senderID)

    else:
        recipient_ids = [str(user.id) for user in recipient_users]
        group_id = "-".join(sorted([str(senderID.id)] + recipient_ids, key=int))

        new_message = Message(sender_id=senderID.id, recipient_ids=",".join(recipient_ids), message_type=messageObj['type'], message_text=messageObj['text'], group_id=group_id)
        db.session.add(new_message)
        db.session.commit()

        for recipient_user in recipient_users:
            socketio.emit('message', messageObj, to=recipient_user.sid)

        # Emit the message back to the sender
        socketio.emit('message', messageObj, to=senderID.sid)

def handle_item_transfer(messageObj, recipient_users, senderID):
    # Assuming recipient_users contains only one recipient for an item_transfer
    recipient_user = recipient_users[0]
    print("recipient_user:", recipient_user)
    item = messageObj['item']
    quantity = item['quantity']

    ## app.logger.info("MESSAGE- ITEM TRANSFER- recipient_user: %s", recipient_user)
    print("MESSAGE- ITEM TRANSFER- recipient_user:", recipient_user.to_dict())

    # Update recipient's inventory here
    if recipient_user is None:
        return jsonify({'message': 'User not found'}), 404
    elif recipient_user == "Magic Ian" and item['name'] == "poop":
        return jsonify({'message': 'Ian does not want your poop'}), 404

    # Query for the sender user
    ## app.logger.info("MESSAGE- ITEM TRANSFER- senderID.character_name: %s", senderID.character_name)
    print("MESSAGE- ITEM TRANSFER- senderID.character_name:", senderID.character_name)


    # db_item = Item.query.get(item['id'])
    db_item = Item.query.filter_by(id=item['id']).first()
    ## app.logger.info("MESSAGE- item: %s", db_item.name)
    print("MESSAGE- item:", db_item.name)
    if db_item is None:
        return jsonify({'message': 'Item not found'}), 404

    # Update recipient's inventory
    recipient_inventory_item = InventoryItem.query.filter_by(user_id=recipient_user.id, item_id=db_item.id).first()
    print("MESSAGE- recipient_inventory_item:", recipient_inventory_item)

    if recipient_inventory_item:
        print("MESSAGE- old quantity:", recipient_inventory_item.quantity)
        recipient_inventory_item.quantity += int(quantity)
        print("MESSAGE- new quantity:", recipient_inventory_item.quantity)

    else:
        new_inventory_item = InventoryItem(user_id=recipient_user.id, item_id=db_item.id, name=db_item.name, quantity=int(quantity))
        print("new_inventory_item:", new_inventory_item)
        db.session.add(new_inventory_item)

    db.session.commit()

    # Emit an inventory_update event to the recipient
    socketio.emit('inventory_update', {'character_name': recipient_user.character_name, 'item': item}, to=recipient_user.sid)

    # Send a message to the recipient that they got a new item
    reception_message = {
        'type': 'text_message',
        'text': f'{senderID.character_name} gave you {quantity} {db_item.name}',
        'sender': 'System',
        'recipients': [f'{recipient_user.character_name}'],
    }
    socketio.emit('message', reception_message, to=recipient_user.sid)

    # Update sender's inventory only if the sender is not a DM
    if senderID.account_type != 'DM':
        sender_inventory_item = InventoryItem.query.filter_by(user_id=senderID.id, item_id=db_item.id).first()
        if sender_inventory_item and sender_inventory_item.quantity > int(quantity):
            sender_inventory_item.quantity -= int(quantity)
        elif sender_inventory_item.quantity == int(quantity):
            db.session.delete(sender_inventory_item)
        else:
            return jsonify({'message': 'Not enough quantity in inventory'}), 400

        db.session.commit()

        # Emit an inventory_update event to the sender
        socketio.emit('inventory_update', {'character_name': senderID.character_name, 'item': item}, to=senderID.sid)

        ## Notify the DMs, by getting their user IDs
        dm_users = User.query.filter_by(account_type='DM').all()

        # If any DM users are found, send them a message
        if dm_users:
            for dm_user in dm_users:
                notification_message = {
                    'type': 'text_message',
                    'text': f'{senderID.character_name} gave {recipient_user.character_name} {quantity} {db_item.name}',
                    'sender': 'System',
                    'recipients': ['DM'],
                }
                socketio.emit('message', notification_message, to=dm_user.sid)


    # Send a confirmation message to the sender.
    confirmation_message = {
        'type': 'text_message',
        'text': f'You gave {recipient_user.character_name} {quantity} {db_item.name}',
        'sender': 'System',
        'recipients': [f'{senderID.character_name}'],
    }
    socketio.emit('message', confirmation_message, to=senderID.sid)

def handle_spell_transfer(messageObj, recipient_users, senderID):
    # Assuming recipient_users contains only one recipient for a spell_transfer
    recipient_user = recipient_users[0]
    spell = messageObj['spell']

    # Update recipient's spellbook
    recipient_spellbook_item = Spellbook.query.filter_by(user_id=recipient_user.id, spell_id=spell['id']).first()

    if not recipient_spellbook_item:
        new_spellbook_item = Spellbook(user_id=recipient_user.id, spell_id=spell['id'], quantity=1)
        db.session.add(new_spellbook_item)
    else:
        # Assuming that spell details like name, etc. are not modified during transfer
        pass

    db.session.commit()

    # Emit a spellbook_update event to the recipient
    socketio.emit('spellbook_update', {'character_name': recipient_user.character_name, 'spell': spell}, to=recipient_user.sid)

    # Notify the recipient about the new spell
    reception_message = {
        'type': 'text_message',
        'text': f'Now you the know spell {spell["name"]}',
        'sender': 'System',
        'recipients': [f'{recipient_user.character_name}'],
    }
    socketio.emit('message', reception_message, to=recipient_user.sid)

    # Send a confirmation message to the sender.
    confirmation_message = {
        'type': 'text_message',
        'text': f'{recipient_user.character_name} knows the spell {spell["name"]}',
        'sender': 'System',
        'recipients': [f'{senderID.character_name}'],
    }
    socketio.emit('message', confirmation_message, to=senderID.sid)


## Initiative Tracking
@socketio.on('Roll for initiative!')
def roll_initiative():
    # You may want to include authentication or other logic here

    # Emit the "Roll for initiative!" event to all connected clients
    socketio.emit('Roll for initiative!')

@socketio.on('initiative roll')
def handle_initiative_roll(data):
    # You may want to include validation or other logic here

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


@socketio.on('disconnect')
def disconnected():
    """event listener when client disconnects to the server"""
    ## app.logger.info("DISCONNECT- request.sid: %s", request.sid)
    print("DISCONNECT- request.sid:", request.sid)
    user = User.query.filter_by(sid=request.sid).first()
    if user:
        ## app.logger.info("DISCONNECT- %s is logging off!", user.username)
        print("DISCONNECT-", user.username, "is logging off!")
        user.is_online = False
        db.session.commit()
        emit_active_users()
        socketio.emit("disconnect",f"user {user.username} disconnected", room='/')
        ## app.logger.info("DISCONNECT- %s disconnected", user.username)
        print("DISCONNECT-", user.username, "disconnected")

@app.route('/search', methods=['GET'])
def search():
    query = request.args.get('q')
    results = Page.query.filter(Page.title.contains(query)).all()
    return jsonify([page.title for page in results])


@app.route('/', methods=['GET'])
def index():
    page = Page.query.filter_by(title="Main Page").first()
    if not page:
        return render_template('index.html')

    html_content = markdown.markdown(page.content)

    return render_template('page.html', content=html_content, page_title=page.title)


@app.route('/<page_title>', methods=['GET'])
def wiki_page(page_title):
    print("page_title:", page_title)
    ## Decode any %20 in the URL to space
    # page_title = unquote(page_title)
    # print("Adjusted page_title:", page_title)

    page = Page.query.filter_by(title=page_title).first()
    if not page:
        return "Page not found", 404

    html_content = markdown.markdown(page.content)

    return render_template('page.html', content=html_content, page_title=page.title)

@app.route('/<page_title>/edit', methods=['GET', 'POST'])
def edit_page(page_title):
    print("Accessing edit page for:", page_title)
    page = Page.query.filter_by(title=page_title).first()
    if not page:
        return "Page not found", 404

    # Handle POST request for saving edits
    if request.method == "POST":
        print("Saving edits for:", page_title)
        content = request.form.get('content')
        page.content = content
        db.session.commit()
        
        # Redirect to the non-editing version of the page
        return redirect(url_for('wiki_page', page_title=page_title))

    # Handle GET request for displaying the edit page
    elif request.method == "GET":
        html_content = markdown.markdown(page.content)
        return render_template('edit_page.html', content=html_content)

    # Return an error for any other request method
    else:
        return "Method not allowed", 405


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5001)
