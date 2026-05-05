local component = require("component")
local computer = require("computer")
local os = require("os")
local unicode = require("unicode")

local config = {
  serverBaseUrl = "http://127.0.0.1:8080",
  token = "change-me",
  stationId = "reactor-station-1",
  stationName = "Главная реакторная",
  syncIntervalSeconds = 45,
  trackedFluidKeywords = {
    "низкотемператур",
    "low temperature coolant",
    "low_temperature_coolant",
    "low temp coolant",
    "low_temp_coolant",
  },
  reactorNames = {
    -- ["dbc7703c-c4bf-4e9c-a6ec-3959abc06321"] = "Контур L6",
  },
  fluxNames = {
    -- ["controller-address"] = "Flux Mainline",
  },
  meName = "Главная МЭ",
}

local function trimAddress(address)
  local value = tostring(address or "")
  if unicode.len(value) <= 8 then
    return value
  end
  return unicode.sub(value, 1, 8)
end

local function log(...)
  local parts = {}
  for index = 1, select("#", ...) do
    parts[index] = tostring(select(index, ...))
  end
  print("[reactor_agent] " .. table.concat(parts, " "))
end

local function sortStrings(values)
  table.sort(values, function(left, right)
    return tostring(left) < tostring(right)
  end)
  return values
end

local function collectAddresses(componentType)
  local addresses = {}
  for address in component.list(componentType) do
    table.insert(addresses, address)
  end
  return sortStrings(addresses)
end

local function safeCall(callback, ...)
  local packed = table.pack(pcall(callback, ...))
  if not packed[1] then
    return false, packed[2]
  end
  return true, table.unpack(packed, 2, packed.n)
end

local function normalizePairTable(raw)
  if type(raw) ~= "table" then
    return raw
  end

  local normalized = {}
  local index = 1

  while raw[index] ~= nil do
    local key = tostring(raw[index])
    normalized[key] = raw[index + 1]
    index = index + 2
  end

  if next(normalized) then
    return normalized
  end

  for key, value in pairs(raw) do
    normalized[key] = value
  end

  return normalized
end

local function toNumber(value, fallback)
  local number = tonumber(value)
  if number == nil then
    return fallback or 0
  end
  return number
end

local function isArray(value)
  if type(value) ~= "table" then
    return false
  end

  local count = 0
  for key, _ in pairs(value) do
    if type(key) ~= "number" then
      return false
    end
    count = math.max(count, key)
  end

  for index = 1, count do
    if value[index] == nil then
      return false
    end
  end

  return true
end

local function escapeJsonString(value)
  local text = tostring(value or "")
  text = text:gsub("\\", "\\\\")
  text = text:gsub('"', '\\"')
  text = text:gsub("\b", "\\b")
  text = text:gsub("\f", "\\f")
  text = text:gsub("\n", "\\n")
  text = text:gsub("\r", "\\r")
  text = text:gsub("\t", "\\t")
  return '"' .. text .. '"'
end

local function encodeJson(value)
  local valueType = type(value)

  if valueType == "nil" then
    return "null"
  end

  if valueType == "number" then
    if value ~= value or value == math.huge or value == -math.huge then
      return "0"
    end
    return tostring(value)
  end

  if valueType == "boolean" then
    return value and "true" or "false"
  end

  if valueType == "string" then
    return escapeJsonString(value)
  end

  if valueType == "table" then
    if isArray(value) then
      local parts = {}
      for index = 1, #value do
        parts[index] = encodeJson(value[index])
      end
      return "[" .. table.concat(parts, ",") .. "]"
    end

    local parts = {}
    for key, nestedValue in pairs(value) do
      table.insert(parts, escapeJsonString(key) .. ":" .. encodeJson(nestedValue))
    end
    return "{" .. table.concat(parts, ",") .. "}"
  end

  return escapeJsonString(tostring(value))
end

local function urlEncode(text)
  local value = tostring(text or "")
  return (value:gsub("[^%w%-_%.~]", function(char)
    return string.format("%%%02X", string.byte(char))
  end))
end

