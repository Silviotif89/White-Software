import http.cookiejar
import json
import os
import secrets
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class WhiteSoftwareFlowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="white-software-test-")
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        cls.port = sock.getsockname()[1]
        sock.close()
        env = os.environ.copy()
        env["WHITESOFT_DATA"] = cls.temp.name
        env["WHITE_HOST"] = "127.0.0.1"
        env["WHITE_PORT"] = str(cls.port)
        cls.stderr_path = Path(cls.temp.name) / "server-stderr.log"
        cls.stderr_file = cls.stderr_path.open("w+", encoding="utf-8")
        cls.process = subprocess.Popen(
            [sys.executable, "server.py"], cwd=ROOT, env=env,
            stdout=subprocess.DEVNULL, stderr=cls.stderr_file
        )
        cls.base = "http://127.0.0.1:%d" % cls.port
        for _ in range(80):
            try:
                urllib.request.urlopen(cls.base + "/api/health", timeout=1)
                break
            except Exception:
                if cls.process.poll() is not None:
                    cls.stderr_file.flush()
                    raise RuntimeError(cls.stderr_path.read_text(encoding="utf-8"))
                time.sleep(0.15)
        else:
            raise RuntimeError("White Software server did not start.")
        cls.admin = cls.client()
        cls.rider = cls.client()

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        try:
            cls.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.process.kill()
        cls.stderr_file.close()
        cls.temp.cleanup()

    @classmethod
    def client(cls):
        jar = http.cookiejar.CookieJar()
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def request(self, client, path, body=None, expected=200, method=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(
            self.base + path, data=data,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method=method or ("POST" if body is not None else "GET")
        )
        try:
            response = client.open(req, timeout=4)
            status = response.status
            payload = json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            status = exc.code
            payload = json.loads(exc.read().decode())
        if status >= 500:
            self.__class__.stderr_file.flush()
            payload["server_log"] = self.__class__.stderr_path.read_text(encoding="utf-8")
        self.assertEqual(status, expected, payload)
        return payload

    def first_sse_event(self, client, path):
        req = urllib.request.Request(self.base + path, headers={"Accept": "text/event-stream"})
        stream = client.open(req, timeout=5)
        try:
            event = None
            while True:
                line = stream.readline().decode("utf-8").strip()
                if line.startswith("data: "):
                    event = json.loads(line[6:])
                if line == "" and event is not None:
                    return event
        finally:
            stream.close()

    def first_sse_event_type(self, client, path, event_type):
        req = urllib.request.Request(self.base + path, headers={"Accept": "text/event-stream"})
        stream = client.open(req, timeout=8)
        try:
            while True:
                line = stream.readline().decode("utf-8").strip()
                if line.startswith("data: "):
                    event = json.loads(line[6:])
                    if event.get("type") == event_type:
                        return event
        finally:
            stream.close()

    def test_end_to_end_order_roles_payments_gps_and_tenant_boundary(self):
        self.assertTrue(self.request(self.admin, "/api/health")["ok"])
        self.assertGreater(len(self.request(self.admin, "/api/storefront?slug=mercadito-la-esquina")["products"]), 0)
        for route, view in (("/admin.html", "admin"), ("/tienda.html", "tienda"), ("/seguimiento.html", "seguimiento")):
            page = urllib.request.urlopen(self.base + route, timeout=3).read().decode("utf-8")
            self.assertIn('data-view="%s"' % view, page)
        self.request(self.admin, "/api/admin/orders", expected=401)

        self.request(self.admin, "/api/orders", {
            "slug": "mercadito-la-esquina", "customer_name": "Cliente de prueba",
            "phone": "88880000", "address": "Reparto San Juan, Managua",
            "payment_method": "card", "idempotency_key": "card-test-00000001",
            "items": [{"product_id": "p-arroz", "quantity": 1}]
        }, expected=409)

        order_body = {
            "slug": "mercadito-la-esquina", "customer_name": "Cliente de prueba",
            "phone": "88880000", "address": "Reparto San Juan, Managua",
            "reference": "Casa de esquina", "payment_method": "transfer",
            "idempotency_key": "order-test-" + secrets.token_hex(12),
            "items": [{"product_id": "p-arroz", "quantity": 2}]
        }
        created = self.request(self.admin, "/api/orders", order_body, expected=201)
        duplicate = self.request(self.admin, "/api/orders", order_body)
        self.assertTrue(duplicate["duplicate"])
        self.assertEqual(created["order_id"], duplicate["order_id"])
        self.assertEqual(created["total"], 11400)
        tracking_path = "/api/tracking?token=" + created["tracking_token"]
        public_tracking = self.request(self.admin, tracking_path)
        self.assertEqual(public_tracking["order"]["status"], "received")
        self.assertNotIn("phone", public_tracking["order"])
        self.assertNotIn("tenant_id", public_tracking["order"])
        public_event = self.first_sse_event(self.admin, "/api/events?token=" + created["tracking_token"] + "&after=0")
        self.assertEqual(public_event["entity_id"], created["order_id"])

        self.request(self.admin, "/api/login", {"email": "admin@demo.white", "password": "Demo123!"})
        admin_event = self.first_sse_event(self.admin, "/api/events?after=0")
        self.assertIn("type", admin_event)
        self.request(self.admin, "/api/admin/orders/" + created["order_id"] + "/status", {"status": "confirmed"})
        self.request(self.admin, "/api/admin/orders/" + created["order_id"] + "/status", {"status": "preparing"})
        self.request(self.admin, "/api/admin/orders/" + created["order_id"] + "/assign", {"courier_id": 3})
        self.request(self.rider, "/api/login", {"email": "rider@demo.white", "password": "Demo123!"})
        self.request(self.rider, "/api/admin/orders", expected=403)
        assigned_event = self.first_sse_event_type(self.rider, "/api/events?after=0", "courier_assigned")
        self.assertEqual(assigned_event["entity_id"], created["order_id"])
        tasks = self.request(self.rider, "/api/rider/tasks")["tasks"]
        self.assertEqual(tasks[0]["id"], created["order_id"])
        self.request(self.rider, "/api/rider/tasks/" + created["order_id"] + "/event",
                     {"status": "accepted", "event_id": "evt-accept-" + secrets.token_hex(8)})
        self.request(self.rider, "/api/rider/tasks/" + created["order_id"] + "/event",
                     {"status": "picked_up", "event_id": "evt-pick-" + secrets.token_hex(8)}, expected=409)

        self.request(self.admin, "/api/admin/orders/" + created["order_id"] + "/status", {"status": "ready"})
        self.request(self.rider, "/api/rider/tasks/" + created["order_id"] + "/event",
                     {"status": "picked_up", "event_id": "evt-pick-" + secrets.token_hex(8)})
        self.request(self.rider, "/api/rider/tasks/" + created["order_id"] + "/event",
                     {"status": "on_route", "event_id": "evt-route-" + secrets.token_hex(8)})
        coordinate = {"order_id": created["order_id"], "latitude": 12.1364, "longitude": -86.2514, "accuracy": 18}
        self.request(self.rider, "/api/rider/location", coordinate, expected=409)
        self.request(self.rider, "/api/rider/location/start", {"order_id": created["order_id"]})
        self.request(self.rider, "/api/rider/location", coordinate)
        self.assertIsNotNone(self.request(self.admin, tracking_path)["location"])
        self.request(self.rider, "/api/rider/location/stop", {"order_id": created["order_id"]})
        self.assertIsNone(self.request(self.admin, tracking_path)["location"])
        self.request(self.rider, "/api/rider/tasks/" + created["order_id"] + "/event",
                     {"status": "delivered", "event_id": "evt-done-" + secrets.token_hex(8)})
        self.assertEqual(self.request(self.admin, tracking_path)["order"]["status"], "delivered")

        self.request(self.admin, "/api/admin/orders/" + created["order_id"] + "/payment",
                     {"note": "Verificado en registro bancario"})
        self.assertGreater(len(self.request(self.admin, "/api/admin/audit")["activity"]), 0)
        cash_order = self.request(self.admin, "/api/orders", {
            "slug": "mercadito-la-esquina", "customer_name": "Cliente efectivo",
            "phone": "88881111", "address": "Centro, Managua",
            "payment_method": "cash", "idempotency_key": "cash-test-" + secrets.token_hex(10),
            "items": [{"product_id": "p-arroz", "quantity": 1}]
        }, expected=201)
        cash_result = self.request(self.admin, "/api/admin/orders/" + cash_order["order_id"] + "/payment",
                                   {"note": "Revisión manual de efectivo"})
        self.assertEqual(cash_result["payment_state"], "paid_cash")

        database = Path(self.temp.name) / "white-software.sqlite3"
        db = sqlite3.connect(database)
        with db:
            now = "2026-01-01T00:00:00+00:00"
            db.execute("INSERT INTO tenants(id,slug,name,created_at) VALUES(?,?,?,?)",
                       ("tenant_other", "comercio-otro", "Otro comercio", now))
            salt = secrets.token_bytes(16)
            password = "Another123!"
            digest = __import__("hashlib").pbkdf2_hmac("sha256", password.encode(), salt, 240000).hex()
            db.execute("INSERT INTO users(tenant_id,name,email,role,password_hash,salt,created_at) VALUES(?,?,?,?,?,?,?)",
                       ("tenant_other", "Otro dueño", "otro@demo.white", "owner", digest, salt.hex(), now))
        db.close()
        other = self.client()
        self.request(other, "/api/login", {"email": "otro@demo.white", "password": "Another123!"})
        self.assertEqual(self.request(other, "/api/admin/orders")["orders"], [])
        self.request(other, "/api/admin/orders/" + created["order_id"] + "/status",
                     {"status": "cancelled"}, expected=404)

        manifest = urllib.request.urlopen(self.base + "/manifest.webmanifest")
        self.assertIn("manifest+json", manifest.headers.get("Content-Type", ""))
        self.assertIn('addeventlistener("fetch"', urllib.request.urlopen(self.base + "/sw.js").read().decode().lower())


if __name__ == "__main__":
    unittest.main()
