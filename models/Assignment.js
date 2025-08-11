const mongoose = require("mongoose");

const subAssignmentSchema = new mongoose.Schema({
  subModuleName: { type: String, required: true },
  patientName: String,
  ageOrDob: String, // <-- new field
  icdCodes: [String],
  cptCodes: [String],
  notes: String,
  assignmentPdf: String,
  answerKey: {
    patientName: String,
    ageOrDob: String, // <-- new field in answer
    icdCodes: [String],
    cptCodes: [String],
    notes: String
  }
});

const assignmentSchema = new mongoose.Schema({
  moduleName: { type: String, required: true },
  subAssignments: [subAssignmentSchema],
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  assignedDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Assignment", assignmentSchema);