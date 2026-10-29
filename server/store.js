import mongoose from "mongoose";

const suspectSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  motive: { type: String, required: true },
  alibi: { type: String, required: true }
}, { _id: false });

const clueSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  relatedSuspectIds: [{ type: String }],
  significance: { type: String, required: true }
}, { _id: false });

const mysterySchema = new mongoose.Schema({
  caseId: { type: String, required: true, unique: true, index: true },
  difficulty: { type: String, required: true },
  premise: { type: String, required: true },
  title: { type: String, required: true },
  introduction: { type: String, required: true },
  suspects: [suspectSchema],
  clues: [clueSchema],
  hints: [{ type: String }],
  culpritId: { type: String, required: true, select: false },
  solution: {
    motive: { type: String, required: true },
    explanation: { type: String, required: true },
    narrative: { type: String, required: true }
  },
  progress: {
    collectedClueIds: [{ type: String }],
    hintsUsed: { type: Number, default: 0 },
    status: { type: String, default: "investigating" },
    accusation: { type: String, default: null }
  }
}, { timestamps: true, versionKey: false });

const MysteryCase = mongoose.models.MysteryCase
  || mongoose.model("MysteryCase", mysterySchema);
const memoryCases = new Map();
let useMongo = false;

export async function connectStore() {
  if (!process.env.MONGODB_URI) {
    console.info("MONGODB_URI is not set; using in-memory case storage.");
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);
  useMongo = true;
  console.info("Connected to MongoDB.");
}

export async function saveCase(caseRecord) {
  if (!useMongo) {
    memoryCases.set(caseRecord.caseId, structuredClone(caseRecord));
    return;
  }

  await MysteryCase.create(caseRecord);
}

export async function findCase(caseId) {
  if (!useMongo) {
    const record = memoryCases.get(caseId);
    return record ? structuredClone(record) : null;
  }

  const record = await MysteryCase.findOne({ caseId }).select("+culpritId").lean();
  return record ?? null;
}

export async function updateCase(caseId, updater) {
  const record = await findCase(caseId);
  if (!record) return null;

  const updated = updater(record);
  if (!updated) return record;

  if (!useMongo) {
    memoryCases.set(caseId, updated);
    return structuredClone(updated);
  }

  const { _id, createdAt, updatedAt, ...fields } = updated;
  return MysteryCase.findOneAndUpdate(
    { caseId },
    { $set: fields },
    { new: true, runValidators: true }
  ).select("+culpritId").lean();
}
