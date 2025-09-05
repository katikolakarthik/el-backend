const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");
const Student = require("../models/Student");

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

// Normalize list-like fields to arrays
const asArray = v => Array.isArray(v) ? v : (v ? [v].flat() : []);

/* ---------------------------------------------------------------------- *
 *  POST /submit - create/update a submission and auto-grade              *
 *  Enforces optional assignment timeLimitMinutes (per attempt)           *
 * ---------------------------------------------------------------------- */
exports.submitAssignment = async (req, res) => {
  try {
    const { studentId, assignmentId, submittedAnswers } = req.body;

    if (!studentId || !assignmentId || !Array.isArray(submittedAnswers)) {
      return res.status(400).json({ success: false, message: "Missing studentId, assignmentId or submittedAnswers" });
    }

    // Get student (for TTL expiry)
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    const now = new Date();

    // Find or create submission (unique by student+assignment)
    let submission = await Submission.findOne({ studentId, assignmentId });

    // --- TIMER LOGIC (timeLimitMinutes) ---
    const limitMin = Number(assignment.timeLimitMinutes ?? 0);
    if (!submission) {
      // First attempt → stamp startedAt and mustSubmitBy if limit is set
      submission = new Submission({
        studentId,
        assignmentId,
        submittedAnswers: [],
        totalCorrect: 0,
        totalWrong: 0,
        overallProgress: 0,
        expiresAt: student.expiryDate || undefined
      });
      if (Number.isFinite(limitMin) && limitMin > 0) {
        submission.startedAt = now;
        submission.mustSubmitBy = new Date(now.getTime() + limitMin * 60 * 1000);
      }
    } else {
      // Existing attempt → if a limit exists, ensure we're still within time
      if (submission.mustSubmitBy && now > new Date(submission.mustSubmitBy)) {
        return res.status(403).json({
          success: false,
          message: "Time limit exceeded for this assignment."
        });
      }
      // If assignment got a limit later but this attempt has no timer yet (rare), start it now.
      if (!submission.startedAt && Number.isFinite(limitMin) && limitMin > 0) {
        submission.startedAt = now;
        submission.mustSubmitBy = new Date(now.getTime() + limitMin * 60 * 1000);
      }
    }
    // --------------------------------------

    // Track any duplicate attempts for sub-sections/parent
    const alreadySubmittedSubs = [];

    // Process each submitted submodule (or parent-level)
    for (const sub of submittedAnswers) {
      let correctCount = 0, wrongCount = 0;

      // Resolve grading target (sub-assignment or parent)
      let target;
      if (sub.subAssignmentId) {
        target = assignment.subAssignments.id(sub.subAssignmentId);
      } else {
        target = assignment; // parent-level assignment
      }
      if (!target) continue;

      // Disallow resubmitting same sub or parent
      const alreadySubmitted = submission.submittedAnswers.find(
        ans => String(ans.subAssignmentId || null) === String(sub.subAssignmentId || null)
      );
      if (alreadySubmitted) {
        alreadySubmittedSubs.push(sub.subAssignmentId || "parent");
        continue;
      }

      const gradedDynamicQuestions = [];

      // Prefer dynamic questions when defined on target
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
      }
      // Otherwise, grade against predefined answer key
      else if (target.answerKey) {
        const key = target.answerKey;

        if (textMatchIgnoreCase(key.patientName, sub.patientName)) correctCount++; else wrongCount++;
        if (textMatchIgnoreCase(key.ageOrDob, sub.ageOrDob)) correctCount++; else wrongCount++;

        if (arraysMatchIgnoreOrder(key.icdCodes || [], asArray(sub.icdCodes))) correctCount++; else wrongCount++;
        if (arraysMatchIgnoreOrder(key.cptCodes || [], asArray(sub.cptCodes))) correctCount++; else wrongCount++;
        if (arraysMatchIgnoreOrder(key.pcsCodes || [], asArray(sub.pcsCodes))) correctCount++; else wrongCount++;       // PCS
        if (arraysMatchIgnoreOrder(key.hcpcsCodes || [], asArray(sub.hcpcsCodes))) correctCount++; else wrongCount++;   // HCPCS
        if (textMatchIgnoreCase(key.drgValue, sub.drgValue)) correctCount++; else wrongCount++;                         // DRG
        if (arraysMatchIgnoreOrder(key.modifiers || [], asArray(sub.modifiers))) correctCount++; else wrongCount++;     // Modifiers
        if (textMatchIgnoreCase(key.notes, sub.notes)) correctCount++; else wrongCount++;
        if (textMatchIgnoreCase(key.adx, sub.adx)) correctCount++; else wrongCount++;                                   // Adx
      }

      const denom = correctCount + wrongCount;
      const progressPercent = denom > 0 ? Math.round((correctCount / denom) * 100) : 0;

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
        adx: sub.adx || null,

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

    // Recalculate totals
    submission.totalCorrect = submission.submittedAnswers.reduce((sum, a) => sum + (a.correctCount || 0), 0);
    submission.totalWrong = submission.submittedAnswers.reduce((sum, a) => sum + (a.wrongCount || 0), 0);
    const totalDenom = submission.totalCorrect + submission.totalWrong;
    submission.overallProgress = totalDenom > 0 ? Math.round((submission.totalCorrect / totalDenom) * 100) : 0;

    // Update submissionDate to last activity
    submission.submissionDate = now;

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

/* ---------------------------------------------------------------------- *
 *  POST /summary - student + assignment summary with keys and entries    *
 * ---------------------------------------------------------------------- */
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

    // Sub-module summaries with answer key included
    const subModulesSummary = assignment.subAssignments.map(subAssign => {
      const submittedAnswer = submission.submittedAnswers.find(sa =>
        sa.subAssignmentId?.toString() === subAssign._id.toString()
      );

      return {
        subAssignmentId: subAssign._id,
        subModuleName: subAssign.subModuleName || "",

        // Student answers
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
              adx: submittedAnswer.adx,
              dynamicQuestions: submittedAnswer.dynamicQuestions || []
            }
          : null,

        // Predefined correct answers
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
          adx: subAssign.answerKey?.adx || "",
          dynamicQuestions: subAssign.dynamicQuestions || []
        },

        correctCount: submittedAnswer?.correctCount || 0,
        wrongCount: submittedAnswer?.wrongCount || 0,
        progressPercent: submittedAnswer?.progressPercent || 0
      };
    });

    // Parent-level summary (if present)
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
              pcsCodes: submittedParent.pcsCodes,
              hcpcsCodes: submittedParent.hcpcsCodes,
              drgValue: submittedParent.drgValue,
              modifiers: submittedParent.modifiers,
              notes: submittedParent.notes,
              adx: submittedParent.adx,
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
          adx: assignment.answerKey?.adx || "",
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
      timeLimitMinutes: assignment.timeLimitMinutes ?? null,
      startedAt: submission.startedAt || null,
      mustSubmitBy: submission.mustSubmitBy || null,
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

