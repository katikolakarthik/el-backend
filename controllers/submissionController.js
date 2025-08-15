const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");

/* ---------- Helpers ---------- */

function normalizeString(v) {
  return (v ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}
function textMatchIgnoreCase(a, b) {
  return normalizeString(a) === normalizeString(b);
}
function arraysMatchIgnoreOrder(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const A = a.map(normalizeString).sort();
  const B = b.map(normalizeString).sort();
  return A.every((v, i) => v === B[i]);
}

// Get a consistent list of "dynamic" questions from either field
function getDynamicQuestions(target = {}) {
  const qs = Array.isArray(target.dynamicQuestions)
    ? target.dynamicQuestions
    : Array.isArray(target.questions)
      ? target.questions
      : [];
  // Only keep questions that look like MCQ/open-ended type items
  return qs.map(q => ({
    questionText: q.questionText || q.question || "",
    type: q.type || "dynamic",
    options: q.options || [],
    // resolve correct answer from common schema variants
    correctAnswer:
      q?.answerKey?.correctAnswer ??
      q?.correctAnswer ??
      q?.answer ??
      "",
  }));
}

// Pull structured answer key if present on assignment/subAssignment
function getStructuredAnswerKey(target = {}) {
  const ak = target.answerKey || {};
  return {
    patientName: ak.patientName ?? null,
    ageOrDob: ak.ageOrDob ?? null,
    icdCodes: Array.isArray(ak.icdCodes) ? ak.icdCodes : (ak.icdCodes ? [ak.icdCodes] : []),
    cptCodes: Array.isArray(ak.cptCodes) ? ak.cptCodes : (ak.cptCodes ? [ak.cptCodes] : []),
  };
}

/* ---------- Controller ---------- */

exports.submitAssignment = async (req, res) => {
  try {
    const { studentId, assignmentId, submittedAnswers } = req.body;

    if (!studentId || !assignmentId || !Array.isArray(submittedAnswers)) {
      return res.status(400).json({ error: "studentId, assignmentId and submittedAnswers[] are required" });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    // Load or create the submission shell
    let submission = await Submission.findOne({ studentId, assignmentId });
    if (!submission) {
      submission = new Submission({
        studentId,
        assignmentId,
        submittedAnswers: [],
        totalCorrect: 0,
        totalWrong: 0,
        overallProgress: 0,
      });
    }

    // Process each incoming sub/parent block independently
    for (const incoming of submittedAnswers) {
      const subId = incoming.subAssignmentId || null;

      // Locate target: sub-assignment or the parent assignment
      const target = subId
        ? assignment.subAssignments?.id(subId)
        : assignment;

      if (!target) {
        // Skip unknown subId gracefully (do not fail the whole request)
        continue;
      }

      let correctCount = 0;
      let wrongCount = 0;
      const gradedDynamicQuestions = [];

      /* ----- 1) Grade dynamic questions if any exist on the target ----- */
      const dynQs = getDynamicQuestions(target);
      if (dynQs.length > 0) {
        const submittedDynQs = Array.isArray(incoming.dynamicQuestions)
          ? incoming.dynamicQuestions
          : [];

        dynQs.forEach((q) => {
          const submittedQ = submittedDynQs.find(
            sq => textMatchIgnoreCase(sq.questionText, q.questionText)
          );

          // Support either string or array submissions; normalize to string compare
          const submittedAnswer =
            Array.isArray(submittedQ?.submittedAnswer)
              ? submittedQ.submittedAnswer.join(",")
              : (submittedQ?.submittedAnswer ?? "");

          const correctAnswer =
            Array.isArray(q.correctAnswer)
              ? q.correctAnswer.join(",")
              : (q.correctAnswer ?? "");

          const isCorrect = textMatchIgnoreCase(correctAnswer, submittedAnswer);

          if (isCorrect) correctCount++;
          else wrongCount++;

          gradedDynamicQuestions.push({
            questionText: q.questionText,
            type: q.type || "dynamic",
            options: q.options || [],
            correctAnswer,
            submittedAnswer,
            isCorrect,
          });
        });
      }

      /* ----- 2) Grade structured fields if an answerKey exists ----- */
      if (target.answerKey) {
        const key = getStructuredAnswerKey(target);

        // patientName
        if (key.patientName != null) {
          if (textMatchIgnoreCase(key.patientName, incoming.patientName)) correctCount++;
          else wrongCount++;
        }

        // ageOrDob
        if (key.ageOrDob != null) {
          if (textMatchIgnoreCase(key.ageOrDob, incoming.ageOrDob)) correctCount++;
          else wrongCount++;
        }

        // icdCodes (ignore order/case/extra spaces)
        if (key.icdCodes?.length) {
          const incICD = Array.isArray(incoming.icdCodes)
            ? incoming.icdCodes
            : (incoming.icdCodes ? [incoming.icdCodes] : []);
          if (arraysMatchIgnoreOrder(key.icdCodes, incICD)) correctCount++;
          else wrongCount++;
        }

        // cptCodes
        if (key.cptCodes?.length) {
          const incCPT = Array.isArray(incoming.cptCodes)
            ? incoming.cptCodes
            : (incoming.cptCodes ? [incoming.cptCodes] : []);
          if (arraysMatchIgnoreOrder(key.cptCodes, incCPT)) correctCount++;
          else wrongCount++;
        }

        // notes: stored but never graded (intentionally)
      }

      // Avoid NaN when there are zero items to grade
      const totalItems = correctCount + wrongCount;
      const progressPercent = totalItems > 0 ? Math.round((correctCount / totalItems) * 100) : 0;

      // Canonical stored object
      const processedAnswer = {
        subAssignmentId: subId,
        // structured fields (stored as-is if present)
        patientName: incoming.patientName ?? null,
        ageOrDob: incoming.ageOrDob ?? null,
        icdCodes: Array.isArray(incoming.icdCodes)
          ? incoming.icdCodes
          : (incoming.icdCodes ? [incoming.icdCodes] : []),
        cptCodes: Array.isArray(incoming.cptCodes)
          ? incoming.cptCodes
          : (incoming.cptCodes ? [incoming.cptCodes] : []),
        notes: incoming.notes ?? null, // stored but ungraded
        // dynamic questions (graded copy)
        dynamicQuestions: gradedDynamicQuestions,

        correctCount,
        wrongCount,
        progressPercent,
      };

      // Merge/overwrite by subAssignmentId (null = parent)
      const idx = submission.submittedAnswers.findIndex(
        a => String(a.subAssignmentId ?? null) === String(subId)
      );
      if (idx >= 0) submission.submittedAnswers[idx] = processedAnswer;
      else submission.submittedAnswers.push(processedAnswer);
    }

    // Recompute totals
    submission.totalCorrect = submission.submittedAnswers.reduce((s, a) => s + (a.correctCount || 0), 0);
    submission.totalWrong   = submission.submittedAnswers.reduce((s, a) => s + (a.wrongCount   || 0), 0);
    const denom = submission.totalCorrect + submission.totalWrong;
    submission.overallProgress = denom > 0 ? Math.round((submission.totalCorrect / denom) * 100) : 0;

    await submission.save();

    return res.json({
      success: true,
      message: "Assignment submitted/updated successfully",
      submission,
    });

  } catch (err) {
    console.error("submitAssignment error:", err);
    return res.status(500).json({ error: err.message });
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
