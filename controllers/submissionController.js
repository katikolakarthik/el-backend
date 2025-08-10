const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");

exports.submitAssignment = async (req, res) => {
  try {
    const { studentId, assignmentId, patientName, icdCodes, cptCodes, notes } = req.body;

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    let correctCount = 0, wrongCount = 0;

    // Auto-check logic
    if (assignment.answerKey) {
      if (assignment.answerKey.patientName?.toLowerCase() === patientName?.toLowerCase()) correctCount++; else wrongCount++;
      if (JSON.stringify(assignment.answerKey.icdCodes || []) === JSON.stringify(icdCodes)) correctCount++; else wrongCount++;
      if (JSON.stringify(assignment.answerKey.cptCodes || []) === JSON.stringify(cptCodes)) correctCount++; else wrongCount++;
      if ((assignment.answerKey.notes || "").trim().toLowerCase() === (notes || "").trim().toLowerCase()) correctCount++; else wrongCount++;
    }

    const progressPercent = Math.round((correctCount / (correctCount + wrongCount)) * 100);

    const submission = new Submission({
      studentId,
      assignmentId,
      submittedAnswers: { patientName, icdCodes, cptCodes, notes },
      correctCount,
      wrongCount,
      progressPercent
    });

    await submission.save();
    res.json({ success: true, message: "Assignment submitted", submission });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};