local function httpRequest(url, body, headers)
  if not component.isAvailable("internet") then
    return nil, "internet card is not available"
  end

  local proxy = component.internet
  local ok, handleOrError = safeCall(proxy.request, url, body, headers or {})
  if not ok then
    return nil, handleOrError
  end

  local handle = handleOrError
  local connectOk, connectError = safeCall(function()
    return handle:finishConnect()
  end)

  if not connectOk then
    handle:close()
    return nil, connectError
  end

  local _, code, message, responseHeaders = safeCall(function()
    return handle:response()
  end)

  local parts = {}

  while true do
    local readOk, chunkOrError = safeCall(function()
      return handle:read(math.huge)
    end)

    if not readOk then
      handle:close()
      return nil, chunkOrError
    end

    if chunkOrError == nil then
      break
    end

    if chunkOrError ~= "" then
      table.insert(parts, chunkOrError)
    end
  end

  handle:close()
  return {
    code = code or 0,
    message = message or "",
    headers = responseHeaders or {},
    body = table.concat(parts),
  }
end

local function splitLines(text)
  local lines = {}
  for line in tostring(text or ""):gmatch("[^\r\n]+") do
    table.insert(lines, line)
  end
  return lines
end

local function splitByPipe(text)
  local parts = {}
  local start = 1

  while true do
    local pipeStart, pipeEnd = string.find(text, "|", start, true)
    if not pipeStart then
      table.insert(parts, string.sub(text, start))
      break
    end
    table.insert(parts, string.sub(text, start, pipeStart - 1))
    start = pipeEnd + 1
  end

  return parts
end

local function parseCommandEnvelope(body)
  local commands = {}
  for _, line in ipairs(splitLines(body)) do
    if string.sub(line, 1, 8) == "COMMAND=" then
      local payload = string.sub(line, 9)
      local parts = splitByPipe(payload)
      if #parts >= 3 then
        table.insert(commands, {
          id = parts[1],
          action = parts[2],
          reactorId = parts[3],
        })
      end
    end
  end
  return commands
end

local function normalizeFluidEntry(rawFluid)
  local fluid = normalizePairTable(rawFluid)
  local label = tostring(fluid.label or fluid.localizedName or fluid.name or fluid.id or "unknown")
  local name = tostring(fluid.name or fluid.id or label)
  local amount = toNumber(fluid.amount or fluid.size or fluid.qty or fluid.quantity or fluid.total or fluid.stored, 0)

  return {
    id = tostring(fluid.id or fluid.name or label),
    name = name,
    label = label,
    amount = amount,
  }
end

local function containsKeyword(text, keywords)
  local haystack = string.lower(tostring(text or ""))
  for _, keyword in ipairs(keywords or {}) do
    if string.find(haystack, string.lower(keyword), 1, true) then
      return true
    end
  end
  return false
end

local function normalizeAeList(rawList)
  if type(rawList) ~= "table" then
    return {}
  end

  local list = {}
  for _, rawEntry in pairs(rawList) do
    table.insert(list, normalizeFluidEntry(rawEntry))
  end
  table.sort(list, function(left, right)
    return tostring(left.label) < tostring(right.label)
  end)
  return list
end

local function summarizeFuelRods(rawRods)
  local totalFuel = 0
  local totalMaxFuel = 0
  local rodCount = 0

  if type(rawRods) ~= "table" then
    return totalFuel, totalMaxFuel, rodCount
  end

  for _, rawRod in pairs(rawRods) do
    local rod = normalizePairTable(rawRod)
    if rod.fuel or rod.maxFuel then
      totalFuel = totalFuel + toNumber(rod.fuel, 0)
      totalMaxFuel = totalMaxFuel + toNumber(rod.maxFuel, 0)
      rodCount = rodCount + 1
    end
  end

  return totalFuel, totalMaxFuel, rodCount
end

