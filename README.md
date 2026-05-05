# Reactor Grid Control

Лёгкий веб-пульт для комплекса реакторов на **OpenComputers**. Проект состоит из двух частей:

- `server.js` — Node-сервер без зависимостей, который принимает телеметрию, хранит последнее состояние и раздаёт сайт.
- `opencomputers/server-computer/` — пакет файлов для компьютера внутри Minecraft, который опрашивает реакторы, Flux и МЭ-сеть.

## Что уже умеет

- Показывать карточки реакторов с фоном по уровню `1-6`.
- Отображать генерацию, охлаждение, расход жижи, температуру, остаток топлива и примерное время до выработки.
- Показать состояние `Flux` сети: буфер, лимит передачи, вход и выход.
- Показать состояние `МЭ` сети: энергия и количество **низкотемпературного хладагента**.
- Ставить в очередь команды `включить` / `выключить`, которые OpenComputers-агент забирает на своём 45-секундном цикле.
- Работать без `npm install`: нужен только `node`.

## Структура

- [server.js](/Users/artyom/Documents/Реакторы/server.js)
- [public/index.html](/Users/artyom/Documents/Реакторы/public/index.html)
- [public/styles.css](/Users/artyom/Documents/Реакторы/public/styles.css)
- [public/app.js](/Users/artyom/Documents/Реакторы/public/app.js)
- [opencomputers/server-computer/reactor_agent.lua](/Users/artyom/Documents/Реакторы/opencomputers/server-computer/reactor_agent.lua)
- [opencomputers/server-computer/autorun.lua](/Users/artyom/Documents/Реакторы/opencomputers/server-computer/autorun.lua)
- [opencomputers/server-computer/README.md](/Users/artyom/Documents/Реакторы/opencomputers/server-computer/README.md)

## Запуск сайта

1. Убедитесь, что на машине есть `node`.
2. При желании задайте токен агента:

```bash
export OC_AGENT_TOKEN='replace-me'
```

3. Запустите сервер:

```bash
node /Users/artyom/Documents/Реакторы/server.js
```

По умолчанию сайт поднимется на `http://0.0.0.0:8080`.

### Переменные окружения

- `PORT` — порт сайта, по умолчанию `8080`.
- `HOST` — адрес бинда, по умолчанию `0.0.0.0`.
- `OC_AGENT_TOKEN` — токен, которым авторизуется OpenComputers-агент.
- `SYNC_INTERVAL_SECONDS` — интервал синхронизации. По умолчанию `45`.

## Как подключить OpenComputers

Файлы для игрового компьютера собраны отдельно в папке [opencomputers/server-computer](/Users/artyom/Documents/Реакторы/opencomputers/server-computer).

Быстрый сценарий:

1. Откройте [opencomputers/server-computer/reactor_agent.lua](/Users/artyom/Documents/Реакторы/opencomputers/server-computer/reactor_agent.lua) и поправьте блок `config`.
2. Перенесите `reactor_agent.lua` на диск OpenComputers в `/home/reactor_agent.lua`.
3. Если нужен автозапуск, перенесите `autorun.lua` в корень диска `/autorun.lua`.
4. Запустите агент вручную командой `lua /home/reactor_agent.lua` или перезагрузите компьютер с `autorun.lua`.

Подробности лежат в [opencomputers/server-computer/README.md](/Users/artyom/Documents/Реакторы/opencomputers/server-computer/README.md).

## Формат обмена

- Агент OpenComputers раз в `45` секунд:
  - забирает команды с `/api/agent/commands`;
  - выполняет `start` / `stop`;
  - отправляет полную телеметрию в `/api/agent/report`.
- Сайт опрашивает `/api/state` и рисует актуальное состояние.

## Хранение состояния

Сервер сам создаёт файлы в папке `data/`:

- `data/state-store.json`
- `data/commands-store.json`

Если реальных отчётов ещё не было, сайт покажет демо-панель с реакторами `1-6`, чтобы интерфейс можно было сразу проверить визуально.
