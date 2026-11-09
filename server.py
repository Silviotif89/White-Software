#!/usr/bin/env python3
"""White Software: dependency-free connected delivery MVP."""
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("WHITESOFT_DATA", ROOT / "data")).resolve()
DB_PATH = DATA / "white-software.sqlite3"
HOST = os.environ.get("WHITE_HOST", "127.0.0.1")
PORT = int(os.environ.get("WHITE_PORT", "8000"))
ROUNDS = 240000

SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS tenants(
 id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,name TEXT NOT NULL,tagline TEXT DEFAULT '',
 color TEXT DEFAULT '#155eef',currency TEXT DEFAULT 'NIO',delivery_fee INTEGER DEFAULT 0,
 payments_json TEXT DEFAULT '["cash"]',transfer_instructions TEXT DEFAULT '',active INTEGER DEFAULT 1,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','dispatcher','courier')),password_hash TEXT NOT NULL,salt TEXT NOT NULL,
 active INTEGER DEFAULT 1,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),category TEXT NOT NULL,name TEXT NOT NULL,
 description TEXT DEFAULT '',price INTEGER NOT NULL CHECK(price>=0),available INTEGER DEFAULT 1,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),customer_name TEXT NOT NULL,phone TEXT NOT NULL,
 address TEXT NOT NULL,reference TEXT DEFAULT '',payment_method TEXT NOT NULL,payment_state TEXT NOT NULL,
 status TEXT NOT NULL,subtotal INTEGER NOT NULL,delivery_fee INTEGER NOT NULL,total INTEGER NOT NULL,
 tracking_token TEXT UNIQUE NOT NULL,idempotency_key TEXT NOT NULL,assigned_user_id INTEGER REFERENCES users(id),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(tenant_id,idempotency_key));