local function collectReactorSnapshot(address)
  local proxy = component.proxy(address)
  local name = config.reactorNames[address] or ("Реактор " .. trimAddress(address))

  local _, level = safeCall(proxy.getReactorLevel)
  local _, generation = safeCall(proxy.getEnergyGeneration)
  local _, temperature = safeCall(proxy.getTemperature)
  local _, maxTemperature = safeCall(proxy.getMaxTemperature)
  local _, coolant = safeCall(proxy.getFluidCoolant)
  local _, maxCoolant = safeCall(proxy.getMaxFluidCoolant)
  local _, coolantPerSecond = safeCall(proxy.getFluidCoolantConsume)
  local _, hasWork = safeCall(proxy.hasWork)
  local _, activeCooling = safeCall(proxy.isActiveCooling)
  local _, rods = safeCall(proxy.getAllFuelRodsStatus)
  local fuelRemaining, maxFuel, rodCount = summarizeFuelRods(rods)

  return {
    reactorId = address,
    address = address,
    name = name,
    level = toNumber(level, 1),
    active = hasWork == true,
    activeCooling = activeCooling == true,
    energyGeneration = toNumber(generation, 0),
    temperature = toNumber(temperature, 0),
    maxTemperature = toNumber(maxTemperature, 0),
    coolant = toNumber(coolant, 0),
    maxCoolant = toNumber(maxCoolant, 0),
    coolantPerSecond = toNumber(coolantPerSecond, 0),
    fuelRemaining = fuelRemaining,
    maxFuel = maxFuel,
    rodCount = rodCount,
  }
end

local function collectFluxSnapshot()
  local controllerAddresses = collectAddresses("flux_controller")
  local plugAddresses = collectAddresses("flux_plug")
  local chosen = #controllerAddresses > 0 and controllerAddresses or plugAddresses
  local networkType = #controllerAddresses > 0 and "controller" or "plug"
  local networks = {}

  for _, address in ipairs(chosen) do
    local proxy = component.proxy(address)
    local _, networkInfo = safeCall(proxy.getNetworkInfo)
    local _, energyInfo = safeCall(proxy.getEnergyInfo)
    local _, fluxInfo = safeCall(proxy.getFluxInfo)
    local _, countInfo = safeCall(proxy.getCountInfo)
    local _, maxEnergyStored = safeCall(proxy.getMaxEnergyStored)
    local _, energyStored = safeCall(proxy.getEnergyStored)

    table.insert(networks, {
      networkId = tostring((networkInfo or {}).id or address),
      address = address,
      type = networkType,
      name = config.fluxNames[address]
        or tostring((networkInfo or {}).name or (fluxInfo or {}).customName or ("Flux " .. trimAddress(address))),
      maxStoredEnergy = toNumber(maxEnergyStored, 0),
      storedEnergy = toNumber(energyStored, 0),
      energyInfo = energyInfo or {},
      fluxInfo = fluxInfo or {},
      countInfo = countInfo or {},
    })
  end

  return networks
end

local function readMeCall(callback)
  local ok, valueA, valueB, valueC = safeCall(callback)
  if not ok then
    return nil, tostring(valueA)
  end

  if valueA == false and valueB == "cooldown" then
    return nil, "cooldown " .. tostring(valueC or "")
  end

  return valueA, nil
end

local function collectMeSnapshot()
  local addresses = collectAddresses("me_interface")
  if #addresses == 0 then
    return nil
  end

  local address = addresses[1]
  local proxy = component.proxy(address)
  local cooldowns = {}

  local _, online = safeCall(proxy.isNetworkPowered)
  local _, storedPower = safeCall(proxy.getStoredPower)
  local _, maxStoredPower = safeCall(proxy.getMaxStoredPower)
  local _, avgPowerInjection = safeCall(proxy.getAvgPowerInjection)
  local _, avgPowerUsage = safeCall(proxy.getAvgPowerUsage)
  local _, idlePowerUsage = safeCall(proxy.getIdlePowerUsage)
  local _, energyDemand = safeCall(proxy.getEnergyDemand)
  local fluids, fluidsError = readMeCall(proxy.getFluidsInNetwork)

  if fluidsError then
    cooldowns.fluids = fluidsError
  end

  local trackedFluids = normalizeAeList(fluids)
  local lowTempCoolant = nil

  for _, fluid in ipairs(trackedFluids) do
    if containsKeyword(fluid.label .. " " .. fluid.name .. " " .. fluid.id, config.trackedFluidKeywords) then
      lowTempCoolant = fluid
      break
    end
  end

  return {
    address = address,
    name = config.meName,
    online = online == true,
    storedPower = toNumber(storedPower, 0),
    maxStoredPower = toNumber(maxStoredPower, 0),
    avgPowerInjection = toNumber(avgPowerInjection, 0),
    avgPowerUsage = toNumber(avgPowerUsage, 0),
    idlePowerUsage = toNumber(idlePowerUsage, 0),
    energyDemand = toNumber(energyDemand, 0),
    lowTempCoolant = lowTempCoolant,
    trackedFluids = trackedFluids,
    cooldowns = cooldowns,
  }
