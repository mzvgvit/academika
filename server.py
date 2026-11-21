#!/usr/bin/env python3
"""«Академика» — сервер сайта с онлайн-записью.

Запуск:  python3 server.py          # http://localhost:8080
Настройки: config.json (SMTP для отправки писем).

/api/booking  POST — записать на приём:
  письмо → notify_email (почта клиники), копия с подтверждением → почта клиента.
  Если SMTP не настроен, письмо кладётся в outbox/ (можно переслать вручную).
/api/slots    GET ?date=YYYY-MM-DD — свободное время на дату.
"""
import json, os, sqlite3, smtplib, ssl, threading, time
from datetime import datetime, timedelta
from email.message import EmailMessage
from email.utils import formataddr
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, "site")
DB = os.path.join(ROOT, "data", "bookings.db")
OUTBOX = os.path.join(ROOT, "outbox")
CONFIG = os.path.join(ROOT, "config.json")

def cfg():
    if os.path.exists(CONFIG):
        return json.load(open(CONFIG, encoding="utf-8"))
    return {}

CLINIC = {
    "name": "НИК «Академика»",
    "phone": "+7 (495) 120-02-62",
    "email": "info@academicals.ru",
}
# Рабочие слоты приёма: Пн–Вс 9:00–19:30, шаг 90 мин (50 минут приём + перерыв)
SLOTS = ["9:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:00"]
MAX_HORIZON_DAYS = 60  # запись не дальше чем на 60 дней вперёд

def db():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    con = sqlite3.connect(DB)
    con.execute("""CREATE TABLE IF NOT EXISTS bookings(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created TEXT, date TEXT, time TEXT, who TEXT,
        service TEXT, age TEXT, name TEXT, phone TEXT, email TEXT, comment TEXT,
        emailed TEXT)""")
    try:  # миграция: поле doctor для уже созданной таблицы
        con.execute("ALTER TABLE bookings ADD COLUMN doctor TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    con.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_bookings_slot ON bookings(date, time)")
    return con

def booked(date):
    con = db()
    rows = con.execute("SELECT time FROM bookings WHERE date=?", (date,)).fetchall()
    con.close()
    return {r[0] for r in rows}

def save(**kw):
    con = db()
    cur = con.execute(
        "INSERT INTO bookings(created,date,time,who,service,age,name,phone,email,comment,emailed,doctor)"
        " VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        (datetime.now().isoformat(timespec="seconds"), kw["date"], kw["time"], kw["who"],
         kw["service"], kw["age"], kw["name"], kw["phone"], kw["email"], kw["comment"], "no",
         kw.get("doctor", "")))
    con.commit()
    bid = cur.lastrowid
    con.close()
    return bid

def render(bid, b):
    c = cfg()
    body = [
        f"Новая запись №{bid} на сайт «Академика»",
        "",
        f"Дата и время: {b['date']} в {b['time']} (запись для: {b['who']})",
        f"Услуга: {b['service']}",
        f"Врач (если указан): {b.get('doctor') or 'не выбран'}",
        f"Возраст пациента: {b['age']}",
        f"Имя: {b['name']}",
        f"Телефон: {b['phone']}",
        f"E-mail: {b['email'] or '—'}",
        f"Комментарий: {b['comment'] or '—'}",
        "",
        f"Создано: {b['created']}",
        "Ответьте клиенту: подтвердите время или предложите другое.",
    ]
    to_client = None
    if b.get("email"):
        to_client = EmailMessage()
        to_client["From"] = formataddr((CLINIC["name"], c.get("from_email", CLINIC["email"])))
        to_client["To"] = b["email"]
        to_client["Subject"] = f"Вы записаны: {b['date']} в {b['time']} — клиника «Академика»"
        to_client.set_content(
            f"Здравствуйте, {b['name']}!\n\n"
            f"Вы записаны на консультацию в клинику «Академика»:\n"
            f"  Дата: {b['date']}\n  Время: {b['time']}\n  Специалист: {b['service']}\n\n"
            f"Администратор свяжется с вами по телефону {b['phone']} и подтвердит запись.\n"
            f"С собой возьмите паспорт и СНИЛС (для ребёнка — документ опекуна, ребёнок присутствует).\n"
            f"Если есть прежние заключения и список принимаемых препаратов — возьмите их.\n\n"
            f"Адрес: г. Москва, ул. Трубная 29 с. 6\n"
            f"Телефон: {CLINIC['phone']}\n\n"
            f"Если время не подходит — просто ответьте на это письмо.")
    return "\n".join(body), to_client

