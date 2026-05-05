local ok, errorMessage = pcall(dofile, "/home/reactor_agent.lua")

if not ok then
  io.stderr:write("[reactor_agent] autorun error: " .. tostring(errorMessage) .. "\n")
end
