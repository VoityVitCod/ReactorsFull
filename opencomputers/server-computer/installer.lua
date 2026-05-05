local component = require("component")
local filesystem = require("filesystem")

local RAW_BASE_URL = "https://raw.githubusercontent.com/VoityVitCod/ReactorsFull/main/opencomputers/server-computer"

local filesToInstall = {
  {
    url = RAW_BASE_URL .. "/reactor_agent.lua",
    path = "/home/reactor_agent.lua",
    overwrite = true,
  },
  {
    url = RAW_BASE_URL .. "/reactor_config.lua",
    path = "/home/reactor_config.lua",
    overwrite = false,
  },
  {
    url = RAW_BASE_URL .. "/autorun.lua",
    path = "/autorun.lua",
    overwrite = true,
  },
  {
    url = RAW_BASE_URL .. "/README.md",
    path = "/home/reactor_control_readme.md",
    overwrite = true,
  },
}

local function log(...)
  local parts = {}
  for index = 1, select("#", ...) do
    parts[index] = tostring(select(index, ...))
  end
  print("[reactor_installer] " .. table.concat(parts, " "))
end

local function safeCall(callback, ...)
  local packed = table.pack(pcall(callback, ...))
  if not packed[1] then
    return false, packed[2]
  end
  return true, table.unpack(packed, 2, packed.n)
end

local function ensureParentDirectory(filePath)
  local parent = filesystem.path(filePath)
  if parent and parent ~= "" and not filesystem.exists(parent) then
    filesystem.makeDirectory(parent)
  end
end

local function download(url)
  local ok, handleOrError = safeCall(component.internet.request, url)
  if not ok then
    return nil, handleOrError
  end

  local handle = handleOrError

  if handle.finishConnect then
    local connected, connectError = safeCall(function()
      return handle:finishConnect()
    end)

    if not connected then
      if handle.close then
        handle:close()
      end
      return nil, connectError
    end
  end

  if handle.response then
    local responseOk, _, statusCode = safeCall(function()
      return handle:response()
    end)

    if not responseOk then
      if handle.close then
        handle:close()
      end
      return nil, statusCode
    end

    if statusCode and statusCode ~= 200 then
      if handle.close then
        handle:close()
      end
      return nil, "HTTP " .. tostring(statusCode)
    end
  end

  local chunks = {}

  while true do
    local readOk, chunkOrError = safeCall(function()
      return handle:read(math.huge)
    end)

    if not readOk then
      if handle.close then
        handle:close()
      end
      return nil, chunkOrError
    end

    if chunkOrError == nil then
      break
    end

    if chunkOrError ~= "" then
      table.insert(chunks, chunkOrError)
    end
  end

  if handle.close then
    handle:close()
  end

  return table.concat(chunks)
end

local function writeFile(filePath, content)
  ensureParentDirectory(filePath)
  local fileHandle, openError = io.open(filePath, "w")

  if not fileHandle then
    return false, openError
  end

  fileHandle:write(content)
  fileHandle:close()
  return true, nil
end

if not component.isAvailable("internet") then
  error("Для установки нужна internet card.")
end

log("source:", RAW_BASE_URL)

for _, file in ipairs(filesToInstall) do
  if filesystem.exists(file.path) and not file.overwrite then
    log("skip:", file.path, "(already exists)")
  else
    log("download:", file.url)
    local content, downloadError = download(file.url)

    if not content then
      error("Не удалось скачать " .. file.url .. ": " .. tostring(downloadError))
    end

    local ok, writeError = writeFile(file.path, content)
    if not ok then
      error("Не удалось записать " .. file.path .. ": " .. tostring(writeError))
    end

    log("saved:", file.path)
  end
end

log("Установка завершена.")
log("1) Отредактируйте /home/reactor_config.lua")
log("2) Запустите: lua /home/reactor_agent.lua")
log("3) Или просто перезагрузите компьютер, если нужен autorun.")
