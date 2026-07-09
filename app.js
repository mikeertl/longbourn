(function () {
  "use strict";

  var STATE_STORAGE_KEY = "longbourn-state-v2";
  var USERS_STORAGE_KEY = "longbourn-users-v1";
  var PENDING_STATE_STORAGE_KEY = "longbourn-pending-state-v1";
  var TOKEN_STORAGE_KEY = "longbourn-github-token";
  var USER_STORAGE_KEY = "longbourn-user-id";
  var ADMIN_STORAGE_KEY = "longbourn-admin-mode";
  var APP_VERSION = "2026.07.09.3";
  var GITHUB_OWNER = "mikeertl";
  var GITHUB_REPO = "longbourn";
  var GITHUB_BRANCH = "main";
  var STATE_PATH = "data/current.json";
  var USERS_PATH = "data/users.json";
  var RETENTION_MONTHS = 6;
  var PENDING_TTL_MS = 24 * 60 * 60 * 1000;
  var TIMES = ["08:00", "09:00", "10:30", "11:45", "13:00"];
  var DEFAULT_ENABLED_TIMES = ["10:30", "11:45"];
  var WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DEFAULT_USERS = [
    "Mike Ertl",
    "Phil Charles",
    "Akiko",
    "Arda",
    "Chris Danzinger",
    "Chris Dalley",
    "Ellen",
    "Jude Zur",
    "Michael W-M",
    "Peter Miell",
    "Rachel",
    "Jo TR",
    "Richard Moxon",
    "David Taylor",
    "Ian Thomas",
    "Gina Williams",
  ].map(function (name) {
    return { id: slugify(name), name: name };
  });

  var state = createEmptyState();
  var users = DEFAULT_USERS.slice();
  var draftAvailability = {};
  var session = { token: "", userId: "", isAdmin: false };
  var activeTab = "games";
  var saveChain = Promise.resolve();
  var el = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    bindEvents();
    setDefaultMonth();
    users = readStoredUsers() || sortUsersByName(DEFAULT_USERS);
    state = normalizeState(readStoredState() || createEmptyState());
    state = newestState(state, readStoredPendingState());
    loadStoredSession();
    syncStatePlayersWithUsers();
    renderUserSelects();
    loadDraftForSession();
    setAuth(hasSession());
    setTab("games", false);
    renderAll();
    fetchUsersFile()
      .then(function (sharedUsers) {
        if (sharedUsers) {
          users = normalizeUsers(sharedUsers);
          saveUsersLocal();
          syncStatePlayersWithUsers();
          renderAll();
        }
      })
      .catch(function (error) {
        console.warn("Could not load users", error);
      })
      .then(function () {
        if (hasSession()) {
          return refreshSharedData(true);
        }
      });
  }

  function cacheElements() {
    [
      "gamesTabButton",
      "availabilityTabButton",
      "adminTabButton",
      "brandHomeButton",
      "menuButton",
      "userMenu",
      "refreshButton",
      "signOutButton",
      "refreshProgress",
      "sessionName",
      "signInUserSelect",
      "signInTokenInput",
      "signInAdminCheckbox",
      "signInButton",
      "signInStatus",
      "gamesList",
      "gamesStatus",
      "availabilityTitle",
      "availabilityGrid",
      "submitAvailabilityButton",
      "availabilityStatus",
      "allocateButton",
      "manualSlotSelect",
      "manualUserSelect",
      "manualAddPlayerButton",
      "summaryBar",
      "allocationList",
      "allocationStatus",
      "monthInput",
      "venueInput",
      "createMonthButton",
      "slotsList",
      "setupStatus",
      "newUserInput",
      "addUserButton",
      "usersList",
      "usersStatus",
      "profileUserSelect",
      "profileTokenInput",
      "profileAdminCheckbox",
      "saveProfileButton",
      "profileStatus",
      "appVersion",
    ].forEach(function (id) {
      el[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    el.brandHomeButton.addEventListener("click", function () {
      setTab("games", true);
    });
    el.menuButton.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleMenu();
    });
    document.addEventListener("click", function (event) {
      if (!el.userMenu.contains(event.target) && !el.menuButton.contains(event.target)) {
        toggleMenu(false);
      }
    });
    el.signInButton.addEventListener("click", signIn);
    el.gamesTabButton.addEventListener("click", function () {
      setTab("games", true);
    });
    el.availabilityTabButton.addEventListener("click", function () {
      setTab("availability", true);
    });
    el.adminTabButton.addEventListener("click", function () {
      setTab("admin", true);
    });
    el.refreshButton.addEventListener("click", function () {
      toggleMenu(false);
      refreshSharedData(false);
    });
    el.signOutButton.addEventListener("click", signOut);
    el.submitAvailabilityButton.addEventListener("click", submitAvailability);
    el.allocateButton.addEventListener("click", handleAllocateClick);
    el.manualAddPlayerButton.addEventListener("click", addManualPlayerToSlot);
    el.createMonthButton.addEventListener("click", createMonthFromForm);
    el.venueInput.addEventListener("change", function () {
      state.venue = el.venueInput.value.trim() || "Longbourn";
      saveCurrentState("setup", "Venue saved.");
    });
    el.addUserButton.addEventListener("click", addUser);
    el.saveProfileButton.addEventListener("click", saveProfile);
  }

  function signIn() {
    var token = el.signInTokenInput.value.trim();
    var userId = el.signInUserSelect.value;
    if (!token || !userId) {
      setStatus("signIn", "Choose your name and paste the token.");
      return;
    }
    session.token = token;
    session.userId = userId;
    session.isAdmin = el.signInAdminCheckbox.checked;
    storeSession();
    setAuth(true);
    syncProfileInputs();
    loadDraftForSession();
    setTab("games", false);
    renderAll();
    refreshSharedData(false);
  }

  function signOut() {
    session = { token: "", userId: "", isAdmin: false };
    try {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(USER_STORAGE_KEY);
      window.localStorage.removeItem(ADMIN_STORAGE_KEY);
    } catch (error) {
      console.warn("Could not clear session", error);
    }
    draftAvailability = {};
    toggleMenu(false);
    setAuth(false);
    renderAll();
  }

  function saveProfile() {
    var token = el.profileTokenInput.value.trim();
    var userId = el.profileUserSelect.value;
    if (!token || !userId) {
      setStatus("profile", "Choose your name and paste the token.");
      return;
    }
    session.token = token;
    session.userId = userId;
    session.isAdmin = el.profileAdminCheckbox.checked;
    storeSession();
    loadDraftForSession();
    setAuth(true);
    renderAll();
    setStatus("profile", "Profile saved in this browser.");
  }

  function setAuth(isSignedIn) {
    document.body.dataset.auth = isSignedIn ? "signed-in" : "signed-out";
    document.body.dataset.admin = isSignedIn && session.isAdmin ? "true" : "false";
    if ((!isSignedIn || !session.isAdmin) && activeTab === "admin") {
      setTab("games", false);
    }
  }

  function setTab(tab, shouldRefresh) {
    activeTab = ["games", "availability", "admin"].indexOf(tab) >= 0 ? tab : "games";
    if (activeTab === "admin" && !session.isAdmin) activeTab = "games";
    document.body.dataset.tab = activeTab;
    el.gamesTabButton.classList.toggle("active", activeTab === "games");
    el.availabilityTabButton.classList.toggle("active", activeTab === "availability");
    el.adminTabButton.classList.toggle("active", activeTab === "admin");
    toggleMenu(false);
    if (hasSession() && shouldRefresh) {
      refreshSharedData(true);
    }
  }

  function toggleMenu(forceOpen) {
    var shouldOpen =
      typeof forceOpen === "boolean" ? forceOpen : document.body.dataset.menu !== "open";
    document.body.dataset.menu = shouldOpen ? "open" : "closed";
    if (el.menuButton) el.menuButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }

  function hasSession() {
    return !!(session.token && session.userId);
  }

  function loadStoredSession() {
    try {
      session.token = window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
      session.userId = window.localStorage.getItem(USER_STORAGE_KEY) || "";
      session.isAdmin = window.localStorage.getItem(ADMIN_STORAGE_KEY) === "true";
      el.signInTokenInput.value = session.token;
      el.signInAdminCheckbox.checked = session.isAdmin;
    } catch (error) {
      console.warn("Could not read session", error);
    }
  }

  function setDefaultMonth() {
    el.monthInput.value = addMonthsToMonthKey(currentMonthKey(), 1);
  }

  function storeSession() {
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, session.token);
      window.localStorage.setItem(USER_STORAGE_KEY, session.userId);
      window.localStorage.setItem(ADMIN_STORAGE_KEY, session.isAdmin ? "true" : "false");
    } catch (error) {
      console.warn("Could not store session", error);
    }
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
      updatedAt: "",
      updatedBy: "",
      manualEditedAt: "",
    };
  }

  function normalizeState(input) {
    var next = Object.assign(createEmptyState(), input || {});
    next.slots = Array.isArray(next.slots) ? next.slots : [];
    next.players = next.players || {};
    next.availability = next.availability || {};
    next.allocations = next.allocations || {};
    next.changes = Array.isArray(next.changes) ? next.changes : [];
    next.updatedAt = next.updatedAt || latestChangeAt(next.changes) || "";
    next.updatedBy = next.updatedBy || "";
    next.manualEditedAt = next.manualEditedAt || "";
    return pruneOldState(next);
  }

  function normalizeUsers(input) {
    var list = input && Array.isArray(input.users) ? input.users : input;
    if (!Array.isArray(list) || !list.length) list = DEFAULT_USERS;
    var seen = {};
    return sortUsersByName(list
      .map(function (user) {
        var name = typeof user === "string" ? user : user && user.name;
        var id = typeof user === "object" && user.id ? user.id : slugify(name);
        return name ? { id: uniqueUserId(id, seen), name: String(name).trim() } : null;
      })
      .filter(Boolean));
  }

  function uniqueUserId(id, seen) {
    var base = slugify(id || "user") || "user";
    var next = base;
    var count = 2;
    while (seen[next]) {
      next = base + "-" + count;
      count += 1;
    }
    seen[next] = true;
    return next;
  }

  function readStoredState() {
    try {
      var stored = window.localStorage.getItem(STATE_STORAGE_KEY);
      if (!stored) stored = window.localStorage.getItem("longbourn-state-v1");
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn("Could not read local state", error);
      return null;
    }
  }

  function readStoredPendingState() {
    try {
      var stored = window.localStorage.getItem(PENDING_STATE_STORAGE_KEY);
      if (!stored) return null;
      var pending = JSON.parse(stored);
      if (!pending || !pending.state || isPendingExpired(pending.savedAt)) {
        window.localStorage.removeItem(PENDING_STATE_STORAGE_KEY);
        return null;
      }
      return normalizeState(pending.state);
    } catch (error) {
      console.warn("Could not read pending state", error);
      return null;
    }
  }

  function readStoredUsers() {
    try {
      var stored = window.localStorage.getItem(USERS_STORAGE_KEY);
      return stored ? normalizeUsers(JSON.parse(stored)) : null;
    } catch (error) {
      console.warn("Could not read local users", error);
      return null;
    }
  }

  function saveStateLocal() {
    try {
      window.localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Could not save local state", error);
    }
  }

  function savePendingStateLocal() {
    try {
      window.localStorage.setItem(
        PENDING_STATE_STORAGE_KEY,
        JSON.stringify({ savedAt: nowIso(), state: state })
      );
    } catch (error) {
      console.warn("Could not save pending state", error);
    }
  }

  function clearPendingStateLocal() {
    try {
      window.localStorage.removeItem(PENDING_STATE_STORAGE_KEY);
    } catch (error) {
      console.warn("Could not clear pending state", error);
    }
  }

  function startRefreshFeedback() {
    if (el.refreshButton) el.refreshButton.disabled = true;
    document.body.dataset.refreshing = "true";
  }

  function finishRefreshFeedback() {
    window.setTimeout(function () {
      if (el.refreshButton) el.refreshButton.disabled = false;
      document.body.dataset.refreshing = "false";
    }, 250);
  }

  function stampStateUpdate() {
    state.updatedAt = nowIso();
    state.updatedBy = session.userId || "";
  }

  function markManualAllocationChange() {
    state.manualEditedAt = nowIso();
  }

  function newestState(first, second) {
    if (!first) return second;
    if (!second) return first;
    return compareStateTimes(second, first) > 0 ? second : first;
  }

  function compareStateTimes(first, second) {
    return stateTime(first) - stateTime(second);
  }

  function stateTime(value) {
    var time = Date.parse((value && value.updatedAt) || "");
    return Number.isNaN(time) ? 0 : time;
  }

  function latestChangeAt(changes) {
    var latest = "";
    (changes || []).forEach(function (entry) {
      if (entry && entry.at && (!latest || Date.parse(entry.at) > Date.parse(latest))) {
        latest = entry.at;
      }
    });
    return latest;
  }

  function isPendingExpired(savedAt) {
    var time = Date.parse(savedAt || "");
    return Number.isNaN(time) || Date.now() - time > PENDING_TTL_MS;
  }

  function saveUsersLocal() {
    try {
      window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify({ users: users }));
    } catch (error) {
      console.warn("Could not save local users", error);
    }
  }

  function refreshSharedData(silent) {
    startRefreshFeedback();
    if (!silent) setStatus(activeTab, "Loading latest data...");
    return Promise.all([fetchStateFile(), fetchUsersFile()])
      .then(function (results) {
        var refreshResult = applyIncomingState(results[0] ? normalizeState(results[0]) : null, !silent);
        if (results[1]) users = normalizeUsers(results[1]);
        syncStatePlayersWithUsers();
        saveStateLocal();
        saveUsersLocal();
        renderUserSelects();
        syncProfileInputs();
        loadDraftForSession();
        renderAll();
        if (!silent) {
          setStatus(activeTab, refreshResult.message || "Latest data loaded.");
        }
        return autoAllocateIfDue();
      })
      .catch(function (error) {
        if (!silent) setStatus(activeTab, "Could not load latest data.");
        console.warn("Could not refresh shared data", error);
      })
      .then(function (result) {
        finishRefreshFeedback();
        return result;
      }, function (error) {
        finishRefreshFeedback();
        throw error;
      });
  }

  function applyIncomingState(incoming, alertIfChangedByOthers) {
    if (!incoming) return { applied: false, message: "No shared rota found yet." };

    var pending = readStoredPendingState();
    if (pending && compareStateTimes(incoming, pending) < 0) {
      state = newestState(state, pending);
      return {
        applied: false,
        message: "Your latest change is saved locally while GitHub catches up.",
      };
    }

    if (pending) clearPendingStateLocal();

    if (!pending && compareStateTimes(incoming, state) < 0) {
      return {
        applied: false,
        message: "Kept your newer local changes.",
      };
    }

    if (
      alertIfChangedByOthers &&
      state.updatedAt &&
      compareStateTimes(incoming, state) > 0 &&
      incoming.updatedBy &&
      incoming.updatedBy !== session.userId
    ) {
      window.alert("Changes made by other players. Press OK to continue with refreshed data.");
    }

    state = incoming;
    return { applied: true, message: "Latest data loaded." };
  }

  function fetchStateFile() {
    return fetchJsonFile(STATE_PATH);
  }

  function fetchUsersFile() {
    return fetchJsonFile(USERS_PATH);
  }

  function fetchJsonFile(path) {
    var relativeUrl = path + "?v=" + Date.now();
    var rawUrl =
      "https://raw.githubusercontent.com/" +
      GITHUB_OWNER +
      "/" +
      GITHUB_REPO +
      "/" +
      GITHUB_BRANCH +
      "/" +
      path +
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

  function saveCurrentState(statusTarget, successMessage) {
    if (!requireToken(statusTarget)) return Promise.resolve(false);
    syncStatePlayersWithUsers();
    stampStateUpdate();
    state = pruneOldState(state);
    saveStateLocal();
    savePendingStateLocal();
    renderAll();
    setStatus(statusTarget, "Saving...");
    return saveJsonFile(STATE_PATH, state, "Update Longbourn shared rota")
      .then(function () {
        setStatus(statusTarget, successMessage || "Saved.");
        return true;
      })
      .catch(function (error) {
        setStatus(statusTarget, "Could not save. Check token permissions.");
        console.warn("Could not save state", error);
        return false;
      });
  }

  function saveUsersFile(statusTarget, successMessage) {
    if (!requireToken(statusTarget)) return Promise.resolve(false);
    users = sortUsersByName(users);
    saveUsersLocal();
    renderUserSelects();
    syncProfileInputs();
    setStatus(statusTarget, "Saving...");
    return saveJsonFile(
      USERS_PATH,
      { version: 1, users: users, updatedAt: nowIso() },
      "Update Longbourn users"
    )
      .then(function () {
        setStatus(statusTarget, successMessage || "Users saved.");
        return true;
      })
      .catch(function (error) {
        setStatus(statusTarget, "Could not save users. Check token permissions.");
        console.warn("Could not save users", error);
        return false;
      });
  }

  function saveJsonFile(path, data, message) {
    return queueSave(function () {
      return getGitHubFileSha(path).then(function (sha) {
        var body = {
          message: message,
          content: base64Encode(JSON.stringify(data, null, 2) + "\n"),
          branch: GITHUB_BRANCH,
        };
        if (sha) body.sha = sha;
        return fetch(gitHubContentsUrl(path), {
          method: "PUT",
          headers: gitHubHeaders(),
          body: JSON.stringify(body),
        }).then(function (response) {
          if (!response.ok) {
            return response.text().then(function (text) {
              throw new Error(text || "GitHub save failed");
            });
          }
          return response.json();
        });
      });
    });
  }

  function queueSave(work) {
    saveChain = saveChain.then(work, work);
    return saveChain;
  }

  function getGitHubFileSha(path) {
    return fetch(gitHubContentsUrl(path) + "?ref=" + encodeURIComponent(GITHUB_BRANCH), {
      headers: gitHubHeaders(),
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

  function gitHubContentsUrl(path) {
    return (
      "https://api.github.com/repos/" +
      GITHUB_OWNER +
      "/" +
      GITHUB_REPO +
      "/contents/" +
      path
    );
  }

  function gitHubHeaders() {
    return {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + session.token,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  function requireToken(statusTarget) {
    if (hasSession()) return true;
    setStatus(statusTarget, "Sign in with the shared token first.");
    return false;
  }

  function renderAll() {
    el.sessionName.textContent = session.userId ? playerName(session.userId) : "";
    el.appVersion.textContent = APP_VERSION;
    el.monthInput.value = el.monthInput.value || state.month || addMonthsToMonthKey(currentMonthKey(), 1);
    el.venueInput.value = state.venue || "Longbourn";
    renderUserSelects();
    syncProfileInputs();
    renderGames();
    renderAvailabilityGrid();
    renderSlots();
    renderAllocationControls();
    renderSummary();
    renderAllocations();
    renderUsers();
  }

  function renderUserSelects() {
    fillUserSelect(el.signInUserSelect, session.userId);
    fillUserSelect(el.profileUserSelect, session.userId);
    fillUserSelect(el.manualUserSelect, el.manualUserSelect.value || session.userId);
  }

  function fillUserSelect(select, selectedId) {
    if (!select) return;
    var current = selectedId || select.value;
    select.innerHTML = "";
    sortUsersByName(users).forEach(function (user) {
      var option = document.createElement("option");
      option.value = user.id;
      option.textContent = user.name;
      select.appendChild(option);
    });
    if (current && users.some(function (user) { return user.id === current; })) {
      select.value = current;
    }
  }

  function syncProfileInputs() {
    el.signInTokenInput.value = session.token || el.signInTokenInput.value || "";
    el.profileTokenInput.value = session.token || "";
    el.signInAdminCheckbox.checked = session.isAdmin;
    el.profileAdminCheckbox.checked = session.isAdmin;
    if (session.userId) {
      el.signInUserSelect.value = session.userId;
      el.profileUserSelect.value = session.userId;
    }
  }

  function renderGames() {
    el.gamesList.innerHTML = "";
    scheduleMonthKeys().forEach(function (monthKey) {
      var section = document.createElement("section");
      section.className = "schedule-month";
      var heading = document.createElement("h3");
      heading.textContent = formatMonthHeading(monthKey);
      section.appendChild(heading);

      var slots = enabledSlots().filter(function (slot) {
        return slot.date.slice(0, 7) === monthKey;
      });
      if (!slots.length) {
        var empty = document.createElement("p");
        empty.className = "allocation-note";
        empty.textContent = "No games published yet.";
        section.appendChild(empty);
      }
      slots.forEach(function (slot) {
        section.appendChild(scheduleRow(slot));
      });
      el.gamesList.appendChild(section);
    });
  }

  function scheduleRow(slot) {
    var allocation = allocationForSlot(slot.id);
    var row = document.createElement("article");
    row.className = "schedule-row" + (allocation.players.length < 4 ? " short" : "");
    var summary = document.createElement("div");
    summary.innerHTML =
      '<div class="schedule-time">' +
      escapeHtml(slot.time) +
      '</div><div class="schedule-date">' +
      escapeHtml(formatSlotDate(slot.date)) +
      "</div>";
    row.appendChild(summary);

    var players = document.createElement("div");
    players.className = "schedule-players";
    allocation.players.forEach(function (playerId) {
      players.appendChild(schedulePlayerChip(slot.id, playerId));
    });
    for (var index = allocation.players.length; index < 4; index += 1) {
      players.appendChild(readOnlyChip("empty-chip", "-"));
    }
    allocation.yellowCandidates.forEach(function (playerId) {
      players.appendChild(readOnlyChip("candidate-chip", "*" + playerName(playerId)));
    });
    if (hasSession() && allocation.players.indexOf(session.userId) < 0) {
      var addMe = document.createElement("button");
      addMe.type = "button";
      addMe.className = "button secondary schedule-action";
      addMe.textContent = "Add me";
      addMe.addEventListener("click", function () {
        addSelfToGame(slot.id);
      });
      players.appendChild(addMe);
    }
    row.appendChild(players);
    return row;
  }

  function schedulePlayerChip(slotId, playerId) {
    var chip = readOnlyChip("player-chip", playerName(playerId));
    if (hasSession() && playerId === session.userId) {
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chip-button";
      remove.title = "Remove yourself from this game";
      remove.textContent = "x";
      remove.addEventListener("click", function () {
        removeSelfFromGame(slotId);
      });
      chip.appendChild(remove);
    }
    return chip;
  }

  function renderAvailabilityGrid() {
    var name = session.userId ? playerName(session.userId) : "Player";
    el.availabilityTitle.textContent =
      "Availability - " + name + " - " + availabilityTitleRange();
    el.availabilityGrid.innerHTML = "";
    if (!availabilitySlots().length) {
      var empty = document.createElement("p");
      empty.className = "allocation-note";
      empty.textContent = "No games have been set up for next month yet.";
      el.availabilityGrid.appendChild(empty);
      return;
    }

    availabilityMonthKeys().forEach(function (monthKey) {
      var slots = availabilitySlots().filter(function (slot) {
        return slot.date.slice(0, 7) === monthKey;
      });
      if (!slots.length) return;

      var section = document.createElement("section");
      section.className = "availability-month";
      var heading = document.createElement("h3");
      heading.textContent = formatMonthHeading(monthKey);
      section.appendChild(heading);

      slots.forEach(function (slot) {
        section.appendChild(availabilityRow(slot));
      });
      el.availabilityGrid.appendChild(section);
    });
  }

  function availabilityRow(slot) {
    var row = document.createElement("div");
    row.className = "availability-row";
    row.innerHTML =
      '<div><div class="slot-name">' +
      escapeHtml(slot.time) +
      '</div><div class="slot-subtitle">' +
      escapeHtml(formatSlotDate(slot.date)) +
      "</div></div>";

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
      });
      segmented.appendChild(button);
    });
    row.appendChild(segmented);
    return row;
  }

  function submitAvailability() {
    if (!requireToken("availability")) return;
    if (!session.userId) {
      setStatus("availability", "Choose your name in My Profile first.");
      return;
    }
    var green = [];
    var yellow = [];
    var visibleSlotIds = {};
    availabilitySlots().forEach(function (slot) {
      visibleSlotIds[slot.id] = true;
    });
    var existing = state.availability[session.userId] || {};
    green = (existing.green || []).filter(function (slotId) {
      return !visibleSlotIds[slotId];
    });
    yellow = (existing.yellow || []).filter(function (slotId) {
      return !visibleSlotIds[slotId];
    });
    Object.keys(draftAvailability).forEach(function (slotId) {
      if (!visibleSlotIds[slotId]) return;
      if (draftAvailability[slotId] === "green") green.push(slotId);
      if (draftAvailability[slotId] === "yellow") yellow.push(slotId);
    });
    state.players[session.userId] = { name: playerName(session.userId) };
    state.availability[session.userId] = {
      green: green,
      yellow: yellow,
      updatedAt: nowIso(),
    };
    state.changes.push(change("availability", "Saved availability for " + playerName(session.userId)));
    saveCurrentState("availability", "Availability submitted.");
  }

  function loadDraftForSession() {
    draftAvailability = {};
    if (!session.userId) return;
    var availability = state.availability[session.userId] || {};
    (availability.green || []).forEach(function (slotId) {
      draftAvailability[slotId] = "green";
    });
    (availability.yellow || []).forEach(function (slotId) {
      draftAvailability[slotId] = "yellow";
    });
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
          saveCurrentState("setup", "Slot saved.");
        });
        timeInput.addEventListener("change", function () {
          slot.time = timeInput.value;
          refreshSlotIds();
          saveCurrentState("setup", "Slot saved.");
        });
        enabledInput.addEventListener("change", function () {
          slot.enabled = enabledInput.checked;
          saveCurrentState("setup", "Slot saved.");
        });
        removeButton.addEventListener("click", function () {
          removeSlot(slot.id);
        });
        el.slotsList.appendChild(row);
      });
  }

  function createMonthFromForm() {
    if (!requireToken("setup")) return;
    var month = el.monthInput.value || addMonthsToMonthKey(currentMonthKey(), 1);
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
          enabled: DEFAULT_ENABLED_TIMES.indexOf(time) >= 0,
        });
      });
    }

    state.month = month;
    state.venue = el.venueInput.value.trim() || "Longbourn";
    replaceMonthSlots(month, slots);
    state.changes.push(change("month-created", "Created " + month));
    saveCurrentState("setup", "Month saved.");
  }

  function replaceMonthSlots(month, slots) {
    var removed = {};
    state.slots.forEach(function (slot) {
      if (slot.date && slot.date.slice(0, 7) === month) removed[slot.id] = true;
    });
    state.slots = state.slots
      .filter(function (slot) {
        return !slot.date || slot.date.slice(0, 7) !== month;
      })
      .concat(slots);
    Object.keys(state.allocations).forEach(function (slotId) {
      if (removed[slotId]) delete state.allocations[slotId];
    });
    Object.keys(state.availability).forEach(function (playerId) {
      state.availability[playerId].green = (state.availability[playerId].green || []).filter(function (slotId) {
        return !removed[slotId];
      });
      state.availability[playerId].yellow = (state.availability[playerId].yellow || []).filter(function (slotId) {
        return !removed[slotId];
      });
    });
  }

  function removeSlot(slotId) {
    if (!window.confirm("Remove this slot?")) return;
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
    state.changes.push(change("slot-removed", "Removed " + slotId));
    saveCurrentState("setup", "Slot removed.");
  }

  function renderAllocationControls() {
    fillSlotSelect(el.manualSlotSelect, el.manualSlotSelect.value);
    fillUserSelect(el.manualUserSelect, el.manualUserSelect.value || session.userId);
  }

  function fillSlotSelect(select, selectedId) {
    var current = selectedId || select.value;
    select.innerHTML = "";
    enabledSlots().forEach(function (slot) {
      var option = document.createElement("option");
      option.value = slot.id;
      option.textContent = formatSlotDate(slot.date) + " " + slot.time;
      select.appendChild(option);
    });
    if (current && getSlot(current)) select.value = current;
  }

  function renderSummary() {
    var playerCount = Object.keys(state.players).length;
    var slotCount = enabledSlots().length;
    var shortCount = enabledSlots().filter(function (slot) {
      var allocation = allocationForSlot(slot.id);
      return allocation.players.length < 4;
    }).length;
    el.summaryBar.innerHTML = "";
    [playerCount + " players", slotCount + " enabled slots", shortCount + " short slots"].forEach(function (text) {
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
      var allocation = allocationForSlot(slot.id);
      var card = document.createElement("article");
      card.className = "allocation-card" + (allocation.players.length < 4 ? " short" : "");

      var title = document.createElement("h3");
      title.textContent = formatSlotFull(slot);
      card.appendChild(title);

      var players = document.createElement("div");
      players.className = "player-list";
      allocation.players.forEach(function (playerId) {
        players.appendChild(playerChip(slot.id, playerId));
      });
      for (var index = allocation.players.length; index < 4; index += 1) {
        players.appendChild(readOnlyChip("empty-chip", "-"));
      }
      card.appendChild(players);

      if (allocation.yellowCandidates.length) {
        var note = document.createElement("p");
        note.className = "allocation-note";
        note.textContent = "Needs confirmation to play twice:";
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
    var chip = readOnlyChip("player-chip", playerName(playerId));
    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-button";
    remove.title = "Remove from this game";
    remove.textContent = "x";
    remove.addEventListener("click", function () {
      removePlayerFromAllocation(slotId, playerId);
    });
    chip.appendChild(remove);
    return chip;
  }

  function candidateChip(slotId, playerId) {
    var chip = readOnlyChip("candidate-chip", "*" + playerName(playerId));
    var confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "chip-button";
    confirm.title = "Confirm this extra game";
    confirm.textContent = "Confirm";
    confirm.addEventListener("click", function () {
      addPlayerToAllocation(slotId, playerId, "allocation", "Player confirmed.");
    });
    chip.appendChild(confirm);
    return chip;
  }

  function addManualPlayerToSlot() {
    var slotId = el.manualSlotSelect.value;
    var playerId = el.manualUserSelect.value;
    if (!slotId || !playerId) {
      setStatus("allocation", "Choose a game and player.");
      return;
    }
    addPlayerToAllocation(slotId, playerId, "allocation", "Player added.");
  }

  function addSelfToGame(slotId) {
    if (!requireToken("games")) return;
    addPlayerToAllocation(slotId, session.userId, "games", "You were added to this game.");
  }

  function addPlayerToAllocation(slotId, playerId, statusTarget, message) {
    var allocation = allocationForSlot(slotId);
    if (allocation.players.indexOf(playerId) >= 0) {
      setStatus(statusTarget, "That player is already in this game.");
      return;
    }
    if (allocation.players.length >= 4 && !window.confirm("This game already has four players. Add another?")) {
      return;
    }
    allocation.players.push(playerId);
    allocation.confirmed = allocation.players.slice();
    allocation.yellowCandidates = allocation.yellowCandidates.filter(function (id) {
      return id !== playerId;
    });
    state.allocations[slotId] = allocation;
    state.players[playerId] = { name: playerName(playerId) };
    markManualAllocationChange();
    state.changes.push(change("allocation-add", "Added " + playerName(playerId) + " to " + slotId));
    saveCurrentState(statusTarget, message);
  }

  function removePlayerFromAllocation(slotId, playerId) {
    if (!window.confirm("Remove " + playerName(playerId) + " from this game?")) return;
    removePlayerFromSlot(slotId, playerId, "allocation", "Player removed from this game.");
  }

  function removeSelfFromGame(slotId) {
    if (!requireToken("games")) return;
    if (!window.confirm("Remove yourself from this game?")) return;
    removePlayerFromSlot(slotId, session.userId, "games", "You were removed from this game.");
  }

  function removePlayerFromSlot(slotId, playerId, statusTarget, message) {
    var allocation = allocationForSlot(slotId);
    allocation.players = allocation.players.filter(function (id) {
      return id !== playerId;
    });
    allocation.confirmed = allocation.confirmed.filter(function (id) {
      return id !== playerId;
    });
    allocation.yellowCandidates = allocation.yellowCandidates.filter(function (id) {
      return id !== playerId;
    });
    state.allocations[slotId] = allocation;
    markManualAllocationChange();
    state.changes.push(change("allocation-remove", "Removed " + playerName(playerId) + " from " + slotId));
    saveCurrentState(statusTarget, message);
  }

  function handleAllocateClick() {
    var lastFriday = lastFridayOfMonth(currentMonthKey());
    if (startOfDay(new Date()) < lastFriday) {
      var message =
        "Allocation automatically happens on the last Friday of the month (" +
        formatDateLong(lastFriday) +
        "). Are you sure?";
      if (!window.confirm(message)) return;
    }
    var keepExisting = true;
    if (hasAllocationsInMonth(autoAllocationMonthKey())) {
      keepExisting = window.confirm(
        "Manual allocation changes already exist.\n\nOK keeps manual edits and auto allocates around them.\nCancel lets you auto allocate from scratch."
      );
      if (!keepExisting) {
        if (!window.confirm("Manual changes will be deleted. Are you sure?")) return;
      }
    }
    runAllocationAndSave("Auto allocation saved.", "Auto allocation", false, {
      keepExisting: keepExisting,
    });
  }

  function autoAllocateIfDue() {
    if (!hasSession()) return Promise.resolve(false);
    var month = currentMonthKey();
    var lastFriday = lastFridayOfMonth(month);
    if (startOfDay(new Date()) < lastFriday) return Promise.resolve(false);
    if (!autoAllocationSlots().length) return Promise.resolve(false);
    return runAllocationAndSave("Automatic allocation updated.", "Automatic allocation", true, {
      keepExisting: true,
    });
  }

  function runAllocationAndSave(successMessage, reason, onlyIfChanged, options) {
    options = options || {};
    if (!autoAllocationSlots().length) {
      setStatus("allocation", "No enabled games for " + formatMonthHeading(autoAllocationMonthKey()) + ".");
      return Promise.resolve(false);
    }
    var changed = allocate(reason, options);
    renderAll();
    if (!changed && onlyIfChanged) return Promise.resolve(false);
    if (!changed) {
      setStatus("allocation", "Allocation already up to date.");
      return Promise.resolve(false);
    }
    return saveCurrentState(activeTab === "games" ? "games" : "allocation", successMessage);
  }

  function allocate(reason, options) {
    var nextAllocations = buildAllocations(options || {});
    var changed = JSON.stringify(nextAllocations) !== JSON.stringify(state.allocations || {});
    state.allocations = nextAllocations;
    if (changed) state.changes.push(change("allocate", reason || "Allocated games"));
    return changed;
  }

  function buildAllocations(options) {
    options = options || {};
    var targetSlots = autoAllocationSlots();
    var targetSlotIds = {};
    var allocations = {};
    var allocationCount = {};
    Object.keys(state.allocations || {}).forEach(function (slotId) {
      var allocation = allocationForSlot(slotId);
      var slot = getSlot(slotId);
      if (slot && targetSlots.some(function (targetSlot) { return targetSlot.id === slotId; })) {
        targetSlotIds[slotId] = true;
        if (options.keepExisting) {
          allocations[slotId] = allocation;
        }
        return;
      }
      if (allocation.players.length || allocation.yellowCandidates.length) {
        allocations[slotId] = allocation;
      }
    });

    targetSlots.forEach(function (slot) {
      targetSlotIds[slot.id] = true;
      if (!allocations[slot.id]) {
        allocations[slot.id] = { players: [], yellowCandidates: [], confirmed: [] };
      }
    });

    users.forEach(function (user) {
      allocationCount[user.id] = 0;
    });

    Object.keys(targetSlotIds).forEach(function (slotId) {
      (allocations[slotId].players || []).forEach(function (playerId) {
        allocationCount[playerId] = (allocationCount[playerId] || 0) + 1;
      });
    });

    uniqueDates(targetSlots).forEach(function (date) {
      var daySlots = targetSlots.filter(function (slot) {
        return slot.date === date;
      });
      var dayAssigned = {};

      daySlots.forEach(function (slot) {
        allocations[slot.id].players = allocations[slot.id].players.filter(isActiveUser);
        allocations[slot.id].confirmed = allocations[slot.id].players.slice();
        allocations[slot.id].yellowCandidates = [];
        allocations[slot.id].players.forEach(function (playerId) {
          dayAssigned[playerId] = slot.id;
        });
      });

      daySlots
        .slice()
        .sort(function (a, b) {
          return greenCandidates(a.id).length - greenCandidates(b.id).length || compareSlots(a, b);
        })
        .forEach(function (slot) {
          greenCandidates(slot.id)
            .filter(isActiveUser)
            .filter(function (playerId) {
              return !dayAssigned[playerId];
            })
            .sort(function (a, b) {
              return (
                dayYellowOptions(a, date, targetSlots).length - dayYellowOptions(b, date, targetSlots).length ||
                dayGreenOptions(a, date, targetSlots).length - dayGreenOptions(b, date, targetSlots).length ||
                (allocationCount[a] || 0) - (allocationCount[b] || 0) ||
                stableHash(a + slot.id) - stableHash(b + slot.id)
              );
            })
            .some(function (playerId) {
              if (allocations[slot.id].players.length >= 4) return true;
              addAllocatedPlayer(allocations, allocationCount, dayAssigned, slot.id, playerId);
              return false;
            });
        });

      daySlots
        .slice()
        .sort(function (a, b) {
          return allocations[a.id].players.length - allocations[b.id].players.length || compareSlots(a, b);
        })
        .forEach(function (slot) {
          yellowCandidates(slot.id)
            .filter(isActiveUser)
            .filter(function (playerId) {
              return !dayAssigned[playerId] && allocations[slot.id].players.indexOf(playerId) < 0;
            })
            .sort(function (a, b) {
              return (
                (allocationCount[a] || 0) - (allocationCount[b] || 0) ||
                dayGreenOptions(a, date, targetSlots).length - dayGreenOptions(b, date, targetSlots).length ||
                stableHash(a + slot.id + "yellow") - stableHash(b + slot.id + "yellow")
              );
            })
            .some(function (playerId) {
              if (allocations[slot.id].players.length >= 4) return true;
              addAllocatedPlayer(allocations, allocationCount, dayAssigned, slot.id, playerId);
              return false;
            });
        });

      daySlots.forEach(function (slot) {
        if (allocations[slot.id].players.length >= 4) return;
        allocations[slot.id].yellowCandidates = willingCandidates(slot.id)
          .filter(isActiveUser)
          .filter(function (playerId) {
            return (
              dayAssigned[playerId] &&
              dayAssigned[playerId] !== slot.id &&
              allocations[slot.id].players.indexOf(playerId) < 0
            );
          })
          .sort(function (a, b) {
            return (
              (allocationCount[a] || 0) - (allocationCount[b] || 0) ||
              stableHash(a + slot.id + "double") - stableHash(b + slot.id + "double")
            );
          });
      });
    });

    return allocations;
  }

  function addAllocatedPlayer(allocations, allocationCount, dayAssigned, slotId, playerId) {
    allocations[slotId].players.push(playerId);
    allocations[slotId].confirmed = allocations[slotId].players.slice();
    dayAssigned[playerId] = slotId;
    allocationCount[playerId] = (allocationCount[playerId] || 0) + 1;
  }

  function greenCandidates(slotId) {
    return Object.keys(state.availability).filter(function (playerId) {
      return (state.availability[playerId].green || []).indexOf(slotId) >= 0;
    });
  }

  function yellowCandidates(slotId) {
    return Object.keys(state.availability).filter(function (playerId) {
      return (state.availability[playerId].yellow || []).indexOf(slotId) >= 0;
    });
  }

  function willingCandidates(slotId) {
    return Object.keys(state.availability).filter(function (playerId) {
      var availability = state.availability[playerId] || {};
      return (
        (availability.green || []).indexOf(slotId) >= 0 ||
        (availability.yellow || []).indexOf(slotId) >= 0
      );
    });
  }

  function dayGreenOptions(playerId, date, slots) {
    var availability = state.availability[playerId] || {};
    return (slots || enabledSlots()).filter(function (slot) {
      return slot.date === date && (availability.green || []).indexOf(slot.id) >= 0;
    });
  }

  function dayYellowOptions(playerId, date, slots) {
    var availability = state.availability[playerId] || {};
    return (slots || enabledSlots()).filter(function (slot) {
      return slot.date === date && (availability.yellow || []).indexOf(slot.id) >= 0;
    });
  }

  function renderUsers() {
    el.usersList.innerHTML = "";
    users.forEach(function (user) {
      var row = document.createElement("div");
      row.className = "user-row";
      var name = document.createElement("span");
      name.className = "user-name";
      name.textContent = user.name;
      row.appendChild(name);

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button text";
      remove.textContent = "Delete";
      remove.addEventListener("click", function () {
        deleteUser(user.id);
      });
      row.appendChild(remove);
      el.usersList.appendChild(row);
    });
  }

  function addUser() {
    var name = el.newUserInput.value.trim();
    if (!name) {
      setStatus("users", "Enter a user name.");
      return;
    }
    var seen = {};
    users.forEach(function (user) {
      seen[user.id] = true;
    });
    var user = { id: uniqueUserId(slugify(name), seen), name: name };
    users.push(user);
    users = sortUsersByName(users);
    state.players[user.id] = { name: user.name };
    el.newUserInput.value = "";
    saveUsersFile("users", "User added.").then(function () {
      return saveCurrentState("users", "User added.");
    });
  }

  function deleteUser(userId) {
    var user = getUser(userId);
    if (!user || !window.confirm("Delete " + user.name + "?")) return;
    var deletingCurrentUser = session.userId === userId;
    users = users.filter(function (item) {
      return item.id !== userId;
    });
    users = sortUsersByName(users);
    delete state.players[userId];
    delete state.availability[userId];
    Object.keys(state.allocations).forEach(function (slotId) {
      var allocation = allocationForSlot(slotId);
      allocation.players = allocation.players.filter(function (id) {
        return id !== userId;
      });
      allocation.confirmed = allocation.confirmed.filter(function (id) {
        return id !== userId;
      });
      allocation.yellowCandidates = allocation.yellowCandidates.filter(function (id) {
        return id !== userId;
      });
      state.allocations[slotId] = allocation;
    });
    saveUsersFile("users", "User deleted.").then(function () {
      return saveCurrentState("users", "User deleted.");
    }).then(function () {
      if (deletingCurrentUser) signOut();
    });
  }

  function syncStatePlayersWithUsers() {
    users.forEach(function (user) {
      state.players[user.id] = { name: user.name };
    });
  }

  function isActiveUser(userId) {
    return users.some(function (user) {
      return user.id === userId;
    });
  }

  function sortUsersByName(list) {
    return (list || []).slice().sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""), "en-GB", {
        sensitivity: "base",
      });
    });
  }

  function getUser(userId) {
    return users.find(function (user) {
      return user.id === userId;
    });
  }

  function playerName(playerId) {
    var user = getUser(playerId);
    return (user && user.name) || (state.players[playerId] && state.players[playerId].name) || playerId;
  }

  function readOnlyChip(className, text) {
    var chip = document.createElement("span");
    chip.className = className;
    chip.textContent = text;
    return chip;
  }

  function pruneOldState(input) {
    var next = input || createEmptyState();
    var cutoff = retentionCutoffDate();
    var keptSlotIds = {};

    next.slots = (next.slots || []).filter(function (slot) {
      if (!slot || !slot.date || !isValidDateKey(slot.date)) return false;
      return parseDateKey(slot.date) >= cutoff;
    });
    next.slots.forEach(function (slot) {
      keptSlotIds[slot.id] = true;
    });

    var allocations = {};
    Object.keys(next.allocations || {}).forEach(function (slotId) {
      if (keptSlotIds[slotId]) allocations[slotId] = next.allocations[slotId];
    });
    next.allocations = allocations;

    Object.keys(next.availability || {}).forEach(function (playerId) {
      var availability = next.availability[playerId] || {};
      availability.green = (availability.green || []).filter(function (slotId) {
        return keptSlotIds[slotId];
      });
      availability.yellow = (availability.yellow || []).filter(function (slotId) {
        return keptSlotIds[slotId];
      });
      next.availability[playerId] = availability;
      if (
        !availability.green.length &&
        !availability.yellow.length &&
        isOlderThanCutoff(availability.updatedAt, cutoff) &&
        !playerHasAllocation(playerId, next.allocations)
      ) {
        delete next.availability[playerId];
        delete next.players[playerId];
      }
    });

    next.changes = (next.changes || []).filter(function (entry) {
      return !entry.at || !isOlderThanCutoff(entry.at, cutoff);
    });
    return next;
  }

  function retentionCutoffDate() {
    var cutoff = startOfDay(new Date());
    cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
    return cutoff;
  }

  function isOlderThanCutoff(value, cutoff) {
    if (!value) return true;
    var time = Date.parse(value);
    return Number.isNaN(time) ? false : time < cutoff.getTime();
  }

  function playerHasAllocation(playerId, allocations) {
    return Object.keys(allocations || {}).some(function (slotId) {
      var allocation = allocations[slotId] || {};
      return (
        (allocation.players || []).indexOf(playerId) >= 0 ||
        (allocation.yellowCandidates || []).indexOf(playerId) >= 0
      );
    });
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
    Object.keys(state.allocations).forEach(function (slotId) {
      if (idMap[slotId]) {
        state.allocations[idMap[slotId]] = state.allocations[slotId];
        delete state.allocations[slotId];
      }
    });
  }

  function enabledSlots() {
    return state.slots.filter(function (slot) {
      return slot.enabled !== false;
    }).sort(compareSlots);
  }

  function allocationForSlot(slotId) {
    var allocation = state.allocations[slotId] || {};
    return {
      players: Array.isArray(allocation.players) ? allocation.players.slice() : [],
      yellowCandidates: Array.isArray(allocation.yellowCandidates)
        ? allocation.yellowCandidates.slice()
        : [],
      confirmed: Array.isArray(allocation.confirmed) ? allocation.confirmed.slice() : [],
    };
  }

  function uniqueDates(slots) {
    var seen = {};
    return slots
      .map(function (slot) {
        return slot.date;
      })
      .filter(function (date) {
        if (seen[date]) return false;
        seen[date] = true;
        return true;
      })
      .sort();
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

  function formatSlotFull(slot) {
    return formatSlotDate(slot.date) + " at " + slot.time;
  }

  function formatSlotDate(dateKey) {
    var date = parseDateKey(dateKey);
    return WEEKDAY[date.getDay()] + " " + ordinal(date.getDate()) + " " + monthName(date);
  }

  function formatMonthHeading(monthKey) {
    var parts = monthKey.split("-");
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    return monthName(date) + " " + parts[0];
  }

  function availabilityTitleRange() {
    var months = availabilityMonthKeys().filter(function (monthKey) {
      return availabilitySlots().some(function (slot) {
        return slot.date.slice(0, 7) === monthKey;
      });
    });
    if (!months.length) months = availabilityMonthKeys();
    return months.map(formatMonthHeading).join(" and ");
  }

  function scheduleMonthKeys() {
    var month = currentMonthKey();
    return [month, addMonthsToMonthKey(month, 1)];
  }

  function availabilityMonthKeys() {
    return [addMonthsToMonthKey(currentMonthKey(), 1)];
  }

  function availabilitySlots() {
    var months = availabilityMonthKeys();
    return enabledSlots().filter(function (slot) {
      return months.indexOf(slot.date.slice(0, 7)) >= 0;
    });
  }

  function autoAllocationMonthKey() {
    return addMonthsToMonthKey(currentMonthKey(), 1);
  }

  function autoAllocationSlots() {
    var month = autoAllocationMonthKey();
    return enabledSlots().filter(function (slot) {
      return slot.date.slice(0, 7) === month;
    });
  }

  function hasAllocationsInMonth(monthKey) {
    return enabledSlots().some(function (slot) {
      if (slot.date.slice(0, 7) !== monthKey) return false;
      var allocation = allocationForSlot(slot.id);
      return allocation.players.length || allocation.yellowCandidates.length;
    });
  }

  function addMonthsToMonthKey(monthKey, offset) {
    var parts = monthKey.split("-").map(Number);
    var date = new Date(parts[0], parts[1] - 1 + offset, 1);
    return date.getFullYear() + "-" + pad(date.getMonth() + 1);
  }

  function currentMonthKey() {
    var now = new Date();
    return now.getFullYear() + "-" + pad(now.getMonth() + 1);
  }

  function lastFridayOfMonth(monthKey) {
    var parts = monthKey.split("-").map(Number);
    var date = new Date(parts[0], parts[1], 0);
    while (date.getDay() !== 5) {
      date.setDate(date.getDate() - 1);
    }
    return startOfDay(date);
  }

  function parseDateKey(dateKey) {
    var parts = String(dateKey).split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function isValidDateKey(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return false;
    return !Number.isNaN(parseDateKey(dateKey).getTime());
  }

  function toDateKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function formatDateLong(date) {
    return date.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
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
    return String(value || "")
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

  function setStatus(target, text) {
    var map = {
      signIn: el.signInStatus,
      games: el.gamesStatus,
      availability: el.availabilityStatus,
      allocation: el.allocationStatus,
      setup: el.setupStatus,
      users: el.usersStatus,
      profile: el.profileStatus,
      admin: el.allocationStatus,
    };
    if (map[target]) map[target].textContent = text || "";
  }

  function base64Encode(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    bytes.forEach(function (byte) {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
