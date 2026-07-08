(function () {
  "use strict";

  var STORAGE_KEY = "longbourn-state-v1";
  var TOKEN_STORAGE_KEY = "longbourn-github-token";
  var GITHUB_OWNER = "mikeertl";
  var GITHUB_REPO = "longbourn";
  var GITHUB_BRANCH = "main";
  var GITHUB_DATA_PATH = "data/current.json";
  var TIMES = ["10:30", "11:45", "13:00"];
  var WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var state = createEmptyState();
  var draftAvailability = {};

  var el = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    bindEvents();
    setDefaultMonth();
    var loadedFromHash = loadInitialState();
    loadStoredToken();
    renderAll();
    if (!loadedFromHash) {
      loadSharedState(true);
    }
  }

  function cacheElements() {
    [
      "monthInput",
      "venueInput",
      "createMonthButton",
      "addSlotButton",
      "slotsList",
      "githubTokenInput",
      "saveTokenButton",
      "loadSharedButton",
      "saveSharedButton",
      "sharedStatus",
      "playerNameInput",
      "availabilityGrid",
      "saveAvailabilityButton",
      "copyAvailabilityButton",
      "availabilityMessage",
      "importText",
      "importButton",
      "clearImportButton",
      "importStatus",
      "allocateButton",
      "summaryBar",
      "allocationList",
      "monthMessage",
      "copyMonthMessageButton",
      "shareWhatsAppButton",
      "copyStateLinkButton",
      "resetButton",
    ].forEach(function (id) {
      el[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    el.createMonthButton.addEventListener("click", createMonthFromForm);
    el.addSlotButton.addEventListener("click", addManualSlot);
    el.saveTokenButton.addEventListener("click", saveToken);
    el.loadSharedButton.addEventListener("click", function () {
      loadSharedState(false);
    });
    el.saveSharedButton.addEventListener("click", saveSharedState);
    el.saveAvailabilityButton.addEventListener("click", saveAvailability);
    el.copyAvailabilityButton.addEventListener("click", function () {
      copyText(el.availabilityMessage.value, "Availability reply copied");
    });
    el.importButton.addEventListener("click", importMessages);
    el.clearImportButton.addEventListener("click", function () {
      el.importText.value = "";
      setStatus("");
    });
    el.allocateButton.addEventListener("click", function () {
      allocate();
      saveAndRender();
    });
    el.copyMonthMessageButton.addEventListener("click", function () {
      copyText(el.monthMessage.value, "Month message copied");
    });
    el.shareWhatsAppButton.addEventListener("click", shareWhatsApp);
    el.copyStateLinkButton.addEventListener("click", function () {
      copyText(buildCleanAppLink(), "App link copied");
    });
    el.resetButton.addEventListener("click", resetApp);
    el.playerNameInput.addEventListener("input", updateAvailabilityMessage);
    el.venueInput.addEventListener("input", function () {
      state.venue = el.venueInput.value.trim() || "Longbourn";
      saveAndRender(false);
    });
  }

  function createEmptyState() {
    return {
      version: 1,
      month: "",
      venue: "Longbourn",
      slots: [],
      players: {},
      availability: {},
      allocations: {},
      changes: [],
    };
  }

  function setDefaultMonth() {
    var now = new Date();
    el.monthInput.value = now.getFullYear() + "-" + pad(now.getMonth() + 1);
  }

  function loadInitialState() {
    var hashState = readStateFromHash();
    var storedState = readStoredState();
    state = normalizeState(hashState || storedState || createEmptyState());
    if (!state.month) {
      state.month = el.monthInput.value;
    }
    el.monthInput.value = state.month;
    el.venueInput.value = state.venue || "Longbourn";
    return !!hashState;
  }

  function readStateFromHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    var encoded = params.get("state");
    if (!encoded) return null;
    try {
      var decoded = JSON.parse(base64UrlDecode(encoded));
      return decoded && decoded.type === "state" ? decoded.state : decoded;
    } catch (error) {
      console.warn("Could not read state from URL", error);
      return null;
    }
  }

  function readStoredState() {
    try {
      var stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn("Could not read local state", error);
      return null;
    }
  }

  function normalizeState(input) {
    var next = Object.assign(createEmptyState(), input || {});
    next.slots = Array.isArray(next.slots) ? next.slots : [];
    next.players = next.players || {};
    next.availability = next.availability || {};
    next.allocations = next.allocations || {};
    next.changes = Array.isArray(next.changes) ? next.changes : [];
    return next;
  }

  function loadStoredToken() {
    try {
      el.githubTokenInput.value =
        window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
    } catch (error) {
      console.warn("Could not read GitHub token", error);
    }
  }

  function saveToken() {
    try {
      window.localStorage.setItem(
        TOKEN_STORAGE_KEY,
        el.githubTokenInput.value.trim()
      );
      setSharedStatus("Token remembered in this browser.");
    } catch (error) {
      setSharedStatus("Could not remember token.");
      console.warn("Could not save GitHub token", error);
    }
  }

  function loadSharedState(silent) {
    setSharedStatus(silent ? "" : "Loading shared rota...");
    return fetchSharedState()
      .then(function (sharedState) {
        if (!sharedState) {
          if (!silent) setSharedStatus("No shared rota found yet.");
          return;
        }
        state = normalizeState(sharedState);
        saveState();
        renderAll();
        setSharedStatus("Loaded shared rota.");
      })
      .catch(function (error) {
        if (!silent) setSharedStatus("Could not load shared rota.");
        console.warn("Could not load shared rota", error);
      });
  }

  function fetchSharedState() {
    var relativeUrl = GITHUB_DATA_PATH + "?v=" + Date.now();
    var rawUrl =
      "https://raw.githubusercontent.com/" +
      GITHUB_OWNER +
      "/" +
      GITHUB_REPO +
      "/" +
      GITHUB_BRANCH +
      "/" +
      GITHUB_DATA_PATH +
      "?v=" +
      Date.now();

    return fetch(relativeUrl, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Relative fetch failed");
        return response.json();
      })
      .catch(function () {
        return fetch(rawUrl, { cache: "no-store" }).then(function (response) {
          if (!response.ok) return null;
          return response.json();
        });
      });
  }

  function saveSharedState() {
    var token = el.githubTokenInput.value.trim();
    if (!token) {
      setSharedStatus("Paste an organiser token before saving.");
      el.githubTokenInput.focus();
      return;
    }

    saveToken();
    setSharedStatus("Saving shared rota...");
    getGitHubFileSha(token)
      .then(function (sha) {
        var body = {
          message: "Update Longbourn shared rota",
          content: base64Encode(JSON.stringify(state, null, 2) + "\n"),
          branch: GITHUB_BRANCH,
        };
        if (sha) body.sha = sha;

        return fetch(gitHubContentsUrl(), {
          method: "PUT",
          headers: gitHubHeaders(token),
          body: JSON.stringify(body),
        });
      })
      .then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            throw new Error(text || "GitHub save failed");
          });
        }
        setSharedStatus("Saved shared rota to GitHub.");
        el.monthMessage.value = buildMonthMessage();
      })
      .catch(function (error) {
        setSharedStatus("Could not save. Check token permissions.");
        console.warn("Could not save shared rota", error);
      });
  }

  function getGitHubFileSha(token) {
    return fetch(gitHubContentsUrl() + "?ref=" + encodeURIComponent(GITHUB_BRANCH), {
      headers: gitHubHeaders(token),
      cache: "no-store",
    }).then(function (response) {
      if (response.status === 404) return null;
      if (!response.ok) {
        return response.text().then(function (text) {
          throw new Error(text || "Could not read GitHub file");
        });
      }
      return response.json().then(function (data) {
        return data.sha;
      });
    });
  }

  function gitHubContentsUrl() {
    return (
      "https://api.github.com/repos/" +
      GITHUB_OWNER +
      "/" +
      GITHUB_REPO +
      "/contents/" +
      GITHUB_DATA_PATH
    );
  }

  function gitHubHeaders(token) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  function createMonthFromForm() {
    var month = el.monthInput.value || currentMonthKey();
    var parts = month.split("-").map(Number);
    var year = parts[0];
    var monthIndex = parts[1] - 1;
    var today = startOfDay(new Date());
    var slots = [];
    var daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    for (var day = 1; day <= daysInMonth; day += 1) {
      var date = new Date(year, monthIndex, day);
      if (date.getDay() !== 5 || date < today) continue;
      TIMES.forEach(function (time) {
        slots.push({
          id: makeSlotId(toDateKey(date), time),
          date: toDateKey(date),
          time: time,
          enabled: time !== "13:00",
        });
      });
    }

    state.month = month;
    state.venue = el.venueInput.value.trim() || "Longbourn";
    state.slots = slots;
    state.allocations = {};
    state.changes.push(change("month-created", "Created " + month));
    saveAndRender();
  }

  function addManualSlot() {
    var date = state.slots[0] ? state.slots[0].date : firstFridayInMonth();
    var slot = {
      id: makeSlotId(date, "10:30"),
      date: date,
      time: "10:30",
      enabled: true,
    };
    state.slots.push(slot);
    refreshSlotIds();
    saveAndRender();
  }

  function renderAll() {
    el.monthInput.value = state.month || el.monthInput.value;
    el.venueInput.value = state.venue || "Longbourn";
    renderSlots();
    renderAvailabilityGrid();
    renderSummary();
    renderAllocations();
    updateAvailabilityMessage();
    el.monthMessage.value = buildMonthMessage();
  }

  function renderSlots() {
    el.slotsList.innerHTML = "";
    if (!state.slots.length) {
      var empty = document.createElement("p");
      empty.className = "allocation-note";
      empty.textContent = "No slots yet. Create the remaining Fridays to begin.";
      el.slotsList.appendChild(empty);
      return;
    }

    state.slots
      .slice()
      .sort(compareSlots)
      .forEach(function (slot) {
        var row = document.getElementById("slotTemplate").content.cloneNode(true);
        var root = row.querySelector(".slot-row");
        var dateInput = row.querySelector(".slot-date");
        var timeInput = row.querySelector(".slot-time");
        var enabledInput = row.querySelector(".slot-enabled-input");
        var removeButton = row.querySelector(".slot-remove");

        root.dataset.slotId = slot.id;
        dateInput.value = slot.date;
        timeInput.value = slot.time;
        enabledInput.checked = slot.enabled !== false;

        dateInput.addEventListener("change", function () {
          slot.date = dateInput.value;
          refreshSlotIds();
          saveAndRender();
        });
        timeInput.addEventListener("change", function () {
          slot.time = timeInput.value;
          refreshSlotIds();
          saveAndRender();
        });
        enabledInput.addEventListener("change", function () {
          slot.enabled = enabledInput.checked;
          saveAndRender();
        });
        removeButton.addEventListener("click", function () {
          removeSlot(slot.id);
        });

        el.slotsList.appendChild(row);
      });
  }

  function renderAvailabilityGrid() {
    el.availabilityGrid.innerHTML = "";
    enabledSlots().forEach(function (slot) {
      var row = document.createElement("div");
      row.className = "availability-row";
      row.innerHTML =
        '<div><div class="slot-name">' +
        escapeHtml(formatSlotShort(slot)) +
        '</div><div class="slot-subtitle">' +
        escapeHtml(formatSlotDate(slot.date)) +
        '</div></div>';

      var segmented = document.createElement("div");
      segmented.className = "segmented";
      ["green", "yellow", "blank"].forEach(function (value) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "segment";
        button.dataset.value = value;
        button.textContent =
          value === "green" ? "Green" : value === "yellow" ? "Yellow" : "Blank";
        if ((draftAvailability[slot.id] || "blank") === value) {
          button.classList.add("active");
        }
        button.addEventListener("click", function () {
          draftAvailability[slot.id] = value;
          renderAvailabilityGrid();
          updateAvailabilityMessage();
        });
        segmented.appendChild(button);
      });

      row.appendChild(segmented);
      el.availabilityGrid.appendChild(row);
    });
  }

  function renderSummary() {
    var playerCount = Object.keys(state.players).length;
    var slotCount = enabledSlots().length;
    var shortCount = enabledSlots().filter(function (slot) {
      var allocation = state.allocations[slot.id];
      return !allocation || allocation.players.length < 4;
    }).length;
    el.summaryBar.innerHTML = "";
    [
      playerCount + " players",
      slotCount + " enabled slots",
      shortCount + " short slots",
    ].forEach(function (text) {
      var pill = document.createElement("span");
      pill.className = "summary-pill";
      pill.textContent = text;
      el.summaryBar.appendChild(pill);
    });
  }

  function renderAllocations() {
    el.allocationList.innerHTML = "";
    if (!enabledSlots().length) {
      var empty = document.createElement("p");
      empty.className = "allocation-note";
      empty.textContent = "Create slots and add availability before allocating.";
      el.allocationList.appendChild(empty);
      return;
    }

    enabledSlots().forEach(function (slot) {
      var allocation = state.allocations[slot.id] || {
        players: [],
        yellowCandidates: [],
        confirmed: [],
      };
      var card = document.createElement("article");
      card.className =
        "allocation-card" + (allocation.players.length < 4 ? " short" : "");

      var title = document.createElement("h3");
      title.textContent = formatSlotFull(slot);
      card.appendChild(title);

      var players = document.createElement("div");
      players.className = "player-list";
      for (var index = 0; index < 4; index += 1) {
        var playerId = allocation.players[index];
        if (playerId) {
          players.appendChild(playerChip(slot.id, playerId));
        } else {
          var emptyChip = document.createElement("span");
          emptyChip.className = "empty-chip";
          emptyChip.textContent = "-";
          players.appendChild(emptyChip);
        }
      }
      card.appendChild(players);

      if (allocation.yellowCandidates.length) {
        var note = document.createElement("p");
        note.className = "allocation-note";
        note.textContent = "Yellow candidates. Ask in WhatsApp before confirming:";
        card.appendChild(note);

        var candidates = document.createElement("div");
        candidates.className = "candidate-list";
        allocation.yellowCandidates.forEach(function (playerId) {
          candidates.appendChild(candidateChip(slot.id, playerId));
        });
        card.appendChild(candidates);
      }

      el.allocationList.appendChild(card);
    });
  }

  function playerChip(slotId, playerId) {
    var chip = document.createElement("span");
    chip.className = "player-chip";
    chip.appendChild(document.createTextNode(playerName(playerId)));

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-button";
    remove.title = "Cancel this player from this slot";
    remove.textContent = "x";
    remove.addEventListener("click", function () {
      cancelPlayerFromSlot(slotId, playerId);
    });
    chip.appendChild(remove);
    return chip;
  }

  function candidateChip(slotId, playerId) {
    var chip = document.createElement("span");
    chip.className = "candidate-chip";
    chip.appendChild(document.createTextNode("*" + playerName(playerId)));

    var confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "chip-button";
    confirm.title = "Confirm after WhatsApp exchange";
    confirm.textContent = "Confirm";
    confirm.addEventListener("click", function () {
      confirmYellow(slotId, playerId);
    });
    chip.appendChild(confirm);
    return chip;
  }

  function saveAvailability() {
    var name = el.playerNameInput.value.trim();
    if (!name) {
      setStatus("Add a player name first.");
      el.playerNameInput.focus();
      return;
    }

    var id = slugify(name);
    var green = [];
    var yellow = [];
    Object.keys(draftAvailability).forEach(function (slotId) {
      if (draftAvailability[slotId] === "green") green.push(slotId);
      if (draftAvailability[slotId] === "yellow") yellow.push(slotId);
    });

    state.players[id] = { name: name };
    state.availability[id] = { green: green, yellow: yellow, updatedAt: nowIso() };
    state.changes.push(change("availability", "Saved availability for " + name));
    setStatus("Saved availability for " + name + ".");
    updateAvailabilityMessage();
    saveAndRender();
  }

  function updateAvailabilityMessage() {
    var name = el.playerNameInput.value.trim();
    var green = [];
    var yellow = [];
    Object.keys(draftAvailability).forEach(function (slotId) {
      var slot = getSlot(slotId);
      if (!slot) return;
      if (draftAvailability[slotId] === "green") green.push(formatSlotShort(slot));
      if (draftAvailability[slotId] === "yellow") yellow.push(formatSlotShort(slot));
    });

    if (!name && !green.length && !yellow.length) {
      el.availabilityMessage.value = "";
      return;
    }

    var payload = {
      type: "availability",
      version: 1,
      month: state.month,
      venue: state.venue,
      name: name,
      green: slotIdsByValue("green"),
      yellow: slotIdsByValue("yellow"),
    };

    el.availabilityMessage.value = [
      "LB-AVAIL v1",
      "Name: " + (name || "(add name)"),
      "Green: " + (green.join(", ") || "-"),
      "Yellow: " + (yellow.join(", ") || "-"),
      "Data: " + base64UrlEncode(JSON.stringify(payload)),
    ].join("\n");
  }

  function slotIdsByValue(value) {
    return Object.keys(draftAvailability).filter(function (slotId) {
      return draftAvailability[slotId] === value;
    });
  }

  function importMessages() {
    var text = el.importText.value;
    var matches = text.match(/Data:\s*([A-Za-z0-9_-]+)/g) || [];
    var imported = 0;

    matches.forEach(function (line) {
      var encoded = line.replace(/^Data:\s*/, "");
      try {
        var payload = JSON.parse(base64UrlDecode(encoded));
        if (payload.type === "availability") {
          importAvailability(payload);
          imported += 1;
        }
        if (payload.type === "state") {
          state = normalizeState(payload.state);
          imported += 1;
        }
        if (payload.type === "cancel") {
          cancelPlayerFromSlot(payload.slotId, slugify(payload.name), false);
          imported += 1;
        }
      } catch (error) {
        console.warn("Could not import message", error);
      }
    });

    setStatus(imported ? "Imported " + imported + " message(s)." : "No valid Data lines found.");
    saveAndRender();
  }

  function importAvailability(payload) {
    if (!payload.name) return;
    var id = slugify(payload.name);
    state.players[id] = { name: payload.name };
    state.availability[id] = {
      green: Array.isArray(payload.green) ? payload.green : [],
      yellow: Array.isArray(payload.yellow) ? payload.yellow : [],
      updatedAt: nowIso(),
    };
    state.changes.push(change("import", "Imported availability for " + payload.name));
  }

  function allocate() {
    var allocations = {};
    var allocationCount = {};
    Object.keys(state.players).forEach(function (id) {
      allocationCount[id] = 0;
    });

    var sortedSlots = enabledSlots()
      .slice()
      .sort(function (a, b) {
        return greenCandidates(a.id).length - greenCandidates(b.id).length || compareSlots(a, b);
      });

    sortedSlots.forEach(function (slot) {
      var players = greenCandidates(slot.id)
        .sort(function (a, b) {
          return (
            allocationCount[a] - allocationCount[b] ||
            sameDayCount(a, slot.date, allocations) - sameDayCount(b, slot.date, allocations) ||
            stableHash(a + slot.id + state.month) - stableHash(b + slot.id + state.month)
          );
        })
        .slice(0, 4);

      players.forEach(function (playerId) {
        allocationCount[playerId] = (allocationCount[playerId] || 0) + 1;
      });

      var yellow = [];
      if (players.length < 4) {
        yellow = yellowCandidates(slot.id, players).sort(function (a, b) {
          return (
            (allocationCount[a] || 0) - (allocationCount[b] || 0) ||
            stableHash(a + slot.id + "yellow") - stableHash(b + slot.id + "yellow")
          );
        });
      }

      allocations[slot.id] = {
        players: players,
        yellowCandidates: yellow,
        confirmed: players.slice(),
      };
    });

    state.allocations = allocations;
    state.changes.push(change("allocate", "Allocated " + formatMonthLabel()));
  }

  function greenCandidates(slotId) {
    return Object.keys(state.availability).filter(function (playerId) {
      return (state.availability[playerId].green || []).indexOf(slotId) >= 0;
    });
  }

  function yellowCandidates(slotId, excluded) {
    excluded = excluded || [];
    return Object.keys(state.availability).filter(function (playerId) {
      return (
        excluded.indexOf(playerId) < 0 &&
        (state.availability[playerId].yellow || []).indexOf(slotId) >= 0
      );
    });
  }

  function sameDayCount(playerId, date, allocations) {
    return Object.keys(allocations).filter(function (slotId) {
      var slot = getSlot(slotId);
      return (
        slot &&
        slot.date === date &&
        allocations[slotId].players.indexOf(playerId) >= 0
      );
    }).length;
  }

  function confirmYellow(slotId, playerId) {
    var availability = state.availability[playerId];
    if (!availability) return;
    availability.yellow = (availability.yellow || []).filter(function (id) {
      return id !== slotId;
    });
    if ((availability.green || []).indexOf(slotId) < 0) {
      availability.green = (availability.green || []).concat([slotId]);
    }
    state.changes.push(
      change("confirm-yellow", "Confirmed " + playerName(playerId) + " for " + slotId)
    );
    allocate();
    saveAndRender();
  }

  function cancelPlayerFromSlot(slotId, playerId, ask) {
    if (ask !== false && !window.confirm("Cancel " + playerName(playerId) + " from this slot?")) {
      return;
    }
    var availability = state.availability[playerId];
    if (!availability) return;
    availability.green = (availability.green || []).filter(function (id) {
      return id !== slotId;
    });
    availability.yellow = (availability.yellow || []).filter(function (id) {
      return id !== slotId;
    });
    state.changes.push(
      change("cancel", "Cancelled " + playerName(playerId) + " from " + slotId)
    );
    allocate();
    saveAndRender();
  }

  function buildMonthMessage() {
    var lines = [formatMonthLabel() + ":", ""];
    enabledSlots().forEach(function (slot) {
      var allocation = state.allocations[slot.id] || {
        players: [],
        yellowCandidates: [],
      };
      var names = allocation.players.map(playerName);
      while (names.length < 4) names.push("-");
      var yellow = allocation.yellowCandidates.map(function (playerId) {
        return "*" + playerName(playerId);
      });
      lines.push(formatSlotShort(slot) + ": " + names.join(", ") + (yellow.length ? " (" + yellow.join(", ") + ")" : ""));
    });

    lines.push("");
    lines.push("* means yellow/conditional availability. Ask before confirming.");
    lines.push("");
    lines.push("Open/update here:");
    lines.push(buildCleanAppLink());
    return lines.join("\n");
  }

  function buildStateDataLine() {
    return base64UrlEncode(
      JSON.stringify({ type: "state", version: 1, state: state })
    );
  }

  function buildStateLink() {
    var encoded = base64UrlEncode(JSON.stringify(state));
    var base = window.location.origin === "null"
      ? window.location.href.split("#")[0]
      : window.location.origin + window.location.pathname;
    return base + "#state=" + encoded;
  }

  function buildCleanAppLink() {
    if (window.location.origin === "null") {
      return window.location.href.split("#")[0];
    }
    return window.location.origin + window.location.pathname;
  }

  function shareWhatsApp() {
    var message = el.monthMessage.value;
    window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank");
  }

  function saveAndRender(shouldRender) {
    saveState();
    if (shouldRender === false) {
      el.monthMessage.value = buildMonthMessage();
      return;
    }
    renderAll();
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Could not save local state", error);
    }
  }

  function resetApp() {
    if (!window.confirm("Reset this browser's Longbourn state?")) return;
    state = createEmptyState();
    draftAvailability = {};
    window.localStorage.removeItem(STORAGE_KEY);
    setDefaultMonth();
    state.month = el.monthInput.value;
    state.venue = "Longbourn";
    el.venueInput.value = "Longbourn";
    setStatus("Reset complete.");
    renderAll();
  }

  function removeSlot(slotId) {
    state.slots = state.slots.filter(function (slot) {
      return slot.id !== slotId;
    });
    Object.keys(state.availability).forEach(function (playerId) {
      state.availability[playerId].green = (state.availability[playerId].green || []).filter(function (id) {
        return id !== slotId;
      });
      state.availability[playerId].yellow = (state.availability[playerId].yellow || []).filter(function (id) {
        return id !== slotId;
      });
    });
    delete state.allocations[slotId];
    saveAndRender();
  }

  function refreshSlotIds() {
    var idMap = {};
    state.slots.forEach(function (slot) {
      var oldId = slot.id;
      slot.id = makeSlotId(slot.date, slot.time);
      idMap[oldId] = slot.id;
    });
    Object.keys(state.availability).forEach(function (playerId) {
      ["green", "yellow"].forEach(function (key) {
        state.availability[playerId][key] = (state.availability[playerId][key] || []).map(function (id) {
          return idMap[id] || id;
        });
      });
    });
  }

  function enabledSlots() {
    return state.slots.filter(function (slot) {
      return slot.enabled !== false;
    }).sort(compareSlots);
  }

  function getSlot(slotId) {
    return state.slots.find(function (slot) {
      return slot.id === slotId;
    });
  }

  function makeSlotId(date, time) {
    return date + "T" + time;
  }

  function compareSlots(a, b) {
    return (a.date + a.time).localeCompare(b.date + b.time);
  }

  function formatSlotShort(slot) {
    return ordinal(Number(slot.date.slice(-2))) + " " + slot.time;
  }

  function formatSlotFull(slot) {
    return formatSlotDate(slot.date) + " at " + slot.time;
  }

  function formatSlotDate(dateKey) {
    var date = parseDateKey(dateKey);
    return WEEKDAY[date.getDay()] + " " + ordinal(date.getDate()) + " " + monthName(date);
  }

  function formatMonthLabel() {
    if (!state.month) return state.venue || "Longbourn";
    var parts = state.month.split("-");
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    return monthName(date) + " " + (state.venue || "Longbourn");
  }

  function playerName(playerId) {
    return (state.players[playerId] && state.players[playerId].name) || playerId;
  }

  function currentMonthKey() {
    var now = new Date();
    return now.getFullYear() + "-" + pad(now.getMonth() + 1);
  }

  function firstFridayInMonth() {
    var parts = (state.month || currentMonthKey()).split("-").map(Number);
    for (var day = 1; day <= 7; day += 1) {
      var date = new Date(parts[0], parts[1] - 1, day);
      if (date.getDay() === 5) return toDateKey(date);
    }
    return toDateKey(new Date());
  }

  function parseDateKey(dateKey) {
    var parts = dateKey.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function toDateKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function monthName(date) {
    return date.toLocaleString("en-GB", { month: "long" });
  }

  function ordinal(number) {
    var suffix = "th";
    if (number % 100 < 11 || number % 100 > 13) {
      if (number % 10 === 1) suffix = "st";
      if (number % 10 === 2) suffix = "nd";
      if (number % 10 === 3) suffix = "rd";
    }
    return number + suffix;
  }

  function pad(number) {
    return String(number).padStart(2, "0");
  }

  function slugify(value) {
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function stableHash(value) {
    var hash = 0;
    for (var index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function change(type, text) {
    return { type: type, text: text, at: nowIso() };
  }

  function setStatus(text) {
    el.importStatus.textContent = text || "";
  }

  function setSharedStatus(text) {
    el.sharedStatus.textContent = text || "";
  }

  function copyText(text, successMessage) {
    if (!text) {
      setStatus("Nothing to copy yet.");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        setStatus(successMessage);
      });
      return;
    }
    window.prompt("Copy this text", text);
    setStatus(successMessage);
  }

  function base64UrlEncode(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    bytes.forEach(function (byte) {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64Encode(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    bytes.forEach(function (byte) {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  function base64UrlDecode(value) {
    var base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
