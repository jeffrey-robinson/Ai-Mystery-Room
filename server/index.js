import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectStore } from "./store.js";
import {
  createMystery,
  discoverClue,
  getMystery,
  publicCase,
  requestHint,
  revealMystery,
  submitAccusation
} from "./mysteries.js";

const app = express();
const port = Number(process.env.PORT) || 3001;
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." }
});
const generationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many case-generation requests. Please try again later." }
});

app.use(helmet());
app.use(express.json({ limit: "16kb" }));
app.use("/api", apiLimiter);

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.post("/api/cases", generationLimiter, async (request, response, next) => {
  try {
    const mystery = await createMystery(request.body?.difficulty, request.body?.premise);
    response.status(201).json(mystery);
  } catch (error) {
    next(error);
  }
});

app.get("/api/cases/:caseId", async (request, response, next) => {
  try {
    const mystery = await getMystery(request.params.caseId);
    if (!mystery) return response.status(404).json({ error: "Case not found." });
    response.json(mystery);
  } catch (error) {
    next(error);
  }
});

app.post("/api/cases/:caseId/clues/:clueId/discover", async (request, response, next) => {
  try {
    const clue = await discoverClue(request.params.caseId, request.params.clueId);
    if (!clue) return response.status(404).json({ error: "Clue not found or case is no longer active." });
    response.json(clue);
  } catch (error) {
    next(error);
  }
});

app.post("/api/cases/:caseId/hints", async (request, response, next) => {
  try {
    const result = await requestHint(request.params.caseId);
    if (!result) return response.status(404).json({ error: "Case not found." });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/cases/:caseId/accusations", async (request, response, next) => {
  try {
    const suspectId = request.body?.suspectId;
    if (typeof suspectId !== "string" || suspectId.length > 100) {
      return response.status(400).json({ error: "Choose a valid suspect before submitting an accusation." });
    }
    const record = await submitAccusation(request.params.caseId, suspectId);
    if (!record) return response.status(404).json({ error: "Case not found." });
    if (record.progress.status === "investigating") {
      return response.status(400).json({ error: "That suspect is not part of this case, or the case has already ended." });
    }
    response.json(publicCase(record));
  } catch (error) {
    next(error);
  }
});

app.post("/api/cases/:caseId/reveal", async (request, response, next) => {
  try {
    const record = await revealMystery(request.params.caseId);
    if (!record) return response.status(404).json({ error: "Case not found." });
    response.json(publicCase(record));
  } catch (error) {
    next(error);
  }
});

const currentFile = fileURLToPath(import.meta.url);
const serverDirectory = path.dirname(currentFile);
const clientBuild = path.resolve(serverDirectory, "../dist");
app.use(express.static(clientBuild));
app.get("*", (request, response, next) => {
  if (request.path.startsWith("/api/")) return next();
  response.sendFile(path.join(clientBuild, "index.html"), (error) => {
    if (error) next();
  });
});

app.use((error, _request, response, _next) => {
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error("Request failed:", error);
  response.status(status).json({
    error: status >= 500 ? "The request could not be completed. Please try again." : error.message
  });
});

await connectStore();
app.listen(port, () => {
  console.info(`AI Mystery Room server listening on http://localhost:${port}`);
});
