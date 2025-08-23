const mongoose = require("mongoose");

// Store each dynamic question answer along with grading details
const dynamicQuestionAnswerSchema = new mongoose.Schema({
  questionText: String,
  type: { type: String }, // e.g., 'mcq', 'text'
  options: [String],      // for MCQ
  correctAnswer: String,  // from assignment definition
  submittedAnswer: String, // from student
  isCorrect: Boolean
});

// Store each sub-assignment answer
const subAnswerSchema = new mongoose.Schema({
  subAssignmentId: { type: mongoose.Schema.Types.ObjectId }, // Reference to specific sub-assignment

  // Patient/case data submitted by student
  patientName: String,
  ageOrDob: String,
  icdCodes: [String],
  cptCodes: [String],
  pcsCodes: [String],        // NEW: ICD-10-PCS codes
  hcpcsCodes: [String],      // NEW: HCPCS codes
  drgValue: String,          // NEW: DRG Value
  modifiers: [String],       // NEW: CPT/HCPCS Modifiers
  notes: String,

  // Dynamic question answers
  dynamicQuestions: [dynamicQuestionAnswerSchema],

  // Auto grading summary
  correctCount: Number,
  wrongCount: Number,
  progressPercent: Number
});

const submissionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment" },

  submittedAnswers: [subAnswerSchema], // Array of answers for each sub-assignment

  // Totals across all subs
  totalCorrect: Number,
  totalWrong: Number,
  overallProgress: Number,

  submissionDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Submission", submissionSchema);