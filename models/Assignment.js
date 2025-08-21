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
subAssignments: [subAssignmentSchema],
assignmentPdf: String,
answerKey: {
patientName: String,
ageOrDob: String,
icdCodes: [String],
cptCodes: [String],
notes: String
},
dynamicQuestions: [questionSchema], // No separate answerKey needed
assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
assignedDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Assignment", assignmentSchema);