end

local function fetchCommands()
  local url = config.serverBaseUrl
    .. "/api/agent/commands?token="
    .. urlEncode(config.token)
    .. "&stationId="
    .. urlEncode(config.stationId)

  local response, errorMessage = httpRequest(url, nil, {})
  if not response then
    return nil, errorMessage
  end

  if response.code ~= 200 then
    return nil, "server responded with " .. tostring(response.code)
  end

  return parseCommandEnvelope(response.body), nil
end

local function buildReactorMap(reactors)
  local mapped = {}
  for _, reactor in ipairs(reactors) do
    mapped[reactor.reactorId] = reactor
    mapped[reactor.address] = reactor
  end
  return mapped
end

local function buildReactorAddressMap()
  local mapped = {}
  for _, address in ipairs(collectAddresses("htc_reactors_nuclear_reactor")) do
    mapped[address] = {
      reactorId = address,
      address = address,
    }
  end
  return mapped
end

local function executeCommands(reactorMap, commands)
  local results = {}

  for _, command in ipairs(commands or {}) do
    local reactor = reactorMap[command.reactorId]

    if not reactor then
      table.insert(results, {
        commandId = command.id,
        success = false,
        message = "Реактор не найден на агенте.",
      })
    else
      local proxy = component.proxy(reactor.address)
      local callback = command.action == "start" and proxy.activate or proxy.deactivate
      local ok, successOrError = safeCall(callback)

      if not ok then
        table.insert(results, {
          commandId = command.id,
          success = false,
          message = tostring(successOrError),
        })
      else
        table.insert(results, {
          commandId = command.id,
          success = successOrError ~= false,
          message = successOrError == false and "Компонент вернул false." or "Команда выполнена.",
        })
      end
    end
  end

  return results
end

local function collectSnapshot(commandResults)
  local reactorAddresses = collectAddresses("htc_reactors_nuclear_reactor")
  local reactors = {}

  for _, address in ipairs(reactorAddresses) do
    table.insert(reactors, collectReactorSnapshot(address))
  end

  table.sort(reactors, function(left, right)
    if left.level == right.level then
      return tostring(left.name) < tostring(right.name)
    end
    return left.level < right.level
  end)

  return {
    stationId = config.stationId ~= "" and config.stationId or computer.address(),
    stationName = config.stationName ~= "" and config.stationName or ("Станция " .. trimAddress(computer.address())),
    intervalSeconds = config.syncIntervalSeconds,
    computerAddress = computer.address(),
    sentAtUptime = computer.uptime(),
    reactors = reactors,
    fluxNetworks = collectFluxSnapshot(),
    me = collectMeSnapshot(),
    commandResults = commandResults or {},
  }
end

local function sendReport(report)
  local url = config.serverBaseUrl .. "/api/agent/report?token=" .. urlEncode(config.token)
  local response, errorMessage = httpRequest(url, encodeJson(report), {
    ["Content-Type"] = "application/json",
  })

  if not response then
    return false, errorMessage
  end

  if response.code ~= 200 then
    return false, "server responded with " .. tostring(response.code)
  end

  return true, nil
end

local function mainLoop()
  while true do
    local cycleStartedAt = computer.uptime()

    local commands, commandError = fetchCommands()
    if commandError then
      log("command fetch error:", commandError)
      commands = {}
    else
      log("commands received:", #commands)
    end

    local reactorMap = buildReactorAddressMap()
    local commandResults = executeCommands(reactorMap, commands)
    local report = collectSnapshot(commandResults)
    local ok, reportError = sendReport(report)

    if ok then
      log("report sent. reactors:", #report.reactors, "flux:", #report.fluxNetworks)
    else
      log("report error:", reportError)
    end

    local cycleDuration = computer.uptime() - cycleStartedAt
    local sleepFor = math.max(1, config.syncIntervalSeconds - cycleDuration)
    os.sleep(sleepFor)
  end
end

if not component.isAvailable("internet") then
  error("Нужна интернет-карта для отправки HTTP-запросов.")
end

log("station id:", config.stationId)
log("server:", config.serverBaseUrl)
mainLoop()
