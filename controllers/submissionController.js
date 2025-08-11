const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");

exports.submitAssignment = async (req, res) => {
  try {
    const { studentId, assignmentId, submittedAnswers } = req.body;
    // submittedAnswers = [
    //   { subAssignmentId, patientName, ageOrDob, icdCodes, cptCodes, notes }
    // ]

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    let totalCorrect = 0, totalWrong = 0;
    let processedAnswers = [];

    submittedAnswers.forEach(sub => {
      const subAssignment = assignment.subAssignments.id(sub.subAssignmentId);
      if (!subAssignment) return;

      let correctCount = 0, wrongCount = 0;

      // Compare each field with the answerKey
      if (subAssignment.answerKey.patientName?.toLowerCase() === sub.patientName?.toLowerCase()) correctCount++; else wrongCount++;
      if ((subAssignment.answerKey.ageOrDob || "").toLowerCase() === (sub.ageOrDob || "").toLowerCase()) correctCount++; else wrongCount++;
      if (JSON.stringify(subAssignment.answerKey.icdCodes || []) === JSON.stringify(sub.icdCodes || [])) correctCount++; else wrongCount++;
      if (JSON.stringify(subAssignment.answerKey.cptCodes || []) === JSON.stringify(sub.cptCodes || [])) correctCount++; else wrongCount++;
      if ((subAssignment.answerKey.notes || "").trim().toLowerCase() === (sub.notes || "").trim().toLowerCase()) correctCount++; else wrongCount++;

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