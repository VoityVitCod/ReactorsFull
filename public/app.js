const ROUTES = {
  overview: {
    label: "Главная",
    title: "Главная панель",
    subtitle: "Общий обзор комплекса, быстрые сводки и последние события.",
    icon: "home",
  },
  reactors: {
    label: "Реакторы",
    title: "Реакторные контуры",
    subtitle: "Детальные карточки всех реакторов, охлаждение, топливо и ручные команды.",
    icon: "reactor",
  },
  energy: {
    label: "Энергия",
    title: "Энергетика",
    subtitle: "История Flux, текущие потоки, распределение генерации и сети хранения.",
    icon: "bolt",
  },
  logs: {
    label: "Логи",
    title: "Журнал событий",
    subtitle: "Очередь команд, предупреждения по реакторам и состояние каналов связи.",
    icon: "log",
  },
};

const SHOWCASE_LEVELS = [1, 2, 3, 4, 5, 6];

const appNode = document.getElementById("app");
const sidebarNavNode = document.getElementById("sidebar-nav");
const manualRefreshButton = document.getElementById("manual-refresh");
const refreshCountdownNode = document.getElementById("refresh-countdown");
const syncAgeNode = document.getElementById("sync-age");
const liveMessageNode = document.getElementById("live-message");
const pageEyebrowNode = document.getElementById("page-eyebrow");
const pageTitleNode = document.getElementById("page-title");
const pageSubtitleNode = document.getElementById("page-subtitle");
const notifyButtonNode = document.getElementById("notify-button");
const settingsButtonNode = document.getElementById("settings-button");

const state = {
  data: null,
  fetchedAt: 0,
  nextRefreshAt: 0,
  refreshTimer: null,
  clockTimer: null,
  pendingCommands: new Set(),
  route: getRouteFromHash(),
};

function getRouteFromHash() {
  const route = window.location.hash.replace(/^#\/?/, "") || "overview";
  return ROUTES[route] ? route : "overview";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function icon(name, className = "") {
  const icons = {
    home: `
      <path d="M3.5 10.5 12 3l8.5 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-6h5v6" />
    `,
    reactor: `
      <rect x="5" y="4" width="14" height="4" rx="1.2" />
      <rect x="7" y="8.5" width="10" height="10.5" rx="1.4" />
      <path d="M9 12h6M9 15h6" />
      <path d="M5 6H3m18 0h-2" />
    `,
    bolt: `
      <path d="m13 2-7 11h5l-1 9 8-12h-5l0-8Z" />
    `,
    log: `
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    `,
    bell: `
      <path d="M12 21a2.5 2.5 0 0 0 2.2-1.3" />
      <path d="M18 16V11a6 6 0 1 0-12 0v5l-2 2h16l-2-2Z" />
    `,
    settings: `
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
    `,
    battery: `
      <rect x="5" y="7" width="12" height="10" rx="2" />
      <path d="M17 10h2v4h-2" />
      <path d="M8 10h6v4H8z" />
    `,
    chart: `
      <path d="M4 19h16" />
      <path d="m6 16 4-4 3 2 5-7" />
      <circle cx="6" cy="16" r="1" />
      <circle cx="10" cy="12" r="1" />
      <circle cx="13" cy="14" r="1" />
      <circle cx="18" cy="7" r="1" />
    `,
    droplet: `
      <path d="M12 3c2.6 3.7 5 6.4 5 9.2a5 5 0 1 1-10 0C7 9.4 9.4 6.7 12 3Z" />
    `,
    thermometer: `
      <path d="M10 5a2 2 0 1 1 4 0v8.2a4 4 0 1 1-4 0Z" />
      <path d="M12 10v6" />
    `,
    power: `
      <path d="M12 2v8" />
      <path d="M7 4.8a8 8 0 1 0 10 0" />
    `,
    clock: `
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    `,
    info: `
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10v5" />
      <circle cx="12" cy="7.5" r=".6" fill="currentColor" stroke="none" />
    `,
    shield: `
      <path d="M12 3 5 6v5c0 4.5 3.1 7.8 7 10 3.9-2.2 7-5.5 7-10V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8 3.6-3.6" />
    `,
    alert: `
      <path d="M12 3 2.8 19h18.4L12 3Z" />
      <path d="M12 9v4" />
      <circle cx="12" cy="16.5" r=".7" fill="currentColor" stroke="none" />
    `,
    check: `
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.3 2.4 4.8-5.1" />
    `,
    stop: `
      <rect x="5" y="5" width="14" height="14" rx="2" />
    `,
    play: `
      <path d="m9 7 7 5-7 5Z" />
    `,
    cube: `
      <path d="m12 2 8 4.5v9L12 20l-8-4.5v-9L12 2Z" />
      <path d="m12 20v-9.5" />
      <path d="m4 6.5 8 4.5 8-4.5" />
    `,
    network: `
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="7" r="2" />
      <circle cx="18" cy="17" r="2" />
      <path d="M8 12h4" />
      <path d="m14 11 2.4-2.4" />
      <path d="m14 13 2.4 2.4" />
    `,
    plug: `
      <path d="M9 7v5" />
      <path d="M15 7v5" />
      <path d="M8 12h8v2a4 4 0 0 1-4 4 4 4 0 0 1-4-4v-2Z" />
      <path d="M12 18v3" />
    `,
    server: `
      <rect x="4" y="5" width="16" height="5" rx="1.4" />
      <rect x="4" y="14" width="16" height="5" rx="1.4" />
      <path d="M7.5 7.5h.01M7.5 16.5h.01" />
      <path d="M11 7.5h5M11 16.5h5" />
    `,
  };

  return `
    <svg viewBox="0 0 24 24" class="icon ${className}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${icons[name] || ""}
    </svg>
  `;
}

notifyButtonNode.innerHTML = icon("bell");
settingsButtonNode.innerHTML = icon("settings");

function compactNumber(value, digits = 2) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "0";
  }

  const absolute = Math.abs(numeric);

  if (absolute >= 1_000_000_000) {
    return `${(numeric / 1_000_000_000).toFixed(digits)}G`;
  }

  if (absolute >= 1_000_000) {
    return `${(numeric / 1_000_000).toFixed(digits)}M`;
  }

  if (absolute >= 1_000) {
    return `${(numeric / 1_000).toFixed(1)}K`;
  }

  return Math.round(numeric).toLocaleString("ru-RU");
}

function formatPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : "0%";
}

function formatRate(value) {
  const numeric = Number(value) || 0;
  const absolute = Math.abs(numeric);

  if (absolute >= 1_000_000) {
    return `${(numeric / 1_000_000).toFixed(2)} MRF/t`;
  }

  if (absolute >= 1_000) {
    return `${(numeric / 1_000).toFixed(2)} KRF/t`;
  }

  return `${Math.round(numeric)} RF/t`;
}

