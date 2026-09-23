require("dotenv").config();
const express = require("express");
const cors = require("cors");

const sessionsRouter = require("./routes/sessions");
const suggestionsRouter = require("./routes/suggestions");
const permissionsRouter = require("./routes/permissions");
const photographersRouter = require("./routes/photographers");
const feedbackRouter = require("./routes/feedback");
const versionRouter = require("./routes/version");
const checkinRouter = require("./routes/checkin");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/sessions", sessionsRouter);
app.use("/api/suggestions", suggestionsRouter);
app.use("/api/permissions", permissionsRouter);
app.use("/api/photographers", photographersRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/version", versionRouter);
app.use("/api/checkin", checkinRouter);

module.exports = app;
