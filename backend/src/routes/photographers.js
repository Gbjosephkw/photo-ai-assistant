const express = require("express");
const router = express.Router();
const { supabase } = require("../db/supabaseClient");

router.post("/", async (req, res) => {
  const { name, email } = req.body;
  if (!name) return res.status(400).json({ error: "name manquant" });

  const { data, error } = await supabase
    .from("photographers")
    .insert({ name, email: email || null })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get("/", async (_req, res) => {
  const { data, error } = await supabase.from("photographers").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