function formatEnergy(value) {
  const numeric = Number(value) || 0;
  const absolute = Math.abs(numeric);

  if (absolute >= 1_000_000) {
    return `${(numeric / 1_000_000).toFixed(2)} MRF`;
  }

  if (absolute >= 1_000) {
    return `${(numeric / 1_000).toFixed(2)} KRF`;
  }

  return `${Math.round(numeric)} RF`;
}

function formatAe(value) {
  const numeric = Number(value) || 0;

  if (Math.abs(numeric) >= 1_000_000) {
    return `${(numeric / 1_000_000).toFixed(2)} MAE`;
  }

  if (Math.abs(numeric) >= 1_000) {
    return `${(numeric / 1_000).toFixed(2)} KAE`;
  }

  return `${Math.round(numeric)} AE`;
}

function formatFluid(value) {
  const numeric = Number(value) || 0;

  if (Math.abs(numeric) >= 1_000_000) {
    return `${(numeric / 1_000_000).toFixed(2)} M mB`;
  }

  if (Math.abs(numeric) >= 1_000) {
    return `${(numeric / 1_000).toFixed(2)} K mB`;
  }

  return `${Math.round(numeric)} mB`;
}

function formatDuration(totalSeconds) {
  const numeric = Number(totalSeconds);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "н/д";
  }

  const days = Math.floor(numeric / 86400);
  const hours = Math.floor((numeric % 86400) / 3600);
  const minutes = Math.floor((numeric % 3600) / 60);

  if (days > 0) {
    return `${days}д ${hours}ч`;
  }

  if (hours > 0) {
    return `${hours}ч ${minutes}м`;
  }

  return `${Math.max(1, minutes)}м`;
}

function relativeAgeText(timestamp) {
  if (!timestamp) {
    return "нет данных";
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));

  if (deltaSeconds < 60) {
    return `${deltaSeconds}с назад`;
  }

  if (deltaSeconds < 3600) {
    return `${Math.floor(deltaSeconds / 60)}м назад`;
  }

  return `${Math.floor(deltaSeconds / 3600)}ч назад`;
}

function clockTime(timestamp) {
  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setLiveMessage(message, muted = false) {
  liveMessageNode.textContent = message || "";
  liveMessageNode.classList.toggle("live-message--muted", muted);
}

function latestCommandsByReactor(commands) {
  const mapped = new Map();

  commands.forEach((command) => {
    const key = `${command.stationId}:${command.reactorId}`;

    if (!mapped.has(key)) {
      mapped.set(key, command);
    }
  });

  return mapped;
}

function getAllReactors(data) {
  return (data.stations || []).flatMap((station) =>
    (station.reactors || []).map((reactor) => ({
      ...reactor,
      stationId: station.stationId,
      stationName: station.stationName,
      stationIsStale: station.isStale,
    }))
  );
}

function getPrimaryStation(data) {
  return data.stations && data.stations.length ? data.stations[0] : null;
}

function getPrimaryFlux(data) {
  for (const station of data.stations || []) {
    if (station.fluxNetworks && station.fluxNetworks.length) {
      return station.fluxNetworks[0];
    }
  }

  return null;
}

function reactorEfficiency(reactor) {
  if (!reactor.active && reactor.energyGeneration <= 0) {
    return 0;
  }

  const outputRatio = Math.min(100, (reactor.energyGeneration / Math.max(1, reactor.level * 950000)) * 100);
  const score =
    18 +
    reactor.coolantRatio * 0.34 +
    reactor.fuelRatio * 0.14 +
    (100 - reactor.temperatureRatio) * 0.24 +
    outputRatio * 0.28;

  return Math.max(0, Math.min(99, Math.round(score)));
}

function averageEfficiency(reactors) {
  const active = reactors.filter((reactor) => reactor.active);

  if (!active.length) {
    return 0;
  }

  return Math.round(active.reduce((total, reactor) => total + reactorEfficiency(reactor), 0) / active.length);
}

function activeCoolingCount(reactors) {
  return reactors.filter((reactor) => reactor.activeCooling).length;
}

function criticalCount(reactors) {
  return reactors.filter((reactor) => reactor.state === "critical").length;
}

function stateToneClass(tone) {
  if (tone === "good") {
    return "badge badge--good";
  }

  if (tone === "warn") {
    return "badge badge--warn";
  }

  if (tone === "danger") {
    return "badge badge--danger";
  }

  return "badge badge--muted";
}

function reactorStateMeta(reactor) {
  if (reactor.state === "critical") {
    return {
      label: "Критично",
      badgeClass: "badge badge--danger",
      cardClass: "reactor-card reactor-card--critical",
      dotClass: "reactor-card__status reactor-card__status--danger",
    };
  }

  if (reactor.state === "warning") {
    return {
      label: "Нужен контроль",
      badgeClass: "badge badge--warn",
      cardClass: "reactor-card reactor-card--warning",
      dotClass: "reactor-card__status reactor-card__status--warn",
    };
  }

  if (reactor.active) {
    return {
      label: "Активен",
      badgeClass: "badge badge--good",
      cardClass: "reactor-card reactor-card--running",
      dotClass: "reactor-card__status reactor-card__status--good",
    };
  }

  return {
    label: "Выключен",
    badgeClass: "badge badge--muted",
    cardClass: "reactor-card reactor-card--stopped",
    dotClass: "reactor-card__status reactor-card__status--muted",
  };
}

function coolingLabel(reactor) {
  return reactor.activeCooling ? "Жидкостное" : "Воздушное";
}

function createFallbackData(message = "") {
  return {
    generatedAt: new Date().toISOString(),
    placeholderMode: true,
    syncIntervalSeconds: 45,
    staleAfterSeconds: 135,
    overview: {
      hasLiveData: false,
      totalStations: 0,
      staleStations: 0,
      totalReactors: 0,
      activeReactors: 0,
      totalGeneration: 0,
      totalFluxBuffer: 0,
      totalFluxInput: 0,
      totalFluxOutput: 0,
      lowTempCoolantTotal: 0,
      latestStationReportAt: null,
      latestPacketAgeSeconds: null,
    },
    stations: [],
    commands: [],
    placeholder: {
      showcaseLevels: SHOWCASE_LEVELS,
      message,
    },
  };
}

function fallbackHistoryPoints() {
  const values = [18, 23, 22, 26, 31, 38, 34, 42, 45, 48, 44, 51];
  const now = Date.now();

  return values.map((value, index) => ({
    at: new Date(now - (values.length - index) * 45 * 1000).toISOString(),
    value,
  }));
}

function buildSeries(values, width = 640, height = 220, padding = 16) {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  const min = Math.min(...safeValues, 0);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? padding : padding + (index / (safeValues.length - 1)) * usableWidth;
    const y =
      padding +
      usableHeight -
      ((value - min) / Math.max(1, max - min)) * usableHeight;

    return { x, y, value };
  });
}

