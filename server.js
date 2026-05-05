const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const STATE_FILE = path.join(DATA_DIR, "state-store.json");
const COMMANDS_FILE = path.join(DATA_DIR, "commands-store.json");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);
const AGENT_TOKEN = process.env.OC_AGENT_TOKEN || "change-me";
const DEFAULT_SYNC_INTERVAL_SECONDS = Number(process.env.SYNC_INTERVAL_SECONDS || 45);
const STALE_AFTER_SECONDS = DEFAULT_SYNC_INTERVAL_SECONDS * 3;
const FLUX_HISTORY_LIMIT = Number(process.env.FLUX_HISTORY_LIMIT || 24);
const COMMAND_RESEND_AFTER_MS = Number(process.env.COMMAND_RESEND_AFTER_MS || 120000);
const COMMAND_EXPIRY_MS = Number(process.env.COMMAND_EXPIRY_MS || 24 * 60 * 60 * 1000);
const BODY_LIMIT_BYTES = Number(process.env.BODY_LIMIT_BYTES || 2 * 1024 * 1024);
const MAX_RECENT_COMMANDS = 40;
const SHOWCASE_LEVELS = [1, 2, 3, 4, 5, 6];

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

const LOW_TEMP_COOLANT_HINTS = [
  "низкотемператур",
  "low temperature coolant",
  "low_temperature_coolant",
  "low temp coolant",
  "low_temp_coolant",
];

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();

    if (["1", "true", "yes", "on"].includes(lowered)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(lowered)) {
      return false;
    }
  }

  return fallback;
}

function safeText(value, fallback = "") {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value, 0) * factor) / factor;
}

function percentage(current, max) {
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (current / max) * 100));
}

function sum(values) {
  return values.reduce((total, value) => total + toNumber(value, 0), 0);
}

