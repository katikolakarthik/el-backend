const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");

// Helper: compare strings ignoring case and extra spaces
function textMatchIgnoreCase(a, b) {
  const strA = (a ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  const strB = (b ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  return strA === strB;
}

// Helper: compare arrays ignoring order, case, and extra spaces
function arraysMatchIgnoreOrder(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sortedA = a.map(v => (v ?? "").toString().trim().toLowerCase()).sort();
  const sortedB = b.map(v => (v ?? "").toString().trim().toLowerCase()).sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

exports.submitAssignment = async (req, res) => {
  try {
    const { studentId, assignmentId, submittedAnswers } = req.body;

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    // Check if submission already exists
    let submission = await Submission.findOne({ studentId, assignmentId });

    if (!submission) {
      // No submission yet → create fresh
      submission = new Submission({
        studentId,
        assignmentId,
        submittedAnswers: [],
        totalCorrect: 0,
        totalWrong: 0,
        overallProgress: 0
      });
    }

    // Process each submitted submodule independently
    submittedAnswers.forEach(sub => {
      let correctCount = 0, wrongCount = 0;
      let target;

      if (sub.subAssignmentId) {
        target = assignment.subAssignments.id(sub.subAssignmentId);
      } else {
        target = assignment;
      }
      if (!target) return;

      let gradedDynamicQuestions = [];

      if (target.dynamicQuestions?.length) {
        target.dynamicQuestions.forEach((q) => {
          const submittedQ = (sub.dynamicQuestions || []).find(
            sq => textMatchIgnoreCase(sq.questionText, q.questionText)
          );

          const submittedAnswer = submittedQ?.submittedAnswer || "";
          const isCorrect = textMatchIgnoreCase(q.answer, submittedAnswer);

          if (isCorrect) correctCount++;
          else wrongCount++;

          gradedDynamicQuestions.push({
            questionText: q.questionText,
            type: q.type || "dynamic",
            options: q.options || [],
            correctAnswer: q.answer,
            submittedAnswer,
            isCorrect
          });
        });
      } else if (target.answerKey) {
        // Explicitly excluding `notes` from grading
        if (textMatchIgnoreCase(target.answerKey.patientName, sub.patientName)) correctCount++;
        else wrongCount++;

        if (textMatchIgnoreCase(target.answerKey.ageOrDob, sub.ageOrDob)) correctCount++;
        else wrongCount++;

        if (arraysMatchIgnoreOrder(target.answerKey.icdCodes, sub.icdCodes)) correctCount++;
        else wrongCount++;

        if (arraysMatchIgnoreOrder(target.answerKey.cptCodes, sub.cptCodes)) correctCount++;
        else wrongCount++;

        // `notes` field intentionally ignored in grading
      }

      const progressPercent = Math.round((correctCount / (correctCount + wrongCount)) * 100) || 0;

      const processedAnswer = {
        subAssignmentId: sub.subAssignmentId || null,
        patientName: sub.patientName || null,
        ageOrDob: sub.ageOrDob || null,
        icdCodes: sub.icdCodes || [],
        cptCodes: sub.cptCodes || [],
        notes: sub.notes || null, // store but don't grade
        dynamicQuestions: gradedDynamicQuestions,
        correctCount,
        wrongCount,
        progressPercent
      };

      // Update existing submodule answer or add new
      const existingIndex = submission.submittedAnswers.findIndex(
        ans => String(ans.subAssignmentId) === String(sub.subAssignmentId || null)
      );

      if (existingIndex >= 0) {
        submission.submittedAnswers[existingIndex] = processedAnswer;
      } else {
        submission.submittedAnswers.push(processedAnswer);
      }
    });

    // Recalculate totals
    submission.totalCorrect = submission.submittedAnswers.reduce((sum, a) => sum + a.correctCount, 0);
    submission.totalWrong = submission.submittedAnswers.reduce((sum, a) => sum + a.wrongCount, 0);
    submission.overallProgress = Math.round(
      (submission.totalCorrect / (submission.totalCorrect + submission.totalWrong)) * 100
    ) || 0;

    await submission.save();

    res.json({
      success: true,
      message: "Assignment submitted/updated successfully",
      submission
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.getStudentAssignmentSummary = async (req, res) => {
  try {
    const { studentId, assignmentId } = req.body;
    if (!studentId || !assignmentId) {
      return res.status(400).json({ error: "Missing studentId or assignmentId" });
    }

    const submission = await Submission.findOne({ studentId, assignmentId }).sort({ submissionDate: -1 });  
    if (!submission) {
      return res.status(404).json({ error: "No submission found for this student and assignment" });
    }

    const assignment = await Assignment.findById(assignmentId);  
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    // Prepare sub-module summaries with answer key included
    const subModulesSummary = assignment.subAssignments.map(subAssign => {
      const submittedAnswer = submission.submittedAnswers.find(sa =>
        sa.subAssignmentId?.toString() === subAssign._id.toString()
      );

      return {
        subAssignmentId: subAssign._id,
        subModuleName: subAssign.subModuleName || "",

        // ✅ Student answers
        enteredValues: submittedAnswer
          ? {
              patientName: submittedAnswer.patientName,
              ageOrDob: submittedAnswer.ageOrDob,
              icdCodes: submittedAnswer.icdCodes,
              cptCodes: submittedAnswer.cptCodes,
              notes: submittedAnswer.notes,
              dynamicQuestions: submittedAnswer.dynamicQuestions || []
            }
          : null,

        // ✅ Predefined correct answers
        answerKey: {
          patientName: subAssign.answerKey?.patientName || "",
          ageOrDob: subAssign.answerKey?.ageOrDob || "",
          icdCodes: subAssign.answerKey?.icdCodes || [],
          cptCodes: subAssign.answerKey?.cptCodes || [],
          notes: subAssign.answerKey?.notes || "",
          dynamicQuestions: subAssign.dynamicQuestions || []
        },

        correctCount: submittedAnswer?.correctCount || 0,
        wrongCount: submittedAnswer?.wrongCount || 0,
        progressPercent: submittedAnswer?.progressPercent || 0
      };
    });

    // If parent-level assignment has answers
    let parentSummary = null;
    if (assignment.dynamicQuestions?.length || assignment.answerKey) {
      const submittedParent = submission.submittedAnswers.find(sa => !sa.subAssignmentId);
      parentSummary = {
        enteredValues: submittedParent
          ? {
              patientName: submittedParent.patientName,
              ageOrDob: submittedParent.ageOrDob,
              icdCodes: submittedParent.icdCodes,
              cptCodes: submittedParent.cptCodes,
              notes: submittedParent.notes,
              dynamicQuestions: submittedParent.dynamicQuestions || []
            }
          : null,

        answerKey: {
          patientName: assignment.answerKey?.patientName || "",
          ageOrDob: assignment.answerKey?.ageOrDob || "",
          icdCodes: assignment.answerKey?.icdCodes || [],
          cptCodes: assignment.answerKey?.cptCodes || [],
          notes: assignment.answerKey?.notes || "",
          dynamicQuestions: assignment.dynamicQuestions || []
        },

        correctCount: submittedParent?.correctCount || 0,
        wrongCount: submittedParent?.wrongCount || 0,
        progressPercent: submittedParent?.progressPercent || 0
      };
    }

    return res.json({
      studentId,
      assignmentId,
      totalCorrect: submission.totalCorrect,
      totalWrong: submission.totalWrong,
      overallProgress: submission.overallProgress,
      parentSummary,
      subModulesSummary
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};



// Add this to your backend routes
exports.getSubmission = async (req, res) => {
try {
const { studentId, assignmentId } = req.query;

const submission = await Submission.findOne({ studentId, assignmentId });

if (!submission) {
return res.json({ submission: null });
}

res.json({ submission });

} catch (err) {
res.status(500).json({ error: err.message });
}
};
