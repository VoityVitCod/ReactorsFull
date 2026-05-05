const appNode = document.getElementById("app");
const manualRefreshButton = document.getElementById("manual-refresh");
const refreshCountdownNode = document.getElementById("refresh-countdown");
const syncAgeNode = document.getElementById("sync-age");
const liveMessageNode = document.getElementById("live-message");

const PLACEHOLDER_HISTORY = [14, 22, 38, 46, 58, 61, 48, 66, 77, 69, 53, 41];

const state = {
  data: null,
  fetchedAt: 0,
  nextRefreshAt: 0,
  refreshTimer: null,
  clockTimer: null,
  pendingCommands: new Set(),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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

function formatRfPerTick(value) {
  return `${compactNumber(value)} RF/t`;
}

function formatRfValue(value) {
  return `${compactNumber(value)} RF`;
}

function formatAeValue(value) {
  return `${compactNumber(value)} AE`;
}

function formatFluid(value) {
  return `${compactNumber(value)} mB`;
}

function formatPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : "0%";
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

function timeLabel(timestamp) {
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

function badgeClassByCommandStatus(status) {
  if (status === "completed") {
    return "badge badge--good";
  }

  if (status === "failed" || status === "expired") {
    return "badge badge--danger";
  }

  if (status === "queued" || status === "dispatched") {
    return "badge badge--warn";
  }

  return "badge badge--muted";
}

function commandStatusLabel(command) {
  switch (command.status) {
    case "completed":
      return "Выполнено";
    case "failed":
      return "Ошибка";
    case "expired":
      return "Истекла";
    case "dispatched":
      return "Ушла агенту";
    case "queued":
      return "В очереди";
    default:
      return command.status;
  }
}

function queuedCommandCount(commands) {
  return commands.filter((command) => ["queued", "dispatched"].includes(command.status)).length;
}

function reactorStateConfig(reactor) {
  if (reactor.state === "critical") {
    return {
      cardClass: "reactor-card reactor-card--critical",
      badgeClass: "badge badge--danger",
      label: "Критично",
    };
  }

  if (reactor.state === "warning") {
    return {
      cardClass: "reactor-card reactor-card--warning",
      badgeClass: "badge badge--warn",
      label: "Под контролем",
    };
  }

  if (reactor.active) {
    return {
      cardClass: "reactor-card reactor-card--running",
      badgeClass: "badge badge--good",
      label: "В работе",
    };
  }

  return {
    cardClass: "reactor-card reactor-card--stopped",
    badgeClass: "badge badge--muted",
    label: "Остановлен",
  };
}

function fuelHint(reactor) {
  if (!reactor.active) {
    return "Контур остановлен, топливо не расходуется.";
  }

  if (reactor.estimatedSecondsRemaining) {
    return `До выработки топлива: ${formatDuration(reactor.estimatedSecondsRemaining)}`;
  }

  return "Остаток работы появится после двух последовательных отчётов.";
}

function commandLockHint(station, allowCommands, isPending) {
  if (!allowCommands) {
    return "Команды откроются после первого живого отчёта от OpenComputers.";
  }

  if (station.isStale) {
    return "Станция давно не обновлялась, команды лучше не отправлять вслепую.";
  }

  if (isPending) {
    return "Команда уже поставлена в очередь и ждёт ближайший цикл агента.";
  }

  return "Команда уйдёт агенту на следующем 45-секундном цикле.";
}

function findPrimaryFlux(data) {
  for (const station of data.stations || []) {
    if (station.fluxNetworks && station.fluxNetworks.length) {
      return station.fluxNetworks[0];
    }
  }

  return null;
}

function buildHistoryBars(points, { placeholder = false } = {}) {
  const sanitized = points.length
    ? points
    : PLACEHOLDER_HISTORY.map((value, index) => ({
        buffer: value,
        inputPerTick: value * 1000,
        outputPerTick: value * 900,
        at: Date.now() - (PLACEHOLDER_HISTORY.length - index) * 45 * 1000,
      }));

  const maxValue = Math.max(...sanitized.map((point) => Number(point.buffer) || 0), 1);
  const tickStep = Math.max(1, Math.floor(sanitized.length / 4));

  return `
    <div class="history-bars ${placeholder ? "history-bars--placeholder" : ""}">
      ${sanitized
        .map((point, index) => {
          const value = Math.max(8, ((Number(point.buffer) || 0) / maxValue) * 100);
          const showTick = index === sanitized.length - 1 || index % tickStep === 0;

          return `
            <div class="history-bar">
              <div class="history-bar__rail">
                <div class="history-bar__fill" style="height: ${value}%"></div>
              </div>
              <span class="history-bar__value">${compactNumber(point.buffer)}</span>
              <span class="history-bar__tick">${showTick ? escapeHtml(timeLabel(point.at)) : ""}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSignalDeck(data) {
  const primaryFlux = findPrimaryFlux(data);
  const fluxHistory = primaryFlux?.history || [];
  const fluxSummary = primaryFlux?.historySummary || null;
  const queued = queuedCommandCount(data.commands);
  const latestLabel = data.overview.latestStationReportAt
    ? relativeAgeText(data.overview.latestStationReportAt)
    : "пакет ещё не пришёл";

  return `
    <section class="signal-grid">
      <article class="signal-card signal-card--hero">
        <p class="signal-card__eyebrow">Complex Status</p>
        <div class="signal-card__heading">
          <div>
            <h2>${data.overview.hasLiveData ? "Комплекс на связи" : "Ожидание телеметрии"}</h2>
            <p class="signal-card__lede">
              ${
                data.overview.hasLiveData
                  ? "Панель получила живые отчёты от реакторной станции и держит очередь команд под рукой."
                  : "Сайт готов, но игровой компьютер ещё не прислал первый пакет. Ниже уже подготовлена визуальная заглушка и шаги запуска."
              }
            </p>
          </div>
          <span class="badge ${data.overview.hasLiveData ? "badge--good" : "badge--warn"}">
            ${data.overview.hasLiveData ? "Live" : "Standby"}
          </span>
        </div>
        <div class="signal-card__hero-value">${compactNumber(data.overview.totalGeneration)}</div>
        <p class="signal-card__hero-caption">Суммарная генерация комплекса прямо сейчас, RF/t</p>
        <div class="signal-card__statline">
          <div>
            <span class="signal-card__stat-label">Активные реакторы</span>
            <strong>${data.overview.activeReactors}/${data.overview.totalReactors}</strong>
          </div>
          <div>
            <span class="signal-card__stat-label">Последний пакет</span>
            <strong>${latestLabel}</strong>
          </div>
          <div>
            <span class="signal-card__stat-label">Команд в очереди</span>
            <strong>${queued}</strong>
          </div>
        </div>
      </article>

      <article class="signal-card signal-card--pulse">
        <p class="signal-card__eyebrow">Flux Pulse</p>
        <div class="signal-card__heading signal-card__heading--compact">
          <h3>Буфер Flux по времени</h3>
          <span class="badge ${primaryFlux ? "badge--good" : "badge--muted"}">
            ${primaryFlux ? "История" : "Заглушка"}
          </span>
        </div>
        <div class="signal-card__pulse-value">
          ${primaryFlux ? formatRfValue(primaryFlux.buffer) : "—"}
        </div>
        <p class="signal-card__hero-caption">
          ${
            primaryFlux
              ? `Средний буфер: ${formatRfValue(fluxSummary?.averageBuffer || 0)}`
              : "Когда появятся живые отчёты, здесь будет история последних пакетов Flux."
          }
        </p>
        ${buildHistoryBars(fluxHistory, { placeholder: !primaryFlux })}
      </article>

      <article class="signal-card">
        <p class="signal-card__eyebrow">Storage</p>
        <h3>Flux буфер комплекса</h3>
        <p class="signal-card__value">${formatRfValue(data.overview.totalFluxBuffer)}</p>
        <p class="signal-card__meta">
          Вход ${formatRfPerTick(data.overview.totalFluxInput)} / выход ${formatRfPerTick(data.overview.totalFluxOutput)}
        </p>
      </article>

      <article class="signal-card">
        <p class="signal-card__eyebrow">Coolant</p>
        <h3>Низкотемпературный хладагент</h3>
        <p class="signal-card__value">${formatFluid(data.overview.lowTempCoolantTotal)}</p>
        <p class="signal-card__meta">Суммарно найдено в МЭ-сетях, которые видит агент.</p>
      </article>
    </section>
  `;
}

function renderPlaceholderBay(data, errorMessage = "") {
  const showcaseLevels = data?.placeholder?.showcaseLevels || [1, 2, 3, 4, 5, 6];

  return `
    <section class="empty-bay">
      <div class="empty-bay__intro">
        <div>
          <p class="station__eyebrow">Cold Start</p>
          <h2>${errorMessage ? "Сайт не дождался данных" : "Ждём первый отчёт от игрового компьютера"}</h2>
          <p class="mini-meta">
            ${
              errorMessage
                ? escapeHtml(errorMessage)
                : "Как только OpenComputers-компьютер выйдет на связь, заглушка автоматически сменится реальной телеметрией."
            }
          </p>
        </div>
        <div class="empty-bay__steps">
          <div class="empty-step">
            <span class="empty-step__index">1</span>
            <div>
              <strong>Проверь URL сервера</strong>
              <p>В reactor_config.lua должен быть адрес развернутого сайта или backend-хоста.</p>
            </div>
          </div>
          <div class="empty-step">
            <span class="empty-step__index">2</span>
            <div>
              <strong>Запусти установщик</strong>
              <p>Он сам скачает агент, конфиг и автозапуск на OpenComputers-компьютер.</p>
            </div>
          </div>
          <div class="empty-step">
            <span class="empty-step__index">3</span>
            <div>
              <strong>Подожди 45 секунд</strong>
              <p>Этого достаточно, чтобы первый пакет безопасно прошёл даже через кд МЭ-интерфейса.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="placeholder-grid">
        ${showcaseLevels
          .map(
            (level) => `
              <article class="placeholder-card" style="--reactor-art: url('/assets/reactors/level-${level}.webp')">
                <div class="placeholder-card__veil"></div>
                <div class="placeholder-card__content">
                  <span class="badge">Уровень ${level}</span>
                  <h3>Реакторный контур</h3>
                  <p>Ждём имя реактора, температуру, жижу, генерацию и остаток топлива.</p>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderFluxPanel(network) {
  if (!network) {
    return `
      <article class="network-card network-card--flux">
        <div class="network-card__header">
          <div>
            <p class="network-card__eyebrow">Flux</p>
            <h3>Flux-сеть пока не найдена</h3>
          </div>
          <span class="badge badge--muted">Нет сигнала</span>
        </div>
        <p class="mini-meta">Подключите адаптер к Flux Controller или Flux Plug, чтобы сайт начал строить график буфера.</p>
        ${buildHistoryBars([], { placeholder: true })}
      </article>
    `;
  }

  const summary = network.historySummary || {
    averageBuffer: 0,
    peakBuffer: 0,
    averageInputPerTick: 0,
    averageOutputPerTick: 0,
  };

  return `
    <article class="network-card network-card--flux">
      <div class="network-card__header">
        <div>
          <p class="network-card__eyebrow">Flux</p>
          <h3>${escapeHtml(network.name)}</h3>
        </div>
        <span class="badge ${network.surgeMode ? "badge--warn" : "badge--good"}">
          ${network.surgeMode ? "Surge mode" : "Стабильно"}
        </span>
      </div>

      <div class="network-card__metrics">
        <div class="metric">
          <span class="metric__label">Текущий буфер</span>
          <strong class="metric__value">${formatRfValue(network.buffer)}</strong>
        </div>
        <div class="metric">
          <span class="metric__label">Пиковый буфер</span>
          <strong class="metric__value">${formatRfValue(summary.peakBuffer)}</strong>
        </div>
        <div class="metric">
          <span class="metric__label">Средний вход</span>
          <strong class="metric__value">${formatRfPerTick(summary.averageInputPerTick)}</strong>
        </div>
        <div class="metric">
          <span class="metric__label">Средний выход</span>
          <strong class="metric__value">${formatRfPerTick(summary.averageOutputPerTick)}</strong>
        </div>
      </div>

      <div class="timeline-panel">
        <div class="timeline-panel__head">
          <div>
            <span class="timeline-panel__label">Последние пакеты</span>
            <strong>${network.history?.length || 0} замеров</strong>
          </div>
          <div class="timeline-panel__summary">
            <span>Средний буфер</span>
            <strong>${formatRfValue(summary.averageBuffer)}</strong>
          </div>
        </div>
        ${buildHistoryBars(network.history || [])}
      </div>
    </article>
  `;
}

function renderMePanel(me) {
  if (!me) {
    return `
      <article class="network-card network-card--me">
        <div class="network-card__header">
          <div>
            <p class="network-card__eyebrow">ME</p>
            <h3>МЭ-сеть не подключена</h3>
          </div>
          <span class="badge badge--muted">Нет интерфейса</span>
        </div>
        <p class="mini-meta">Агент поддерживает чтение энергии и жидкостей через компонент me_interface.</p>
      </article>
    `;
  }

  const powerRatio = me.maxStoredPower > 0 ? (me.storedPower / me.maxStoredPower) * 100 : 0;
  const fluidChips = (me.trackedFluids || []).slice(0, 3);

  return `
    <article class="network-card network-card--me">
      <div class="network-card__header">
        <div>
          <p class="network-card__eyebrow">ME</p>
          <h3>${escapeHtml(me.name)}</h3>
        </div>
        <span class="badge ${me.online ? "badge--good" : "badge--danger"}">
          ${me.online ? "Online" : "Offline"}
        </span>
      </div>

      <div class="meter meter--wide">
        <div class="meter__head">
          <span>Энергия в МЭ</span>
          <strong>${formatPercent(powerRatio)}</strong>
        </div>
        <div class="meter__track">
          <div class="meter__fill meter__fill--me" style="width: ${Math.max(0, Math.min(100, powerRatio))}%"></div>
        </div>
      </div>

      <div class="network-card__metrics">
        <div class="metric">
          <span class="metric__label">Запас</span>
          <strong class="metric__value">${formatAeValue(me.storedPower)}</strong>
        </div>
        <div class="metric">
          <span class="metric__label">Низкотемпературный хладагент</span>
          <strong class="metric__value">${me.lowTempCoolant ? formatFluid(me.lowTempCoolant.amount) : "не найден"}</strong>
        </div>
        <div class="metric">
          <span class="metric__label">Средняя подпитка</span>
          <strong class="metric__value">${compactNumber(me.avgPowerInjection)} AE/t</strong>
        </div>
        <div class="metric">
          <span class="metric__label">Средний расход</span>
          <strong class="metric__value">${compactNumber(me.avgPowerUsage)} AE/t</strong>
        </div>
      </div>

      ${
        fluidChips.length
          ? `
            <div class="fluid-chip-row">
              ${fluidChips
                .map(
                  (fluid) => `
                    <div class="fluid-chip">
                      <span class="fluid-chip__name">${escapeHtml(fluid.label)}</span>
                      <strong>${formatFluid(fluid.amount)}</strong>
                    </div>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }
    </article>
  `;
}

function renderReactorCard(station, reactor, commandMap, allowCommands) {
  const commandKey = `${station.stationId}:${reactor.reactorId}`;
  const lastCommand = commandMap.get(commandKey);
  const isPending = state.pendingCommands.has(commandKey);
  const disabled = !allowCommands || station.isStale || isPending;
  const background = `/assets/reactors/level-${reactor.level}.webp`;
  const stateConfig = reactorStateConfig(reactor);

  return `
    <article class="${stateConfig.cardClass}" style="--reactor-art: url('${background}')">
      <div class="reactor-card__glow"></div>
      <div class="reactor-card__content">
        <div class="reactor-card__title">
          <div>
            <p class="reactor-card__eyebrow">Reactor L${reactor.level}</p>
            <h3 class="reactor-card__name">${escapeHtml(reactor.name)}</h3>
            <p class="reactor-card__address">${escapeHtml(reactor.address)}</p>
          </div>
          <div class="reactor-card__badges">
            <span class="badge">${reactor.activeCooling ? "Liquid" : "Dry"}</span>
            <span class="${stateConfig.badgeClass}">${stateConfig.label}</span>
          </div>
        </div>

        <div class="reactor-card__stats">
          <div class="reactor-card__kpi">
            <div class="reactor-card__kpi-label">Генерация</div>
            <div class="reactor-card__kpi-value">${formatRfPerTick(reactor.energyGeneration)}</div>
          </div>
          <div class="reactor-card__kpi">
            <div class="reactor-card__kpi-label">Охлаждение</div>
            <div class="reactor-card__kpi-value">${formatFluid(reactor.coolant)}</div>
          </div>
          <div class="reactor-card__kpi">
            <div class="reactor-card__kpi-label">Расход жижи</div>
            <div class="reactor-card__kpi-value">${formatFluid(reactor.coolantPerSecond)}/s</div>
          </div>
          <div class="reactor-card__kpi">
            <div class="reactor-card__kpi-label">Температура</div>
            <div class="reactor-card__kpi-value">${compactNumber(reactor.temperature)} / ${compactNumber(reactor.maxTemperature)}</div>
          </div>
        </div>

        <div class="reactor-card__meters">
          <div class="meter">
            <div class="meter__head">
              <span>Топливо</span>
              <strong>${formatPercent(reactor.fuelRatio)}</strong>
            </div>
            <div class="meter__track">
              <div class="meter__fill" style="width: ${reactor.fuelRatio}%"></div>
            </div>
          </div>

          <div class="meter">
            <div class="meter__head">
              <span>Буфер охлаждения</span>
              <strong>${formatPercent(reactor.coolantRatio)}</strong>
            </div>
            <div class="meter__track">
              <div class="meter__fill meter__fill--coolant" style="width: ${reactor.coolantRatio}%"></div>
            </div>
          </div>

          <div class="meter">
            <div class="meter__head">
              <span>Температурная нагрузка</span>
              <strong>${formatPercent(reactor.temperatureRatio)}</strong>
            </div>
            <div class="meter__track">
              <div class="meter__fill meter__fill--temperature" style="width: ${reactor.temperatureRatio}%"></div>
            </div>
          </div>
        </div>

        <div class="reactor-card__footer">
          <p class="reactor-card__hint">${fuelHint(reactor)}</p>
          <p class="reactor-card__hint">${commandLockHint(station, allowCommands, isPending)}</p>
          ${
            lastCommand
              ? `<p class="reactor-card__hint">Последняя команда: ${escapeHtml(commandStatusLabel(lastCommand))}${
                  lastCommand.resultMessage ? ` — ${escapeHtml(lastCommand.resultMessage)}` : ""
                }</p>`
              : ""
          }
          <div class="action-row">
            <button
              class="action-button action-button--start"
              type="button"
              data-command="start"
              data-station-id="${escapeHtml(station.stationId)}"
              data-reactor-id="${escapeHtml(reactor.reactorId)}"
              ${disabled ? "disabled" : ""}
            >
              Включить
            </button>
            <button
              class="action-button action-button--stop"
              type="button"
              data-command="stop"
              data-station-id="${escapeHtml(station.stationId)}"
              data-reactor-id="${escapeHtml(reactor.reactorId)}"
              ${disabled ? "disabled" : ""}
            >
              Выключить
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderStation(station, commandMap, allowCommands) {
  return `
    <section class="station">
      <div class="station__header">
        <div class="station__title-wrap">
          <p class="station__eyebrow">Station</p>
          <h2>${escapeHtml(station.stationName)}</h2>
          <p class="mini-meta">
            Последний отчёт: ${relativeAgeText(station.lastSeenAt)}. Период агента: ${station.intervalSeconds || 45} секунд.
          </p>
        </div>

        <div class="station__badges">
          <span class="badge ${station.isStale ? "badge--danger" : "badge--good"}">
            ${station.isStale ? "Пакет устарел" : "Канал стабилен"}
          </span>
          <span class="badge">${station.summary.activeReactors}/${station.summary.reactorCount} реакторов активны</span>
          <span class="badge">${formatRfValue(station.summary.totalFluxBuffer)}</span>
          <span class="badge">${formatDuration(station.summary.minRemainingSeconds)}</span>
        </div>
      </div>

      <div class="station__network-grid">
        ${renderFluxPanel(station.fluxNetworks[0] || null)}
        ${renderMePanel(station.me)}
      </div>

      <div class="reactor-grid">
        ${station.reactors.map((reactor) => renderReactorCard(station, reactor, commandMap, allowCommands)).join("")}
      </div>
    </section>
  `;
}

function renderCommandFeed(commands) {
  if (!commands.length) {
    return `
      <section class="command-feed">
        <div class="command-feed__header">
          <div>
            <p class="station__eyebrow">Command Queue</p>
            <h2>Очередь команд пуста</h2>
          </div>
          <span class="badge badge--muted">0 активных задач</span>
        </div>
        <p class="mini-meta">Когда ты начнёшь запускать или останавливать реакторы, история действий появится здесь.</p>
      </section>
    `;
  }

  return `
    <section class="command-feed">
      <div class="command-feed__header">
        <div>
          <p class="station__eyebrow">Command Queue</p>
          <h2>Последние действия</h2>
        </div>
        <span class="badge">${queuedCommandCount(commands)} в полёте</span>
      </div>

      <div class="command-feed__rows">
        ${commands
          .slice(0, 10)
          .map(
            (command) => `
              <article class="command-row">
                <div>
                  <h3 class="command-row__title">${escapeHtml(command.action === "start" ? "Запуск" : "Остановка")} → ${escapeHtml(command.reactorId)}</h3>
                  <p class="command-row__meta">
                    ${escapeHtml(command.stationId)} · ${relativeAgeText(command.queuedAt)}
                    ${command.resultMessage ? ` · ${escapeHtml(command.resultMessage)}` : ""}
                  </p>
                </div>
                <div class="command-row__badges">
                  <span class="${badgeClassByCommandStatus(command.status)}">${escapeHtml(commandStatusLabel(command))}</span>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderDashboard(data) {
  const commandMap = latestCommandsByReactor(data.commands);
  const allowCommands = data.overview.hasLiveData;

  appNode.innerHTML = `
    ${renderSignalDeck(data)}
    ${
      data.overview.hasLiveData
        ? data.stations.map((station) => renderStation(station, commandMap, allowCommands)).join("")
        : renderPlaceholderBay(data)
    }
    ${renderCommandFeed(data.commands)}
  `;
}

function renderTransportError(error) {
  appNode.innerHTML = `
    ${renderSignalDeck({
      overview: {
        hasLiveData: false,
        totalGeneration: 0,
        activeReactors: 0,
        totalReactors: 0,
        totalFluxBuffer: 0,
        totalFluxInput: 0,
        totalFluxOutput: 0,
        lowTempCoolantTotal: 0,
        latestStationReportAt: null,
      },
      stations: [],
      commands: [],
      placeholder: {
        showcaseLevels: [1, 2, 3, 4, 5, 6],
      },
    })}
    ${renderPlaceholderBay(
      {
        placeholder: {
          showcaseLevels: [1, 2, 3, 4, 5, 6],
        },
      },
      `Панель не получила ответ от API: ${error.message || "неизвестная ошибка"}.`
    )}
  `;
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

  if (state.data) {
    renderDashboard(state.data);
  }

  try {
    setLiveMessage(`Ставлю команду "${action === "start" ? "включить" : "выключить"}" в очередь...`);

    const response = await fetch("/api/reactors/command", {
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

    setLiveMessage("Команда поставлена в очередь и уйдёт агенту на ближайшем цикле.");
    await loadState();
  } catch (error) {
    setLiveMessage(error.message || "Команда не отправилась.");
  } finally {
    state.pendingCommands.delete(key);

    if (state.data) {
      renderDashboard(state.data);
    }
  }
}

appNode.addEventListener("click", (event) => {
  const button = event.target.closest("[data-command]");

  if (!button) {
    return;
  }

  handleCommand(button);
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
    syncAgeNode.textContent = "Сайт ждёт первое соединение...";
    return;
  }

  const secondsLeft = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
  refreshCountdownNode.textContent = `Следующее обновление через ${secondsLeft}с`;

  if (!state.data.overview.hasLiveData) {
    syncAgeNode.textContent = "Ждём первый пакет от OpenComputers-компьютера";
    return;
  }

  syncAgeNode.textContent = `Самый свежий пакет: ${relativeAgeText(state.data.overview.latestStationReportAt)}`;
}

async function loadState() {
  const response = await fetch("/api/state", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Не удалось получить состояние панели.");
  }

  const payload = await response.json();
  state.data = payload;
  state.fetchedAt = Date.now();
  state.nextRefreshAt = Date.now() + (payload.syncIntervalSeconds || 45) * 1000;
  renderDashboard(payload);
  restartRefreshTimer(payload.syncIntervalSeconds || 45);
  updateCountdown();
}

async function safeLoadState() {
  try {
    await loadState();
    setLiveMessage(
      state.data?.overview?.hasLiveData
        ? "Телеметрия обновлена. Панель синхронизирована с игровым компьютером."
        : "Сайт на связи, но живых пакетов пока нет.",
      true
    );
  } catch (error) {
    if (state.data) {
      setLiveMessage("Не смог обновить панель, поэтому оставил последнее известное состояние.");
      return;
    }

    renderTransportError(error);
    setLiveMessage("API пока недоступен. Как только сервер оживёт, заглушка исчезнет.");
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
