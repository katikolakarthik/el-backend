const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema({
  moduleName: { type: String, required: true },
  subModuleName: String, // optional
  patientName: String,
  icdCodes: [String],
  cptCodes: [String],
  notes: String,
  assignmentPdf: String,
  answerKey: {
    patientName: String,
    icdCodes: [String],
    cptCodes: [String],
    notes: String
  },
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  assignedDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Assignment", assignmentSchema);