function minPositive(values) {
  const positives = values.filter((value) => Number.isFinite(value) && value > 0);
  return positives.length ? Math.min(...positives) : null;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function createEmptyState() {
  return {
    placeholderMode: true,
    updatedAt: nowIso(),
    stations: [],
  };
}

function sanitizePersistedStations(stations) {
  if (!Array.isArray(stations)) {
    return [];
  }

  return stations.filter((station) => {
    if (!station || typeof station !== "object") {
      return false;
    }

    if (!Array.isArray(station.reactors)) {
      return true;
    }

    return !station.reactors.every((reactor) => reactor && reactor.isDemo);
  });
}

function loadStore() {
  ensureDataDir();

  const persistedState = readJson(STATE_FILE, null);
  const persistedCommands = readJson(COMMANDS_FILE, null);
  const emptyState = createEmptyState();
  const stations = sanitizePersistedStations(persistedState?.stations);

  return {
    placeholderMode:
      persistedState && Array.isArray(persistedState.stations)
        ? Boolean(persistedState.placeholderMode) || !stations.length
        : emptyState.placeholderMode,
    stations: stations.length ? stations : emptyState.stations,
    commands: persistedCommands && Array.isArray(persistedCommands.commands) ? persistedCommands.commands : [],
  };
}

const store = loadStore();

function persistState() {
  writeJson(STATE_FILE, {
    placeholderMode: store.placeholderMode,
    updatedAt: nowIso(),
    stations: store.stations,
  });
}

function persistCommands() {
  writeJson(COMMANDS_FILE, {
    updatedAt: nowIso(),
    commands: store.commands,
  });
}

function normalizeFluid(rawFluid, index) {
  const amount = Math.max(
    0,
    toNumber(
      rawFluid.amount ??
        rawFluid.size ??
        rawFluid.qty ??
        rawFluid.quantity ??
        rawFluid.total ??
        rawFluid.stored,
      0
    )
  );

  return {
    id: safeText(rawFluid.id || rawFluid.name || rawFluid.label || `fluid-${index + 1}`),
    name: safeText(rawFluid.name || rawFluid.id || rawFluid.label || `fluid-${index + 1}`),
    label: safeText(rawFluid.label || rawFluid.localizedName || rawFluid.name || rawFluid.id || `Жидкость ${index + 1}`),
    amount,
  };
}

function isLowTempCoolant(fluid) {
  const haystack = `${fluid.label} ${fluid.name} ${fluid.id}`.toLowerCase();
  return LOW_TEMP_COOLANT_HINTS.some((hint) => haystack.includes(hint));
}

function normalizeMe(rawMe) {
  if (!rawMe || typeof rawMe !== "object") {
    return null;
  }

  const trackedFluids = Array.isArray(rawMe.trackedFluids)
    ? rawMe.trackedFluids.map(normalizeFluid)
    : [];

  const lowTempCoolant = rawMe.lowTempCoolant
    ? normalizeFluid(rawMe.lowTempCoolant, 0)
    : trackedFluids.find(isLowTempCoolant) || null;

  return {
    address: safeText(rawMe.address || "me-interface"),
    name: safeText(rawMe.name || "МЭ-сеть"),
    online: toBoolean(rawMe.online ?? rawMe.isNetworkPowered, false),
    storedPower: Math.max(0, toNumber(rawMe.storedPower, 0)),
    maxStoredPower: Math.max(0, toNumber(rawMe.maxStoredPower, 0)),
    avgPowerInjection: round(rawMe.avgPowerInjection, 2),
    avgPowerUsage: round(rawMe.avgPowerUsage, 2),
    idlePowerUsage: round(rawMe.idlePowerUsage, 2),
    energyDemand: round(rawMe.energyDemand, 2),
    lowTempCoolant,
    trackedFluids,
    cooldowns: rawMe.cooldowns && typeof rawMe.cooldowns === "object" ? rawMe.cooldowns : {},
  };
}

function normalizeFluxNetwork(rawFlux, index) {
  const energyInfo = rawFlux.energyInfo && typeof rawFlux.energyInfo === "object" ? rawFlux.energyInfo : {};
  const fluxInfo = rawFlux.fluxInfo && typeof rawFlux.fluxInfo === "object" ? rawFlux.fluxInfo : {};
  const countInfo = rawFlux.countInfo && typeof rawFlux.countInfo === "object" ? rawFlux.countInfo : {};

  return {
    networkId: safeText(rawFlux.networkId || rawFlux.address || `flux-${index + 1}`),
    address: safeText(rawFlux.address || rawFlux.networkId || `flux-${index + 1}`),
    name: safeText(
      rawFlux.name ||
        rawFlux.customName ||
        fluxInfo.customName ||
        energyInfo.name ||
        `Flux ${index + 1}`
    ),
    type: safeText(rawFlux.type || "controller"),
    storedEnergy: Math.max(
      0,
      toNumber(rawFlux.storedEnergy, 0),
      toNumber(rawFlux.totalEnergy, 0),
      toNumber(energyInfo.totalEnergy, 0)
    ),
    maxStoredEnergy: Math.max(
      0,
      toNumber(rawFlux.maxStoredEnergy, 0),
      toNumber(rawFlux.capacity, 0)
    ),
    buffer: Math.max(
      0,
      toNumber(rawFlux.buffer, 0),
      toNumber(rawFlux.totalBuffer, 0),
      toNumber(energyInfo.totalBuffer, 0),
      toNumber(fluxInfo.buffer, 0)
    ),
    transferLimit: Math.max(
      0,
      toNumber(rawFlux.transferLimit, 0),
      toNumber(fluxInfo.transferLimit, 0)
    ),
    inputPerTick: Math.max(0, toNumber(rawFlux.inputPerTick, toNumber(energyInfo.energyInput, 0))),
    outputPerTick: Math.max(0, toNumber(rawFlux.outputPerTick, toNumber(energyInfo.energyOutput, 0))),
    surgeMode: toBoolean(rawFlux.surgeMode ?? fluxInfo.surgeMode, false),
    unlimited: toBoolean(rawFlux.unlimited ?? fluxInfo.unlimited, false),
    countInfo: {
      controllerCount: Math.max(0, toNumber(countInfo.controllerCount, 0)),
      plugCount: Math.max(0, toNumber(countInfo.plugCount, 0)),
      pointCount: Math.max(0, toNumber(countInfo.pointCount, 0)),
      storageCount: Math.max(0, toNumber(countInfo.storageCount, 0)),
    },
  };
}

function normalizeFluxHistoryPoint(rawPoint) {
  return {
    at: safeText(rawPoint.at || rawPoint.timestamp || rawPoint.time || nowIso()),
    buffer: Math.max(0, toNumber(rawPoint.buffer, 0)),
    storedEnergy: Math.max(0, toNumber(rawPoint.storedEnergy, 0)),
    inputPerTick: Math.max(0, toNumber(rawPoint.inputPerTick, 0)),
    outputPerTick: Math.max(0, toNumber(rawPoint.outputPerTick, 0)),
  };
}

function summarizeFluxHistory(history) {
  if (!history.length) {
    return {
      averageBuffer: 0,
      peakBuffer: 0,
      averageInputPerTick: 0,
      averageOutputPerTick: 0,
    };
  }

  return {
    averageBuffer: round(sum(history.map((point) => point.buffer)) / history.length, 2),
    peakBuffer: Math.max(...history.map((point) => point.buffer)),
    averageInputPerTick: round(sum(history.map((point) => point.inputPerTick)) / history.length, 2),
    averageOutputPerTick: round(sum(history.map((point) => point.outputPerTick)) / history.length, 2),
  };
}

function attachFluxHistory(previousStation, fluxNetworks, reportTimeIso) {
  const previousNetworks = new Map(
    (previousStation?.fluxNetworks || []).map((network) => [
      network.networkId,
      Array.isArray(network.history) ? network.history.map(normalizeFluxHistoryPoint) : [],
    ])
  );

  return fluxNetworks.map((network) => {
    const historyPoint = normalizeFluxHistoryPoint({
      at: reportTimeIso,
      buffer: network.buffer,
      storedEnergy: network.storedEnergy,
      inputPerTick: network.inputPerTick,
      outputPerTick: network.outputPerTick,
    });

    const history = [...(previousNetworks.get(network.networkId) || [])]
      .filter((point) => point.at !== reportTimeIso)
      .concat(historyPoint)
      .slice(-FLUX_HISTORY_LIMIT);

    return {
      ...network,
      history,
      historySummary: summarizeFluxHistory(history),
    };
  });
}

function deriveFuelBurnRate(rawReactor, previousReactor, reportTimeIso, active) {
  const explicitRate = Math.max(0, toNumber(rawReactor.fuelBurnRatePerSecond, 0));

  if (!previousReactor || !active) {
    return explicitRate;
  }

  const previousFuel = toNumber(previousReactor.fuelRemaining, 0);
  const currentFuel = toNumber(rawReactor.fuelRemaining, 0);
  const previousTimestamp = previousReactor.updatedAt || previousReactor.lastSeenAt;
  const deltaSeconds = previousTimestamp
    ? (new Date(reportTimeIso).getTime() - new Date(previousTimestamp).getTime()) / 1000
    : 0;

  if (deltaSeconds > 0 && previousFuel > currentFuel) {
    return round((previousFuel - currentFuel) / deltaSeconds, 4);
  }

  return explicitRate;
}

function deriveReactorState(reactor) {
  if (!reactor.active) {
    return "stopped";
  }

  if (reactor.coolantRatio <= 12) {
    return "critical";
  }

  if (reactor.temperatureRatio >= 70 || reactor.fuelRatio <= 15) {
    return "warning";
  }

  return "running";
}

function normalizeReactor(rawReactor, index, previousReactor, reportTimeIso) {
  const active = toBoolean(
    rawReactor.active ?? rawReactor.hasWork ?? rawReactor.isRunning,
    toNumber(rawReactor.energyGeneration, 0) > 0
  );
  const level = Math.max(1, Math.min(6, toNumber(rawReactor.level ?? rawReactor.reactorLevel, 1)));
  const fuelRemaining = Math.max(0, toNumber(rawReactor.fuelRemaining, 0));
  const maxFuel = Math.max(fuelRemaining, toNumber(rawReactor.maxFuel, fuelRemaining));
  const coolant = Math.max(0, toNumber(rawReactor.coolant, 0));
  const maxCoolant = Math.max(coolant, toNumber(rawReactor.maxCoolant, coolant));
  const temperature = Math.max(0, toNumber(rawReactor.temperature, 0));
  const maxTemperature = Math.max(temperature, toNumber(rawReactor.maxTemperature, 0));
  const fuelBurnRatePerSecond = deriveFuelBurnRate(rawReactor, previousReactor, reportTimeIso, active);
  const estimatedSecondsRemaining =
    active && fuelBurnRatePerSecond > 0
      ? Math.round(fuelRemaining / fuelBurnRatePerSecond)
      : toNullableNumber(rawReactor.estimatedSecondsRemaining);

  const normalized = {
    reactorId: safeText(rawReactor.reactorId || rawReactor.address || rawReactor.name || `reactor-${index + 1}`),
    address: safeText(rawReactor.address || rawReactor.reactorId || `reactor-${index + 1}`),
    name: safeText(rawReactor.name || `Реактор ${index + 1}`),
    level,
    active,
    activeCooling: toBoolean(rawReactor.activeCooling ?? rawReactor.isActiveCooling, false),
    energyGeneration: Math.max(0, toNumber(rawReactor.energyGeneration, 0)),
    temperature,
    maxTemperature,
    coolant,
    maxCoolant,
    coolantPerSecond: Math.max(0, toNumber(rawReactor.coolantPerSecond ?? rawReactor.fluidCoolantConsume, 0)),
    fuelRemaining,
    maxFuel,
    fuelBurnRatePerSecond,
    estimatedSecondsRemaining,
    rodCount: Math.max(0, toNumber(rawReactor.rodCount, 0)),
    updatedAt: reportTimeIso,
  };

  normalized.fuelRatio = percentage(normalized.fuelRemaining, normalized.maxFuel);
  normalized.coolantRatio = percentage(normalized.coolant, normalized.maxCoolant);
  normalized.temperatureRatio = percentage(normalized.temperature, normalized.maxTemperature);
  normalized.state = deriveReactorState(normalized);

  return normalized;
}

function normalizeStation(rawReport) {
  const reportTimeIso = nowIso();
  const stationId = safeText(rawReport.stationId || rawReport.stationName || "reactor-station");
  const previousStation = store.stations.find((station) => station.stationId === stationId);
  const previousReactors = new Map(
    (previousStation?.reactors || []).map((reactor) => [reactor.reactorId, reactor])
  );

  const reactors = Array.isArray(rawReport.reactors)
    ? rawReport.reactors
        .map((reactor, index) => {
          const reactorId = safeText(reactor.reactorId || reactor.address || reactor.name || `reactor-${index + 1}`);
          return normalizeReactor(reactor, index, previousReactors.get(reactorId), reportTimeIso);
        })
        .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name, "ru"))
    : [];

  const baseFluxNetworks = Array.isArray(rawReport.fluxNetworks || rawReport.flux)
    ? (rawReport.fluxNetworks || rawReport.flux).map(normalizeFluxNetwork)
    : [];
  const fluxNetworks = attachFluxHistory(previousStation, baseFluxNetworks, reportTimeIso);

  return {
    stationId,
    stationName: safeText(rawReport.stationName || rawReport.stationId || "Реакторная станция"),
    intervalSeconds: Math.max(15, toNumber(rawReport.intervalSeconds, DEFAULT_SYNC_INTERVAL_SECONDS)),
    lastSeenAt: reportTimeIso,
    reactors,
    fluxNetworks,
    me: normalizeMe(rawReport.me),
  };
}

