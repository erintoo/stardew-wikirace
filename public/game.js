const API = "https://stardewvalleywiki.com/mediawiki/api.php";
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let clicks = 0;
let pageTitles = [];
let targetPage = "";
let playerNameEdited = false;

function show(id) {
  document
    .querySelectorAll(".screen")
    .forEach((screen) => screen.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function setLobbyMessage(message) {
  document.getElementById("lobby-message").textContent = message;
}

function chooseRandomPage(excludedPage) {
  const choices = pageTitles.filter((title) => title !== excludedPage);
  if (choices.length === 0) {
    setLobbyMessage("There are no other wiki pages to choose from.");
    return "";
  }
  return choices[Math.floor(Math.random() * choices.length)];
}

function createRoomCode() {
  return Array.from(
    { length: 4 },
    () =>
      ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)],
  ).join("");
}

async function loadArticle(title) {
  const url =
    API +
    "?action=parse&format=json&prop=text&redirects=1&origin=*" +
    "&page=" +
    encodeURIComponent(title);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`The wiki returned ${response.status}.`);
  }
  const data = await response.json();
  const articleHtml = data.parse && data.parse.text && data.parse.text["*"];
  if (!articleHtml) {
    throw new Error("The wiki did not return that article.");
  }
  document.getElementById("wiki-content").innerHTML = articleHtml;
}

async function loadPageTitles() {
  try {
    const response = await fetch("../data/graph.json");
    if (!response.ok) {
      throw new Error(`Could not load wiki pages (${response.status}).`);
    }
    const graph = await response.json();
    pageTitles = Object.keys(graph);
    if (pageTitles.length < 2) {
      throw new Error("At least two wiki pages are needed to start a game.");
    }

    document.getElementById("start-page").value = chooseRandomPage("");
    document.getElementById("end-page").value = chooseRandomPage(
      document.getElementById("start-page").value,
    );
  } catch (error) {
    setLobbyMessage(
      `${error.message} Make sure the app is served with the data folder available.`,
    );
  }
}

function setupPageAutocomplete(inputId, suggestionsId) {
  const input = document.getElementById(inputId);
  const suggestions = document.getElementById(suggestionsId);
  const container = input.parentElement;
  let activeIndex = -1;

  function closeSuggestions() {
    suggestions.hidden = true;
    activeIndex = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function selectSuggestion(title) {
    input.value = title;
    closeSuggestions();
  }

  function updateSuggestions() {
    const query = input.value.trim().toLocaleLowerCase();
    const matches = query
      ? pageTitles
          .filter((title) => title.toLocaleLowerCase().includes(query))
          .slice(0, 8)
      : [];

    activeIndex = -1;
    suggestions.replaceChildren();
    matches.forEach((title, index) => {
      const option = document.createElement("li");
      option.id = `${inputId}-option-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.textContent = title;
      option.addEventListener("click", () => selectSuggestion(title));
      suggestions.append(option);
    });

    suggestions.hidden = matches.length === 0;
    input.setAttribute("aria-expanded", String(matches.length > 0));
  }

  input.addEventListener("input", updateSuggestions);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSuggestions();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.hidden) updateSuggestions();
      const options = suggestions.querySelectorAll('[role="option"]');
      if (options.length === 0) return;

      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      activeIndex = (activeIndex + direction + options.length) % options.length;
      options.forEach((option, index) => {
        option.setAttribute("aria-selected", String(index === activeIndex));
      });
      input.setAttribute("aria-activedescendant", options[activeIndex].id);
      options[activeIndex].scrollIntoView({ block: "nearest" });
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const activeOption = suggestions.querySelector(
        `[role="option"]:nth-child(${activeIndex + 1})`,
      );
      if (activeOption) selectSuggestion(activeOption.textContent);
    }
  });
  document.addEventListener("click", (event) => {
    if (!container.contains(event.target)) closeSuggestions();
  });

  return { closeSuggestions };
}

async function loadRandomPlayerName() {
  try {
    const response = await fetch("../src/stardew_filler_names.md");
    if (!response.ok) {
      throw new Error(`Could not load player names (${response.status}).`);
    }
    const markdown = await response.text();
    const names = markdown
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*-\s+(.+?)\s*$/))
      .filter(Boolean)
      .map((match) => match[1]);
    if (names.length === 0) {
      throw new Error("The player name list is empty.");
    }

    if (!playerNameEdited) {
      const name = names[Math.floor(Math.random() * names.length)];
      document.getElementById("player-name").value = name;
      document.getElementById("player-name-display").textContent = name;
    }
  } catch (error) {
    setLobbyMessage(error.message);
  }
}

document.getElementById("make-lobby").addEventListener("click", () => {
  show("lobby");
  history.pushState(
    {},
    "",
    `${window.location.pathname}${window.location.search}#lobby`,
  );
});

document.getElementById("player-name").addEventListener("input", (event) => {
  playerNameEdited = true;
  document.getElementById("player-name-display").textContent =
    event.target.value.trim() || "Unnamed player";
});

const startAutocomplete = setupPageAutocomplete(
  "start-page",
  "start-suggestions",
);
const endAutocomplete = setupPageAutocomplete("end-page", "end-suggestions");

document.getElementById("random-start").addEventListener("click", () => {
  startAutocomplete.closeSuggestions();
  const start = chooseRandomPage(document.getElementById("end-page").value);
  if (start) document.getElementById("start-page").value = start;
});

document.getElementById("random-end").addEventListener("click", () => {
  endAutocomplete.closeSuggestions();
  const end = chooseRandomPage(document.getElementById("start-page").value);
  if (end) document.getElementById("end-page").value = end;
});

document.getElementById("toggle-code").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const code = document.getElementById("lobby-code");
  const hidden = button.getAttribute("aria-pressed") !== "true";
  button.setAttribute("aria-pressed", String(hidden));
  button.textContent = hidden ? "Show" : "Hide";
  code.textContent = hidden ? "••••" : code.dataset.code;
});

