// controllers/submissionController.js
const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");
const Student = require("../models/Student");

/* ----------------------------- Helpers -------------------------------- */

// Compare strings ignoring case and extra spaces
function textMatchIgnoreCase(a, b) {
  const strA = (a ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  const strB = (b ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  return strA === strB;
}

// Compare arrays ignoring order, case, and extra spaces
function arraysMatchIgnoreOrder(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sortedA = a.map(v => (v ?? "").toString().trim().toLowerCase()).sort();
  const sortedB = b.map(v => (v ?? "").toString().trim().toLowerCase()).sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

// Normalize list-like fields to arrays
const asArray = v => Array.isArray(v) ? v : (v ? [v].flat() : []);

// Non-empty checks (so blank keys don’t count toward grading)
const hasNonEmptyText = v => typeof v === "string" && v.trim() !== "";
const hasNonEmptyArray = v => Array.isArray(v) && v.length > 0;

/* Given an answerKey object, does it have at least one real target? */
function keyHasAny(key = {}) {
  return (
    hasNonEmptyText(key.patientName) ||
    hasNonEmptyText(key.ageOrDob) ||
    hasNonEmptyArray(key.icdCodes) ||
    hasNonEmptyArray(key.cptCodes) ||
    hasNonEmptyArray(key.pcsCodes) ||
    hasNonEmptyArray(key.hcpcsCodes) ||
    hasNonEmptyText(key.drgValue) ||
    hasNonEmptyArray(key.modifiers) ||
    hasNonEmptyText(key.notes)
  );
}

/* ----------------------------- Submit ---------------------------------- */
/*  POST /submit - create/update a submission and auto-grade               */
exports.submitAssignment = async (req, res) => {
  try {
    const { studentId, assignmentId, submittedAnswers } = req.body;

    // Get student (expiry)
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    // Find or create submission record
    let submission = await Submission.findOne({ studentId, assignmentId });
    if (!submission) {
      submission = new Submission({
        studentId,
        assignmentId,
        submittedAnswers: [],
        totalCorrect: 0,
        totalWrong: 0,
        overallProgress: 0,
        expiresAt: student.expiryDate
      });
    }

    // Track duplicate attempts (per parent or sub-assignment)
    const alreadySubmittedSubs = [];

    // Process each submitted submodule (or parent-level)
    for (const sub of submittedAnswers) {
      let correctCount = 0;
      let wrongCount = 0;
      let gradedDenom = 0; // number of fields/questions that actually counted
      const gradedDynamicQuestions = [];

      // Resolve target (sub-assignment or parent)
      let target;
      if (sub.subAssignmentId) {
        target = assignment.subAssignments.id(sub.subAssignmentId);
      } else {
        target = assignment; // parent-level
      }
      if (!target) continue;

      // Block overwrite if this sub was already submitted
      const alreadySubmitted = submission.submittedAnswers.find(
        ans => String(ans.subAssignmentId || null) === String(sub.subAssignmentId || null)
      );
      if (alreadySubmitted) {
        alreadySubmittedSubs.push(sub.subAssignmentId || "parent");
        continue;
      }

      const hasDynamic = Array.isArray(target.dynamicQuestions) && target.dynamicQuestions.length > 0;
      const hasKey = target.answerKey && keyHasAny(target.answerKey);

      // Prefer dynamic questions when defined on target
      if (hasDynamic) {
        target.dynamicQuestions.forEach((q) => {
          // Only grade dynamic items with both a question and an answer
          const validDynamic =
            hasNonEmptyText(q?.questionText) && hasNonEmptyText(q?.answer);
          if (!validDynamic) return;

          gradedDenom++;

          const submittedQ = (sub.dynamicQuestions || []).find(
            sq => textMatchIgnoreCase(sq?.questionText, q.questionText)
          );
          const submittedAnswer = submittedQ?.submittedAnswer ?? "";
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
      }
      // Otherwise, grade against predefined answer key — but only count non-empty keys
      else if (hasKey) {
        const key = target.answerKey;

        if (hasNonEmptyText(key.patientName)) {
          gradedDenom++;
          textMatchIgnoreCase(key.patientName, sub.patientName) ? correctCount++ : wrongCount++;
        }

        if (hasNonEmptyText(key.ageOrDob)) {
          gradedDenom++;
          textMatchIgnoreCase(key.ageOrDob, sub.ageOrDob) ? correctCount++ : wrongCount++
        }

        if (hasNonEmptyArray(key.icdCodes)) {
          gradedDenom++;
          arraysMatchIgnoreOrder(key.icdCodes, asArray(sub.icdCodes)) ? correctCount++ : wrongCount++;
        }

        if (hasNonEmptyArray(key.cptCodes)) {
          gradedDenom++;
          arraysMatchIgnoreOrder(key.cptCodes, asArray(sub.cptCodes)) ? correctCount++ : wrongCount++;
        }

        if (hasNonEmptyArray(key.pcsCodes)) {
          gradedDenom++;
          arraysMatchIgnoreOrder(key.pcsCodes, asArray(sub.pcsCodes)) ? correctCount++ : wrongCount++;
        }

        if (hasNonEmptyArray(key.hcpcsCodes)) {
          gradedDenom++;
          arraysMatchIgnoreOrder(key.hcpcsCodes, asArray(sub.hcpcsCodes)) ? correctCount++ : wrongCount++;
        }

        if (hasNonEmptyText(key.drgValue)) {
          gradedDenom++;
          textMatchIgnoreCase(key.drgValue, sub.drgValue) ? correctCount++ : wrongCount++;
        }

        if (hasNonEmptyArray(key.modifiers)) {
          gradedDenom++;
          arraysMatchIgnoreOrder(key.modifiers, asArray(sub.modifiers)) ? correctCount++ : wrongCount++;
        }

        if (hasNonEmptyText(key.notes)) {
          gradedDenom++;
          textMatchIgnoreCase(key.notes, sub.notes) ? correctCount++ : wrongCount++;
        }
      }
      // else: nothing to grade (no dynamic, empty key) — denom stays 0

      const progressPercent = gradedDenom > 0
        ? Math.round((correctCount / gradedDenom) * 100)
        : 0;

      const processedAnswer = {
        subAssignmentId: sub.subAssignmentId || null,

        // Submitted values (ensure array fields are arrays)
        patientName: sub.patientName || null,
        ageOrDob: sub.ageOrDob || null,
        icdCodes: asArray(sub.icdCodes),
        cptCodes: asArray(sub.cptCodes),
        pcsCodes: asArray(sub.pcsCodes),
        hcpcsCodes: asArray(sub.hcpcsCodes),
        drgValue: sub.drgValue || null,
        modifiers: asArray(sub.modifiers),
        notes: sub.notes || null,

        dynamicQuestions: gradedDynamicQuestions,
        correctCount,
        wrongCount,
        progressPercent
      };

      submission.submittedAnswers.push(processedAnswer);
    }

    // If any resubmits were blocked, inform the caller
    if (alreadySubmittedSubs.length > 0) {
      return res.status(400).json({
        success: false,
        message: `You have already submitted: ${alreadySubmittedSubs.join(", ")}. Resubmission not allowed.`
      });
    }

    // Recalculate totals from parts actually graded
    submission.totalCorrect = submission.submittedAnswers.reduce((sum, a) => sum + (a.correctCount || 0), 0);
    submission.totalWrong = submission.submittedAnswers.reduce((sum, a) => sum + (a.wrongCount || 0), 0);
    const totalDenom = submission.totalCorrect + submission.totalWrong;
    submission.overallProgress = totalDenom > 0
      ? Math.round((submission.totalCorrect / totalDenom) * 100)
      : 0;

    await submission.save();

    res.json({
      success: true,
      message: "Assignment submitted successfully",
      submission
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ----------------------------- Summary --------------------------------- */
/*  POST /summary - student + assignment summary with keys and entries     */
exports.getStudentAssignmentSummary = async (req, res) => {
  try {
    const { studentId, assignmentId } = req.body;
    if (!studentId || !assignmentId) {
      return res.status(400).json({ error: "Missing studentId or assignmentId" });
    }

    const submission = await Submission
      .findOne({ studentId, assignmentId })
      .sort({ submissionDate: -1 });

    if (!submission) {
      return res.status(404).json({ error: "No submission found for this student and assignment" });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    const subModulesSummary = assignment.subAssignments.map(subAssign => {
      const submittedAnswer = submission.submittedAnswers.find(sa =>
        sa.subAssignmentId?.toString() === subAssign._id.toString()
      );

      return {
        subAssignmentId: subAssign._id,
        subModuleName: subAssign.subModuleName || "",
        enteredValues: submittedAnswer
          ? {
              patientName: submittedAnswer.patientName,
              ageOrDob: submittedAnswer.ageOrDob,
              icdCodes: submittedAnswer.icdCodes,
              cptCodes: submittedAnswer.cptCodes,
              pcsCodes: submittedAnswer.pcsCodes,
              hcpcsCodes: submittedAnswer.hcpcsCodes,
              drgValue: submittedAnswer.drgValue,
              modifiers: submittedAnswer.modifiers,
              notes: submittedAnswer.notes,
              dynamicQuestions: submittedAnswer.dynamicQuestions || []
            }
          : null,
        answerKey: {
          patientName: subAssign.answerKey?.patientName || "",
          ageOrDob: subAssign.answerKey?.ageOrDob || "",
          icdCodes: subAssign.answerKey?.icdCodes || [],
          cptCodes: subAssign.answerKey?.cptCodes || [],
          pcsCodes: subAssign.answerKey?.pcsCodes || [],
          hcpcsCodes: subAssign.answerKey?.hcpcsCodes || [],
          drgValue: subAssign.answerKey?.drgValue || "",
          modifiers: subAssign.answerKey?.modifiers || [],
          notes: subAssign.answerKey?.notes || "",
          dynamicQuestions: subAssign.dynamicQuestions || []
        },
        correctCount: submittedAnswer?.correctCount || 0,
        wrongCount: submittedAnswer?.wrongCount || 0,
        progressPercent: submittedAnswer?.progressPercent || 0
      };
    });

    // Parent-level summary (if present)
    let parentSummary = null;
    if ((assignment.dynamicQuestions?.length || 0) > 0 || keyHasAny(assignment.answerKey || {})) {
      const submittedParent = submission.submittedAnswers.find(sa => !sa.subAssignmentId);
      parentSummary = {
        enteredValues: submittedParent
          ? {
              patientName: submittedParent.patientName,
              ageOrDob: submittedParent.ageOrDob,
              icdCodes: submittedParent.icdCodes,
              cptCodes: submittedParent.cptCodes,
              pcsCodes: submittedParent.pcsCodes,
              hcpcsCodes: submittedParent.hcpcsCodes,
              drgValue: submittedParent.drgValue,
              modifiers: submittedParent.modifiers,
              notes: submittedParent.notes,
              dynamicQuestions: submittedParent.dynamicQuestions || []
            }
          : null,
        answerKey: {
          patientName: assignment.answerKey?.patientName || "",
          ageOrDob: assignment.answerKey?.ageOrDob || "",
          icdCodes: assignment.answerKey?.icdCodes || [],
          cptCodes: assignment.answerKey?.cptCodes || [],
          pcsCodes: assignment.answerKey?.pcsCodes || [],
          hcpcsCodes: assignment.answerKey?.hcpcsCodes || [],
          drgValue: assignment.answerKey?.drgValue || "",
          modifiers: assignment.answerKey?.modifiers || [],
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

/* --------------------------- Get by query ------------------------------- */
/*  GET /submission?studentId=&assignmentId=                              */
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

/*  GET /submitted-parent-assignments?studentId=                          */
exports.getSubmittedParentAssignments = async (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId) {
      return res.status(400).json({ error: "Missing studentId" });
    }

    // Fetch submissions and populate parent assignment (moduleName + subAssignments)
    const submissions = await Submission.find({ studentId })
      .populate({
        path: "assignmentId",
        select: "moduleName subAssignments",
      })
      .lean();

    if (!submissions || submissions.length === 0) {
      return res.json({ assignments: [] });
    }

    // Build response
    const result = submissions.map(sub => {
      const parentCompleted = Array.isArray(sub.submittedAnswers) &&
        sub.submittedAnswers.some(sa => !sa.subAssignmentId);

      const subAssignments = (sub.assignmentId?.subAssignments || []).map(sa => {
        const submitted = sub.submittedAnswers?.some(ans =>
          ans.subAssignmentId?.toString() === sa._id.toString()
        );
        return {
          subAssignmentId: sa._id,
          subAssignmentName: sa.subModuleName,
          isCompleted: submitted,
        };
      });

      const isParentCompleted =
        subAssignments.length > 0
          ? subAssignments.every(sa => sa.isCompleted)
          : parentCompleted;

      return {
        assignmentId: sub.assignmentId?._id,
        assignmentName: sub.assignmentId?.moduleName,
        isCompleted: isParentCompleted,
        subAssignments,
      };
    });

    res.json({ assignments: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ------------------------- Get by :id (detail) -------------------------- */
/*  GET /submission/:submissionId  (full detail with keys & submissions)  */
exports.getSubmissionDetails = async (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = await Submission.findById(submissionId)
      .populate({
        path: 'assignmentId',
        populate: {
          path: 'subAssignments'
        }
      });

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const assignment = submission.assignmentId;
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    const result = {
      submissionId: submission._id,
      studentId: submission.studentId,
      assignmentId: submission.assignmentId._id,
      moduleName: assignment.moduleName,
      category: assignment.category,
      overallProgress: submission.overallProgress,
      totalCorrect: submission.totalCorrect,
      totalWrong: submission.totalWrong,
      submissionDate: submission.submissionDate,
      assignments: []
    };

    // Parent assignment (only if there is something to grade/show)
    if ((assignment.dynamicQuestions?.length || 0) > 0 || keyHasAny(assignment.answerKey || {})) {
      const parentSubmission = submission.submittedAnswers.find(ans => ans.subAssignmentId === null);

      result.assignments.push({
        type: "parent",
        subAssignmentId: null,
        subModuleName: assignment.moduleName,
        assignmentPdf: assignment.assignmentPdf,
        submittedAnswers: parentSubmission || null,
        correctAnswers: {
          patientName: assignment.answerKey?.patientName || null,
          ageOrDob: assignment.answerKey?.ageOrDob || null,
          icdCodes: assignment.answerKey?.icdCodes || [],
          cptCodes: assignment.answerKey?.cptCodes || [],
          pcsCodes: assignment.answerKey?.pcsCodes || [],
          hcpcsCodes: assignment.answerKey?.hcpcsCodes || [],
          drgValue: assignment.answerKey?.drgValue || null,
          modifiers: assignment.answerKey?.modifiers || [],
          notes: assignment.answerKey?.notes || null,
          dynamicQuestions: (assignment.dynamicQuestions || []).map(q => ({
            questionText: q.questionText,
            type: q.type || "dynamic",
            options: q.options || [],
            correctAnswer: q.answer
          }))
        }
      });
    }

    // Sub-assignments
    for (const subAssignment of assignment.subAssignments) {
      const subSubmission = submission.submittedAnswers.find(
        ans => ans.subAssignmentId &&
               ans.subAssignmentId.toString() === subAssignment._id.toString()
      );

      result.assignments.push({
        type: "sub",
        subAssignmentId: subAssignment._id,
        subModuleName: subAssignment.subModuleName,
        assignmentPdf: subAssignment.assignmentPdf,
        submittedAnswers: subSubmission || null,
        correctAnswers: {
          patientName: subAssignment.answerKey?.patientName || null,
          ageOrDob: subAssignment.answerKey?.ageOrDob || null,
          icdCodes: subAssignment.answerKey?.icdCodes || [],
          cptCodes: subAssignment.answerKey?.cptCodes || [],
          pcsCodes: subAssignment.answerKey?.pcsCodes || [],
          hcpcsCodes: subAssignment.answerKey?.hcpcsCodes || [],
          drgValue: subAssignment.answerKey?.drgValue || null,
          modifiers: subAssignment.answerKey?.modifiers || [],
          notes: subAssignment.answerKey?.notes || null,
          dynamicQuestions: (subAssignment.dynamicQuestions || []).map(q => ({
            questionText: q.questionText,
            type: q.type || "dynamic",
            options: q.options || [],
            correctAnswer: q.answer
          }))
        }
      });
    }

    res.json({ success: true, data: result });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};