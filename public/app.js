const appNode = document.getElementById("app");
const manualRefreshButton = document.getElementById("manual-refresh");
const refreshCountdownNode = document.getElementById("refresh-countdown");
const syncAgeNode = document.getElementById("sync-age");
const liveMessageNode = document.getElementById("live-message");

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
      return "Протухла";
    case "dispatched":
      return "Отправлена агенту";
    case "queued":
      return "В очереди";
    default:
      return command.status;
  }
}

function reactorStateBadge(reactor) {
  if (reactor.state === "critical") {
    return '<span class="badge badge--danger">Критично</span>';
  }

  if (reactor.state === "warning") {
    return '<span class="badge badge--warn">Нужен контроль</span>';
  }

  if (reactor.active) {
    return '<span class="badge badge--good">Работает</span>';
  }

  return '<span class="badge badge--muted">Остановлен</span>';
}

function fuelHint(reactor) {
  if (!reactor.active) {
    return "Реактор стоит, топливо не расходуется.";
  }

  if (reactor.estimatedSecondsRemaining) {
    return `До выработки: ${formatDuration(reactor.estimatedSecondsRemaining)}`;
  }

  return "Для расчёта остатка нужно хотя бы две телеметрии.";
}

function renderOverview(data) {
  return `
    <section class="overview-grid">
      <article class="overview-card">
        <p class="overview-card__label">Реакторы в сети</p>
        <p class="overview-card__value">${data.overview.activeReactors}/${data.overview.totalReactors}</p>
        <p class="overview-card__hint">Активных блоков сейчас в работе.</p>
      </article>
      <article class="overview-card">
        <p class="overview-card__label">Суммарная генерация</p>
        <p class="overview-card__value">${compactNumber(data.overview.totalGeneration)}</p>
        <p class="overview-card__hint">Текущая выработка комплекса в RF/t.</p>
      </article>
      <article class="overview-card">
        <p class="overview-card__label">Flux буфер</p>
        <p class="overview-card__value">${compactNumber(data.overview.totalFluxBuffer)}</p>
        <p class="overview-card__hint">
          Вход ${compactNumber(data.overview.totalFluxInput)} / выход ${compactNumber(data.overview.totalFluxOutput)} RF/t.
        </p>
      </article>
      <article class="overview-card">
        <p class="overview-card__label">Низкотемпературный хладагент</p>
        <p class="overview-card__value">${compactNumber(data.overview.lowTempCoolantTotal)}</p>
        <p class="overview-card__hint">Общий объём, который агент нашёл в МЭ-сети.</p>
      </article>
    </section>
  `;
}

