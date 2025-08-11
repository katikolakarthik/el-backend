const mongoose = require("mongoose");

const subAnswerSchema = new mongoose.Schema({
  subAssignmentId: { type: mongoose.Schema.Types.ObjectId }, // Reference to specific sub-assignment
  patientName: String,
  ageOrDob: String, // New field
  icdCodes: [String],
  cptCodes: [String],
  notes: String,
  correctCount: Number,
  wrongCount: Number,
  progressPercent: Number
});

const submissionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment" },
  submittedAnswers: [subAnswerSchema], // Array of answers for each sub-assignment
  totalCorrect: Number,
  totalWrong: Number,
  overallProgress: Number,
  submissionDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Submission", submissionSchema);