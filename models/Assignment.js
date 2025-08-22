const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: [String],             // optional for MCQs
  answer: { type: String }       // text or correct option
});

const subAssignmentSchema = new mongoose.Schema({
  subModuleName: { type: String, required: true },
  patientName: String,
  ageOrDob: String,
  icdCodes: [String],
  cptCodes: [String],
  notes: String,
  assignmentPdf: String,

  // Predefined answers (per sub)
  answerKey: {
    patientName: String,
    ageOrDob: String,
    icdCodes: [String],
    cptCodes: [String],
    notes: String
  },

  // Dynamic questions (per sub)
  dynamicQuestions: [questionSchema]
});

const assignmentSchema = new mongoose.Schema({
  moduleName: { type: String, required: true },

  // Category container, e.g. "ICD", "CPT"
  category: { type: String, required: true, trim: true },   // <-- add comma here

  subAssignments: [subAssignmentSchema],
  assignmentPdf: String,

  // Parent-level predefined answerKey (when there is only one sub-assignment)
  answerKey: {
    patientName: String,
    ageOrDob: String,
    icdCodes: [String],
    cptCodes: [String],
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