CREATE TABLE IF NOT EXISTS order_items(
 id INTEGER PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 product_id TEXT NOT NULL,name_snapshot TEXT NOT NULL,quantity INTEGER NOT NULL,unit_price INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS deliveries(
 id INTEGER PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),order_id TEXT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 courier_id INTEGER NOT NULL REFERENCES users(id),status TEXT NOT NULL,active INTEGER DEFAULT 1,sharing_location INTEGER DEFAULT 0,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS order_events(
 id INTEGER PRIMARY KEY,tenant_id TEXT NOT NULL,order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 actor_id INTEGER,event_type TEXT NOT NULL,old_value TEXT DEFAULT '',new_value TEXT DEFAULT '',message TEXT DEFAULT '',
 idempotency_key TEXT UNIQUE,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS locations(
 id INTEGER PRIMARY KEY,tenant_id TEXT NOT NULL,order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 courier_id INTEGER NOT NULL,latitude REAL NOT NULL,longitude REAL NOT NULL,accuracy REAL,recorded_at TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS location_recent ON locations(tenant_id,order_id,expires_at);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS system_audit(
 id INTEGER PRIMARY KEY,tenant_id TEXT NOT NULL,actor_id INTEGER,action TEXT NOT NULL,entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL,details TEXT DEFAULT '',created_at TEXT NOT NULL);
"""

def stamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def db_open():
    DATA.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=10000")
    return db

def pass_hash(password, salt=None):
    raw = bytes.fromhex(salt) if salt else secrets.token_bytes(16)
    result = hashlib.pbkdf2_hmac("sha256", password.encode(), raw, ROUNDS)
    return result.hex(), raw.hex()

def password_ok(password, salt, expected):
    return hmac.compare_digest(pass_hash(password, salt)[0], expected)

def init_db():
    with db_open() as db:
        db.executescript(SCHEMA)
        columns={x["name"] for x in db.execute("PRAGMA table_info(deliveries)").fetchall()}
        if "sharing_location" not in columns:
            db.execute("ALTER TABLE deliveries ADD COLUMN sharing_location INTEGER DEFAULT 0")
        tenant = db.execute("SELECT id FROM tenants WHERE slug='mercadito-la-esquina'").fetchone()
        now = stamp()
        if not tenant:
            tid = "tenant_demo"
            db.execute("INSERT INTO tenants(id,slug,name,tagline,color,currency,delivery_fee,payments_json,transfer_instructions,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                       (tid,"mercadito-la-esquina","Mercadito La Esquina","Pedido fácil, cerca de vos.","#155eef","NIO",3000,json.dumps(["cash","transfer"]),"La transferencia se confirma manualmente con el negocio. No compartas claves ni datos completos de tarjeta.",now))
            products = [
                ("p-arroz","Abarrotes","Arroz 1 kg","Arroz de consumo diario.",4200),
                ("p-frijoles","Abarrotes","Frijoles rojos 1 kg","Frijoles seleccionados.",5200),
                ("p-aceite","Abarrotes","Aceite vegetal 900 ml","Presentación familiar.",8900),
                ("p-cafe","Bebidas","Café molido 250 g","Café para compartir.",14500),
                ("p-jabon","Hogar","Jabón de lavar","Unidad.",3500),
                ("p-leche","Lácteos","Leche 1 litro","Producto refrigerado.",6700)]
            for pid,cat,name,desc,price in products:
                db.execute("INSERT INTO products(id,tenant_id,category,name,description,price,created_at) VALUES(?,?,?,?,?,?,?)",(pid,tid,cat,name,desc,price,now))
        tid = db.execute("SELECT id FROM tenants WHERE slug='mercadito-la-esquina'").fetchone()["id"]
        accounts = [
            (os.environ.get("WHITE_ADMIN_EMAIL","admin@demo.white").lower(),os.environ.get("WHITE_ADMIN_PASSWORD","Demo123!"),"Administración","owner"),
            (os.environ.get("WHITE_DISPATCHER_EMAIL","despacho@demo.white").lower(),os.environ.get("WHITE_DISPATCHER_PASSWORD","Demo123!"),"Despacho","dispatcher"),
            (os.environ.get("WHITE_COURIER_EMAIL","rider@demo.white").lower(),os.environ.get("WHITE_COURIER_PASSWORD","Demo123!"),"Repartidor Demo","courier")]
        for email,pwd,name,role in accounts:
            if not db.execute("SELECT 1 FROM users WHERE email=?",(email,)).fetchone():
                hashed,salt=pass_hash(pwd)
                db.execute("INSERT INTO users(tenant_id,name,email,role,password_hash,salt,created_at) VALUES(?,?,?,?,?,?,?)",(tid,name,email,role,hashed,salt,now))

def asdict(row):
    return dict(row) if row else None

def audit(db,tenant,order,actor,kind,old="",new="",message="",idem=None):
    db.execute("INSERT OR IGNORE INTO order_events(tenant_id,order_id,actor_id,event_type,old_value,new_value,message,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
               (tenant,order,actor,kind,old,new,message[:500],idem,stamp()))

def audit_system(db,tenant,actor,action,entity,entity_id,details=""):
    db.execute("INSERT INTO system_audit(tenant_id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)",
               (tenant,actor,action,entity,entity_id,details[:500],stamp()))

class App(BaseHTTPRequestHandler):
    server_version = "WhiteSoftware/0.1"
    def log_message(self, fmt, *args):
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(),fmt % args))

    def json_out(self,data,status=200,headers=None):
        raw=json.dumps(data,ensure_ascii=False,separators=(",",":")).encode()
        self.send_response(status)
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(raw)))
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Referrer-Policy","strict-origin-when-cross-origin")
        self.send_header("Content-Security-Policy","default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        for k,v in (headers or {}).items():
            self.send_header(k,v)
        self.end_headers()
        self.wfile.write(raw)

    def error(self,status,message,code="request_error"):
        self.json_out({"error":{"code":code,"message":message}},status)

    def read_body(self):
        length=int(self.headers.get("Content-Length","0"))
        if length<0 or length>512000:
            raise ValueError("La solicitud supera el tamaño permitido.")
        try:
            data=json.loads(self.rfile.read(length).decode()) if length else {}
        except (UnicodeDecodeError,json.JSONDecodeError):
            raise ValueError("El contenido JSON no es válido.")
        if not isinstance(data,dict):
            raise ValueError("El cuerpo debe ser un objeto JSON.")
        return data

    def origin_valid(self):
        origin=self.headers.get("Origin")
        return not origin or urlparse(origin).netloc.lower()==self.headers.get("Host","").lower()

    def current_user(self,db):
        cookie=SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie",""))
            raw=cookie["white_session"].value
        except Exception:
            return None
        hashed=hashlib.sha256(raw.encode()).hexdigest()
        return db.execute("SELECT u.id,u.tenant_id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",(hashed,int(time.time()))).fetchone()

    def auth(self,db,roles):
        user=self.current_user(db)
        if not user:
            self.error(401,"Iniciá sesión para continuar.","authentication_required")
            return None
        if user["role"] not in roles:
            self.error(403,"Tu cuenta no tiene permiso para esta acción.","forbidden")
            return None
        return user

    def do_GET(self):
        try:
            url=urlparse(self.path); path=unquote(url.path); q=parse_qs(url.query)
            with db_open() as db:
                if path=="/api/health":
                    return self.json_out({"ok":True,"service":"white-software","database":"sqlite","card_payments":"pending_integration"})
                if path=="/api/session":
                    return self.json_out({"user":asdict(self.current_user(db))})
                if path=="/api/storefront":
                    slug=q.get("slug",["mercadito-la-esquina"])[0]
                    tenant=db.execute("SELECT * FROM tenants WHERE slug=? AND active=1",(slug,)).fetchone()
                    if not tenant:return self.error(404,"No encontramos este comercio.","store_not_found")
                    products=db.execute("SELECT id,category,name,description,price,available FROM products WHERE tenant_id=? ORDER BY category,name",(tenant["id"],)).fetchall()
                    store={k:tenant[k] for k in ("slug","name","tagline","color","currency","delivery_fee","transfer_instructions")}
                    store["payments"]=json.loads(tenant["payments_json"])
                    return self.json_out({"store":store,"products":[dict(x) for x in products]})
                if path=="/api/tracking":
                    order=db.execute("SELECT id,tenant_id,status,payment_method,payment_state,total,created_at,updated_at FROM orders WHERE tracking_token=?",(q.get("token",[""])[0],)).fetchone()
                    if not order:return self.error(404,"No encontramos un pedido con ese enlace.","tracking_not_found")
                    delivery=db.execute("SELECT status,updated_at,sharing_location FROM deliveries WHERE order_id=? AND tenant_id=?",(order["id"],order["tenant_id"])).fetchone()
                    location=None
                    fresh=datetime.fromtimestamp(time.time()-120,timezone.utc).isoformat(timespec="seconds")
                    if delivery and delivery["status"] in ("accepted","picked_up","on_route") and delivery["sharing_location"]:
                        location=db.execute("SELECT latitude,longitude,accuracy,recorded_at FROM locations WHERE order_id=? AND expires_at>? AND recorded_at>? ORDER BY id DESC LIMIT 1",(order["id"],int(time.time()),fresh)).fetchone()
                    safe_order={key:order[key] for key in ("id","status","payment_method","payment_state","total","created_at","updated_at")}
                    return self.json_out({"order":safe_order,"delivery":asdict(delivery),"location":asdict(location)})
                if path=="/api/admin/overview":
                    u=self.auth(db,("owner","admin","dispatcher"))
                    if not u:return
                    tid=u["tenant_id"]
                    counts=db.execute("SELECT status,COUNT(*) n FROM orders WHERE tenant_id=? GROUP BY status",(tid,)).fetchall()
                    sales=db.execute("SELECT COALESCE(SUM(total),0) n FROM orders WHERE tenant_id=? AND status='delivered'",(tid,)).fetchone()["n"]
                    pending=db.execute("SELECT COUNT(*) n FROM orders WHERE tenant_id=? AND payment_state IN ('pending_cash','pending_verification','pending_integration')",(tid,)).fetchone()["n"]
                    day=datetime.now(timezone.utc).date().isoformat()
                    today=db.execute("SELECT COUNT(*) n FROM orders WHERE tenant_id=? AND substr(created_at,1,10)=?",(tid,day)).fetchone()["n"]
                    return self.json_out({"counts":{x["status"]:x["n"] for x in counts},"sales_delivered":sales,"payments_pending":pending,"orders_today":today})
                if path=="/api/admin/orders":
                    u=self.auth(db,("owner","admin","dispatcher"))
                    if not u:return
                    rows=db.execute("""SELECT o.id,o.customer_name,o.phone,o.address,o.reference,o.payment_method,o.payment_state,o.status,o.subtotal,o.delivery_fee,o.total,o.created_at,o.updated_at,u.name courier_name,d.status delivery_status,u.id courier_id
                        FROM orders o LEFT JOIN deliveries d ON d.order_id=o.id AND d.tenant_id=o.tenant_id LEFT JOIN users u ON u.id=d.courier_id
                        WHERE o.tenant_id=? ORDER BY o.created_at DESC LIMIT 150""",(u["tenant_id"],)).fetchall()
                    items=[]
                    for r in rows:
                        item=dict(r)
                        item["items"]=[dict(x) for x in db.execute("SELECT name_snapshot,quantity,unit_price FROM order_items WHERE order_id=?",(r["id"],)).fetchall()]
                        item["events"]=[dict(x) for x in db.execute("SELECT event_type,old_value,new_value,message,created_at FROM order_events WHERE order_id=? ORDER BY id DESC LIMIT 8",(r["id"],)).fetchall()]
                        items.append(item)
                    return self.json_out({"orders":items})
                if path=="/api/admin/products":
                    u=self.auth(db,("owner","admin","dispatcher"))
                    if not u:return
                    rows=db.execute("SELECT id,category,name,description,price,available FROM products WHERE tenant_id=? ORDER BY category,name",(u["tenant_id"],)).fetchall()
                    return self.json_out({"products":[dict(x) for x in rows]})
                if path=="/api/admin/couriers":
                    u=self.auth(db,("owner","admin","dispatcher"))
                    if not u:return
                    rows=db.execute("SELECT id,name,email,active FROM users WHERE tenant_id=? AND role='courier' AND active=1 ORDER BY name",(u["tenant_id"],)).fetchall()
                    return self.json_out({"couriers":[dict(x) for x in rows]})
                if path=="/api/admin/locations":
                    u=self.auth(db,("owner","admin","dispatcher"))
                    if not u:return
                    rows=db.execute("""SELECT l.latitude,l.longitude,l.accuracy,l.recorded_at,o.id order_id,o.customer_name,u.name courier_name,d.status
                        FROM locations l JOIN orders o ON o.id=l.order_id AND o.tenant_id=l.tenant_id
                        JOIN deliveries d ON d.order_id=o.id AND d.tenant_id=o.tenant_id
                        JOIN users u ON u.id=l.courier_id AND u.tenant_id=l.tenant_id WHERE l.tenant_id=? AND l.expires_at>?
                        AND d.status IN ('accepted','picked_up','on_route') AND d.sharing_location=1 AND l.recorded_at>? AND l.id=(SELECT MAX(x.id) FROM locations x WHERE x.order_id=l.order_id AND x.expires_at>?) ORDER BY l.recorded_at DESC""",
                        (u["tenant_id"],int(time.time()),datetime.fromtimestamp(time.time()-120,timezone.utc).isoformat(timespec="seconds"),int(time.time()))).fetchall()
                    return self.json_out({"locations":[dict(x) for x in rows]})
                if path=="/api/admin/audit":
                    u=self.auth(db,("owner","admin"))
                    if not u:return
                    system=db.execute("SELECT action,entity_type,entity_id,details,created_at FROM system_audit WHERE tenant_id=? ORDER BY id DESC LIMIT 18",(u["tenant_id"],)).fetchall()
                    orders=db.execute("SELECT 'order_'||event_type action,'pedido' entity_type,order_id entity_id,message details,created_at FROM order_events WHERE tenant_id=? ORDER BY id DESC LIMIT 18",(u["tenant_id"],)).fetchall()
                    activity=sorted([dict(x) for x in system]+[dict(x) for x in orders],key=lambda x:x["created_at"],reverse=True)[:18]
                    return self.json_out({"activity":activity})
                if path=="/api/admin/settings":
                    u=self.auth(db,("owner","admin"))
                    if not u:return
                    row=db.execute("SELECT slug,name,tagline,color,currency,delivery_fee,payments_json,transfer_instructions FROM tenants WHERE id=?",(u["tenant_id"],)).fetchone()
                    result=dict(row);result["payments"]=json.loads(result.pop("payments_json"))
                    return self.json_out({"settings":result})
                if path=="/api/rider/tasks":
                    u=self.auth(db,("courier",))
                    if not u:return
                    rows=db.execute("""SELECT o.id,o.customer_name,o.phone,o.address,o.reference,o.status order_status,o.payment_method,o.payment_state,o.total,o.created_at,d.status delivery_status,d.updated_at
                        FROM deliveries d JOIN orders o ON o.id=d.order_id AND o.tenant_id=d.tenant_id
                        WHERE d.tenant_id=? AND d.courier_id=? AND d.active=1 AND d.status!='delivered' ORDER BY d.updated_at DESC""",(u["tenant_id"],u["id"])).fetchall()
                    tasks=[]
                    for row in rows:
                        item=dict(row)
                        item["items"]=[dict(x) for x in db.execute("SELECT name_snapshot,quantity FROM order_items WHERE order_id=?",(row["id"],)).fetchall()]
                        tasks.append(item)
                    return self.json_out({"tasks":tasks})
            return self.static(path)
        except ValueError as exc:
            return self.error(400,str(exc),"invalid_request")
        except Exception as exc:
            sys.stderr.write("GET error: %s\n"%exc)
            return self.error(500,"Ocurrió un error interno.","internal_error")

    def do_POST(self):
        try:
            if not self.origin_valid():return self.error(403,"Origen de solicitud no permitido.","origin_rejected")
            path=unquote(urlparse(self.path).path); data=self.read_body()
            with db_open() as db:
                db.execute("BEGIN IMMEDIATE")
                if path=="/api/login":
                    email=str(data.get("email","")).strip().lower(); password=str(data.get("password",""))
                    u=db.execute("SELECT * FROM users WHERE email=? AND active=1",(email,)).fetchone()
                    if not u or not password_ok(password,u["salt"],u["password_hash"]):return self.error(401,"Correo o contraseña incorrectos.","login_failed")
                    token=secrets.token_urlsafe(36); hashed=hashlib.sha256(token.encode()).hexdigest(); expires=int(time.time())+12*3600
                    db.execute("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",(hashed,u["id"],expires,stamp()))
                    secure="; Secure" if os.environ.get("WHITE_COOKIE_SECURE")=="1" else ""
                    cookie="white_session=%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200%s"%(token,secure)
                    return self.json_out({"user":{"id":u["id"],"name":u["name"],"email":u["email"],"role":u["role"]}},headers={"Set-Cookie":cookie})
                if path=="/api/logout":
                    jar=SimpleCookie();jar.load(self.headers.get("Cookie",""))
                    if "white_session" in jar:db.execute("DELETE FROM sessions WHERE token_hash=?",(hashlib.sha256(jar["white_session"].value.encode()).hexdigest(),))
                    return self.json_out({"ok":True},headers={"Set-Cookie":"white_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"})
                if path=="/api/orders":
                    slug=str(data.get("slug","")); tenant=db.execute("SELECT * FROM tenants WHERE slug=? AND active=1",(slug,)).fetchone()
                    if not tenant:return self.error(404,"No encontramos este comercio.","store_not_found")
                    name=str(data.get("customer_name","")).strip()[:100];phone=str(data.get("phone","")).strip()[:40];address=str(data.get("address","")).strip()[:300];ref=str(data.get("reference","")).strip()[:300]
                    method=str(data.get("payment_method",""));key=str(data.get("idempotency_key","")).strip()
                    if len(name)<2 or len(phone)<7 or len(address)<5:return self.error(400,"Completá nombre, teléfono y dirección.","validation_error")
                    if method=="card":return self.error(409,"El pago con tarjeta está pendiente de integrar con un adquirente real.","payment_integration_pending")
                    if method not in json.loads(tenant["payments_json"]):return self.error(400,"Este método de pago no está habilitado.","payment_method_unavailable")
                    if not re.fullmatch(r"[A-Za-z0-9_-]{12,100}",key):return self.error(400,"La clave de pedido no es válida.","validation_error")
                    existing=db.execute("SELECT id,tracking_token,total,payment_state FROM orders WHERE tenant_id=? AND idempotency_key=?",(tenant["id"],key)).fetchone()
                    if existing:return self.json_out({"order_id":existing["id"],"tracking_token":existing["tracking_token"],"total":existing["total"],"payment_state":existing["payment_state"],"duplicate":True})
                    lines=data.get("items")
                    if not isinstance(lines,list) or not lines or len(lines)>30:return self.error(400,"Agregá productos al carrito.","validation_error")
                    checked=[];subtotal=0
                    for line in lines:
                        if not isinstance(line,dict):return self.error(400,"El carrito no es válido.","validation_error")
                        pid=str(line.get("product_id",""));qty=line.get("quantity")
                        if not isinstance(qty,int) or qty<1 or qty>99:return self.error(400,"La cantidad no es válida.","validation_error")
                        p=db.execute("SELECT id,name,price,available FROM products WHERE id=? AND tenant_id=?",(pid,tenant["id"])).fetchone()
                        if not p or not p["available"]:return self.error(409,"Un producto ya no está disponible. Actualizá el carrito.","product_unavailable")
                        subtotal+=p["price"]*qty;checked.append((p,qty))
                    fee=tenant["delivery_fee"];total=subtotal+fee;oid="WS-"+secrets.token_hex(4).upper();tracking=secrets.token_urlsafe(32);now=stamp()
                    pay="pending_cash" if method=="cash" else "pending_verification"
                    db.execute("""INSERT INTO orders(id,tenant_id,customer_name,phone,address,reference,payment_method,payment_state,status,subtotal,delivery_fee,total,tracking_token,idempotency_key,created_at,updated_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",(oid,tenant["id"],name,phone,address,ref,method,pay,"received",subtotal,fee,total,tracking,key,now,now))
                    for p,qty in checked:db.execute("INSERT INTO order_items(order_id,product_id,name_snapshot,quantity,unit_price) VALUES(?,?,?,?,?)",(oid,p["id"],p["name"],qty,p["price"]))
                    audit(db,tenant["id"],oid,None,"order_received","","received","Pedido creado por el cliente.")
                    return self.json_out({"order_id":oid,"tracking_token":tracking,"total":total,"payment_state":pay,"duplicate":False},201)
                match=re.fullmatch(r"/api/admin/orders/([^/]+)/(status|assign|payment)",path)
                if match:
                    u=self.auth(db,("owner","admin","dispatcher"))
                    if not u:return
                    oid,action=match.groups();order=db.execute("SELECT * FROM orders WHERE id=? AND tenant_id=?",(oid,u["tenant_id"])).fetchone()
                    if not order:return self.error(404,"No encontramos el pedido en tu comercio.","order_not_found")
                    if action=="status":
                        target=str(data.get("status",""));valid={"received":{"confirmed","cancelled"},"confirmed":{"preparing","cancelled"},"preparing":{"ready","cancelled"},"ready":{"cancelled"},"in_delivery":set(),"delivered":set(),"cancelled":set()}
                        if target not in valid.get(order["status"],set()):return self.error(409,"Ese cambio no está permitido desde el estado actual.","invalid_transition")
                        changed=db.execute("UPDATE orders SET status=?,updated_at=? WHERE id=? AND tenant_id=? AND status=?",(target,stamp(),oid,u["tenant_id"],order["status"])).rowcount
                        if not changed:return self.error(409,"El pedido cambió mientras procesabas la acción. Actualizá la bandeja.","stale_order")
                        if target=="cancelled":db.execute("UPDATE deliveries SET active=0,sharing_location=0,status='incident',updated_at=? WHERE order_id=?",(stamp(),oid))
                        audit(db,u["tenant_id"],oid,u["id"],"order_status",order["status"],target)
                        return self.json_out({"ok":True,"status":target})
                    if action=="assign":
                        courier=db.execute("SELECT id,name FROM users WHERE id=? AND tenant_id=? AND role='courier' AND active=1",(data.get("courier_id"),u["tenant_id"])).fetchone()
                        if not courier:return self.error(400,"Seleccioná un repartidor activo de este comercio.","invalid_courier")
                        if order["status"] in ("cancelled","delivered","in_delivery"):return self.error(409,"El pedido ya no se puede asignar.","invalid_transition")
                        old=db.execute("SELECT courier_id FROM deliveries WHERE order_id=?",(oid,)).fetchone()
                        db.execute("""INSERT INTO deliveries(tenant_id,order_id,courier_id,status,active,sharing_location,updated_at) VALUES(?,?,?,'assigned',1,0,?)
                            ON CONFLICT(order_id) DO UPDATE SET courier_id=excluded.courier_id,status='assigned',active=1,sharing_location=0,updated_at=excluded.updated_at""",(u["tenant_id"],oid,courier["id"],stamp()))
                        db.execute("UPDATE orders SET assigned_user_id=?,updated_at=? WHERE id=?",(courier["id"],stamp(),oid))
                        audit(db,u["tenant_id"],oid,u["id"],"courier_assigned",str(old["courier_id"]) if old else "",str(courier["id"]),courier["name"])
                        return self.json_out({"ok":True,"courier":courier["name"]})
                    if order["payment_method"]=="transfer" and order["payment_state"]=="pending_verification":
                        new_payment="paid_manual"; event_name="transfer_verified"
                    elif order["payment_method"]=="cash" and order["payment_state"]=="pending_cash":
                        new_payment="paid_cash"; event_name="cash_verified"
                    else:
                        return self.error(409,"El pago ya fue confirmado o requiere una integración externa.","invalid_payment_transition")
                    note=str(data.get("note","")).strip()[:300]
                    if len(note)<3:return self.error(400,"Ingresá una referencia breve para documentar la verificación.","validation_error")
                    changed=db.execute("UPDATE orders SET payment_state=?,updated_at=? WHERE id=? AND tenant_id=? AND payment_state=?",(new_payment,stamp(),oid,u["tenant_id"],order["payment_state"])).rowcount
                    if not changed:return self.error(409,"El estado del pago cambió. Actualizá el pedido.","stale_payment")
                    audit(db,u["tenant_id"],oid,u["id"],event_name,order["payment_state"],new_payment,note)
                    return self.json_out({"ok":True,"payment_state":new_payment})
                match=re.fullmatch(r"/api/admin/products/([^/]+)",path)
                if match:
                    u=self.auth(db,("owner","admin"))
                    if not u:return
                    pid=match.group(1);p=db.execute("SELECT id FROM products WHERE id=? AND tenant_id=?",(pid,u["tenant_id"])).fetchone()
                    if not p:return self.error(404,"Producto no encontrado.","product_not_found")
                    val=data.get("available")
                    if not isinstance(val,bool):return self.error(400,"La disponibilidad debe ser sí o no.","validation_error")
                    db.execute("UPDATE products SET available=? WHERE id=? AND tenant_id=?",(int(val),pid,u["tenant_id"]))
                    audit_system(db,u["tenant_id"],u["id"],"availability_changed","product",pid,"Disponible" if val else "Oculto")
                    return self.json_out({"ok":True,"available":val})
                if path=="/api/admin/products":
                    u=self.auth(db,("owner","admin"))
                    if not u:return
                    name=str(data.get("name","")).strip()[:100];cat=str(data.get("category","")).strip()[:60];desc=str(data.get("description","")).strip()[:300];price=data.get("price")
                    if len(name)<2 or len(cat)<2 or not isinstance(price,int) or not 0<=price<=100000000:return self.error(400,"Revisá nombre, categoría y precio.","validation_error")
                    pid="p-"+secrets.token_hex(6)
                    db.execute("INSERT INTO products(id,tenant_id,category,name,description,price,available,created_at) VALUES(?,?,?,?,?,?,1,?)",(pid,u["tenant_id"],cat,name,desc,price,stamp()))
                    audit_system(db,u["tenant_id"],u["id"],"product_created","product",pid,name)
                    return self.json_out({"ok":True,"id":pid},201)
                if path=="/api/admin/settings":
                    u=self.auth(db,("owner","admin"))
                    if not u:return
                    name=str(data.get("name","")).strip()[:100];tag=str(data.get("tagline","")).strip()[:160];color=str(data.get("color",""));fee=data.get("delivery_fee");instructions=str(data.get("transfer_instructions","")).strip()[:500]
                    if len(name)<2 or not re.fullmatch(r"#[0-9A-Fa-f]{6}",color) or not isinstance(fee,int) or not 0<=fee<=1000000:return self.error(400,"Revisá nombre, color y tarifa de entrega.","validation_error")
                    db.execute("UPDATE tenants SET name=?,tagline=?,color=?,delivery_fee=?,transfer_instructions=? WHERE id=?",(name,tag,color,fee,instructions,u["tenant_id"]))
                    audit_system(db,u["tenant_id"],u["id"],"store_settings_updated","tenant",u["tenant_id"],"Configuración del comercio actualizada.")
                    return self.json_out({"ok":True})
                match=re.fullmatch(r"/api/rider/tasks/([^/]+)/event",path)
                if match:
                    u=self.auth(db,("courier",))
                    if not u:return
                    oid=match.group(1);target=str(data.get("status",""));idem=str(data.get("event_id",""))
                    if not re.fullmatch(r"[A-Za-z0-9_-]{12,100}",idem):return self.error(400,"El identificador del evento no es válido.","validation_error")
                    if db.execute("SELECT 1 FROM order_events WHERE idempotency_key=?",(idem,)).fetchone():return self.json_out({"ok":True,"duplicate":True})
                    order=db.execute("SELECT * FROM orders WHERE id=? AND tenant_id=?",(oid,u["tenant_id"])).fetchone()
                    delivery=db.execute("SELECT * FROM deliveries WHERE order_id=? AND tenant_id=? AND courier_id=? AND active=1",(oid,u["tenant_id"],u["id"])).fetchone()
                    if not order or not delivery:return self.error(404,"La entrega no está asignada a tu cuenta.","task_not_found")
                    transitions={"assigned":{"accepted","incident"},"accepted":{"picked_up","incident"},"picked_up":{"on_route","incident"},"on_route":{"delivered","incident"},"incident":set(),"delivered":set()}
                    if target not in transitions.get(delivery["status"],set()):return self.error(409,"Ese paso no sigue el orden permitido de la entrega.","invalid_delivery_transition")
                    if target=="picked_up" and order["status"]!="ready":return self.error(409,"El comercio debe marcar el pedido como listo antes de recogerlo.","order_not_ready")
                    note=str(data.get("note","")).strip()[:300];now=stamp()
                    changed=db.execute("UPDATE deliveries SET status=?,active=?,sharing_location=CASE WHEN ? IN ('delivered','incident') THEN 0 ELSE sharing_location END,updated_at=? WHERE order_id=? AND tenant_id=? AND courier_id=? AND status=? AND active=1",(target,int(target not in ("delivered","incident")),target,now,oid,u["tenant_id"],u["id"],delivery["status"])).rowcount
                    if not changed:return self.error(409,"La entrega cambió en otro dispositivo. Actualizá la lista.","stale_delivery")
                    if target=="picked_up":db.execute("UPDATE orders SET status='in_delivery',updated_at=? WHERE id=? AND tenant_id=? AND status='ready'",(now,oid,u["tenant_id"]))
                    if target=="delivered":
                        db.execute("UPDATE orders SET status='delivered',updated_at=? WHERE id=? AND tenant_id=?",(now,oid,u["tenant_id"]))
                        if order["payment_method"]=="cash" and data.get("payment_collected") is True:
                            db.execute("UPDATE orders SET payment_state='paid_cash' WHERE id=? AND tenant_id=? AND payment_state='pending_cash'",(oid,u["tenant_id"]))
                            audit(db,u["tenant_id"],oid,u["id"],"cash_collected","pending_cash","paid_cash","El rider confirmó el efectivo.")
                    audit(db,u["tenant_id"],oid,u["id"],"delivery_status",delivery["status"],target,note or "Actualización del repartidor.",idem)
                    return self.json_out({"ok":True,"status":target})
                if path in ("/api/rider/location/start","/api/rider/location/stop"):
                    u=self.auth(db,("courier",))
                    if not u:return
                    oid=str(data.get("order_id",""))
                    d=db.execute("SELECT status,active FROM deliveries WHERE order_id=? AND tenant_id=? AND courier_id=?",(oid,u["tenant_id"],u["id"])).fetchone()
                    if not d or not d["active"] or d["status"]!="on_route":return self.error(409,"El GPS solo se puede activar durante una ruta activa.","location_not_active")
                    sharing=1 if path.endswith("/start") else 0
                    db.execute("UPDATE deliveries SET sharing_location=?,updated_at=? WHERE order_id=? AND tenant_id=?",(sharing,stamp(),oid,u["tenant_id"]))
                    return self.json_out({"ok":True,"sharing_location":bool(sharing)})
                if path=="/api/rider/location":
                    u=self.auth(db,("courier",))
                    if not u:return
                    oid=str(data.get("order_id",""))
                    try:lat=float(data["latitude"]);lon=float(data["longitude"]);accuracy=float(data.get("accuracy",0))
                    except (KeyError,TypeError,ValueError):return self.error(400,"Coordenadas no válidas.","validation_error")
                    if not (-90<=lat<=90 and -180<=lon<=180 and 0<=accuracy<=10000):return self.error(400,"Coordenadas fuera del rango permitido.","validation_error")
                    d=db.execute("SELECT status,sharing_location FROM deliveries WHERE order_id=? AND tenant_id=? AND courier_id=? AND active=1",(oid,u["tenant_id"],u["id"])).fetchone()
                    if not d or d["status"]!="on_route" or not d["sharing_location"]:return self.error(409,"La ubicación solo se guarda si el repartidor activa compartir durante su ruta.","location_not_active")
                    now=stamp()
                    db.execute("INSERT INTO locations(tenant_id,order_id,courier_id,latitude,longitude,accuracy,recorded_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",(u["tenant_id"],oid,u["id"],lat,lon,accuracy,now,int(time.time())+21600))
                    db.execute("DELETE FROM locations WHERE expires_at<?",(int(time.time()),))
                    return self.json_out({"ok":True,"recorded_at":now})
            return self.error(404,"Ruta API no encontrada.","not_found")
        except ValueError as exc:
            return self.error(400,str(exc),"invalid_request")
        except sqlite3.IntegrityError as exc:
            sys.stderr.write("Integrity: %s\n"%exc)
            return self.error(409,"La operación entra en conflicto con el estado actual.","conflict")
        except Exception as exc:
            sys.stderr.write("POST error: %s\n"%exc)
            return self.error(500,"Ocurrió un error interno.","internal_error")

    def static(self,path):
        allowed={"","/","/index.html","/connected.css","/connected.js","/manifest.webmanifest","/sw.js","/icon.svg"}
        if path not in allowed:return self.error(404,"Archivo no encontrado.","not_found")
        rel="index.html" if path in ("","/") else path.lstrip("/")
        target=(ROOT/rel).resolve()
        if ROOT not in target.parents and target!=ROOT/"index.html":return self.error(404,"Archivo no encontrado.","not_found")
        if not target.is_file():return self.error(404,"Archivo no encontrado.","not_found")
        raw=target.read_bytes();mime=mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if target.suffix==".webmanifest":mime="application/manifest+json"
        if mime.startswith("text/") or mime in ("application/javascript","application/manifest+json"):mime+="; charset=utf-8"
        self.send_response(200);self.send_header("Content-Type",mime);self.send_header("Content-Length",str(len(raw)))
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Referrer-Policy","strict-origin-when-cross-origin")
        self.send_header("Content-Security-Policy","default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        if target.name=="sw.js":self.send_header("Service-Worker-Allowed","/")
        self.send_header("Cache-Control","no-cache");self.end_headers();self.wfile.write(raw)

def main():
    if HOST not in ("127.0.0.1","localhost","::1"):
        passwords=[os.environ.get("WHITE_ADMIN_PASSWORD",""),os.environ.get("WHITE_DISPATCHER_PASSWORD",""),os.environ.get("WHITE_COURIER_PASSWORD","")]
        if any(len(password)<12 or password=="Demo123!" for password in passwords) or os.environ.get("WHITE_COOKIE_SECURE")!="1":
            raise SystemExit("Al exponer fuera de localhost configura claves distintas de 12+ caracteres para los tres roles y WHITE_COOKIE_SECURE=1. No uses esta demo directamente en internet.")
    init_db()
    def cleanup_expired_locations():
        while True:
            time.sleep(300)
            try:
                with db_open() as cleanup_db:
                    cleanup_db.execute("DELETE FROM locations WHERE expires_at<?",(int(time.time()),))
            except Exception as exc:
                sys.stderr.write("Location cleanup failed: %s\n"%exc)
    threading.Thread(target=cleanup_expired_locations,daemon=True).start()
    server=ThreadingHTTPServer((HOST,PORT),App)
    print("White Software en http://%s:%d"% (HOST,PORT))
    print("Base local: %s"%DB_PATH)
    print("MVP de demostración. Antes de internet: HTTPS, credenciales propias, revisión de seguridad y despliegue preparado.")
    try:server.serve_forever()
    except KeyboardInterrupt:print("\nServidor detenido.")
    finally:server.server_close()

if __name__=="__main__":
    main()

