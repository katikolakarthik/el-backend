const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment" },
  submittedAnswers: {
    patientName: String,
    icdCodes: [String],
    cptCodes: [String],
    notes: String
  },
  correctCount: Number,
  wrongCount: Number,
  progressPercent: Number,
  submissionDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Submission", submissionSchema);