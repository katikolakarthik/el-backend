const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: [String], // Optional - for MCQs
  answer: { type: String } // Text or correct option
});

const subAssignmentSchema = new mongoose.Schema({
  subModuleName: { type: String, required: true },
  patientName: String,
  ageOrDob: String,
  icdCodes: [String],
  cptCodes: [String],
  notes: String,
  assignmentPdf: String,

  // Predefined answers
  answerKey: {
    patientName: String,
    ageOrDob: String,
    icdCodes: [String],
    cptCodes: [String],
    notes: String
  },

  // Dynamic questions (MCQ or text)
  dynamicQuestions: [questionSchema]
});

const assignmentSchema = new mongoose.Schema({
  moduleName: { type: String, required: true },

  
category: { type: String, required: true, trim: true }




  subAssignments: [subAssignmentSchema],
  assignmentPdf: String,

  // parent-level predefined answerKey
  answerKey: {
    patientName: String,
    ageOrDob: String,
    icdCodes: [String],
    cptCodes: [String],
    notes: String
  },

  // parent-level dynamic Qs
  dynamicQuestions: [questionSchema],

  // DEPRECATED: we will no longer assign to students directly
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],

  assignedDate: { type: Date, default: Date.now }
});

// Fast lookups by category
assignmentSchema.index({ category: 1, assignedDate: -1 });

module.exports = mongoose.model("Assignment", assignmentSchema);