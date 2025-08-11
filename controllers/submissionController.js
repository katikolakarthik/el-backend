const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");

// Helper: compare strings ignoring case and extra spaces
function textMatchIgnoreCase(a = "", b = "") {
  return a.trim().toLowerCase().replace(/\s+/g, " ") ===
         b.trim().toLowerCase().replace(/\s+/g, " ");
}

// Helper: compare arrays ignoring order, case, and extra spaces
function arraysMatchIgnoreOrder(a = [], b = []) {
  if (a.length !== b.length) return false;
  const sortedA = a.map(v => v.trim().toLowerCase()).sort();
  const sortedB = b.map(v => v.trim().toLowerCase()).sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

exports.submitAssignment = async (req, res) => {
  try {
    const { studentId, assignmentId, submittedAnswers } = req.body;

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    let totalCorrect = 0, totalWrong = 0;
    let processedAnswers = [];

    submittedAnswers.forEach(sub => {
      const subAssignment = assignment.subAssignments.id(sub.subAssignmentId);
      if (!subAssignment) return;

      let correctCount = 0, wrongCount = 0;

      // patientName
      if (textMatchIgnoreCase(subAssignment.answerKey.patientName, sub.patientName)) correctCount++;
      else wrongCount++;

      // ageOrDob
      if (textMatchIgnoreCase(subAssignment.answerKey.ageOrDob, sub.ageOrDob)) correctCount++;
      else wrongCount++;

      // icdCodes
      if (arraysMatchIgnoreOrder(subAssignment.answerKey.icdCodes, sub.icdCodes)) correctCount++;
      else wrongCount++;

      // cptCodes
      if (arraysMatchIgnoreOrder(subAssignment.answerKey.cptCodes, sub.cptCodes)) correctCount++;
      else wrongCount++;

      // notes → not graded, but still stored

      const progressPercent = Math.round((correctCount / (correctCount + wrongCount)) * 100);

      totalCorrect += correctCount;
      totalWrong += wrongCount;

      processedAnswers.push({
        subAssignmentId: sub.subAssignmentId,
        patientName: sub.patientName,
        ageOrDob: sub.ageOrDob,
        icdCodes: sub.icdCodes,
        cptCodes: sub.cptCodes,
        notes: sub.notes,
        correctCount,
        wrongCount,
        progressPercent
      });
    });

    const overallProgress = Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100);

    const submission = new Submission({
      studentId,
      assignmentId,
      submittedAnswers: processedAnswers,
      totalCorrect,
      totalWrong,
      overallProgress
    });

    await submission.save();

    res.json({ success: true, message: "Assignment submitted", submission });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};