const rid = location.pathname.split("/").pop();
const box = document.querySelector("#box");
const saved = localStorage.getItem("theme") || "dark";
document.documentElement.dataset.theme = saved;
document.querySelector("#themeBtn").onclick = () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t; localStorage.setItem("theme", t);
};

function embedUrl(u) {
  let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
  if (m) return "https://www.youtube.com/embed/" + m[1];
  m = u.match(/open\.spotify\.com\/track\/(\w+)/);
  if (m) return "https://open.spotify.com/embed/track/" + m[1];
  if (/soundcloud\.com/.test(u)) return "https://w.soundcloud.com/player/?url=" + encodeURIComponent(u);
  return null;
}

(async () => {
  const res = await fetch("/api/reviews/" + rid);
  if (!res.ok) { box.textContent = "Рецензия не найдена"; return; }
  const r = await res.json();
  document.title = r.title;
  box.replaceChildren();
  const h = document.createElement("h2"); h.textContent = r.title;
  const a = document.createElement("p"); a.textContent = r.artist;
  const s = document.createElement("span"); s.className = "score"; s.textContent = r.score;
  box.append(h, a, s);
  if (r.cover) { const i = document.createElement("img"); i.src = "/uploads/" + r.cover; i.className = "big"; box.append(i); }
  const t = document.createElement("p"); t.textContent = r.text || ""; t.style.whiteSpace = "pre-wrap"; box.append(t);
  if (r.tags && r.tags.length) {
    const d = document.createElement("div");
    r.tags.forEach(x => { const c = document.createElement("a"); c.className = "chip"; c.href = "/?tag=" + encodeURIComponent(x); c.textContent = "#" + x; d.append(c); });
    box.append(d);
  }
  if (r.link) {
    const e = embedUrl(r.link);
    if (e) { const f = document.createElement("iframe"); f.src = e; f.className = "player"; f.allow = "autoplay; encrypted-media"; box.append(f); }
    else { const l = document.createElement("a"); l.href = r.link; l.target = "_blank"; l.textContent = "▶ Слушать"; box.append(l); }
  }
})();