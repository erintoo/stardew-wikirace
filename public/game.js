// game.js
function show(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

document.getElementById("make-lobby").onclick = () => {
  window.location.href = "lobby.html";
};
document.getElementById("start").onclick = () => show("wiki");

// game.js
const API = "https://stardewvalleywiki.com/mediawiki/api.php";
let clicks = 0;

function show(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

async function loadArticle(title) {
  const url =
    API +
    "?action=parse&format=json&prop=text&redirects=1&origin=*" +
    "&page=" +
    encodeURIComponent(title);
  const res = await fetch(url);
  const data = await res.json();
  document.getElementById("wiki-content").innerHTML = data.parse.text["*"];
}

document.getElementById("make-lobby").onclick = () => {
  history.pushState({}, "", "#lobby");
  show("lobby");
};

document.getElementById("start").onclick = () => {
  clicks = 0;
  show("wiki");
  loadArticle("Abigail");
};

document.getElementById("wiki-content").addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (!link) return;
  e.preventDefault(); // stop the browser leaving your page
  console.log(link.getAttribute("href")); // look at what the links really are
  const href = link.getAttribute("href");
  if (href && href.startsWith("/") && !href.includes(":")) {
    clicks++;
    document.getElementById("clicks").textContent = "Clicks: " + clicks;
    loadArticle(decodeURIComponent(href.slice(1)));
  }
});
