require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[db] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants. " +
    "Copier .env.example vers .env et renseigner un vrai projet Supabase."
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

module.exports = { supabase };
