(function () {
  async function request(path, options = {}) {
    const headers = { Accept: "application/json" };
    const requestOptions = { ...options, headers };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`/api${path}`, requestOptions);
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        `The server returned invalid JSON (HTTP ${response.status}).`,
      );
    }

    if (!response.ok) {
      const message =
        data && typeof data.error === "string"
          ? data.error
          : `The server returned ${response.status}.`;
      throw new Error(message);
    }

    return data;
  }

  function post(path, body) {
    return request(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  function subscribeToRoom(roomCode, playerId, onState, onError) {
    const url = new URL(
      `/api/rooms/${encodeURIComponent(roomCode)}/events`,
      window.location.href,
    );
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("playerId", playerId);

    const socket = new WebSocket(url);
    let intentionallyClosed = false;

    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        onError(new Error("The server sent an invalid room update."));
        return;
      }

      if (!message || message.type !== "room_state" || !message.state) {
        onError(new Error("The server sent an unsupported room update."));
        return;
      }
      onState(message.state);
    });

    socket.addEventListener("error", () => {
      onError(new Error("Could not connect to live room updates."));
    });

    socket.addEventListener("close", () => {
      if (!intentionallyClosed) {
        onError(new Error("The live room connection was closed."));
      }
    });

    return () => {
      intentionallyClosed = true;
      socket.close();
    };
  }

  window.GameApi = {
    getPages() {
      return request("/pages");
    },
    getArticle(title) {
      return request(`/articles?title=${encodeURIComponent(title)}`);
    },
    createRoom(playerName) {
      return post("/rooms", { playerName });
    },
    joinRoom(roomCode, playerName) {
      return post(`/rooms/${encodeURIComponent(roomCode)}/join`, {
        playerName,
      });
    },
    startGame(roomCode, playerId, startPage, targetPage) {
      return post(`/rooms/${encodeURIComponent(roomCode)}/start`, {
        playerId,
        startPage,
        targetPage,
      });
    },
    submitMove(roomCode, playerId, destination) {
      return post(`/rooms/${encodeURIComponent(roomCode)}/moves`, {
        playerId,
        destination,
      });
    },
    subscribeToRoom,
  };
})();
