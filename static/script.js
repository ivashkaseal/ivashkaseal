const $ = s => document.querySelector(s);
const QUOTES = ["Опять 10/10?", "Слушаю, оцениваю, пишу.", "Оценка — это состояние души.",
  "Без цифр, только вайб.", "Это не трек, это диагноз.", "Нет смысла/смысла."];
let ALL = [], IS_ADMIN = false, TAB = "all", TAG = new URLSearchParams(location.search).get("tag") || "";

// ---------- тема ----------
document.documentElement.dataset.theme = localStorage.getItem("theme") || "dark";
$("#themeBtn").onclick = () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t; localStorage.setItem("theme", t);
};

// ---------- вход ----------
async function checkMe() {
  IS_ADMIN = (await (await fetch("/api/me")).json()).admin;
  $("#authBtn").textContent = IS_ADMIN ? "Выйти" : "Войти";
  $("#formCard").hidden = !IS_ADMIN;
}
$("#authBtn").onclick = async () => {
  if (IS_ADMIN) { await fetch("/api/logout", {method: "POST"}); }
  else {
    const password = prompt("Пароль автора:");
    if (password === null) return;
    const r = await fetch("/api/login", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({password})});
    if (!r.ok) alert("Неверный пароль");
  }
  await checkMe(); render();
};

// ---------- утилиты ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function dominantColor(img, cb) {
  const run = () => {
    try {
      const c = document.createElement("canvas"); c.width = c.height = 8;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0, 8, 8);
      const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; n++; }
      cb(`rgb(${r/n|0},${g/n|0},${b/n|0})`);
    } catch (e) {}
  };
  img.complete ? run() : img.addEventListener("load", run);
}
async function api(url, method, body) {
  const r = await fetch(url, {method, headers: body ? {"Content-Type": "application/json"} : {}, body: body ? JSON.stringify(body) : undefined});
  if (!r.ok) alert((await r.json()).error || "Ошибка");
  return r.ok;
}
async function uploadCover(id, file) {
  const fd = new FormData(); fd.append("cover", file);
  const r = await fetch(`/api/reviews/${id}/cover`, {method: "POST", body: fd});
  if (!r.ok) alert((await r.json()).error || "Ошибка");
  loadAll();
}

// ---------- карточка ----------
function card(r) {
  const d = el("div", "review");
  const cw = el("div", "cover"), img = el("img", "c");
  if (r.cover) { img.src = "/uploads/" + r.cover; dominantColor(img, col => { d.style.borderColor = col; d.style.boxShadow = `0 0 14px ${col}`; }); }
  cw.append(img);
  const b = el("div", "body");
  const t = el("a", "", r.title); t.href = "/review/" + r.id; t.style.fontWeight = "700";
  b.append(t, el("br"), el("small", "", r.artist), el("p", "", r.text || ""), el("span", "score", r.score));
  if (r.num !== null && r.num !== undefined) b.append(el("small", "", `  ≈ ${(r.num*10).toFixed(1)}/10`));
  const tags = el("div");
  (r.tags || []).forEach(x => { const c = el("span", "chip", "#" + x); c.onclick = () => { TAG = x; render(); }; tags.append(c); });
  b.append(tags);
  const acts = el("div", "acts");
  if (r.link) { const a = el("a", "btn", "▶"); a.href = "/review/" + r.id; acts.append(a); }
  if (IS_ADMIN) {
    const e = el("button", "", "✏️"); e.onclick = () => editReview(r);
    const x = el("button", "", "🗑"); x.onclick = async () => { if (confirm("Удалить «" + r.title + "»?")) { await api("/api/reviews/" + r.id, "DELETE"); loadAll(); } };
    const f = el("input"); f.type = "file"; f.accept = "image/*"; f.onchange = () => uploadCover(r.id, f.files[0]);
    acts.append(e, x, f);
    d.addEventListener("dragover", ev => { ev.preventDefault(); d.classList.add("dragover"); });
    d.addEventListener("dragleave", () => d.classList.remove("dragover"));
    d.addEventListener("drop", ev => { ev.preventDefault(); d.classList.remove("dragover"); if (ev.dataTransfer.files[0]) uploadCover(r.id, ev.dataTransfer.files[0]); });
  }
  b.append(acts);
  d.append(cw, b);
  return d;
}
async function editReview(r) {
  const title = prompt("Название:", r.title); if (title === null) return;
  const artist = prompt("Исполнитель:", r.artist); if (artist === null) return;
  const score = prompt("Оценка:", r.score); if (score === null) return;
  const text = prompt("Текст:", r.text || ""); if (text === null) return;
  const tags = prompt("Теги (через пробел):", (r.tags || []).join(" ")); if (tags === null) return;
  const link = prompt("Ссылка:", r.link || ""); if (link === null) return;
  const bonus = confirm("Это Bonus? (ОК = да)");
  if (await api("/api/reviews/" + r.id, "PUT", {title, artist, score, text, tags, link, bonus})) loadAll();
}

