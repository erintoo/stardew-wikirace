let pageTitles = [];
let pageTitlesError = "";
let playerNameEdited = false;
let currentRoomCode = "";
let currentPlayerId = "";
let currentRoomState = null;
let currentArticleTitle = "";
let requestedArticleTitle = "";
let articleRequestId = 0;
let unsubscribeFromRoom = null;

function show(id) {
  document
    .querySelectorAll(".screen")
    .forEach((screen) => screen.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function setLobbyMessage(message) {
  document.getElementById("lobby-message").textContent = message;
}

function setGameMessage(message) {
  document.getElementById("game-message").textContent = message;
}

function chooseRandomPage(excludedPage) {
  const choices = pageTitles.filter((title) => title !== excludedPage);
  if (choices.length === 0) {
    setLobbyMessage("There are no other wiki pages to choose from.");
    return "";
  }
  return choices[Math.floor(Math.random() * choices.length)];
}

async function loadArticle(title) {
  const requestId = ++articleRequestId;
  requestedArticleTitle = title;
  let article;
  try {
    article = await GameApi.getArticle(title);
  } catch (error) {
    if (requestId !== articleRequestId) return;
    requestedArticleTitle = "";
    throw error;
  }
  if (requestId !== articleRequestId) return;
  if (!article || typeof article.html !== "string" || !article.html) {
    requestedArticleTitle = "";
    throw new Error("The server did not return article content.");
  }

  document.getElementById("wiki-content").innerHTML = article.html;
  currentArticleTitle = article.title || title;
  requestedArticleTitle = "";
}

async function loadPageTitles() {
  try {
    const data = await GameApi.getPages();
    if (!Array.isArray(data.titles)) {
      throw new Error("The server returned an invalid page list.");
    }
    pageTitles = data.titles;
    if (pageTitles.length < 2) {
      throw new Error("At least two wiki pages are needed to start a game.");
    }
    pageTitlesError = "";

    document.getElementById("start-page").value = chooseRandomPage("");
    document.getElementById("end-page").value = chooseRandomPage(
      document.getElementById("start-page").value,
    );
  } catch (error) {
    pageTitlesError = error.message;
    setLobbyMessage(pageTitlesError);
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

function renderPlayers(state) {
  const playerLists = [
    document.getElementById("lobby-players"),
    document.getElementById("game-players"),
  ];

  playerLists.forEach((list) => {
    list.replaceChildren();
    state.players.forEach((player) => {
      const item = document.createElement("li");
      const currentPage = player.currentPage
        ? ` — ${player.currentPage} (${player.clicks} clicks)`
        : "";
      item.textContent = `${player.name}${currentPage}`;
      list.append(item);
    });
  });
}

function renderRoomState(state) {
  if (
    !state ||
    typeof state.roomCode !== "string" ||
    !Array.isArray(state.players)
  ) {
    throw new Error("The server returned an invalid room state.");
  }

  currentRoomState = state;
  currentRoomCode = state.roomCode;

  const codeElement = document.getElementById("lobby-code");
  codeElement.dataset.code = currentRoomCode;
  codeElement.textContent =
    document.getElementById("toggle-code").getAttribute("aria-pressed") ===
    "true"
      ? "••••"
      : currentRoomCode;

  renderPlayers(state);

  const player = state.players.find((item) => item.id === currentPlayerId);
  if (!player) {
    throw new Error("Your player is missing from the room state.");
  }

  const startButton = document.getElementById("start");
  startButton.disabled =
    state.status !== "lobby" || state.hostPlayerId !== currentPlayerId;

  if (state.startPage) {
    document.getElementById("start-page").value = state.startPage;
  }
  if (state.targetPage) {
    document.getElementById("end-page").value = state.targetPage;
  }

  if (state.status === "lobby") {
    articleRequestId++;
    currentArticleTitle = "";
    requestedArticleTitle = "";
    document.getElementById("wiki-content").replaceChildren();
    show("lobby");
    return;
  }

  if (state.status !== "playing" && state.status !== "finished") {
    throw new Error("The server returned an unsupported room status.");
  }

  show("wiki");
  document.getElementById("clicks").textContent = `Clicks: ${player.clicks}`;
  document.getElementById("target-page").textContent = state.targetPage || "";

  if (
    player.currentPage &&
    player.currentPage !== currentArticleTitle &&
    player.currentPage !== requestedArticleTitle
  ) {
    loadArticle(player.currentPage).catch((error) =>
      setGameMessage(error.message),
    );
  }

  if (state.status === "finished") {
    const winner = state.players.find(
      (item) => item.id === state.winnerPlayerId,
    );
    setGameMessage(
      winner
        ? `${winner.name} reached ${state.targetPage}!`
        : "The game has finished.",
    );
  } else {
    setGameMessage("");
  }
}

function connectToRoom() {
  if (unsubscribeFromRoom) unsubscribeFromRoom();
  unsubscribeFromRoom = GameApi.subscribeToRoom(
    currentRoomCode,
    currentPlayerId,
    (state) => {
      try {
        renderRoomState(state);
      } catch (error) {
        setLobbyMessage(error.message);
        setGameMessage(error.message);
      }
    },
    (error) => {
      setLobbyMessage(error.message);
      setGameMessage(error.message);
    },
  );
}

document.getElementById("make-lobby").addEventListener("click", async () => {
  const button = document.getElementById("make-lobby");
  button.disabled = true;
  show("lobby");
  setLobbyMessage("Connecting to the game server…");

  try {
    const playerName =
      document.getElementById("player-name").value.trim() || "Unnamed player";
    const requestedRoomCode = new URLSearchParams(window.location.search).get(
      "room",
    );
    const result = requestedRoomCode
      ? await GameApi.joinRoom(requestedRoomCode, playerName)
      : await GameApi.createRoom(playerName);

    if (!result || !result.playerId || !result.state) {
      throw new Error("The server returned an incomplete room response.");
    }
    currentPlayerId = result.playerId;
    renderRoomState(result.state);
    connectToRoom();
    setLobbyMessage(pageTitlesError);
  } catch (error) {
    setLobbyMessage(error.message);
  } finally {
    button.disabled = false;
  }
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
  if (!currentRoomCode) {
    setLobbyMessage("Create or join a room before inviting players.");
    return;
  }

  const inviteUrl = new URL(window.location.href);
  inviteUrl.searchParams.set("room", currentRoomCode);
  inviteUrl.hash = "";
  try {
    await navigator.clipboard.writeText(inviteUrl.href);
    setLobbyMessage("Invite link copied.");
  } catch {
    setLobbyMessage(
      `Could not copy the invite link. Copy this URL: ${inviteUrl.href}`,
    );
  }
});

document.getElementById("start").addEventListener("click", async () => {
  const startPage = document.getElementById("start-page").value.trim();
  const targetPage = document.getElementById("end-page").value.trim();
  if (!currentRoomCode || !currentPlayerId) {
    setLobbyMessage("Create or join a room before starting the game.");
    return;
  }
  if (!pageTitles.includes(startPage) || !pageTitles.includes(targetPage)) {
    setLobbyMessage("Choose start and target pages from the suggestions.");
    return;
  }
  if (startPage === targetPage) {
    setLobbyMessage("Starting point and ending point must be different.");
    return;
  }

  const button = document.getElementById("start");
  button.disabled = true;
  try {
    const result = await GameApi.startGame(
      currentRoomCode,
      currentPlayerId,
      startPage,
      targetPage,
    );
    renderRoomState(result.state);
    setLobbyMessage("");
  } catch (error) {
    setLobbyMessage(error.message);
  } finally {
    button.disabled = currentRoomState?.hostPlayerId !== currentPlayerId;
  }
});

document
  .getElementById("wiki-content")
  .addEventListener("click", async (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    event.preventDefault();

    const href = link.getAttribute("href");
    if (!href || !href.startsWith("/") || href.startsWith("//")) return;

    try {
      const title = decodeURIComponent(href.slice(1)).replace(/_/g, " ");
      const result = await GameApi.submitMove(
        currentRoomCode,
        currentPlayerId,
        title,
      );
      renderRoomState(result.state);
    } catch (error) {
      setGameMessage(error.message);
    }
  });

const requestedRoomCode = new URLSearchParams(window.location.search).get(
  "room",
);
document.getElementById("make-lobby").textContent = requestedRoomCode
  ? "Join lobby"
  : "Make lobby";
loadPageTitles();
loadRandomPlayerName();