document.getElementById("invite").addEventListener("click", async () => {
  const inviteUrl = new URL(window.location.href);
  inviteUrl.searchParams.set(
    "room",
    document.getElementById("lobby-code").dataset.code,
  );
  inviteUrl.hash = "lobby";
  try {
    await navigator.clipboard.writeText(inviteUrl.href);
    setLobbyMessage("Invite link copied.");
  } catch (error) {
    setLobbyMessage(
      `Could not copy the invite link. Copy this URL: ${inviteUrl.href}`,
    );
  }
});

document.getElementById("start").addEventListener("click", async () => {
  const startPage = document.getElementById("start-page").value.trim();
  targetPage = document.getElementById("end-page").value.trim();
  if (!pageTitles.includes(startPage) || !pageTitles.includes(targetPage)) {
    setLobbyMessage(
      "Choose a starting point and ending point from the wiki pages.",
    );
    return;
  }
  if (startPage === targetPage) {
    setLobbyMessage("Starting point and ending point must be different.");
    return;
  }

  clicks = 0;
  document.getElementById("clicks").textContent = "Clicks: 0";
  document.getElementById("target-page").textContent = targetPage;
  document.getElementById("game-message").textContent = "";
  show("wiki");
  try {
    await loadArticle(startPage);
  } catch (error) {
    document.getElementById("game-message").textContent = error.message;
  }
});

document
  .getElementById("wiki-content")
  .addEventListener("click", async (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href");
    if (href && href.startsWith("/") && !href.includes(":")) {
      clicks++;
      document.getElementById("clicks").textContent = "Clicks: " + clicks;
      try {
        const title = decodeURIComponent(href.slice(1)).replace(/_/g, " ");
        await loadArticle(title);
        if (title === targetPage) {
          document.getElementById("game-message").textContent =
            `You reached ${targetPage} in ${clicks} clicks!`;
        } else {
          document.getElementById("game-message").textContent = "";
        }
      } catch (error) {
        document.getElementById("game-message").textContent = error.message;
      }
    }
  });

const requestedRoomCode = new URLSearchParams(window.location.search).get(
  "room",
);
const roomCode = requestedRoomCode || createRoomCode();
const roomCodeElement = document.getElementById("lobby-code");
roomCodeElement.dataset.code = roomCode;
roomCodeElement.textContent = roomCode;
if (!requestedRoomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  history.replaceState({}, "", url);
}
if (window.location.hash === "#lobby") show("lobby");
loadPageTitles();
loadRandomPlayerName();