function stationSummary(station) {
  const activeReactors = station.reactors.filter((reactor) => reactor.active).length;
  const totalGeneration = sum(station.reactors.map((reactor) => reactor.energyGeneration));
  const totalFluxBuffer = sum(station.fluxNetworks.map((network) => network.buffer));
  const minRemainingSeconds = minPositive(
    station.reactors.map((reactor) => reactor.estimatedSecondsRemaining)
  );

  return {
    reactorCount: station.reactors.length,
    activeReactors,
    totalGeneration,
    totalFluxBuffer,
    minRemainingSeconds,
    lowTempCoolantAmount: station.me?.lowTempCoolant?.amount || 0,
  };
}

function pruneCommands() {
  const now = Date.now();

  store.commands = store.commands
    .map((command) => {
      if (
        ["queued", "dispatched"].includes(command.status) &&
        now - new Date(command.queuedAt).getTime() > COMMAND_EXPIRY_MS
      ) {
        return {
          ...command,
          status: "expired",
          finishedAt: command.finishedAt || nowIso(),
          resultMessage: command.resultMessage || "Команда протухла, потому что агент не вышел на связь.",
        };
      }

      return command;
    })
    .slice(0, 300);
}

function queueCommand(stationId, reactorId, action) {
  const timestamp = nowIso();
  const command = {
    id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    stationId,
    reactorId,
    action,
    status: "queued",
    queuedAt: timestamp,
    dispatchedAt: null,
    finishedAt: null,
    resultMessage: "",
  };

  store.commands.unshift(command);
  pruneCommands();
  persistCommands();
  return command;
}

