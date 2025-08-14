const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  answer: { type: String }, // Can hold plain text, JSON, etc.
});

const subAssignmentSchema = new mongoose.Schema({
  subModuleName: { type: String, required: true },
  patientName: String,
  ageOrDob: String,
  icdCodes: [String],
  cptCodes: [String],
  notes: String,
  assignmentPdf: String,
  
  // Predefined-type answer key
  answerKey: {
    patientName: String,
    ageOrDob: String,
    icdCodes: [String],
    cptCodes: [String],
    notes: String
  },

  // NEW: Dynamic questions support
  dynamicQuestions: [questionSchema], 
  dynamicAnswerKey: [ // parallel to dynamicQuestions
    {
      questionText: String,
      answer: String
    }
  ]
});

const assignmentSchema = new mongoose.Schema({
  moduleName: { type: String, required: true },
  subAssignments: [subAssignmentSchema],
  assignmentPdf: String,
  answerKey: {
    patientName: String,
    ageOrDob: String,
    icdCodes: [String],
    cptCodes: [String],
    notes: String
  },
  dynamicQuestions: [questionSchema],
  dynamicAnswerKey: [
    {
      questionText: String,
      answer: String
    }
  ],
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  assignedDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Assignment", assignmentSchema);