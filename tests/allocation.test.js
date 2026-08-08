"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

process.env.TZ = "Europe/London";

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const sharedUsers = JSON.parse(fs.readFileSync(path.join(root, "data/users.json"), "utf8")).users;

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.attributes = {};
    this.listeners = {};
    this.classList = {
      add: (...names) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.add(name));
        this.className = Array.from(classes).join(" ");
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}

function createHarness(now) {
  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return new Date(now).getTime();
    }
  }

  const source = appSource.replace(
    /\}\)\(\);\s*$/,
    `globalThis.__test = {
      setState: function (value) { state = normalizeState(value); },
      setUsers: function (value) { users = normalizeUsers(value); },
      setSession: function (value) { session = value; },
      getState: function () { return state; },
      dueAllocationMonthKeys: dueAllocationMonthKeys,
      dueDefaultSetupMonthKeys: dueDefaultSetupMonthKeys,
      ensureDueDefaultMonthSlots: ensureDueDefaultMonthSlots,
      ensureDefaultMonthSlots: ensureDefaultMonthSlots,
      allocationSlotsForMonth: allocationSlotsForMonth,
      allocate: allocate,
      markMonthAllocationStarted: markMonthAllocationStarted,
      responseHistoryMonthKeys: responseHistoryMonthKeys,
      historicalAllocationStatus: historicalAllocationStatus,
      setResponsesList: function (value) { el.responsesList = value; },
      renderResponseHistory: renderResponseHistory,
      scheduleRow: scheduleRow,
      candidateChip: candidateChip
    };
  })();`
  );
  const context = {
    Date: FakeDate,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    document: {
      addEventListener() {},
      createElement(tagName) {
        return new FakeElement(tagName);
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.__test.setUsers(sharedUsers);
  context.__test.setSession({ token: "test", userId: "mike-ertl", isAdmin: true });
  return context.__test;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function allocationFixture() {
  return {
    version: 1,
    month: "2026-08",
    venue: "Longbourn",
    slots: [
      {
        id: "2026-08-28T10:30",
        date: "2026-08-28",
        time: "10:30",
        enabled: true,
      },
      {
        id: "2026-08-28T11:45",
        date: "2026-08-28",
        time: "11:45",
        enabled: true,
      },
    ],
    players: {},
    availability: {
      "chris-dalley": {
        green: ["2026-08-28T10:30", "2026-08-28T11:45"],
        yellow: [],
      },
      "chris-danzinger": {
        green: ["2026-08-28T10:30"],
        yellow: ["2026-08-28T11:45"],
      },
      "david-taylor": {
        green: ["2026-08-28T10:30"],
        yellow: [],
      },
      "phil-charles": {
        green: ["2026-08-28T10:30"],
        yellow: ["2026-08-28T11:45"],
      },
      rachel: {
        green: ["2026-08-28T10:30"],
        yellow: [],
      },
      "jo-tr": {
        green: [],
        yellow: ["2026-08-28T10:30"],
      },
    },
    allocations: {},
    allocatedMonths: {
      "2026-07": {
        allocatedAt: "2026-06-26T08:00:00.000Z",
        allocatedBy: "test",
        automatic: true,
        completed: true,
      },
    },
    changes: [],
  };
}

function elementText(element) {
  return [element.textContent]
    .concat(element.children.map(elementText))
    .filter(Boolean)
    .join(" ");
}

function elementsByTag(element, tagName) {
  return (element.tagName === tagName ? [element] : []).concat(
    element.children.flatMap((child) => elementsByTag(child, tagName))
  );
}

function elementsByClass(element, className) {
  return (element.classList && element.classList.contains(className) ? [element] : []).concat(
    element.children.flatMap((child) => elementsByClass(child, className))
  );
}

function testAllocationRunsOnDueDateOnlyOnce() {
  const app = createHarness("2026-07-31T08:00:00+01:00");
  app.setState(allocationFixture());
  assert.deepStrictEqual(Array.from(app.dueAllocationMonthKeys()), ["2026-08"]);
  app.ensureDefaultMonthSlots("2026-08");
  app.allocate("2026-08", "Automatic allocation", {
    keepExisting: true,
    automatic: true,
    catchUp: false,
  });
  const marker = app.getState().allocatedMonths["2026-08"];
  assert.strictEqual(marker.catchUp, false);
  assert.strictEqual(marker.completed, true);
  assert.deepStrictEqual(Array.from(app.dueAllocationMonthKeys()), []);
}

function testLastFridayOpensFollowingResponseMonth() {
  const app = createHarness("2026-07-31T08:00:00+01:00");
  app.setState(allocationFixture());

  assert.deepStrictEqual(Array.from(app.dueDefaultSetupMonthKeys()), ["2026-09"]);
  assert.deepStrictEqual(Array.from(app.ensureDueDefaultMonthSlots()), ["2026-09"]);

  const septemberSlots = app.getState().slots.filter((slot) =>
    slot.date.startsWith("2026-09")
  );
  assert.strictEqual(septemberSlots.length, 20);
  assert.deepStrictEqual(
    Array.from(
      new Set(septemberSlots.filter((slot) => slot.enabled).map((slot) => slot.time))
    ),
    ["10:30", "11:45"]
  );
  assert.deepStrictEqual(Array.from(app.dueDefaultSetupMonthKeys()), []);
  assert.deepStrictEqual(Array.from(app.ensureDueDefaultMonthSlots()), []);

  app.setState(clone(app.getState()));
  assert.strictEqual(
    app.getState().slots.filter((slot) => slot.date.startsWith("2026-09")).length,
    20,
    "pre-created slots must survive pruning before September becomes active"
  );
}

function testResponseMonthDoesNotOpenBeforeLastFriday() {
  const app = createHarness("2026-07-30T08:00:00+01:00");
  app.setState(allocationFixture());

  assert.deepStrictEqual(Array.from(app.dueDefaultSetupMonthKeys()), []);
  assert.deepStrictEqual(Array.from(app.ensureDueDefaultMonthSlots()), []);
}

function testMissedLastFridayCreatesDefaultsOnNextRefresh() {
  const app = createHarness("2026-08-01T09:00:00+01:00");
  app.setState(allocationFixture());

  assert.deepStrictEqual(Array.from(app.dueDefaultSetupMonthKeys()), ["2026-09"]);
  assert.deepStrictEqual(Array.from(app.ensureDueDefaultMonthSlots()), ["2026-09"]);
  assert.strictEqual(
    app.getState().slots.filter(
      (slot) => slot.date.startsWith("2026-09") && slot.enabled
    ).length,
    8
  );
}

function testExistingMonthSetupIsNotOverwritten() {
  const app = createHarness("2026-08-01T09:00:00+01:00");
  const customState = allocationFixture();
  customState.slots.push({
    id: "2026-09-04T09:15",
    date: "2026-09-04",
    time: "09:15",
    enabled: true,
  });
  app.setState(customState);

  assert.deepStrictEqual(Array.from(app.dueDefaultSetupMonthKeys()), []);
  assert.deepStrictEqual(Array.from(app.ensureDueDefaultMonthSlots()), []);
  assert.deepStrictEqual(
    Array.from(
      app.getState().slots
        .filter((slot) => slot.date.startsWith("2026-09"))
        .map((slot) => slot.id)
    ),
    ["2026-09-04T09:15"]
  );
}

function testMissedAugustCatchUp() {
  const app = createHarness("2026-08-02T09:00:00+01:00");
  app.setState(allocationFixture());

  assert.deepStrictEqual(
    Array.from(app.dueAllocationMonthKeys()),
    ["2026-08"],
    "August should remain due after the calendar rolls into August"
  );

  app.ensureDefaultMonthSlots("2026-08");
  assert.strictEqual(
    app.allocate("2026-08", "Automatic catch-up allocation", {
      keepExisting: true,
      automatic: true,
      catchUp: true,
    }),
    true
  );

  const state = app.getState();
  const marker = state.allocatedMonths["2026-08"];
  assert.strictEqual(marker.completed, true);
  assert.strictEqual(marker.automatic, true);
  assert.strictEqual(marker.catchUp, true);
  assert.strictEqual(marker.dueDate, "2026-07-31");
  assert.deepStrictEqual(
    Array.from(state.allocations["2026-08-28T10:30"].players).sort(),
    ["chris-danzinger", "david-taylor", "phil-charles", "rachel"]
  );
  assert.deepStrictEqual(
    Array.from(marker.responses["2026-08-28T10:30"].green),
    ["chris-dalley", "chris-danzinger", "david-taylor", "phil-charles", "rachel"]
  );
  assert.deepStrictEqual(
    Array.from(marker.responses["2026-08-28T10:30"].yellow),
    ["jo-tr"]
  );
  assert.strictEqual(
    app.historicalAllocationStatus("chris-dalley", "2026-08-28", marker),
    "Allocated at 11:45"
  );
  assert.strictEqual(
    app.historicalAllocationStatus("jo-tr", "2026-08-28", marker),
    "Not selected"
  );
  assert.deepStrictEqual(
    Array.from(app.responseHistoryMonthKeys("2026-09")),
    ["2026-08"]
  );
  const responsesList = new FakeElement("div");
  app.setResponsesList(responsesList);
  app.renderResponseHistory("2026-09");
  assert.strictEqual(responsesList.children.length, 1);
  assert.match(elementText(responsesList), /August 2026 - Responses used for allocation/);
  assert.match(elementText(responsesList), /Jo TR Not selected/);
  assert.match(elementText(responsesList), /Chris Dalley Allocated at 11:45/);

  const snapshotBefore = JSON.stringify(marker.responses);
  state.availability["jo-tr"].yellow = [];
  state.allocations["2026-08-28T11:45"].players =
    state.allocations["2026-08-28T11:45"].players.filter((id) => id !== "chris-dalley");
  state.allocations["2026-08-28T10:30"].players.push("chris-dalley");
  assert.strictEqual(JSON.stringify(marker.responses), snapshotBefore);
  assert.strictEqual(
    app.historicalAllocationStatus("chris-dalley", "2026-08-28", marker),
    "Originally 11:45; now 10:30"
  );
}

function testManualStartDoesNotBlockDueAllocation() {
  const app = createHarness("2026-08-02T09:00:00+01:00");
  app.setState(allocationFixture());
  app.getState().allocations["2026-08-28T10:30"] = {
    players: ["jo-tr"],
    confirmed: ["jo-tr"],
    yellowCandidates: [],
  };
  app.markMonthAllocationStarted("2026-08");
  assert.strictEqual(app.getState().allocatedMonths["2026-08"].completed, false);
  assert.deepStrictEqual(Array.from(app.dueAllocationMonthKeys()), ["2026-08"]);
  app.allocate("2026-08", "Automatic catch-up allocation", {
    keepExisting: true,
    automatic: true,
    catchUp: true,
  });
  assert.strictEqual(
    app.getState().allocations["2026-08-28T10:30"].players.includes("jo-tr"),
    true,
    "an existing manual selection should survive automatic catch-up"
  );
}

function testLateCatchUpLeavesPastGamesUntouched() {
  const app = createHarness("2026-09-06T09:00:00+01:00");
  app.setUsers([{ id: "player", name: "Player" }]);
  app.setState({
    version: 1,
    slots: [
      {
        id: "2026-09-04T10:30",
        date: "2026-09-04",
        time: "10:30",
        enabled: true,
      },
      {
        id: "2026-09-11T10:30",
        date: "2026-09-11",
        time: "10:30",
        enabled: true,
      },
    ],
    players: { player: { name: "Player" } },
    availability: {
      player: {
        green: ["2026-09-04T10:30", "2026-09-11T10:30"],
        yellow: [],
      },
    },
    allocations: {},
    allocatedMonths: {},
  });

  assert.deepStrictEqual(Array.from(app.dueAllocationMonthKeys()), ["2026-09"]);
  assert.deepStrictEqual(
    Array.from(app.allocationSlotsForMonth("2026-09", true)).map((slot) => slot.id),
    ["2026-09-11T10:30"]
  );
  app.allocate("2026-09", "Automatic catch-up allocation", {
    keepExisting: true,
    automatic: true,
    catchUp: true,
  });
  const allocations = app.getState().allocations;
  assert.strictEqual(allocations["2026-09-04T10:30"], undefined);
  assert.deepStrictEqual(
    Array.from(allocations["2026-09-11T10:30"].players),
    ["player"]
  );
}

function testLegacyCompletedMarkerRemainsComplete() {
  const app = createHarness("2026-09-06T09:00:00+01:00");
  app.setState({
    version: 1,
    slots: [
      {
        id: "2026-09-11T10:30",
        date: "2026-09-11",
        time: "10:30",
        enabled: true,
      },
    ],
    players: {},
    availability: {},
    allocations: {},
    allocatedMonths: {
      "2026-09": {
        allocatedAt: "2026-08-28T08:00:00.000Z",
        allocatedBy: "legacy-user",
        automatic: true,
      },
    },
  });
  assert.deepStrictEqual(Array.from(app.dueAllocationMonthKeys()), []);
  assert.strictEqual(app.getState().allocatedMonths["2026-09"].completed, true);
}

function testGamesSelfServiceControls() {
  const app = createHarness("2026-08-02T09:00:00+01:00");
  const fixture = allocationFixture();
  const slot = fixture.slots[0];
  fixture.allocations[slot.id] = {
    players: ["jo-tr", "chris-dalley", "chris-danzinger"],
    confirmed: ["jo-tr", "chris-dalley", "chris-danzinger"],
    yellowCandidates: [],
  };
  app.setSession({ token: "test", userId: "jo-tr", isAdmin: false });
  app.setState(fixture);

  let row = app.scheduleRow(slot);
  assert.deepStrictEqual(
    elementsByTag(row, "button").map((button) => button.textContent),
    ["Remove me"]
  );
  assert.strictEqual(elementsByClass(row, "my-player-chip").length, 1);
  assert.strictEqual(elementsByClass(row, "my-player-chip")[0].textContent, "Jo TR");

  fixture.allocations[slot.id] = {
    players: ["chris-dalley", "chris-danzinger", "david-taylor"],
    confirmed: ["chris-dalley", "chris-danzinger", "david-taylor"],
    yellowCandidates: ["jo-tr"],
  };
  app.setState(fixture);
  row = app.scheduleRow(slot);
  assert.deepStrictEqual(
    elementsByTag(row, "button").map((button) => button.textContent),
    ["Confirm my slot", "Remove me"]
  );
  assert.strictEqual(elementsByClass(row, "my-player-chip").length, 1);
  assert.strictEqual(elementsByClass(row, "my-player-chip")[0].textContent, "*Jo TR");

  const adminCandidate = app.candidateChip(slot.id, "jo-tr", true);
  assert.deepStrictEqual(
    elementsByTag(adminCandidate, "button").map((button) => button.textContent),
    ["Confirm", "×"]
  );
}

testAllocationRunsOnDueDateOnlyOnce();
testLastFridayOpensFollowingResponseMonth();
testResponseMonthDoesNotOpenBeforeLastFriday();
testMissedLastFridayCreatesDefaultsOnNextRefresh();
testExistingMonthSetupIsNotOverwritten();
testMissedAugustCatchUp();
testManualStartDoesNotBlockDueAllocation();
testLateCatchUpLeavesPastGamesUntouched();
testLegacyCompletedMarkerRemainsComplete();
testGamesSelfServiceControls();

console.log("Allocation, response-history, and Games self-service tests passed.");
