const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: [String],             // optional for MCQs
  answer: { type: String }       // text or correct option
});

const subAssignmentSchema = new mongoose.Schema({
  subModuleName: { type: String, required: true },

  // Case data (student input fields)
  patientName: String,
  ageOrDob: String,
  icdCodes: [String],
  cptCodes: [String],
  pcsCodes: [String],           // NEW: ICD-10-PCS
  hcpcsCodes: [String],         // NEW: HCPCS
  drgValue: String,             // NEW: DRG code/value (string to allow "470", "470-xx", etc.)
  modifiers: [String],          // NEW: CPT/HCPCS modifiers (can be multiple)
  notes: String,
  assignmentPdf: String,

  // Predefined answers (per sub)
  answerKey: {
    patientName: String,
    ageOrDob: String,
    icdCodes: [String],
    cptCodes: [String],
    pcsCodes: [String],         // NEW in predefined answers
    hcpcsCodes: [String],       // NEW in predefined answers
    drgValue: String,           // NEW in predefined answers
    modifiers: [String],        // NEW in predefined answers
    notes: String
  },

  // Dynamic questions (per sub)
  dynamicQuestions: [questionSchema]
});

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
    pcsCodes: [String],        // NEW at parent level
    hcpcsCodes: [String],      // NEW at parent level
    drgValue: String,          // NEW at parent level
    modifiers: [String],       // NEW at parent level
    notes: String
  },

  // Parent-level dynamic Qs (when there is only one sub-assignment)
  dynamicQuestions: [questionSchema],

  // Deprecated
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],

  assignedDate: { type: Date, default: Date.now }
});

// Fast lookups by category
assignmentSchema.index({ category: 1, assignedDate: -1 });

module.exports = mongoose.model("Assignment", assignmentSchema);