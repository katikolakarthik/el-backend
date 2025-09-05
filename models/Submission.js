const mongoose = require("mongoose");

// Store each dynamic question answer along with grading details
const dynamicQuestionAnswerSchema = new mongoose.Schema({
  questionText: String,
  type: { type: String },   // e.g., 'mcq', 'text'
  options: [String],        // for MCQ
  correctAnswer: String,    // from assignment definition
  submittedAnswer: String,  // from student
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
  pcsCodes: [String],      // ICD-10-PCS codes
  hcpcsCodes: [String],    // HCPCS codes
  drgValue: String,        // DRG Value
  modifiers: [String],     // CPT/HCPCS Modifiers
  notes: String,
  adx: String,             // NEW: student's Adx entry

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
  submittedAnswers: [subAnswerSchema],
  totalCorrect: Number,
  totalWrong: Number,
  overallProgress: Number,
  submissionDate: { type: Date, default: Date.now },

  // TTL field that references student expiry
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }
});

// Create TTL index
submissionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Submission", submissionSchema);