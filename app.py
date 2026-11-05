import os, io, re, csv, json, uuid, random, time
from functools import wraps
from collections import Counter
from flask import (Flask, request, jsonify, send_from_directory, session, Response)

try:
    from PIL import Image
except ImportError:
    Image = None

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.secret_key = os.environ.get("SECRET_KEY", "change-me-please")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")   # смени пароль!

BASE = os.path.dirname(os.path.abspath(__file__))
UPLOADS = os.path.join(BASE, "uploads")
DATA = os.path.join(BASE, "reviews.json")
EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif")
os.makedirs(UPLOADS, exist_ok=True)


def load():
    if not os.path.exists(DATA):
        return []
    with open(DATA, encoding="utf-8") as f:
        return json.load(f)


def save(items):
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def admin_only(fn):
    @wraps(fn)
    def wrap(*a, **kw):
        if not session.get("admin"):
            return jsonify(error="Нужен вход автора"), 401
        return fn(*a, **kw)
    return wrap


def parse_tags(raw):
    if isinstance(raw, list):
        raw = " ".join(raw)
    return sorted({t.strip("#,; ").lower() for t in re.split(r"[\s,]+", raw or "") if t.strip("#,; ")})


def num_score(s):
    m = re.fullmatch(r"\s*(-?\d+(?:[.,]\d+)?)\s*/\s*(\d+(?:[.,]\d+)?)\s*", s or "")
    if not m:
        return None
    a, b = float(m.group(1).replace(",", ".")), float(m.group(2).replace(",", "."))
    return a / b if b > 0 else None


def save_cover(f):
    """Сохраняет обложку, сжимая до 600x600 (если есть Pillow)."""
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in EXT:
        return None
    name = uuid.uuid4().hex + ext
    path = os.path.join(UPLOADS, name)
    if Image and ext != ".gif":
        img = Image.open(f.stream)
        img.thumbnail((600, 600))
        if ext in (".jpg", ".jpeg") and img.mode != "RGB":
            img = img.convert("RGB")
        img.save(path)
    else:
        f.save(path)
    return name


def remove_cover(name):
    if name:
        p = os.path.join(UPLOADS, name)
        if os.path.exists(p):
            os.remove(p)


# ---------- страницы ----------
@app.route("/")
def index():
    return send_from_directory(os.path.join(BASE, "templates"), "index.html")


@app.route("/review/<rid>")
def review_page(rid):
    return send_from_directory(os.path.join(BASE, "templates"), "review.html")


@app.route("/uploads/<name>")
def uploads(name):
    return send_from_directory(UPLOADS, name)


# ---------- авторизация ----------
@app.route("/api/me")
def me():
    return jsonify(admin=bool(session.get("admin")))


@app.route("/api/login", methods=["POST"])
def login():
    pw = (request.get_json(silent=True) or {}).get("password", "")
    if pw == ADMIN_PASSWORD:
        session["admin"] = True
        return jsonify(ok=True)
    return jsonify(error="Неверный пароль"), 401


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify(ok=True)


# ---------- рецензии ----------
@app.route("/api/reviews", methods=["GET"])
def list_reviews():
    items = load()
    for r in items:
        r["num"] = num_score(r["score"])
    return jsonify(items)


@app.route("/api/reviews/<rid>", methods=["GET"])
def get_review(rid):
    for r in load():
        if r["id"] == rid:
            r["num"] = num_score(r["score"])
            return jsonify(r)
    return jsonify(error="Не найдено"), 404


@app.route("/api/reviews", methods=["POST"])
@admin_only
def add_review():
    title = request.form.get("title", "").strip()
    score = request.form.get("score", "").strip()
    if not title or not score:
        return jsonify(error="Нужны название и оценка"), 400
    cover = ""
    f = request.files.get("cover")
    if f and f.filename:
        cover = save_cover(f)
        if cover is None:
            return jsonify(error="Неверный формат картинки"), 400
    items = load()
    items.append(dict(
        id=uuid.uuid4().hex, title=title,
        artist=request.form.get("artist", "").strip() or "Kai Angel",
        score=score, text=request.form.get("text", "").strip(),
        cover=cover, bonus=request.form.get("bonus") == "on",
        tags=parse_tags(request.form.get("tags", "")),
        link=request.form.get("link", "").strip(),
        created=int(time.time())))
    save(items)
    return jsonify(ok=True)


