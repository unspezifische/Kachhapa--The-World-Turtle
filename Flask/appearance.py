"""Private account palettes. Only validated literal colors are accepted, never CSS."""
from copy import deepcopy
from functools import wraps
import json
from pathlib import Path
import re
from uuid import uuid4
from flask import request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, decode_token

PRESETS=json.loads(Path(__file__).with_name('theme_presets.json').read_text())
TARGETS=set(PRESETS['assignments'])
COLOR=re.compile(r'^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$')


def validate_palettes(value):
    roles=set(PRESETS['themes'][0]['palettes']['dark'])
    if not isinstance(value,dict) or set(value)!={'dark','light'}:
        raise ValueError('Provide both Dark and Light palettes.')
    result={}
    for mode in ('dark','light'):
        colors=value[mode]
        if not isinstance(colors,dict) or set(colors)!=roles:
            raise ValueError('Every shared color role is required.')
        if any(not isinstance(v,str) or not COLOR.fullmatch(v) for v in colors.values()):
            raise ValueError('Colors must be HEX colors, with an optional alpha channel.')
        result[mode]={k:v.lower() for k,v in colors.items()}
    return result


def register_appearance(app,ns):
    db=ns['db']; User=ns['User']; Theme=ns['UserColorTheme']; Appearance=ns['UserAppearance']
    def identity():
        try:
            try:
                verify_jwt_in_request(optional=True)
                name=get_jwt_identity()
            except Exception:
                name=None
            if not name:
                token=request.cookies.get(ns['SHARED_SESSION_COOKIE'])
                name=decode_token(token).get('sub') if token else None
            return User.query.filter_by(username=name).first() if name else None
        except Exception:
            return None

    def authenticated(fn):
        @wraps(fn)
        def wrapped(*args,**kwargs):
            user=identity()
            if not user:return jsonify(message='Sign in to manage your themes.'),401
            if request.method!='GET':
                origin=request.headers.get('Origin')
                if request.headers.get('Sec-Fetch-Site')=='cross-site' or (origin and origin.rstrip('/')!=request.host_url.rstrip('/')):
                    return jsonify(message='Use this site to change appearance settings.'),403
                if not request.is_json:return jsonify(message='Send appearance changes as JSON.'),400
                User.query.filter_by(id=user.id).with_for_update().one()
            result=app.make_response(fn(user,*args,**kwargs))
            result.headers['Cache-Control']='private, no-store'
            if result.status_code>=400:db.session.rollback()
            return result
        return wrapped

    def record(user):
        row=Appearance.query.filter_by(user_id=user.id).first()
        if not row:
            row=Appearance(user_id=user.id,revision=0,preferences={'mode':request.headers.get('X-Appearance-Mode') if request.headers.get('X-Appearance-Mode') in ('dark','light') else 'dark'})
            db.session.add(row)
        return row

    def snapshot(user):
        row=Appearance.query.filter_by(user_id=user.id).first()
        preferences=row.preferences if row else {'mode':request.headers.get('X-Appearance-Mode') if request.headers.get('X-Appearance-Mode') in ('dark','light') else 'dark'}
        themes=deepcopy(PRESETS['themes'])
        for t in Theme.query.filter_by(user_id=user.id).order_by(Theme.name,Theme.id).all():
            themes.append(dict(id=t.id,name=t.name,version=t.version,revision=t.revision,builtin=False,palettes=t.palettes))
        return dict(version=1,user_id=user.id,username=user.username,revision=row.revision if row else 0,themes=themes,
                    mode=preferences.get('mode','dark'),assignments={**PRESETS['assignments'],**preferences.get('assignments',{})})

    def save(user,row):
        row.revision+=1;db.session.commit()
        return jsonify(snapshot(user))

    def valid_id(user,key):
        return isinstance(key,str) and (key in ('kachhapa','settlement') or Theme.query.filter_by(id=key,user_id=user.id).first() is not None)

    @app.route('/api/appearance',methods=['GET','PATCH'])
    @authenticated
    def appearance_settings(user):
        if request.method=='GET':return jsonify(snapshot(user))
        data=request.get_json() or {}
        if not isinstance(data,dict):return jsonify(message='Send an appearance object.'),400
        row=record(user)
        if 'assignments' in data and data.get('revision')!=row.revision:
            db.session.rollback();return jsonify(message='Appearance changed in another tab. Review the latest settings.',**snapshot(user)),409
        prefs=deepcopy(row.preferences)
        if 'mode' in data:
            if data['mode'] not in ('dark','light'):return jsonify(message='Choose Dark or Light mode.'),400
            prefs['mode']=data['mode']
        if 'assignments' in data:
            assignments=data['assignments']
            if not isinstance(assignments,dict) or not set(assignments).issubset(TARGETS) or any(not valid_id(user,k) for k in assignments.values()):
                return jsonify(message='Choose one of your themes for each interface.'),400
            prefs['assignments']={**prefs.get('assignments',{}),**assignments}
        row.preferences=prefs
        return save(user,row)

    @app.route('/api/appearance/themes',methods=['POST'])
    @app.route('/api/appearance/themes/<string:theme_id>',methods=['PATCH','DELETE'])
    @authenticated
    def edit_theme(user,theme_id=None):
        data=request.get_json() or {}
        if not isinstance(data,dict):return jsonify(message='Send a theme object.'),400
        theme=Theme.query.filter_by(id=theme_id,user_id=user.id).first() if theme_id else None
        if theme_id and not theme:return jsonify(message='Personal theme not found. Duplicate a built-in theme to customize it.'),404
        row=record(user)
        if data.get('revision')!=row.revision:
            db.session.rollback();return jsonify(message='Appearance changed in another tab. Your draft has been kept; review before saving again.',**snapshot(user)),409
        if request.method=='DELETE':
            prefs=deepcopy(row.preferences)
            assigned={**PRESETS['assignments'],**prefs.get('assignments',{})}
            targets=[k for k,v in assigned.items() if v==theme.id]
            replacement=data.get('replacement_id')
            if targets and (replacement==theme.id or not valid_id(user,replacement)):
                return jsonify(message='Choose a replacement for the interfaces using this theme.'),400
            for target in targets:assigned[target]=replacement
            prefs['assignments']=assigned;row.preferences=prefs;db.session.delete(theme)
        else:
            name=str(data.get('name') or '').strip()
            if not 1<=len(name)<=100:return jsonify(message='Name your theme using 1 to 100 characters.'),400
            try:palettes=validate_palettes(data.get('palettes'))
            except ValueError as error:return jsonify(message=str(error)),400
            if not theme:
                theme=Theme(id=str(uuid4()),user_id=user.id,version=1,revision=0)
                db.session.add(theme)
            theme.name=name;theme.palettes=palettes;theme.revision+=1
        return save(user,row)