/* ---------------------------------------------------------------------- *
 *  GET /submission?studentId=&assignmentId=                              *
 * ---------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------- *
 *  GET /submitted-parent-assignments?studentId=                          *
 * ---------------------------------------------------------------------- */
exports.getSubmittedParentAssignments = async (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId) {
      return res.status(400).json({ error: "Missing studentId" });
    }

    const submissions = await Submission.find({ studentId })
      .populate({
        path: "assignmentId",
        select: "moduleName subAssignments timeLimitMinutes"
      })
      .lean();

    if (!submissions || submissions.length === 0) {
      return res.json({ assignments: [] });
    }

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
        timeLimitMinutes: sub.assignmentId?.timeLimitMinutes ?? null,
        startedAt: sub.startedAt || null,
        mustSubmitBy: sub.mustSubmitBy || null,
        isCompleted: isParentCompleted,
        subAssignments,
      };
    });

    res.json({ assignments: result });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


/* ---------------------------------------------------------------------- *
 *  GET /submission/:submissionId  (full detail with keys & submissions)  *
 * ---------------------------------------------------------------------- */
exports.getSubmissionDetails = async (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = await Submission.findById(submissionId)
      .populate({
        path: 'assignmentId',
        populate: { path: 'subAssignments' }
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
      assignmentId: assignment._id,
      moduleName: assignment.moduleName,
      category: assignment.category,
      timeLimitMinutes: assignment.timeLimitMinutes ?? null,
      startedAt: submission.startedAt || null,
      mustSubmitBy: submission.mustSubmitBy || null,
      overallProgress: submission.overallProgress,
      totalCorrect: submission.totalCorrect,
      totalWrong: submission.totalWrong,
      submissionDate: submission.submissionDate,
      assignments: []
    };

    // Parent (if it has answers)
    if (assignment.answerKey || assignment.dynamicQuestions?.length > 0) {
      const parentSubmission = submission.submittedAnswers.find(
        ans => ans.subAssignmentId === null
      );

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
          adx: assignment.answerKey?.adx || null,
          dynamicQuestions: assignment.dynamicQuestions?.map(q => ({
            questionText: q.questionText,
            type: q.type || "dynamic",
            options: q.options || [],
            correctAnswer: q.answer
          })) || []
        }
      });
    }

    // Subs
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
          adx: subAssignment.answerKey?.adx || null,
          dynamicQuestions: subAssignment.dynamicQuestions?.map(q => ({
            questionText: q.questionText,
            type: q.type || "dynamic",
            options: q.options || [],
            correctAnswer: q.answer
          })) || []
        }
      });
    }

    res.json({
      success: true,
      data: result
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};