function getDispatchableCommands(stationId) {
  const now = Date.now();
  const dispatchable = store.commands.filter((command) => {
    if (command.stationId !== stationId) {
      return false;
    }

    if (!["queued", "dispatched"].includes(command.status)) {
      return false;
    }

    if (command.status === "queued") {
      return true;
    }

    if (!command.dispatchedAt) {
      return true;
    }

    return now - new Date(command.dispatchedAt).getTime() >= COMMAND_RESEND_AFTER_MS;
  });

  if (dispatchable.length) {
    const timestamp = nowIso();

    dispatchable.forEach((command) => {
      command.status = "dispatched";
      command.dispatchedAt = timestamp;
    });

    persistCommands();
  }

  return dispatchable;
}

function applyCommandResults(stationId, commandResults) {
  if (!Array.isArray(commandResults) || !commandResults.length) {
    return;
  }

  let touched = false;

  commandResults.forEach((result) => {
    const commandId = safeText(result.commandId || result.id);
    const command = store.commands.find(
      (candidate) => candidate.id === commandId && candidate.stationId === stationId
    );

    if (!command) {
      return;
    }

    touched = true;
    command.status = toBoolean(result.success, false) ? "completed" : "failed";
    command.finishedAt = nowIso();
    command.resultMessage = safeText(result.message || (result.success ? "Выполнено." : "Не удалось выполнить."), "");
  });

  if (touched) {
    pruneCommands();
    persistCommands();
  }
}