function renderLineChart(values, options = {}) {
  const width = options.width || 640;
  const height = options.height || 220;
  const points = buildSeries(values, width, height, 18);
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = [`18,${height - 18}`, ...points.map((point) => `${point.x},${point.y}`), `${width - 18},${height - 18}`].join(" ");
  const peak = points[points.length - 1];

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart chart--line" aria-hidden="true">
      <defs>
        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(70, 255, 162, 0.42)" />
          <stop offset="100%" stop-color="rgba(70, 255, 162, 0)" />
        </linearGradient>
      </defs>
      <g class="chart__grid">
        <line x1="18" y1="36" x2="${width - 18}" y2="36"></line>
        <line x1="18" y1="${height / 2}" x2="${width - 18}" y2="${height / 2}"></line>
        <line x1="18" y1="${height - 36}" x2="${width - 18}" y2="${height - 36}"></line>
      </g>
      <polygon points="${area}" class="chart__area"></polygon>
      <polyline points="${polyline}" class="chart__line"></polyline>
      <circle cx="${peak.x}" cy="${peak.y}" r="5" class="chart__point"></circle>
    </svg>
  `;
}

function renderHistoryColumns(points, formatter) {
  const safePoints = points.length
    ? points
    : fallbackHistoryPoints().map((point) => ({ ...point, buffer: point.value, inputPerTick: point.value * 40000, outputPerTick: point.value * 37000 }));
  const max = Math.max(...safePoints.map((point) => Number(point.buffer) || 0), 1);

  return `
    <div class="column-chart">
      ${safePoints
        .map((point, index) => {
          const value = Number(point.buffer) || 0;
          const height = Math.max(10, (value / max) * 100);
          const tick = index === 0 || index === safePoints.length - 1 || index % 3 === 0 ? clockTime(point.at) : "";

          return `
            <div class="column-chart__item">
              <div class="column-chart__rail">
                <div class="column-chart__fill" style="height:${height}%"></div>
              </div>
              <span class="column-chart__value">${formatter ? formatter(value) : compactNumber(value)}</span>
              <span class="column-chart__tick">${escapeHtml(tick)}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderInputOutputBars(points) {
  const safePoints = points.length
    ? points
    : fallbackHistoryPoints().map((point) => ({
        inputPerTick: point.value * 50000,
        outputPerTick: point.value * 43000,
        at: point.at,
      }));
  const max = Math.max(
    ...safePoints.flatMap((point) => [Number(point.inputPerTick) || 0, Number(point.outputPerTick) || 0]),
    1
  );

  return `
    <div class="compare-bars">
      ${safePoints
        .slice(-8)
        .map(
          (point) => `
            <div class="compare-bars__group">
              <div class="compare-bars__track">
                <span class="compare-bars__bar compare-bars__bar--input" style="height:${Math.max(8, (point.inputPerTick / max) * 100)}%"></span>
                <span class="compare-bars__bar compare-bars__bar--output" style="height:${Math.max(8, (point.outputPerTick / max) * 100)}%"></span>
              </div>
              <span class="compare-bars__tick">${escapeHtml(clockTime(point.at))}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDonutChart(segments) {
  const total = Math.max(
    1,
    segments.reduce((sum, segment) => sum + (Number(segment.value) || 0), 0)
  );
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const arcs = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const ratio = segment.value / total;
      const length = circumference * ratio;
      const arc = `
        <circle
          class="donut__arc"
          cx="70"
          cy="70"
          r="${radius}"
          stroke="${segment.color}"
          stroke-dasharray="${length} ${circumference - length}"
          stroke-dashoffset="${-offset}"
        ></circle>
      `;

      offset += length;
      return arc;
    })
    .join("");

  return `
    <div class="donut">
      <svg viewBox="0 0 140 140" class="donut__chart" aria-hidden="true">
        <circle class="donut__base" cx="70" cy="70" r="${radius}"></circle>
        ${arcs}
      </svg>
      <div class="donut__legend">
        ${segments
          .map(
            (segment) => `
              <div class="donut__legend-row">
                <span class="donut__legend-dot" style="background:${segment.color}"></span>
                <span class="donut__legend-label">${escapeHtml(segment.label)}</span>
                <strong>${segment.formatter ? segment.formatter(segment.value) : compactNumber(segment.value)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function metricTile(iconName, label, value, hint = "", tone = "") {
  return `
    <article class="metric-tile ${tone ? `metric-tile--${tone}` : ""}">
      <div class="metric-tile__icon">${icon(iconName)}</div>
      <div>
        <p class="metric-tile__label">${escapeHtml(label)}</p>
        <h3 class="metric-tile__value">${escapeHtml(value)}</h3>
        ${hint ? `<p class="metric-tile__hint">${escapeHtml(hint)}</p>` : ""}
      </div>
    </article>
  `;
}

function panel(title, eyebrow, content, extraClass = "") {
  return `
    <section class="panel ${extraClass}">
      <div class="panel__head">
        <div>
          <p class="panel__eyebrow">${escapeHtml(eyebrow)}</p>
          <h3 class="panel__title">${escapeHtml(title)}</h3>
        </div>
      </div>
      ${content}
    </section>
  `;
}

function buildLogEntries(data) {
  const entries = [];

  if (!data.overview.hasLiveData) {
    entries.push({
      at: data.generatedAt,
      tone: "warn",
      iconName: "info",
      title: "Ожидание телеметрии",
      body: data.placeholder?.message || "Сайт готов, но игровой компьютер ещё не прислал первый пакет.",
    });
  }

  (data.stations || []).forEach((station) => {
    entries.push({
      at: station.lastSeenAt,
      tone: station.isStale ? "warn" : "good",
      iconName: station.isStale ? "alert" : "check",
      title: `Пакет станции ${station.stationName}`,
      body: station.isStale
        ? `Последний отчёт устарел: ${relativeAgeText(station.lastSeenAt)}`
        : `Станция обновилась ${relativeAgeText(station.lastSeenAt)}.`,
    });

    (station.reactors || []).forEach((reactor) => {
      if (reactor.state === "critical" || reactor.state === "warning") {
        entries.push({
          at: reactor.updatedAt || station.lastSeenAt,
          tone: reactor.state === "critical" ? "danger" : "warn",
          iconName: reactor.state === "critical" ? "alert" : "shield",
          title: `${reactor.name}: ${reactor.state === "critical" ? "критическая нагрузка" : "нужен контроль"}`,
          body: `Температура ${formatPercent(reactor.temperatureRatio)}, охлаждение ${formatPercent(reactor.coolantRatio)}, остаток топлива ${formatPercent(reactor.fuelRatio)}.`,
        });
      }
    });
  });

  (data.commands || []).forEach((command) => {
    const tone =
      command.status === "completed"
        ? "good"
        : command.status === "failed" || command.status === "expired"
          ? "danger"
          : "warn";
    const iconName =
      command.action === "start"
        ? command.status === "completed"
          ? "play"
          : "power"
        : "stop";

    entries.push({
      at: command.finishedAt || command.dispatchedAt || command.queuedAt,
      tone,
      iconName,
      title: `${command.action === "start" ? "Запуск" : "Остановка"} ${command.reactorId}`,
      body: command.resultMessage || `Команда для станции ${command.stationId} имеет статус ${command.status}.`,
    });
  });

  return entries
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, 24);
}

function activeCommandCount(commands) {
  return commands.filter((command) => ["queued", "dispatched"].includes(command.status)).length;
}

function renderLogRows(entries) {
  return `
    <div class="log-list">
      ${entries
        .map(
          (entry) => `
            <article class="log-row log-row--${entry.tone}">
              <div class="log-row__icon">${icon(entry.iconName)}</div>
              <div class="log-row__copy">
                <div class="log-row__meta">
                  <strong>${escapeHtml(entry.title)}</strong>
                  <span>${escapeHtml(relativeAgeText(entry.at))}</span>
                </div>
                <p>${escapeHtml(entry.body)}</p>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDetailList(rows, tone = "") {
  return `
    <div class="detail-list ${tone ? `detail-list--${tone}` : ""}">
      ${rows
        .map(
          (row) => `
            <div class="detail-list__row">
              <span>${escapeHtml(row.label)}</span>
              <strong>${escapeHtml(row.value)}</strong>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStatusSurface({
  iconName = "info",
  eyebrow = "Status",
  title,
  message,
  tone = "muted",
  rows = [],
}) {
  return `
    <article class="status-surface status-surface--${tone}">
      <div class="status-surface__icon">${icon(iconName)}</div>
      <div class="status-surface__copy">
        <p class="status-surface__eyebrow">${escapeHtml(eyebrow)}</p>
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(message)}</p>
      </div>
      ${rows.length ? renderDetailList(rows, tone) : ""}
    </article>
  `;
}

function stationConnectionMeta(station) {
  if (!station) {
    return {
      tone: "warn",
      label: "Нет подключения",
      message: "Сервер ещё не получил первый отчёт от OpenComputers-компьютера.",
    };
  }

  if (station.isStale) {
    return {
      tone: "danger",
      label: "Пакет устарел",
      message: `Последняя телеметрия пришла ${relativeAgeText(station.lastSeenAt)} и уже считается устаревшей.`,
    };
  }

  return {
    tone: "good",
    label: "Онлайн",
    message: `Станция ${station.stationName} обновилась ${relativeAgeText(station.lastSeenAt)}.`,
  };
}

function missingSourceMessage(station, subject) {
  if (!station) {
    return `Станция ещё не подключилась, поэтому данные для "${subject}" пока отсутствуют.`;
  }

  if (station.isStale) {
    return `Станция есть, но пакет устарел, поэтому состояние "${subject}" сейчас не подтверждено.`;
  }

  return `Станция подключена, но в последнем отчёте нет блока "${subject}".`;
}

function renderOverviewReactorCard(reactor) {
  const meta = reactorStateMeta(reactor);

  return `
    <article class="overview-reactor-card" style="--reactor-art:url('assets/reactors/level-${reactor.level}.webp')">
      <div class="overview-reactor-card__art"></div>
      <div class="overview-reactor-card__body">
        <div class="overview-reactor-card__head">
          <div>
            <h4>${escapeHtml(reactor.name)}</h4>
            <p>${escapeHtml(reactor.stationName)}</p>
          </div>
          <span class="${meta.badgeClass}">${meta.label}</span>
        </div>
        <div class="overview-reactor-card__specs">
          <span>Уровень ${reactor.level}</span>
          <span>${coolingLabel(reactor)}</span>
          <span>${formatRate(reactor.energyGeneration)}</span>
        </div>
        <div class="overview-reactor-card__bars">
          <div class="meter">
            <div class="meter__head"><span>Топливо</span><strong>${formatPercent(reactor.fuelRatio)}</strong></div>
            <div class="meter__track"><div class="meter__fill" style="width:${reactor.fuelRatio}%"></div></div>
          </div>
          <div class="meter">
            <div class="meter__head"><span>Охлаждение</span><strong>${formatPercent(reactor.coolantRatio)}</strong></div>
            <div class="meter__track"><div class="meter__fill meter__fill--coolant" style="width:${reactor.coolantRatio}%"></div></div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderSidebar(data) {
  const liveTone = data.overview.hasLiveData ? "good" : "warn";
  const liveLabel = data.overview.hasLiveData ? "Станции на связи" : "Ожидание станции";
  const totalReactors = data.overview.totalReactors;

  sidebarNavNode.innerHTML = `
    <div class="sidebar__status">
      <span class="${stateToneClass(liveTone)}">${liveLabel}</span>
      <span class="sidebar__status-copy">${data.overview.totalStations} станц. / ${totalReactors} реакторов</span>
    </div>
    <div class="sidebar__links">
      ${Object.entries(ROUTES)
        .map(
          ([route, meta]) => `
            <a href="#/${route}" class="nav-link ${route === state.route ? "nav-link--active" : ""}" data-route="${route}">
              ${icon(meta.icon)}
              <span>${escapeHtml(meta.label)}</span>
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTopbar(data) {
  const meta = ROUTES[state.route];
  pageEyebrowNode.textContent = meta.label;
  pageTitleNode.textContent = meta.title;
  pageSubtitleNode.textContent = data.overview.hasLiveData
    ? meta.subtitle
    : "Интерфейс уже готов, остаётся дождаться первого пакета от OpenComputers.";
}

function renderOverviewPage(data) {
  const reactors = getAllReactors(data);
  const sortedReactors = [...reactors].sort((left, right) => right.energyGeneration - left.energyGeneration);
  const primaryStation = getPrimaryStation(data);
  const primaryReactor = sortedReactors[0] || { level: 6, name: "Реакторный контур" };
  const heroHistory = (getPrimaryFlux(data)?.history || []).map((point) => Number(point.outputPerTick) || 0);
  const entries = buildLogEntries(data).slice(0, 5);
  const efficiency = averageEfficiency(reactors);
  const flux = getPrimaryFlux(data);
  const heroArt = `assets/reactors/level-${primaryReactor.level || 6}.webp`;
  const hasLiveData = data.overview.hasLiveData;
  const totalReactors = data.overview.totalReactors;
  const queuedCommands = activeCommandCount(data.commands);
  const me = primaryStation?.me || null;
  const meStored = me?.storedPower || 0;
  const connectionMeta = stationConnectionMeta(primaryStation);
  const highestLevel = reactors.length ? Math.max(...reactors.map((reactor) => reactor.level)) : null;
  const commandRows = [
    { label: "Станция", value: primaryStation ? primaryStation.stationName : "нет подключения" },
    { label: "Последний пакет", value: primaryStation ? relativeAgeText(primaryStation.lastSeenAt) : "нет данных" },
    { label: "Команды в очереди", value: `${queuedCommands}` },
    { label: "Ручное управление", value: hasLiveData ? "доступно" : "заблокировано" },
  ];
  const fluxCountTotal = flux
    ? (flux.countInfo?.pointCount || 0) +
      (flux.countInfo?.plugCount || 0) +
      (flux.countInfo?.controllerCount || 0) +
      (flux.countInfo?.storageCount || 0)
    : 0;
  const reactorSectionContent = reactors.length
    ? `
        <div class="overview-reactor-grid">
          ${sortedReactors.slice(0, 4).map(renderOverviewReactorCard).join("")}
        </div>
      `
    : `
        <div class="status-grid">
          ${renderStatusSurface({
            iconName: "server",
            eyebrow: "OpenComputers",
            title: "Станция ещё не подключена",
            message: "Сервер не получил ни одного живого отчёта, поэтому реакторные карточки пока не могут быть построены.",
            tone: "warn",
            rows: [
              { label: "API /agent/report", value: "ожидание" },
              { label: "Команды", value: "заблокированы" },
            ],
          })}
          ${renderStatusSurface({
            iconName: "reactor",
            eyebrow: "Reactors",
            title: "Нет данных по реакторам",
            message: "Как только агент пришлёт список реакторов, здесь появятся реальные уровни, охлаждение и генерация.",
            tone: "muted",
          })}
          ${renderStatusSurface({
            iconName: "clock",
            eyebrow: "Sync",
            title: "Ждём первую синхронизацию",
            message: `Интервал обмена уже настроен на ${data.syncIntervalSeconds || 45} секунд, осталось дождаться первого пакета.`,
            tone: "muted",
          })}
        </div>
      `;
  const generationPanelContent = flux && flux.history && flux.history.length
    ? `
        <div class="chart-block">
          <div class="chart-block__summary">
            <strong>${formatRate(data.overview.totalGeneration)}</strong>
            <span>${hasLiveData ? `Средний выход по истории: ${formatRate(flux.historySummary?.averageOutputPerTick || 0)}` : "Живая история появится после накопления пакетов."}</span>
          </div>
          ${renderLineChart(heroHistory, { width: 760, height: 240 })}
        </div>
      `
    : renderStatusSurface({
        iconName: "chart",
        eyebrow: "Energy graph",
        title: "История генерации недоступна",
        message: missingSourceMessage(primaryStation, "энергетической истории"),
        tone: connectionMeta.tone === "good" ? "muted" : connectionMeta.tone,
      });
  const topologyPanelContent = flux && fluxCountTotal > 0
    ? `
        <div class="topology-block">
          ${renderDonutChart([
            { label: "Точки", value: flux.countInfo?.pointCount || 0, color: "#3ad7ff" },
            { label: "Плаги", value: flux.countInfo?.plugCount || 0, color: "#55f39f" },
            { label: "Контроллеры", value: flux.countInfo?.controllerCount || 0, color: "#ffc46b" },
            { label: "Хранилища", value: flux.countInfo?.storageCount || 0, color: "#7d8d96" },
          ])}
          <div class="topology-block__summary">
            <strong>${fluxCountTotal}</strong>
            <span>всего элементов Flux-сети</span>
          </div>
        </div>
      `
    : renderStatusSurface({
        iconName: "network",
        eyebrow: "Flux topology",
        title: "Топология сети пока недоступна",
        message: missingSourceMessage(primaryStation, "Flux-сети"),
        tone: connectionMeta.tone === "good" ? "muted" : connectionMeta.tone,
      });
  const mePanelContent = me
    ? renderDetailList([
        { label: "Статус", value: me.online ? "онлайн" : "оффлайн" },
        { label: "Накоплено", value: formatAe(me.storedPower) },
        { label: "Инжекция", value: `${compactNumber(me.avgPowerInjection, 2)} AE/t` },
        { label: "Потребление", value: `${compactNumber(me.avgPowerUsage, 2)} AE/t` },
        { label: "Хладагент", value: me.lowTempCoolant ? formatFluid(me.lowTempCoolant.amount) : "нет данных" },
      ])
    : renderStatusSurface({
        iconName: "network",
        eyebrow: "ME",
        title: "ME-сеть не обнаружена",
        message: missingSourceMessage(primaryStation, "ME-сети"),
        tone: connectionMeta.tone === "good" ? "muted" : connectionMeta.tone,
      });
  const fluxPanelContent = flux
    ? renderDetailList([
        { label: "Сеть", value: flux.name || flux.networkId },
        { label: "Буфер", value: formatEnergy(flux.buffer) },
        { label: "Вход", value: formatRate(flux.inputPerTick) },
        { label: "Выход", value: formatRate(flux.outputPerTick) },
        { label: "Лимит", value: flux.transferLimit ? formatRate(flux.transferLimit) : "нет данных" },
        { label: "Surge", value: flux.surgeMode ? "да" : "нет" },
      ])
    : renderStatusSurface({
        iconName: "plug",
        eyebrow: "Flux",
        title: "Flux-сеть не обнаружена",
        message: missingSourceMessage(primaryStation, "Flux-сети"),
        tone: connectionMeta.tone === "good" ? "muted" : connectionMeta.tone,
      });

  const heroContent = `
    <section class="overview-grid">
      <div class="overview-grid__main">
        <article class="command-deck" style="--hero-art:url('${heroArt}')">
          <div class="command-deck__visual"></div>
          <div class="command-deck__copy">
            <p class="command-deck__eyebrow">OpenComputers monitoring</p>
            <h3 class="command-deck__title">
              ${hasLiveData ? `Реакторный комплекс — уровень ${highestLevel || primaryReactor.level}` : "Реакторный комплекс — ожидание связи"}
            </h3>
            <p class="command-deck__lead">
              ${
                hasLiveData
                  ? "Онлайн-мониторинг показывает актуальное состояние реакторов, потоков Flux и МЭ-сети без ухода с главной страницы."
                  : "Главный экран уже работает как пульт комплекса и честно показывает, какие подсистемы ещё не подключились и каких данных пока не хватает."
              }
            </p>
            <div class="command-deck__chips">
              <span class="${stateToneClass(connectionMeta.tone)}">${connectionMeta.label}</span>
              <span class="badge badge--muted">${queuedCommands} команд в очереди</span>
              <span class="badge badge--muted">${data.syncIntervalSeconds || 45}с цикл обмена</span>
            </div>
            <div class="command-deck__metrics">
              <article class="deck-stat">
                <div class="deck-stat__icon">${icon("clock")}</div>
                <div>
                  <p>Последний пакет</p>
                  <strong>${hasLiveData ? relativeAgeText(data.overview.latestStationReportAt) : "нет данных"}</strong>
                  <span>${connectionMeta.message}</span>
                </div>
              </article>
              <article class="deck-stat">
                <div class="deck-stat__icon">${icon("reactor")}</div>
                <div>
                  <p>Реакторов найдено</p>
                  <strong>${totalReactors || 0}</strong>
                  <span>${data.overview.activeReactors} активны</span>
                </div>
              </article>
              <article class="deck-stat">
                <div class="deck-stat__icon">${icon("bolt")}</div>
                <div>
                  <p>Общая генерация</p>
                  <strong>${hasLiveData ? formatRate(data.overview.totalGeneration) : "нет данных"}</strong>
                  <span>${flux ? `Flux буфер ${formatEnergy(flux.buffer)}` : "Flux ещё не обнаружен"}</span>
                </div>
              </article>
              <article class="deck-stat">
                <div class="deck-stat__icon">${icon("network")}</div>
                <div>
                  <p>ME-сеть</p>
                  <strong>${me ? (me.online ? "онлайн" : "оффлайн") : "нет данных"}</strong>
                  <span>${me ? formatAe(meStored) : "Сеть пока не прислана агентом"}</span>
                </div>
              </article>
              <article class="deck-stat">
                <div class="deck-stat__icon">${icon("plug")}</div>
                <div>
                  <p>Низкотемпературный хладагент</p>
                  <strong>${me?.lowTempCoolant ? formatFluid(me.lowTempCoolant.amount) : "нет данных"}</strong>
                  <span>${me?.lowTempCoolant ? me.lowTempCoolant.label : "В МЭ отчёте ещё нет нужной жидкости"}</span>
                </div>
              </article>
            </div>
          </div>
        </article>

        ${panel("Реакторы", "Reactors", reactorSectionContent, "panel--span-2")}

        <section class="overview-lower-grid">
          ${panel("Генерация энергии", "RF/t", generationPanelContent, "panel--wide")}
          ${panel("Сетевая топология", "Flux", topologyPanelContent)}
          ${panel("Последние события", "Logs", renderLogRows(entries), "")}
        </section>
      </div>

      <aside class="overview-rail">
        ${panel("ME-сеть", "ME", mePanelContent, "panel--compact")}
        ${panel("Flux-сеть", "Flux", fluxPanelContent, "panel--compact")}
        ${panel(
          "Связь и команды",
          "Control",
          `${renderStatusSurface({
            iconName: "server",
            eyebrow: "Station link",
            title: connectionMeta.label,
            message: connectionMeta.message,
            tone: connectionMeta.tone,
            rows: commandRows,
          })}`,
          "panel--compact"
        )}
      </aside>
    </section>

    <section class="tile-grid">
      ${metricTile("reactor", "Активные реакторы", `${data.overview.activeReactors}`, hasLiveData ? `Из ${totalReactors} обнаруженных контуров.` : "Нет живых данных по составу комплекса.", data.overview.hasLiveData ? "good" : "warn")}
      ${metricTile("shield", "Средняя эффективность", hasLiveData ? `${efficiency}%` : "нет данных", hasLiveData ? "Оценка по охлаждению, температуре и текущей генерации." : "Без реальной телеметрии оценка эффективности не строится.")}
      ${metricTile("bolt", "Выдача в сеть", hasLiveData ? formatRate(data.overview.totalFluxOutput) : "нет данных", flux ? "Текущий поток в Flux." : "Flux-сеть пока не прислала измерения.", "accent")}
      ${metricTile("battery", "Буфер Flux", flux ? formatEnergy(data.overview.totalFluxBuffer) : "нет данных", flux ? `Пиковый буфер: ${formatEnergy(flux.historySummary?.peakBuffer || 0)}` : "Буфер появится после обнаружения Flux-сети.")}
    </section>
  `;

  return heroContent;
}

function renderReactorControlCard(reactor, commandMap, allowCommands) {
  const meta = reactorStateMeta(reactor);
  const commandKey = `${reactor.stationId}:${reactor.reactorId}`;
  const lastCommand = commandMap.get(commandKey);
  const pending = state.pendingCommands.has(commandKey);
  const disabled = !allowCommands || reactor.stationIsStale || pending;

  return `
    <article class="${meta.cardClass}" style="--reactor-art:url('assets/reactors/level-${reactor.level}.webp')">
      <div class="reactor-card__art"></div>
      <div class="reactor-card__body">
        <div class="reactor-card__head">
          <div>
            <h3>${escapeHtml(reactor.name)}</h3>
            <p>${escapeHtml(reactor.stationName)}</p>
          </div>
          <div class="reactor-card__head-right">
            <span class="${meta.badgeClass}">${meta.label}</span>
            <span class="${meta.dotClass}"></span>
          </div>
        </div>

        <div class="reactor-card__specs">
          <div>${icon("reactor")}<span>Уровень ${reactor.level}</span></div>
          <div>${icon("droplet")}<span>${coolingLabel(reactor)}</span></div>
          <div>${icon("bolt")}<span>${formatRate(reactor.energyGeneration)}</span></div>
          <div>${icon("shield")}<span>${reactorEfficiency(reactor)}% эффективности</span></div>
        </div>

        <div class="reactor-card__meters">
          <div class="meter">
            <div class="meter__head"><span>Топливо</span><strong>${formatPercent(reactor.fuelRatio)}</strong></div>
            <div class="meter__track"><div class="meter__fill" style="width:${reactor.fuelRatio}%"></div></div>
          </div>
          <div class="meter">
            <div class="meter__head"><span>Охлаждение</span><strong>${formatPercent(reactor.coolantRatio)}</strong></div>
            <div class="meter__track"><div class="meter__fill meter__fill--coolant" style="width:${reactor.coolantRatio}%"></div></div>
          </div>
          <div class="meter">
            <div class="meter__head"><span>Температура</span><strong>${formatPercent(reactor.temperatureRatio)}</strong></div>
            <div class="meter__track"><div class="meter__fill meter__fill--temperature" style="width:${reactor.temperatureRatio}%"></div></div>
          </div>
        </div>

        <div class="reactor-card__foot">
          <p>${reactor.active ? `До выработки топлива: ${formatDuration(reactor.estimatedSecondsRemaining)}` : "Контур остановлен и не расходует топливо."}</p>
          ${
            lastCommand
              ? `<p>Последняя команда: ${escapeHtml(lastCommand.status)}${lastCommand.resultMessage ? ` — ${escapeHtml(lastCommand.resultMessage)}` : ""}</p>`
              : `<p>${reactor.stationIsStale ? "Станция не обновлялась дольше порога, команды лучше не слать." : "Команды уйдут агенту на ближайшем цикле."}</p>`
          }
          <div class="reactor-card__actions">
            <button class="switch-button switch-button--start" type="button" data-command="start" data-station-id="${escapeHtml(reactor.stationId)}" data-reactor-id="${escapeHtml(reactor.reactorId)}" ${disabled ? "disabled" : ""}>
              ${icon("play")}<span>Включить</span>
            </button>
            <button class="switch-button switch-button--stop" type="button" data-command="stop" data-station-id="${escapeHtml(reactor.stationId)}" data-reactor-id="${escapeHtml(reactor.reactorId)}" ${disabled ? "disabled" : ""}>
              ${icon("stop")}<span>Выключить</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderReactorsPage(data) {
  const reactors = getAllReactors(data);
  const commandMap = latestCommandsByReactor(data.commands);
  const active = reactors.filter((reactor) => reactor.active).length;
  const warnings = reactors.filter((reactor) => reactor.state === "warning").length;
  const critical = reactors.filter((reactor) => reactor.state === "critical").length;
  const allowCommands = data.overview.hasLiveData;
  const primaryStation = getPrimaryStation(data);

  return `
    <section class="tile-grid">
      ${metricTile("reactor", "Активные", `${active}/${reactors.length}`, reactors.length ? "Сколько реакторов сейчас выдают энергию." : "Список реакторов появится после первого отчёта.", active ? "good" : "warn")}
      ${metricTile("droplet", "Жидкостное охлаждение", `${activeCoolingCount(reactors)}/${reactors.length}`, reactors.length ? "Сколько контуров работают через жидкостную схему." : "Пока нет данных о схеме охлаждения.")}
      ${metricTile("shield", "Предупреждения", `${warnings}`, "Реакторы требуют внимания, но ещё не в критике.", warnings ? "warn" : "good")}
      ${metricTile("alert", "Критические", `${critical}`, "Контуры с опасным остатком охлаждения или нагрузкой.", critical ? "danger" : "good")}
    </section>

    ${
      reactors.length
        ? `
          <section class="reactor-grid">
            ${reactors
              .sort((left, right) => left.level - right.level || right.energyGeneration - left.energyGeneration)
              .map((reactor) => renderReactorControlCard(reactor, commandMap, allowCommands))
              .join("")}
          </section>
        `
        : `
          <section class="status-grid">
            ${renderStatusSurface({
              iconName: "server",
              eyebrow: "Station link",
              title: primaryStation ? "Станция не прислала реакторы" : "Нет подключения к станции",
              message: primaryStation
                ? "Станция на связи, но в последнем отчёте нет массива reactors."
                : "Пока не придёт первый пакет от OpenComputers, карточки реакторов построить нельзя.",
              tone: primaryStation ? "muted" : "warn",
            })}
            ${renderStatusSurface({
              iconName: "power",
              eyebrow: "Commands",
              title: "Управление недоступно",
              message: "Кнопки включения и выключения откроются только после появления живой станции и списка реакторов.",
              tone: "muted",
            })}
            ${renderStatusSurface({
              iconName: "reactor",
              eyebrow: "Telemetry",
              title: "Нет телеметрии по контурам",
              message: "Нужны реальные поля уровня, охлаждения, температуры и генерации из агента OpenComputers.",
              tone: "muted",
            })}
          </section>
        `
    }
  `;
}

function renderEnergyPage(data) {
  const reactors = getAllReactors(data);
  const flux = getPrimaryFlux(data);
  const history = flux?.history || [];
  const bufferSeries = history.map((point) => Number(point.buffer) || 0);
  const avgBuffer = flux?.historySummary?.averageBuffer || 0;
  const reactorSegments = reactors.length
    ? reactors
        .filter((reactor) => reactor.energyGeneration > 0)
        .slice(0, 6)
        .map((reactor, index) => ({
          label: reactor.name,
          value: reactor.energyGeneration,
          color: ["#46f8a7", "#33d1ff", "#86ff6f", "#ffc46b", "#a47df5", "#ff7b72"][index % 6],
          formatter: formatRate,
        }))
    : [];
  const primaryStation = getPrimaryStation(data);

  return `
    <section class="tile-grid">
      ${metricTile("battery", "Буфер Flux", flux ? formatEnergy(data.overview.totalFluxBuffer) : "нет данных", flux ? `Средний буфер: ${formatEnergy(avgBuffer)}` : "Flux-сеть ещё не найдена в отчётах.", "accent")}
      ${metricTile("chart", "Вход в сеть", flux ? formatRate(data.overview.totalFluxInput) : "нет данных", flux ? "Суммарный текущий поток в Flux." : "Нет данных о входящем потоке.")}
      ${metricTile("bolt", "Выход из сети", flux ? formatRate(data.overview.totalFluxOutput) : "нет данных", flux ? "Нагрузка на сеть и потребителей." : "Нет данных о выходящем потоке.")}
      ${metricTile("power", "Энергия в МЭ", getPrimaryStation(data)?.me ? formatAe(getPrimaryStation(data).me.storedPower) : "нет данных", getPrimaryStation(data)?.me ? "Если МЭ-интерфейс доступен, запас энергии виден здесь." : "ME-интерфейс ещё не прислал энергетические показатели.")}
    </section>

    <section class="energy-layout">
      ${panel(
        "Тренд буфера Flux",
        "Flux history",
        flux && history.length
          ? `
              <div class="chart-block">
                <div class="chart-block__summary">
                  <strong>${formatEnergy(flux.buffer)}</strong>
                  <span>Пиковое значение ${formatEnergy(flux.historySummary?.peakBuffer || 0)}</span>
                </div>
                ${renderLineChart(bufferSeries, { width: 820, height: 280 })}
              </div>
            `
          : renderStatusSurface({
              iconName: "chart",
              eyebrow: "Flux history",
              title: "История буфера недоступна",
              message: missingSourceMessage(primaryStation, "истории Flux"),
              tone: primaryStation ? (primaryStation.isStale ? "danger" : "muted") : "warn",
            }),
        "panel--span-2"
      )}

      ${panel(
        "Последние пакеты",
        "Buffer columns",
        flux && history.length
          ? renderHistoryColumns(history, formatEnergy)
          : renderStatusSurface({
              iconName: "battery",
              eyebrow: "Packets",
              title: "Нет замеров по пакетам",
              message: "Нужна хотя бы одна серия пакетов от Flux-сети, чтобы построить столбики.",
              tone: primaryStation ? "muted" : "warn",
            }),
        "panel--compact"
      )}

      ${panel(
        "Вход / выход по пакетам",
        "Input vs output",
        flux && history.length
          ? renderInputOutputBars(history)
          : renderStatusSurface({
              iconName: "plug",
              eyebrow: "Input / output",
              title: "Нет потока для сравнения",
              message: "Когда Flux начнёт отдавать вход и выход по тикам, здесь появится сравнение каналов.",
              tone: primaryStation ? "muted" : "warn",
            }),
        "panel--compact"
      )}

      ${panel(
        "Распределение генерации",
        "Output share",
        reactorSegments.length
          ? renderDonutChart(reactorSegments)
          : renderStatusSurface({
              iconName: "network",
              eyebrow: "Output share",
              title: "Нет данных для распределения",
              message: reactors.length
                ? "Реакторы сейчас не выдают энергию, поэтому распределять пока нечего."
                : missingSourceMessage(primaryStation, "генерации реакторов"),
              tone: primaryStation ? "muted" : "warn",
            }),
        "panel--span-2"
      )}
    </section>
  `;
}

function renderLogsPage(data) {
  const entries = buildLogEntries(data);
  const warnings = entries.filter((entry) => entry.tone === "warn").length;
  const danger = entries.filter((entry) => entry.tone === "danger").length;
  const commands = data.commands.length;

  return `
    <section class="tile-grid">
      ${metricTile("log", "События в ленте", `${entries.length}`, "Сводка по командам, пакетам и предупреждениям.")}
      ${metricTile("shield", "Предупреждения", `${warnings}`, "События, которые требуют внимания, но ещё не критичны.", warnings ? "warn" : "good")}
      ${metricTile("alert", "Ошибки / критика", `${danger}`, "Команды с ошибками и опасные режимы реакторов.", danger ? "danger" : "good")}
      ${metricTile("clock", "Команд в истории", `${commands}`, "Последние действия оператора и агента.")}
    </section>

    <section class="logs-layout">
      ${panel("Хронология", "Timeline", renderLogRows(entries), "panel--span-2")}
      ${panel(
        "Последние команды",
        "Queue",
        data.commands.length
          ? `
              <div class="queue-list">
                ${data.commands
                  .slice(0, 8)
                  .map(
                    (command) => `
                      <article class="queue-row">
                        <div class="queue-row__title">
                          ${icon(command.action === "start" ? "play" : "stop")}
                          <div>
                            <strong>${escapeHtml(command.action === "start" ? "Запуск" : "Остановка")} ${escapeHtml(command.reactorId)}</strong>
                            <p>${escapeHtml(command.stationId)} · ${escapeHtml(relativeAgeText(command.finishedAt || command.queuedAt))}</p>
                          </div>
                        </div>
                        <span class="${stateToneClass(command.status === "completed" ? "good" : command.status === "failed" || command.status === "expired" ? "danger" : "warn")}">${escapeHtml(command.status)}</span>
                      </article>
                    `
                  )
                  .join("")}
              </div>
            `
          : `
              <div class="empty-state">
                <div class="empty-state__icon">${icon("info")}</div>
                <h4>Очередь команд пуста</h4>
                <p>Когда начнутся ручные включения и выключения, список появится здесь.</p>
              </div>
            `,
        "panel--compact"
      )}
    </section>
  `;
}

function renderPage(data) {
  if (state.route === "reactors") {
    return renderReactorsPage(data);
  }

  if (state.route === "energy") {
    return renderEnergyPage(data);
  }

  if (state.route === "logs") {
    return renderLogsPage(data);
  }

  return renderOverviewPage(data);
}

function renderApp(data) {
  renderSidebar(data);
  renderTopbar(data);
  appNode.innerHTML = renderPage(data);
}

async function handleCommand(button) {
  const action = button.dataset.command;
  const stationId = button.dataset.stationId;
  const reactorId = button.dataset.reactorId;
  const key = `${stationId}:${reactorId}`;

  if (state.pendingCommands.has(key)) {
    return;
  }

  state.pendingCommands.add(key);
  renderApp(state.data);

  try {
    setLiveMessage(`Ставлю команду "${action === "start" ? "включить" : "выключить"}" в очередь...`);

    const response = await fetch("api/reactors/command", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, stationId, reactorId }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Не удалось отправить команду.");
    }

    setLiveMessage("Команда поставлена в очередь и уйдёт агенту на следующем цикле.");
    await loadState();
  } catch (error) {
    setLiveMessage(error.message || "Команда не отправилась.");
  } finally {
    state.pendingCommands.delete(key);
    renderApp(state.data);
  }
}

appNode.addEventListener("click", (event) => {
  const button = event.target.closest("[data-command]");

  if (!button || !state.data) {
    return;
  }

  handleCommand(button);
});

window.addEventListener("hashchange", () => {
  state.route = getRouteFromHash();

  if (state.data) {
    renderApp(state.data);
  }
});

function restartRefreshTimer(intervalSeconds) {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
  }

  state.refreshTimer = setInterval(() => {
    safeLoadState();
  }, intervalSeconds * 1000);
}

function updateCountdown() {
  if (!state.data) {
    refreshCountdownNode.textContent = "Следующее обновление после первого ответа API";
    syncAgeNode.textContent = "Ожидание сервера...";
    return;
  }

  const secondsLeft = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
  refreshCountdownNode.textContent = `Следующее обновление через ${secondsLeft}с`;

  if (!state.data.overview.hasLiveData) {
    syncAgeNode.textContent = "Ждём первый пакет от OpenComputers";
    return;
  }

  syncAgeNode.textContent = `Последний пакет: ${relativeAgeText(state.data.overview.latestStationReportAt)}`;
}

async function loadState() {
  const response = await fetch("api/state", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Не удалось получить состояние панели.");
  }

  const payload = await response.json();
  state.data = payload;
  state.fetchedAt = Date.now();
  state.nextRefreshAt = Date.now() + (payload.syncIntervalSeconds || 45) * 1000;
  renderApp(payload);
  restartRefreshTimer(payload.syncIntervalSeconds || 45);
  updateCountdown();
}

async function safeLoadState() {
  try {
    await loadState();
    setLiveMessage(
      state.data.overview.hasLiveData
        ? "Панель синхронизирована с последней телеметрией."
        : "Сайт готов и ждёт первый пакет от игрового компьютера.",
      true
    );
  } catch (error) {
    if (!state.data) {
      state.data = createFallbackData(error.message || "API недоступен");
      renderApp(state.data);
    }

    setLiveMessage("Не удалось обновить данные, поэтому показываю последнее доступное состояние.");
  }
}

function startTimers() {
  if (state.clockTimer) {
    clearInterval(state.clockTimer);
  }

  restartRefreshTimer(state.data?.syncIntervalSeconds || 45);
  state.clockTimer = setInterval(updateCountdown, 1000);
}

manualRefreshButton.addEventListener("click", () => {
  safeLoadState();
});

safeLoadState();
startTimers();