@app.route("/api/reviews/<rid>", methods=["PUT"])
@admin_only
def edit_review(rid):
    d = request.get_json(silent=True) or {}
    items = load()
    for r in items:
        if r["id"] == rid:
            for k in ("title", "artist", "score", "text", "link"):
                if k in d:
                    r[k] = str(d[k]).strip()
            if "tags" in d:
                r["tags"] = parse_tags(d["tags"])
            if "bonus" in d:
                r["bonus"] = bool(d["bonus"])
            save(items)
            return jsonify(ok=True)
    return jsonify(error="Не найдено"), 404


@app.route("/api/reviews/<rid>", methods=["DELETE"])
@admin_only
def delete_review(rid):
    items = load()
    for r in items:
        if r["id"] == rid:
            remove_cover(r.get("cover"))
    save([r for r in items if r["id"] != rid])
    return jsonify(ok=True)


@app.route("/api/reviews/<rid>/cover", methods=["POST"])
@admin_only
def set_cover(rid):
    f = request.files.get("cover")
    if not f or not f.filename:
        return jsonify(error="Нет файла"), 400
    name = save_cover(f)
    if name is None:
        return jsonify(error="Неверный формат картинки"), 400
    items = load()
    for r in items:
        if r["id"] == rid:
            remove_cover(r.get("cover"))
            r["cover"] = name
    save(items)
    return jsonify(ok=True)


# ---------- топ, рандом, статистика, экспорт ----------
@app.route("/api/top")
def top():
    sort = request.args.get("sort", "alpha")
    items = load()
    for r in items:
        r["num"] = num_score(r["score"])
    if sort == "title":
        items.sort(key=lambda r: r["title"].lower())
    elif sort == "date":
        items.sort(key=lambda r: r.get("created", 0), reverse=True)
    elif sort == "num":
        items.sort(key=lambda r: (r["num"] is None, -(r["num"] or 0)))
    elif sort == "random":
        random.shuffle(items)
    else:
        items.sort(key=lambda r: (r["score"].lower(), r["title"].lower()))
    return jsonify(items)


@app.route("/api/random")
def rnd():
    items = load()
    return jsonify(id=random.choice(items)["id"]) if items else (jsonify(error="пусто"), 404)


@app.route("/api/stats")
def stats():
    items = load()
    nums = [n for n in (num_score(r["score"]) for r in items) if n is not None]
    artists = Counter(r["artist"] for r in items)
    tags = Counter(t for r in items for t in r.get("tags", []))
    return jsonify(
        total=len(items),
        tens=sum(1 for r in items if re.sub(r"\s", "", r["score"]) == "10/10"),
        bonus=sum(1 for r in items if r.get("bonus")),
        avg=round(sum(nums) / len(nums) * 10, 2) if nums else None,
        numeric=len(nums),
        top_artist=artists.most_common(1)[0] if artists else None,
        artists=artists.most_common(8),
        tags=tags.most_common(10))


@app.route("/api/export")
def export():
    items = load()
    if request.args.get("format") == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["title", "artist", "score", "bonus", "tags", "link", "text"])
        for r in items:
            w.writerow([r["title"], r["artist"], r["score"], r.get("bonus", False),
                        " ".join(r.get("tags", [])), r.get("link", ""), r.get("text", "")])
        return Response("\ufeff" + buf.getvalue(), mimetype="text/csv",
                        headers={"Content-Disposition": "attachment; filename=reviews.csv"})
    return Response(json.dumps(items, ensure_ascii=False, indent=2), mimetype="application/json",
                    headers={"Content-Disposition": "attachment; filename=reviews.json"})


if __name__ == "__main__":
    app.run(debug=True)