// ---------- фильтры ----------
function filtered() {
  const q = $("#search").value.toLowerCase(), a = $("#artistSel").value;
  return ALL.filter(r =>
    (TAB === "all" || (TAB === "bonus") === !!r.bonus) &&
    (!a || r.artist === a) &&
    (!TAG || (r.tags || []).includes(TAG)) &&
    (!q || (r.title + " " + r.artist + " " + (r.text || "")).toLowerCase().includes(q)));
}
function render() {
  const list = filtered();
  $("#reviews").replaceChildren(...list.map(card));
  $("#top").replaceChildren(...list.map(r => el("li", "", `${r.score} — ${r.title} (${r.artist})`)));
  const at = $("#activeTag");
  at.hidden = !TAG; at.textContent = TAG ? "#" + TAG + " ✕" : ""; at.onclick = () => { TAG = ""; render(); };
}
function fillArtists() {
  const cur = $("#artistSel").value, set = [...new Set(ALL.map(r => r.artist))].sort();
  $("#artistSel").replaceChildren(new Option("Все исполнители", ""), ...set.map(a => new Option(a, a)));
  $("#artistSel").value = set.includes(cur) ? cur : "";
}

// ---------- статистика ----------
async function loadStats() {
  const s = await (await fetch("/api/stats")).json(), box = $("#stats");
  box.replaceChildren();
  const k = el("div", "kpis");
  [["Всего", s.total], ["10/10", s.tens], ["Bonus", s.bonus],
   ["Средняя (числ.)", s.avg === null ? "—" : s.avg + "/10"],
   ["Топ-автор", s.top_artist ? `${s.top_artist[0]} (${s.top_artist[1]})` : "—"]]
    .forEach(([n, v]) => { const d = el("div", "kpi"); d.append(el("b", "", String(v)), el("span", "", n)); k.append(d); });
  box.append(k);
  const max = Math.max(1, ...s.artists.map(a => a[1]));
  s.artists.forEach(([n, c]) => { const bar = el("div", "bar"), i = el("div", "", `${n}: ${c}`); i.style.width = Math.max(12, c / max * 100) + "%"; bar.append(i); box.append(bar); });
  const tg = el("div"); s.tags.forEach(([t, c]) => { const ch = el("span", "chip", `#${t} ${c}`); ch.onclick = () => { TAG = t; render(); }; tg.append(ch); });
  box.append(tg);
}

// ---------- загрузка ----------
async function loadAll() {
  ALL = await (await fetch("/api/top?sort=" + $("#sortSel").value)).json();
  fillArtists(); render(); loadStats();
}

// ---------- события ----------
$("#search").oninput = render;
$("#artistSel").onchange = render;
$("#sortSel").onchange = loadAll;
$("#randBtn").onclick = async () => { const r = await (await fetch("/api/random")).json(); if (r.id) location.href = "/review/" + r.id; };
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach(x => x.classList.remove("on"));
  b.classList.add("on"); TAB = b.dataset.tab; render();
});

// форма: drag&drop + предпросмотр
const drop = $("#drop"), ci = $("#coverInput");
function showPrev() { const f = ci.files[0]; if (f) { $("#preview").src = URL.createObjectURL(f); $("#preview").hidden = false; } }
ci.onchange = showPrev;
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); ci.files = e.dataTransfer.files; showPrev(); });
$("#form").addEventListener("submit", async e => {
  e.preventDefault();
  const res = await fetch("/api/reviews", {method: "POST", body: new FormData(e.target)});
  if (res.ok) { e.target.reset(); $("#preview").hidden = true; loadAll(); }
  else alert((await res.json()).error);
});

// автор
function newQuote() { $("#quote").textContent = QUOTES[Math.random() * QUOTES.length | 0]; }
$("#toggle").onclick = () => { newQuote(); $("#author").classList.toggle("open"); };
newQuote(); setTimeout(() => $("#author").classList.add("open"), 800);
setInterval(newQuote, 12000);

checkMe().then(loadAll);