def send_mail(msg: EmailMessage):
    c = cfg()
    host = c.get("smtp_host")
    if not host:
        return False, "smtp not configured"
    try:
        ctx = ssl.create_default_context()
        port = int(c.get("smtp_port", 587))
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=ctx) as s:
                s.login(c["smtp_user"], c["smtp_pass"])
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port) as s:
                s.starttls(context=ctx)
                s.login(c["smtp_user"], c["smtp_pass"])
                s.send_message(msg)
        return True, "sent"
    except Exception as e:
        return False, repr(e)

def to_outbox(tag, msg):
    os.makedirs(OUTBOX, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    with open(os.path.join(OUTBOX, f"{ts}-{tag}.eml"), "wb") as f:
        f.write(bytes(msg))
    return f"{ts}-{tag}.eml"

def deliver(bid, text, to_client):
    sent = []
    c = cfg()
    clinic_msg = EmailMessage()
    clinic_msg["From"] = formataddr(("Сайт «Академика»", c.get("from_email", "site@academicals.ru")))
    clinic_msg["To"] = c.get("notify_email") or CLINIC["email"]
    clinic_msg["Subject"] = f"Новая запись №{bid} — «Академика»"
    clinic_msg.set_content(text)
    ok, why = send_mail(clinic_msg)
    sent.append((f"clinic→{clinic_msg['To']}", ok, why))
    if not ok:
        sent.append(("clinic outbox", True, to_outbox(f"booking-{bid}", clinic_msg)))
    if to_client is not None:
        ok2, why2 = send_mail(to_client)
        sent.append((f"client→{to_client['To']}", ok2, why2))
        if not ok2:
            sent.append(("client outbox", True, to_outbox(f"confirm-{bid}", to_client)))
    con = db()
    con.execute("UPDATE bookings SET emailed=? WHERE id=?", ("yes" if all(o for _, o, _ in sent) else "outbox", bid))
    con.commit()
    con.close()
    return sent

def free_slots(date_str):
    """Свободные слоты на дату: занятые удалены; для сегодняшнего дня
    вычтены прошедшие и ближайший час (чтобы не продавать ушедшее время)."""
    now = datetime.now()
    slots = list(SLOTS)
    if date_str == now.strftime("%Y-%m-%d"):
        limit = now + timedelta(minutes=60)
        def ok(t):
            h, m = t.split(":")
            return datetime(now.year, now.month, now.day, int(h), int(m)) >= limit
        slots = [s for s in SLOTS if ok(s)]
    busy = booked(date_str)
    return [s for s in slots if s not in busy]

def next_free_date():
    now = datetime.now()
    for i in range(0, 15):
        d = (now + timedelta(days=i)).strftime("%Y-%m-%d")
        if free_slots(d):
            return d
    return None

def valid(d):
    need = ["date", "time", "who", "service", "age", "name", "phone"]
    for k in need:
        if not str(d.get(k, "")).strip():
            return f"не заполнено поле: {k}"
    if not d.get("consent"):
        return "нужно согласие на обработку данных"
    try:
        dd = datetime.strptime(d["date"], "%Y-%m-%d")
    except ValueError:
        return "неверная дата"
    if dd.date() < datetime.now().date():
        return "дата в прошлом"
    if (dd.date() - datetime.now().date()).days > MAX_HORIZON_DAYS:
        return "дата слишком далеко — запись открыта на 60 дней"
    if d["time"] not in SLOTS:
        return "неверный слот"
    if d["time"] not in free_slots(d["date"]):
        return "это время недоступно, выберите другое"
    phone = "".join(ch for ch in d["phone"] if ch.isdigit())
    if len(phone) < 10:
        return "проверьте телефон"
    if d.get("email") and "@" not in d["email"]:
        return "проверьте e-mail"
    return None

# Заголовки безопасности ответа (см. аудит security-*)
SEC_HEADERS = [
    ("X-Frame-Options", "SAMEORIGIN"),
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
    ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
]

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "webserver"  # не раскрываем стек (security-info-disclosure)
    sys_version = ""

    def log_message(self, fmt, *a):
        print("[%s] %s" % (datetime.now().strftime("%H:%M:%S"), fmt % a))

    def _sec(self):
        for k, v in SEC_HEADERS:
            self.send_header(k, v)

    def _json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self._sec()
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path == "/api/slots":
            q = dict(p.split("=", 1) for p in query.split("&") if "=" in p)
            date = q.get("date", "")
            try:
                datetime.strptime(date, "%Y-%m-%d")
            except ValueError:
                return self._json(400, {"error": "bad date"})
            free = free_slots(date)
            return self._json(200, {"date": date, "slots": free, "next": next_free_date()})
        try:
            rel = os.path.relpath(os.path.normpath(os.path.join(SITE, path.lstrip("/"))), SITE)
        except ValueError:
            return self._json(400, {"error": "bad path"})
        if rel.startswith(".."):
            return self._json(403, {"error": "forbidden"})
        fp = os.path.join(SITE, rel if rel != "." else "index.html")
        if not os.path.exists(fp):
            nf = os.path.join(SITE, "404.html")
            self.send_response(404)
            if os.path.exists(nf):
                body = open(nf, "rb").read()
                ctype = "text/html; charset=utf-8"
            else:
                body = b"<h1>404</h1>"
                ctype = "text/html; charset=utf-8"
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self._sec()
            self.end_headers()
            return self.wfile.write(body)
        ext = {"html": "text/html; charset=utf-8", "css": "text/css", "js": "text/javascript",
               "svg": "image/svg+xml", "png": "image/png", "ico": "image/x-icon",
               "webp": "image/webp", "jpg": "image/jpeg", "jpeg": "image/jpeg",
               "xml": "application/xml; charset=utf-8", "txt": "text/plain; charset=utf-8"}.get(
                   fp.rsplit(".", 1)[-1], "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", ext)
        self.send_header("Content-Length", str(os.path.getsize(fp)))
        self._sec()
        self.end_headers()
        with open(fp, "rb") as f:
            self.wfile.write(f.read())

    def do_POST(self):
        if self.path != "/api/booking":
            return self._json(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except (TypeError, ValueError):
            return self._json(400, {"error": "проверьте запрос"})
        if n < 0 or n > 100000:
            return self._json(400, {"error": "запрос слишком большой"})
        try:
            d = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
        except Exception:
            return self._json(400, {"error": "bad json"})
        if not isinstance(d, dict):
            return self._json(400, {"error": "bad json"})
        d["who"] = str(d.get("who", ""))[:40]
        d["service"] = str(d.get("service", ""))[:120]
        d["doctor"] = str(d.get("doctor", "")).strip()[:120]
        d["name"] = str(d.get("name", "")).strip()[:120]
        d["phone"] = str(d.get("phone", "")).strip()[:40]
        d["email"] = str(d.get("email", "")).strip()[:120]
        d["comment"] = str(d.get("comment", "")).strip()[:1000]
        err = valid(d)
        if err:
            return self._json(409, {"error": err})
        try:
            bid = save(**d)
        except sqlite3.IntegrityError:
            return self._json(409, {"error": "это время только что заняли, выберите другое"})
        d.setdefault("created", datetime.now().isoformat(timespec="seconds"))
        text, confirm = render(bid, d)
        def worker():
            try:
                deliver(bid, text, confirm)
            except Exception as e:
                print("deliver error:", repr(e))
        threading.Thread(target=worker, daemon=True).start()
        return self._json(200, {"ok": True, "id": bid,
                                "message": "Запись принята! Мы позвоним вам и подтвердим время."})

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("-p", "--port", type=int, default=8080)
    a = ap.parse_args()
    print(f"«Академика»: сайт на http://localhost:{a.port}  (Ctrl+C — выход)")
    if not cfg().get("smtp_host"):
        print("SMTP не настроен (config.json): письма будут копиться в outbox/")
    ThreadingHTTPServer(("0.0.0.0", a.port), H).serve_forever()