function recentCommands() {
  pruneCommands();
  return [...store.commands]
    .sort((left, right) => new Date(right.queuedAt).getTime() - new Date(left.queuedAt).getTime())
    .slice(0, MAX_RECENT_COMMANDS);
}

function getPublicState() {
  pruneCommands();

  const stations = store.stations
    .map((station) => {
      const lastSeenMs = new Date(station.lastSeenAt).getTime();
      const ageSeconds = Math.max(0, Math.floor((Date.now() - lastSeenMs) / 1000));

      return {
        ...station,
        ageSeconds,
        isStale: ageSeconds > STALE_AFTER_SECONDS,
        summary: stationSummary(station),
      };
    })
    .sort((left, right) => left.stationName.localeCompare(right.stationName, "ru"));

  const commands = recentCommands();

  const totalReactors = sum(stations.map((station) => station.summary.reactorCount));
  const activeReactors = sum(stations.map((station) => station.summary.activeReactors));
  const totalGeneration = sum(stations.map((station) => station.summary.totalGeneration));
  const totalFluxBuffer = sum(
    stations.flatMap((station) => station.fluxNetworks.map((network) => network.buffer))
  );
  const totalFluxInput = sum(
    stations.flatMap((station) => station.fluxNetworks.map((network) => network.inputPerTick))
  );
  const totalFluxOutput = sum(
    stations.flatMap((station) => station.fluxNetworks.map((network) => network.outputPerTick))
  );
  const lowTempCoolantTotal = sum(
    stations.map((station) => station.summary.lowTempCoolantAmount)
  );
  const latestStationReportAt = stations
    .map((station) => station.lastSeenAt)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null;
  const latestPacketAgeSeconds = latestStationReportAt
    ? Math.max(0, Math.floor((Date.now() - new Date(latestStationReportAt).getTime()) / 1000))
    : null;
  const hasLiveData = stations.length > 0;

  return {
    generatedAt: nowIso(),
    placeholderMode: !hasLiveData,
    syncIntervalSeconds: DEFAULT_SYNC_INTERVAL_SECONDS,
    staleAfterSeconds: STALE_AFTER_SECONDS,
    placeholder: {
      showcaseLevels: SHOWCASE_LEVELS,
    },
    overview: {
      hasLiveData,
      totalStations: stations.length,
      staleStations: stations.filter((station) => station.isStale).length,
      totalReactors,
      activeReactors,
      totalGeneration,
      totalFluxBuffer,
      totalFluxInput,
      totalFluxOutput,
      lowTempCoolantTotal,
      latestStationReportAt,
      latestPacketAgeSeconds,
    },
    stations,
    commands,
  };
}

