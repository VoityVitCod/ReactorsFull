# Пакет для компьютера OpenComputers

В этой папке лежат файлы именно для **игрового компьютера**, который будет стоять рядом с реакторами.

## Файлы

- [installer.lua](/Users/artyom/Documents/Реакторы/opencomputers/server-computer/installer.lua) — автозагрузчик, который сам скачает пакет на игровой компьютер.
- [reactor_agent.lua](/Users/artyom/Documents/Реакторы/opencomputers/server-computer/reactor_agent.lua) — основной агент.
- [reactor_config.lua](/Users/artyom/Documents/Реакторы/opencomputers/server-computer/reactor_config.lua) — отдельный конфиг, который не перезатирается при переустановке.
- [autorun.lua](/Users/artyom/Documents/Реакторы/opencomputers/server-computer/autorun.lua) — опциональный автозапуск.

## Что нужно на компьютере

- OpenOS
- интернет-карта
- адаптеры, через которые видны:
  - `htc_reactors_nuclear_reactor`
  - `flux_controller` или `flux_plug`
  - `me_interface`

## Установка в один шаг

На OpenComputers скачайте и запустите установщик:

```sh
wget -f https://raw.githubusercontent.com/VoityVitCod/ReactorsFull/main/opencomputers/server-computer/installer.lua /home/reactor_installer.lua
lua /home/reactor_installer.lua
```

Он автоматически скачает:

- `/home/reactor_agent.lua`
- `/home/reactor_config.lua`
- `/autorun.lua`
- `/home/reactor_control_readme.md`

`autorun.lua` использует стандартный механизм OpenOS autorun на корне файловой системы.

## Что поправить перед запуском

Откройте `/home/reactor_config.lua` и поправьте значения:

```lua
return {
  serverBaseUrl = "https://your-reactor-site.onrender.com",
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

Если уже есть корректный `/autorun.lua`, после настройки конфига можно просто перезагрузить компьютер.

## Как работает цикл

Раз в 45 секунд агент:

1. спрашивает у веб-сервера очередь команд;
2. запускает или останавливает нужные реакторы;
3. снимает телеметрию с реакторов, Flux и МЭ;
4. отправляет полный отчёт на сайт.

Такой цикл специально сделан длиннее кд `me_interface`, чтобы чтение жидкостей не спотыкалось о 22-30 секундные задержки.
