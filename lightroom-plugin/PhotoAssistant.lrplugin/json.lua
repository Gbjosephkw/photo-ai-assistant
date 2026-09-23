-- Encodeur JSON minimal, écrit pour ce plugin (pas de dépendance externe,
-- le SDK Lightroom n'en fournit pas garanti). Encode uniquement (on n'a pas
-- besoin de décoder les réponses du serveur pour l'instant).

local json = {}

local function isArray(t)
  local n = 0
  for k, _ in pairs(t) do
    if type(k) ~= "number" then return false end
    n = n + 1
  end
  for i = 1, n do
    if t[i] == nil then return false end
  end
  return true
end

local function escapeString(s)
  s = s:gsub('\\', '\\\\')
  s = s:gsub('"', '\\"')
  s = s:gsub('\n', '\\n')
  s = s:gsub('\r', '\\r')
  s = s:gsub('\t', '\\t')
  return s
end

local encodeValue

local function encodeArray(t)
  local parts = {}
  for _, v in ipairs(t) do
    table.insert(parts, encodeValue(v))
  end
  return "[" .. table.concat(parts, ",") .. "]"
end

local function encodeObject(t)
  local parts = {}
  for k, v in pairs(t) do
    table.insert(parts, '"' .. escapeString(tostring(k)) .. '":' .. encodeValue(v))
  end
  return "{" .. table.concat(parts, ",") .. "}"
end

encodeValue = function(v)
  local t = type(v)
  if t == "nil" then
    return "null"
  elseif t == "boolean" then
    return v and "true" or "false"
  elseif t == "number" then
    return tostring(v)
  elseif t == "string" then
    return '"' .. escapeString(v) .. '"'
  elseif t == "table" then
    if isArray(v) then
      return encodeArray(v)
    else
      return encodeObject(v)
    end
  else
    return "null"
  end
end

function json.encode(value)
  return encodeValue(value)
end

return json