function agentIsAuthorized(requestUrl, req) {
  const queryToken = requestUrl.searchParams.get("token");
  const headerToken = req.headers["x-agent-token"];
  return queryToken === AGENT_TOKEN || headerToken === AGENT_TOKEN;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendEmpty(res, statusCode) {
  res.writeHead(statusCode, { "Cache-Control": "no-store" });
  res.end();
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;

      if (size > BODY_LIMIT_BYTES) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function publicFilePath(urlPathname) {
  const requestedPath = urlPathname === "/" ? "/index.html" : decodeURIComponent(urlPathname);
  const normalized = path
    .normalize(requestedPath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = path.join(PUBLIC_DIR, normalized);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return null;
  }

  return filePath;
}

function serveStatic(req, res, requestUrl) {
  const filePath = publicFilePath(requestUrl.pathname);

  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendJson(res, 404, { error: "Файл не найден." });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[extension] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": mimeType,
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=3600",
  });

  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, requestUrl) {
  if (req.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      time: nowIso(),
      placeholderMode: store.placeholderMode,
      stationCount: store.stations.length,
    });
    return true;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/state") {
    sendJson(res, 200, getPublicState());
    return true;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/agent/commands") {
    if (!agentIsAuthorized(requestUrl, req)) {
      sendJson(res, 401, { error: "Неверный агент-токен." });
      return true;
    }

    const stationId = safeText(requestUrl.searchParams.get("stationId"));

    if (!stationId) {
      sendJson(res, 400, { error: "Нужен stationId." });
      return true;
    }

    const commands = getDispatchableCommands(stationId);
    const body = [
      "OK",
      `SERVER_TIME=${nowIso()}`,
      `SYNC_INTERVAL_SECONDS=${DEFAULT_SYNC_INTERVAL_SECONDS}`,
      ...commands.map((command) => `COMMAND=${command.id}|${command.action}|${command.reactorId}`),
    ].join("\n");

    sendText(res, 200, body);
    return true;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/agent/report") {
    if (!agentIsAuthorized(requestUrl, req)) {
      sendJson(res, 401, { error: "Неверный агент-токен." });
      return true;
    }

    try {
      const rawBody = await readRequestBody(req);
      const report = JSON.parse(rawBody || "{}");
      const station = normalizeStation(report);
      applyCommandResults(station.stationId, report.commandResults);

      const existingIndex = store.stations.findIndex(
        (currentStation) => currentStation.stationId === station.stationId
      );

      if (existingIndex >= 0) {
        store.stations[existingIndex] = station;
      } else {
        store.stations.push(station);
      }

      store.placeholderMode = store.stations.length === 0;
      persistState();

      sendJson(res, 200, {
        ok: true,
        receivedAt: nowIso(),
      });
    } catch (error) {
      sendJson(res, 400, {
        error: "Не удалось обработать отчёт агента.",
        details: error.message,
      });
    }

    return true;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/reactors/command") {
    try {
      const rawBody = await readRequestBody(req);
      const body = JSON.parse(rawBody || "{}");
      const stationId = safeText(body.stationId);
      const reactorId = safeText(body.reactorId);
      const action = safeText(body.action);

      if (!["start", "stop"].includes(action)) {
        sendJson(res, 400, { error: "Разрешены только команды start и stop." });
        return true;
      }

      if (store.placeholderMode || store.stations.length === 0) {
        sendJson(res, 409, {
          error: "Команды разблокируются после первого живого отчёта от OpenComputers.",
        });
        return true;
      }

      const station = store.stations.find((entry) => entry.stationId === stationId);

      if (!station) {
        sendJson(res, 404, { error: "Станция не найдена." });
        return true;
      }

      const reactor = station.reactors.find((entry) => entry.reactorId === reactorId);

      if (!reactor) {
        sendJson(res, 404, { error: "Реактор не найден." });
        return true;
      }

      const command = queueCommand(stationId, reactorId, action);
      sendJson(res, 202, {
        ok: true,
        command,
      });
    } catch (error) {
      sendJson(res, 400, {
        error: "Не удалось поставить команду в очередь.",
        details: error.message,
      });
    }

    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  try {
    const handled = await handleApi(req, res, requestUrl);

    if (handled) {
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendEmpty(res, 405);
      return;
    }

    serveStatic(req, res, requestUrl);
  } catch (error) {
    sendJson(res, 500, {
      error: "Внутренняя ошибка сервера.",
      details: error.message,
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[reactor-dashboard] http://${HOST}:${PORT}`);
  console.log(`[reactor-dashboard] sync interval: ${DEFAULT_SYNC_INTERVAL_SECONDS}s`);
  console.log(`[reactor-dashboard] placeholder mode: ${store.placeholderMode ? "on" : "off"}`);
});