function renderFluxPanel(station) {
  const network = station.fluxNetworks[0];

  if (!network) {
    return `
      <article class="network-card">
        <p class="network-card__eyebrow">Flux</p>
        <h3>Flux-сеть не подключена</h3>
        <p class="mini-meta">Подключите адаптер к Flux Controller или хотя бы к Flux Plug.</p>
      </article>
    `;
  }

  return `
    <article class="network-card">
      <div class="network-card__title">
        <div>
          <p class="network-card__eyebrow">Flux</p>
          <h3>${escapeHtml(network.name)}</h3>
        </div>
        <span class="badge ${network.surgeMode ? "badge--warn" : "badge--good"}">
          ${network.surgeMode ? "Surge mode" : "Стабильно"}
        </span>
      </div>

      <div class="network-card__stats">
        <div class="metric">
          <span class="metric__label">Буфер</span>
          <span class="metric__value">${compactNumber(network.buffer)}</span>
        </div>
        <div class="metric">
          <span class="metric__label">Лимит передачи</span>
          <span class="metric__value">${formatRfPerTick(network.transferLimit)}</span>
        </div>
        <div class="metric">
          <span class="metric__label">Вход</span>
          <span class="metric__value">${formatRfPerTick(network.inputPerTick)}</span>
        </div>
        <div class="metric">
          <span class="metric__label">Выход</span>
          <span class="metric__value">${formatRfPerTick(network.outputPerTick)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderMePanel(station) {
  const me = station.me;

  if (!me) {
    return `
      <article class="network-card">
        <p class="network-card__eyebrow">ME</p>
        <h3>МЭ-сеть не подключена</h3>
        <p class="mini-meta">Агент умеет читать энергию сети и жидкости через me_interface.</p>
      </article>
    `;
  }

  const lowTempCoolant = me.lowTempCoolant
    ? `${formatFluid(me.lowTempCoolant.amount)}`
    : "не найден";

  return `
    <article class="network-card">
      <div class="network-card__title">
        <div>
          <p class="network-card__eyebrow">МЭ-сеть</p>
          <h3>${escapeHtml(me.name)}</h3>
        </div>
        <span class="badge ${me.online ? "badge--good" : "badge--danger"}">
          ${me.online ? "Online" : "Offline"}
        </span>
      </div>

      <div class="network-card__stats">
        <div class="metric">
          <span class="metric__label">Энергия в МЭ</span>
          <span class="metric__value">${compactNumber(me.storedPower)} AE</span>
        </div>
        <div class="metric">
          <span class="metric__label">Низкотемпературный хладагент</span>
          <span class="metric__value">${lowTempCoolant}</span>
        </div>
        <div class="metric">
          <span class="metric__label">Средняя подпитка</span>
          <span class="metric__value">${compactNumber(me.avgPowerInjection)} AE/t</span>
        </div>
        <div class="metric">
          <span class="metric__label">Средний расход</span>
          <span class="metric__value">${compactNumber(me.avgPowerUsage)} AE/t</span>
        </div>
      </div>
    </article>
  `;
}

function renderReactorCard(station, reactor, commandMap, demoMode) {
  const commandKey = `${station.stationId}:${reactor.reactorId}`;
  const lastCommand = commandMap.get(commandKey);
  const disabled = demoMode || state.pendingCommands.has(commandKey);
  const background = `/assets/reactors/level-${reactor.level}.webp`;

  return `
    <article class="reactor-card" style="--reactor-art: url('${background}')">
      <div class="reactor-card__content">
        <div class="reactor-card__title">
          <div>
            <h3 class="reactor-card__name">${escapeHtml(reactor.name)}</h3>
            <p class="reactor-card__address">${escapeHtml(reactor.address)}</p>
          </div>
          <div class="reactor-card__badges">
            <span class="badge">Уровень ${reactor.level}</span>
            ${reactorStateBadge(reactor)}
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
              <span>Температура</span>
              <strong>${formatPercent(reactor.temperatureRatio)}</strong>
            </div>
            <div class="meter__track">
              <div class="meter__fill meter__fill--temperature" style="width: ${reactor.temperatureRatio}%"></div>
            </div>
          </div>
        </div>

        <div class="reactor-card__footer">
          <p class="reactor-card__hint">${fuelHint(reactor)}</p>
          <p class="reactor-card__hint">
            ${reactor.activeCooling ? "Жидкостное охлаждение активно." : "Жидкостное охлаждение выключено."}
          </p>
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

function renderStation(station, commandMap, demoMode) {
  return `
    <section class="station">
      <div class="station__header">
        <div class="station__title-wrap">
          <p class="station__eyebrow">Станция</p>
          <h2>${escapeHtml(station.stationName)}</h2>
          <p class="mini-meta">
            Последний отчёт: ${relativeAgeText(station.lastSeenAt)}. Обновление агента каждые ${station.intervalSeconds || 45} секунд.
          </p>
        </div>

        <div class="station__badges">
          <span class="badge ${station.isStale ? "badge--danger" : "badge--good"}">
            ${station.isStale ? "Данные устарели" : "На связи"}
          </span>
          <span class="badge">${station.summary.activeReactors}/${station.summary.reactorCount} в работе</span>
          <span class="badge">${formatRfPerTick(station.summary.totalGeneration)}</span>
        </div>
      </div>

      <div class="station__network-grid">
        ${renderFluxPanel(station)}
        ${renderMePanel(station)}
      </div>

      <div class="reactor-grid">
        ${station.reactors.map((reactor) => renderReactorCard(station, reactor, commandMap, demoMode)).join("")}
      </div>
    </section>
  `;
}

function renderCommandFeed(commands) {
  if (!commands.length) {
    return `
      <section class="command-feed">
        <p class="station__eyebrow">Команды</p>
        <h2>Очередь пока пустая</h2>
        <p class="mini-meta">Когда вы нажмёте запуск или остановку реактора, запись появится здесь.</p>
      </section>
    `;
  }

  return `
    <section class="command-feed">
      <p class="station__eyebrow">Команды</p>
      <h2>Последние действия</h2>
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

  appNode.innerHTML = `
    ${renderOverview(data)}
    ${data.demoMode ? `
      <section class="station">
        <div class="station__header">
          <div class="station__title-wrap">
            <p class="station__eyebrow">Режим</p>
            <h2>Сейчас показана демо-телеметрия</h2>
            <p class="mini-meta">
              Кнопки включения и выключения откроются после первого реального отчёта от OpenComputers.
            </p>
          </div>
          <div class="station__badges">
            <span class="badge badge--warn">Демо-режим</span>
          </div>
        </div>
      </section>
    ` : ""}
    ${data.stations.map((station) => renderStation(station, commandMap, data.demoMode)).join("")}
    ${renderCommandFeed(data.commands)}
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
    refreshCountdownNode.textContent = "Следующее обновление после загрузки данных";
    syncAgeNode.textContent = "Ожидание первого пакета...";
    return;
  }

  const secondsLeft = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
  refreshCountdownNode.textContent = `Следующее обновление через ${secondsLeft}с`;

  const freshest = state.data.stations
    .map((station) => station.lastSeenAt)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];

  syncAgeNode.textContent = `Самый свежий отчёт: ${relativeAgeText(freshest)}`;
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
    setLiveMessage("", true);
  } catch (error) {
    appNode.innerHTML = `
      <section class="station">
        <div class="station__header">
          <div class="station__title-wrap">
            <p class="station__eyebrow">Ошибка</p>
            <h2>Панель не смогла загрузить данные</h2>
            <p class="mini-meta">${escapeHtml(error.message || "Неизвестная ошибка.")}</p>
          </div>
        </div>
      </section>
    `;
    setLiveMessage("Сервер ответил ошибкой. Проверьте `server.js` и журнал консоли.");
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
