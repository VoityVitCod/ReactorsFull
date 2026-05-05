# Пакет для компьютера OpenComputers

В этой папке лежат файлы именно для **игрового компьютера**, который будет стоять рядом с реакторами.

## Файлы

- [reactor_agent.lua](/Users/artyom/Documents/Реакторы/opencomputers/server-computer/reactor_agent.lua) — основной агент.
- [autorun.lua](/Users/artyom/Documents/Реакторы/opencomputers/server-computer/autorun.lua) — опциональный автозапуск.

## Что нужно на компьютере

- OpenOS
- интернет-карта
- адаптеры, через которые видны:
  - `htc_reactors_nuclear_reactor`
  - `flux_controller` или `flux_plug`
  - `me_interface`

## Куда копировать

1. `reactor_agent.lua` положите в `/home/reactor_agent.lua`
2. Если нужен автозапуск:
   `autorun.lua` положите в корень диска как `/autorun.lua`

`autorun.lua` опирается на стандартный механизм OpenOS autorun на корне файловой системы.

## Что поправить перед запуском

Откройте `/home/reactor_agent.lua` и поменяйте блок `config`:

```lua
local config = {
  serverBaseUrl = "http://127.0.0.1:8080",
  token = "change-me",
  stationId = "reactor-station-1",
  stationName = "Главная реакторная",
  syncIntervalSeconds = 45,
}
```

Минимально надо заменить:

- `serverBaseUrl` — адрес машины, где крутится `server.js`
- `token` — тот же токен, что вы задали в `OC_AGENT_TOKEN`
- `stationId` — стабильный id станции
- `stationName` — красивое имя для сайта

## Имена реакторов

Если хотите красивые подписи вместо UUID, заполните таблицу:

```lua
reactorNames = {
  ["dbc7703c-c4bf-4e9c-a6ec-3959abc06321"] = "Контур L6",
}
```

То же самое можно сделать и для Flux:

```lua
fluxNames = {
  ["your-controller-address"] = "Flux Mainline",
}
```

## Ручной запуск

```sh
lua /home/reactor_agent.lua
```

## Как работает цикл

Раз в 45 секунд агент:

1. спрашивает у веб-сервера очередь команд;
2. запускает или останавливает нужные реакторы;
3. снимает телеметрию с реакторов, Flux и МЭ;
4. отправляет полный отчёт на сайт.

Такой цикл специально сделан длиннее кд `me_interface`, чтобы чтение жидкостей не спотыкалось о 22-30 секундные задержки.
