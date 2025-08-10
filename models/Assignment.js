const mongoose = require("mongoose");

const subAssignmentSchema = new mongoose.Schema({
  subModuleName: { type: String, required: true },
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
  }
});

const assignmentSchema = new mongoose.Schema({
  moduleName: { type: String, required: true },
  subAssignments: [subAssignmentSchema], // multiple sub-assignments
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }], // module-level assignment
  assignedDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Assignment", assignmentSchema);