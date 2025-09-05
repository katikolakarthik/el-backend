const mongoose = require("mongoose");

/* ----------------------------- Question Schema ----------------------------- */
const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: [String],       // optional for MCQs
  answer: { type: String } // text or correct option
});

/* -------------------------- Sub-Assignment Schema -------------------------- */
const subAssignmentSchema = new mongoose.Schema({
  subModuleName: { type: String, required: true },

  // Case data (student input fields)
  patientName: String,
  ageOrDob: String,
  icdCodes: [String],
  cptCodes: [String],
  pcsCodes: [String],      // ICD-10-PCS
  hcpcsCodes: [String],    // HCPCS
  drgValue: String,        // DRG code/value
  modifiers: [String],     // CPT/HCPCS modifiers
  notes: String,
  adx: String,             // <-- Adx in student input fields
  assignmentPdf: String,

  // Predefined answers (per sub)
  answerKey: {
    patientName: String,
    ageOrDob: String,
    icdCodes: [String],
    cptCodes: [String],
    pcsCodes: [String],
    hcpcsCodes: [String],
    drgValue: String,
    modifiers: [String],
    notes: String,
    adx: String            // Adx in predefined answers
  },

  // Dynamic questions (per sub)
  dynamicQuestions: [questionSchema]
});

/* ------------------------------- Main Schema ------------------------------- */
const assignmentSchema = new mongoose.Schema({
  moduleName: { type: String, required: true },

  // Category container, e.g. "ICD", "CPT"
  category: { type: String, required: true, trim: true },

  subAssignments: [subAssignmentSchema],
  assignmentPdf: String,

  // Parent-level predefined answerKey (when there is only one sub-assignment)
  answerKey: {
    patientName: String,
    ageOrDob: String,
    icdCodes: [String],
    cptCodes: [String],
    pcsCodes: [String],
    hcpcsCodes: [String],
    drgValue: String,
    modifiers: [String],
    notes: String,
    adx: String            // Adx at parent-level predefined answers
  },

  // Parent-level dynamic Qs (when there is only one sub-assignment)
  dynamicQuestions: [questionSchema],

  // Deprecated
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],

  assignedDate: { type: Date, default: Date.now },

  /* ------------------------- TIME LIMIT (minutes) -------------------------- */
  // Admin sets like 10, 200, etc. Applies per assignment attempt.
  timeLimitMinutes: { type: Number, min: 1, max: 100000 } // optional; if missing => no limit
});

// Fast lookups by category and most recent
assignmentSchema.index({ category: 1, assignedDate: -1 });

module.exports = mongoose.model("Assignment", assignmentSchema);