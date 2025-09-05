// controllers/assignmentController.js
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const mongoose = require("mongoose");

/* ----------------------------- Util helpers ------------------------------ */

const toUpperTrim = (v) => (v || "").toString().trim().toUpperCase();

const parseCsv = (str) =>
  (str || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

function textMatchIgnoreCase(a, b) {
  const strA = (a ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  const strB = (b ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  return strA === strB;
}

function arraysMatchIgnoreOrder(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sortedA = a.map((v) => (v ?? "").toString().trim().toLowerCase()).sort();
  const sortedB = b.map((v) => (v ?? "").toString().trim().toLowerCase()).sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/* Merge/format helpers used in getters */
const hasPredefinedData = (answerKey) => {
  if (!answerKey) return false;
  return (
    answerKey.patientName ||
    answerKey.ageOrDob ||
    (answerKey.icdCodes && answerKey.icdCodes.length) ||
    (answerKey.cptCodes && answerKey.cptCodes.length) ||
    (answerKey.pcsCodes && answerKey.pcsCodes.length) ||
    (answerKey.hcpcsCodes && answerKey.hcpcsCodes.length) ||
    answerKey.drgValue ||
    (answerKey.modifiers && answerKey.modifiers.length) ||
    answerKey.notes ||
    answerKey.adx // NEW: include Adx in “has data?”
  );
};

const formatPredefinedOut = (answerKey) =>
  hasPredefinedData(answerKey)
    ? [
        {
          type: "predefined",
          answerKey,
        },
      ]
    : [];

const formatDynamicOut = (dynamicQuestions) => {
  if (!dynamicQuestions || !dynamicQuestions.length) return [];
  return dynamicQuestions.map((q) => ({
    type: "dynamic",
    questionText: q.questionText,
    options: q.options || [],
    answer: q.answer,
  }));
};

/* ----------------------------- Controllers ------------------------------- */

// Create assignment (supports parent-level or multiple sub-assignments)
// Also supports optional windowStart/windowEnd (timer)
exports.addAssignment = async (req, res) => {
  try {
    const { moduleName, subAssignments, category, windowStart, windowEnd } = req.body;
    const files = req.files?.assignmentPdf || [];

    if (!category || !category.trim()) {
      return res.status(400).json({ success: false, message: "category is required" });
    }
    if (!moduleName || !moduleName.trim()) {
      return res.status(400).json({ success: false, message: "moduleName is required" });
    }

    const formatDynamic = (questions) =>
      (questions || []).map((q) => ({
        questionText: q.questionText,
        options: q.options || [],
        answer: q.answer,
      }));

    // Helper: Format predefined answers (from payload fields)
    const formatPredefined = (sub) => ({
      patientName: sub.answerPatientName || null,
      ageOrDob: sub.answerAgeOrDob || null,
      icdCodes: sub.answerIcdCodes ? parseCsv(sub.answerIcdCodes) : [],
      cptCodes: sub.answerCptCodes ? parseCsv(sub.answerCptCodes) : [],
      pcsCodes: sub.answerPcsCodes ? parseCsv(sub.answerPcsCodes) : [],
      hcpcsCodes: sub.answerHcpcsCodes ? parseCsv(sub.answerHcpcsCodes) : [],
      drgValue: sub.answerDrgValue || null,
      modifiers: sub.answerModifiers ? parseCsv(sub.answerModifiers) : [],
      notes: sub.answerNotes || null,
      adx: sub.answerAdx || null, // NEW: predefined Adx
    });

    const assignmentData = {
      moduleName,
      category: toUpperTrim(category), // normalize to uppercase for consistency
      // assignedStudents is deprecated; ignore any incoming values
    };

    // Optional time window (timer) — both are optional
    if (windowStart) {
      const ws = new Date(windowStart);
      if (!isNaN(ws.getTime())) assignmentData.windowStart = ws;
    }
    if (windowEnd) {
      const we = new Date(windowEnd);
      if (!isNaN(we.getTime())) assignmentData.windowEnd = we;
    }
    if (assignmentData.windowStart && assignmentData.windowEnd) {
      if (assignmentData.windowEnd < assignmentData.windowStart) {
        return res
          .status(400)
          .json({ success: false, message: "windowEnd must be >= windowStart" });
      }
    }

    if (subAssignments) {
      const parsed = JSON.parse(subAssignments);

      // Single assignment → store at parent level
      if (parsed.length === 1) {
        const single = parsed[0];
        assignmentData.assignmentPdf = files[0]
          ? files[0].path || files[0].url || files[0].secure_url || null
          : null;

        if (single.isDynamic) {
          assignmentData.dynamicQuestions = formatDynamic(single.questions);
        } else {
          assignmentData.answerKey = formatPredefined(single);
        }
      } else {
        // Multiple sub-assignments
        assignmentData.subAssignments = parsed.map((sub, index) => {
          const pdfPath = files[index]
            ? files[index].path || files[index].url || files[index].secure_url || null
            : null;

          if (sub.isDynamic) {
            return {
              subModuleName: sub.subModuleName || `${moduleName} - Sub ${index + 1}`,
              dynamicQuestions: formatDynamic(sub.questions),
              assignmentPdf: pdfPath,
            };
          } else {
            return {
              subModuleName: sub.subModuleName || `${moduleName} - Sub ${index + 1}`,
              assignmentPdf: pdfPath,
              answerKey: formatPredefined(sub),
            };
          }
        });
      }
    }

    const assignment = new Assignment(assignmentData);
    await assignment.save();

    res.json({
      success: true,
      message:
        "Assignment saved to category successfully (supports predefined, text, and MCQ dynamic questions; optional time window).",
      assignment,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all assignments with merged question format
exports.getAssignments = async (req, res) => {
  try {
    const assignments = await Assignment.find().populate("assignedStudents");

    const formatted = assignments.map((a) => ({
      _id: a._id,
      moduleName: a.moduleName,
      assignedStudents: a.assignedStudents,
      assignedDate: a.assignedDate,
      assignmentPdf: a.assignmentPdf || null,
      windowStart: a.windowStart || null, // include timer info
      windowEnd: a.windowEnd || null,

      // Merged questions (parent level)
      questions: [...formatPredefinedOut(a.answerKey), ...formatDynamicOut(a.dynamicQuestions)],

      // On-the-fly dynamicAnswerKey (parent level)
      dynamicAnswerKey:
        a.dynamicQuestions?.map((q) => ({
          questionText: q.questionText,
          answer: q.answer,
        })) || [],

      // Sub-assignments
      subAssignments:
        a.subAssignments?.map((sa) => ({
          _id: sa._id,
          subModuleName: sa.subModuleName,
          assignmentPdf: sa.assignmentPdf || null,
          questions: [...formatPredefinedOut(sa.answerKey), ...formatDynamicOut(sa.dynamicQuestions)],
          // On-the-fly dynamicAnswerKey (sub-assignment level)
          dynamicAnswerKey:
            sa.dynamicQuestions?.map((q) => ({
              questionText: q.questionText,
              answer: q.answer,
            })) || [],
        })) || [],
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get single assignment by ID for editing
exports.getAssignmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await Assignment.findById(id).populate("assignedStudents");

    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    // Format the assignment for editing (similar to getAssignments but single item)
    const formatted = {
      _id: assignment._id,
      moduleName: assignment.moduleName,
      category: assignment.category,
      assignedStudents: assignment.assignedStudents,
      assignedDate: assignment.assignedDate,
      assignmentPdf: assignment.assignmentPdf || null,
      windowStart: assignment.windowStart || null,
      windowEnd: assignment.windowEnd || null,

      // Parent level data
      answerKey: assignment.answerKey || null,
      dynamicQuestions: assignment.dynamicQuestions || [],

      // Sub-assignments
      subAssignments:
        assignment.subAssignments?.map((sa) => ({
          _id: sa._id,
          subModuleName: sa.subModuleName,
          assignmentPdf: sa.assignmentPdf || null,
          answerKey: sa.answerKey || null,
          dynamicQuestions: sa.dynamicQuestions || [],
        })) || [],
    };

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete entire module
exports.deleteAssignmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Assignment.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Assignment not found" });
    res.json({ success: true, message: "Module deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete specific sub-assignment
exports.deleteSubAssignment = async (req, res) => {
  try {
    const { moduleId, subId } = req.params;
    const assignment = await Assignment.findById(moduleId);
    if (!assignment) return res.status(404).json({ error: "Module not found" });

    assignment.subAssignments = assignment.subAssignments.filter(
      (sub) => sub._id.toString() !== subId
    );

    await assignment.save();
    res.json({ success: true, message: "Sub-assignment deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteAllAssignments = async (req, res) => {
  try {
    if (!req.body.confirm) {
      return res.status(400).json({ error: "Confirmation flag required" });
    }
    const result = await Assignment.deleteMany({});
    res.json({
      success: true,
      message: "All assignments deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update assignment module (also supports optional timer and Adx in predefined)
exports.updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      moduleName,
      assignedStudents,
      subAssignments,
      category,
      windowStart,
      windowEnd,
    } = req.body;
    const files = req.files?.assignmentPdf || [];

    // Find the existing assignment
    const existingAssignment = await Assignment.findById(id);
    if (!existingAssignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    const formatDynamic = (questions) =>
      (questions || []).map((q) => ({
        _id: q._id || new mongoose.Types.ObjectId(), // Preserve existing ID or create new one
        questionText: q.questionText,
        options: q.options || [],
        answer: q.answer,
      }));

    const formatPredefined = (sub) => ({
      patientName: sub.answerPatientName || null,
      ageOrDob: sub.answerAgeOrDob || null,
      icdCodes: sub.answerIcdCodes ? parseCsv(sub.answerIcdCodes) : [],
      cptCodes: sub.answerCptCodes ? parseCsv(sub.answerCptCodes) : [],
      pcsCodes: sub.answerPcsCodes ? parseCsv(sub.answerPcsCodes) : [],
      hcpcsCodes: sub.answerHcpcsCodes ? parseCsv(sub.answerHcpcsCodes) : [],
      drgValue: sub.answerDrgValue || null,
      modifiers: sub.answerModifiers ? parseCsv(sub.answerModifiers) : [],
      notes: sub.answerNotes || null,
      adx: sub.answerAdx || null, // NEW
    });

    // Prepare update data
    let updateData = {
      moduleName,
      assignedStudents: assignedStudents ? assignedStudents.split(",") : [],
    };

    if (category) {
      updateData.category = toUpperTrim(category);
    }

    // Optional timer
    if (windowStart !== undefined) {
      if (windowStart) {
        const ws = new Date(windowStart);
        if (!isNaN(ws.getTime())) updateData.windowStart = ws;
      } else {
        updateData.windowStart = undefined; // unset if empty string/null
      }
    }
    if (windowEnd !== undefined) {
      if (windowEnd) {
        const we = new Date(windowEnd);
        if (!isNaN(we.getTime())) updateData.windowEnd = we;
      } else {
        updateData.windowEnd = undefined;
      }
    }
    if (updateData.windowStart && updateData.windowEnd) {
      if (updateData.windowEnd < updateData.windowStart) {
        return res
          .status(400)
          .json({ success: false, message: "windowEnd must be >= windowStart" });
      }
    }

    if (subAssignments) {
      const parsed = JSON.parse(subAssignments);

      // Single assignment → store at parent level
      if (parsed.length === 1) {
        const single = parsed[0];

        // Only update PDF if a new one is provided
        if (files[0]) {
          updateData.assignmentPdf = files[0].path || files[0].url || files[0].secure_url || null;
        }

        if (single.isDynamic) {
          updateData.dynamicQuestions = formatDynamic(single.questions);
          updateData.answerKey = null; // Clear predefined answers
        } else {
          updateData.answerKey = formatPredefined(single);
          updateData.dynamicQuestions = []; // Clear dynamic questions
        }
      }
      // Multiple sub-assignments
      else {
        updateData.subAssignments = parsed.map((sub, index) => {
          const pdfPath = files[index]
            ? files[index].path || files[index].url || files[index].secure_url || null
            : null;

          if (sub.isDynamic) {
            return {
              _id: sub._id || new mongoose.Types.ObjectId(), // Preserve existing ID or create new one
              subModuleName: sub.subModuleName || `${moduleName} - Sub ${index + 1}`,
              dynamicQuestions: formatDynamic(sub.questions),
              assignmentPdf: pdfPath || sub.assignmentPdf, // Keep existing PDF if no new one
              answerKey: null, // Clear predefined answers
            };
          } else {
            return {
              _id: sub._id || new mongoose.Types.ObjectId(), // Preserve existing ID or create new one
              subModuleName: sub.subModuleName || `${moduleName} - Sub ${index + 1}`,
              assignmentPdf: pdfPath || sub.assignmentPdf, // Keep existing PDF if no new one
              answerKey: formatPredefined(sub),
              dynamicQuestions: [], // Clear dynamic questions
            };
          }
        });
      }
    }

    // Update the assignment
    const updatedAssignment = await Assignment.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate("assignedStudents");

    res.json({
      success: true,
      message: "Assignment updated successfully",
      assignment: updatedAssignment,
    });
  } catch (err) {
    console.error("Update assignment error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get only parent assignments assigned to a specific student
exports.getAssignmentsByStudentId = async (req, res) => {
  try {
    const { studentId } = req.params;

    // 1. Get all assignments for this student
    const assignments = await Assignment.find(
      { assignedStudents: studentId },
      {
        moduleName: 1,
        assignedDate: 1,
        subAssignments: 1,
        windowStart: 1,
        windowEnd: 1,
      }
    ).lean();

    // 2. Get all submissions by this student
    const submissions = await Submission.find({ studentId }).lean();

    const processedAssignments = assignments.map((ass) => {
      // find this student's submission for the assignment
      const studentSubmission = submissions.find(
        (sub) => sub.assignmentId.toString() === ass._id.toString()
      );

      const subStatuses = (ass.subAssignments || []).map((sub) => {
        const submittedSub = studentSubmission?.submittedAnswers?.find(
          (ans) => ans.subAssignmentId?.toString() === sub._id.toString()
        );
        return {
          ...sub,
          isCompleted: !!submittedSub,
        };
      });

      const parentCompleted =
        subStatuses.length > 0
          ? subStatuses.every((sub) => sub.isCompleted)
          : !!studentSubmission; // if no subAssignments, check if any parent-level submission exists

      return {
        ...ass,
        subAssignments: subStatuses,
        isCompleted: parentCompleted,
      };
    });

    res.json({ success: true, assignments: processedAssignments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get full details of a parent assignment for a specific student
exports.getAssignmentDetailsForStudent = async (req, res) => {
  try {
    const { studentId, assignmentId } = req.params;

    // Find the assignment where the student is assigned
    const assignment = await Assignment.findOne({
      _id: assignmentId,
      assignedStudents: studentId,
    }).populate("assignedStudents");

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found or not assigned to this student",
      });
    }

    // Prepare the response
    const formattedAssignment = {
      _id: assignment._id,
      moduleName: assignment.moduleName,
      assignedStudents: assignment.assignedStudents,
      assignedDate: assignment.assignedDate,
      assignmentPdf: assignment.assignmentPdf || null,
      windowStart: assignment.windowStart || null,
      windowEnd: assignment.windowEnd || null,

      // Parent-level questions
      questions: [
        ...formatPredefinedOut(assignment.answerKey),
        ...formatDynamicOut(assignment.dynamicQuestions),
      ],
      dynamicAnswerKey:
        assignment.dynamicQuestions?.map((q) => ({
          questionText: q.questionText,
          answer: q.answer,
        })) || [],

      // Sub-assignments
      subAssignments: assignment.subAssignments.map((sa) => ({
        _id: sa._id,
        subModuleName: sa.subModuleName,
        assignmentPdf: sa.assignmentPdf || null,
        questions: [...formatPredefinedOut(sa.answerKey), ...formatDynamicOut(sa.dynamicQuestions)],
        dynamicAnswerKey:
          sa.dynamicQuestions?.map((q) => ({
            questionText: q.questionText,
            answer: q.answer,
          })) || [],
      })),
    };

    res.json({
      success: true,
      assignment: formattedAssignment,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Get all assignments by category
exports.getAssignmentsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { studentId } = req.query; // Get studentId from query params

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Category parameter is required",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "Student ID is required to check completion status",
      });
    }

    // Find all assignments for the given category
    const formattedCategory = toUpperTrim(category);
    const assignments = await Assignment.find({
      category: formattedCategory,
    }).populate("assignedStudents");

    if (!assignments || assignments.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No assignments found for category: ${category}`,
      });
    }

    // Check submissions for this student
    const submissions = await Submission.find({
      studentId: studentId,
      assignmentId: { $in: assignments.map((a) => a._id) },
    });

    // Helper: check if parent assignment is completed
    const isParentCompleted = (assignmentId) => {
      const submission = submissions.find(
        (sub) => sub.assignmentId.toString() === assignmentId.toString()
      );
      return !!submission;
    };

    // Helper: check if sub-assignment is completed
    const isSubAssignmentCompleted = (assignmentId, subAssignmentId) => {
      const submission = submissions.find(
        (sub) => sub.assignmentId.toString() === assignmentId.toString()
      );

      if (!submission) return false;

      return submission.submittedAnswers.some(
        (answer) => answer.subAssignmentId.toString() === subAssignmentId.toString()
      );
    };

    // Format all assignments for response
    const formattedAssignments = assignments.map((assignment) => {
      const parentCompleted = isParentCompleted(assignment._id);

      return {
        _id: assignment._id,
        moduleName: assignment.moduleName,
        category: assignment.category,
        assignedStudents: assignment.assignedStudents,
        assignedDate: assignment.assignedDate,
        assignmentPdf: assignment.assignmentPdf || null,
        windowStart: assignment.windowStart || null,
        windowEnd: assignment.windowEnd || null,
        isCompleted: parentCompleted, // Parent completion status

        // Parent-level questions
        questions: [
          ...formatPredefinedOut(assignment.answerKey),
          ...formatDynamicOut(assignment.dynamicQuestions),
        ],
        dynamicAnswerKey:
          assignment.dynamicQuestions?.map((q) => ({
            questionText: q.questionText,
            answer: q.answer,
          })) || [],

        // Sub-assignments
        subAssignments: assignment.subAssignments.map((sa) => ({
          _id: sa._id,
          subModuleName: sa.subModuleName,
          assignmentPdf: sa.assignmentPdf || null,
          isCompleted: isSubAssignmentCompleted(assignment._id, sa._id), // Sub-assignment completion status
          questions: [...formatPredefinedOut(sa.answerKey), ...formatDynamicOut(sa.dynamicQuestions)],
          dynamicAnswerKey:
            sa.dynamicQuestions?.map((q) => ({
              questionText: q.questionText,
              answer: q.answer,
            })) || [],
        })),
      };
    });

    res.json({
      success: true,
      count: formattedAssignments.length,
      category: formattedCategory,
      assignments: formattedAssignments,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// Get total assignments count by category
exports.getAssignmentsCountByCategory = async (req, res) => {
  try {
    const { category } = req.params;

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Category parameter is required",
      });
    }

    const count = await Assignment.countDocuments({
      category: toUpperTrim(category),
    });

    res.json({
      success: true,
      category: toUpperTrim(category),
      totalAssignments: count,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};



// Get assignment statistics for a student by category
exports.getAssignmentStatsByCategory = async (req, res) => {
  try {
    const { category, studentId } = req.params;

    if (!category || !studentId) {
      return res.status(400).json({ success: false, message: "Category and studentId parameters are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: "Invalid studentId format" });
    }

    const formattedCategory = toUpperTrim(category);

    const assignments = await Assignment.find({ category: formattedCategory }).lean();
    if (!assignments.length) {
      return res.json({
        success: true, category: formattedCategory, totalAssigned: 0, completed: 0,
        averageScore: "0%", pending: 0,
        stats: { assigned: 0, completed: 0, averageScore: 0, pending: 0 },
        message: "No assignments found for this category",
      });
    }

    const totalAssigned = assignments.length;

    // parentId -> subCount
    const subCountsByAssignment = new Map(
      assignments.map(a => [String(a._id), (a.subAssignments?.length || 0)])
    );

    const submissions = await Submission.find({
      studentId: new mongoose.Types.ObjectId(studentId),
      assignmentId: { $in: assignments.map(a => a._id) },
    }).lean();

    // ---- SETTINGS ----
    const REQUIRE_100_EACH_SUB = false;
    const NO_SUB_MIN_PROGRESS   = 0;
    const USE_OVERALL_FOR_MULTI_SUB = true;
    const MULTI_SUB_MIN_OVERALL = 0;
    // ------------------

    // Dedup by assignmentId (keep latest)
    const latestSubmissionByAssignment = new Map();
    for (const s of submissions) {
      const key = String(s.assignmentId);
      const prev = latestSubmissionByAssignment.get(key);
      if (!prev || new Date(s.submissionDate) > new Date(prev.submissionDate)) {
        latestSubmissionByAssignment.set(key, s);
      }
    }

    const completionByAssignment = new Map();
    const scoreByAssignment = new Map();

    for (const [aId, subm] of latestSubmissionByAssignment) {
      const subCount = subCountsByAssignment.get(aId) || 0;
      let complete = false;

      if (subCount === 0) {
        // No subs: any submission (or >= threshold) counts
        const prog = Number(subm.overallProgress ?? 0);
        complete = prog >= NO_SUB_MIN_PROGRESS;
      } else {
        // With subs:
        const answers = Array.isArray(subm.submittedAnswers) ? subm.submittedAnswers : [];
        const uniqueCovered = new Set(
          answers.map(sa => sa?.subAssignmentId ? String(sa.subAssignmentId) : null).filter(Boolean)
        );
        const coversAllByIds   = uniqueCovered.size >= subCount;
        const coversAllByCount = answers.length   >= subCount;

        if (coversAllByIds || coversAllByCount) {
          if (REQUIRE_100_EACH_SUB) {
            complete = answers.every(sa => Number(sa?.progressPercent) === 100);
          } else {
            complete = true;
          }
        } else if (USE_OVERALL_FOR_MULTI_SUB) {
          const overall = Number(subm.overallProgress ?? 0);
          if (Number.isFinite(overall) && overall >= MULTI_SUB_MIN_OVERALL) {
            complete = true;
          }
        }
      }

      completionByAssignment.set(aId, complete);

      const prog = Number(subm.overallProgress);
      if (Number.isFinite(prog)) scoreByAssignment.set(aId, prog);
    }

    const submittedParents = latestSubmissionByAssignment.size;

    const completed = Array.from(completionByAssignment.values()).filter(Boolean).length;
    const pending = totalAssigned - completed;

    const completedScores = Array.from(scoreByAssignment.entries())
      .filter(([aId]) => completionByAssignment.get(aId))
      .map(([, v]) => v);

    const averageScoreRaw = completedScores.length
      ? completedScores.reduce((a, b) => a + b, 0) / completedScores.length
      : 0;

    const averageScore = Math.round(averageScoreRaw * 100) / 100;

    return res.json({
      success: true,
      category: formattedCategory,
      totalAssigned,
      completed,
      averageScore: `${averageScore}%`,
      pending,
      stats: { assigned: totalAssigned, completed, averageScore, pending },
      debug: { submittedParents }
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};








// Alternative: Get detailed statistics including assignment lists
exports.getDetailedAssignmentStats = async (req, res) => {
  try {
    const { category, studentId } = req.params;

    if (!category || !studentId) {
      return res.status(400).json({
        success: false,
        message: "Category and studentId parameters are required",
      });
    }

    const formattedCategory = toUpperTrim(category);

    // Get all assignments for the category
    const assignments = await Assignment.find({
      category: formattedCategory,
    });

    // Get all submissions for this student and category
    const submissions = await Submission.find({
      studentId: new mongoose.Types.ObjectId(studentId),
      assignmentId: { $in: assignments.map((a) => a._id) },
    }).populate("assignmentId");

    // Create a map of assignmentId to submission for quick lookup
    const submissionMap = {};
    submissions.forEach((sub) => {
      submissionMap[sub.assignmentId._id.toString()] = sub;
    });

    // Categorize assignments
    const completedAssignments = [];
    const pendingAssignments = [];

    assignments.forEach((assignment) => {
      const submission = submissionMap[assignment._id.toString()];
      if (submission) {
        completedAssignments.push({
          assignment: assignment.moduleName,
          score: submission.overallProgress || 0,
          submissionDate: submission.submissionDate,
          windowStart: assignment.windowStart || null,
          windowEnd: assignment.windowEnd || null,
        });
      } else {
        pendingAssignments.push({
          assignment: assignment.moduleName,
          assignedDate: assignment.assignedDate,
          windowStart: assignment.windowStart || null,
          windowEnd: assignment.windowEnd || null,
        });
      }
    });

    // Calculate statistics
    const totalAssigned = assignments.length;
    const completed = completedAssignments.length;
    const pending = pendingAssignments.length;

    // Calculate average score
    const totalScore = completedAssignments.reduce((sum, a) => sum + a.score, 0);
    const averageScore = completed > 0 ? Math.round((totalScore / completed) * 100) / 100 : 0;

    res.json({
      success: true,
      category: formattedCategory,
      summary: {
        totalAssigned,
        completed,
        averageScore: `${averageScore}%`,
        pending,
      },
      completedAssignments,
      pendingAssignments,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/* ---------------------- Submissions — detailed compare -------------------- */


// ---- helpers reused here (same as in your controller) ----
function textMatchIgnoreCase_b(a, b) {
  const strA = (a ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  const strB = (b ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  return strA === strB;
}
function arraysMatchIgnoreOrder_b(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const A = a.map(v => (v ?? "").toString().trim().toLowerCase()).sort();
  const B = b.map(v => (v ?? "").toString().trim().toLowerCase()).sort();
  return A.every((v, i) => v === B[i]);
}
const hasNonEmptyText  = v => typeof v === "string" && v.trim() !== "";
const hasNonEmptyArray = v => Array.isArray(v) && v.length > 0;
const keyHasAny = (key = {}) =>
  hasNonEmptyText(key.patientName) ||
  hasNonEmptyText(key.ageOrDob) ||
  hasNonEmptyArray(key.icdCodes) ||
  hasNonEmptyArray(key.cptCodes) ||
  hasNonEmptyArray(key.pcsCodes) ||
  hasNonEmptyArray(key.hcpcsCodes) ||
  hasNonEmptyText(key.drgValue) ||
  hasNonEmptyArray(key.modifiers) ||
  hasNonEmptyText(key.notes) ||
  hasNonEmptyText(key.adx); // NEW: consider Adx

// utility: grade dynamic by questionText (ignores blanks)
function gradeDynamic(targetDynamics = [], submittedDynamics = []) {
  let correct = 0, wrong = 0, denom = 0;
  const out = [];
  for (const q of targetDynamics) {
    const valid = hasNonEmptyText(q?.questionText) && hasNonEmptyText(q?.answer);
    if (!valid) continue; // skip blank key items
    denom++;
    const match = submittedDynamics.find(sq =>
      textMatchIgnoreCase_b(sq?.questionText, q.questionText)
    );
    const submittedAnswer = match?.submittedAnswer ?? "";
    const isCorrect = textMatchIgnoreCase_b(q.answer, submittedAnswer);
    if (isCorrect) correct++; else wrong++;
    out.push({
      questionText: q.questionText,
      type: q.type || "dynamic",
      options: q.options || [],
      correctAnswer: q.answer,
      submittedAnswer,
      isCorrect,
      _id: match?._id
    });
  }
  return { correct, wrong, denom, enteredDynamics: out };
}


exports.getAssignmentSubmissions = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await Assignment.findById(assignmentId).lean();
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    const getSubModuleName = (defSub) =>
      defSub?.subModuleName || defSub?.name || defSub?.title || "";

    const parentAnswerKey = assignment?.answerKey || {};
    const submissions = await Submission.find({ assignmentId })
      .populate("studentId", "name courseName")
      .lean();

    const results = submissions.map((sub) => {
      let totalCorrect = 0;
      let totalWrong = 0;

      // Start with only answerKey copy; we'll fill enteredValues if parent submission exists
      const parentSummary = {
        enteredValues: null,
        answerKey: {
          patientName: parentAnswerKey.patientName ?? "",
          ageOrDob: parentAnswerKey.ageOrDob ?? "",
          icdCodes: parentAnswerKey.icdCodes ?? [],
          cptCodes: parentAnswerKey.cptCodes ?? [],
          pcsCodes: parentAnswerKey.pcsCodes ?? [],
          hcpcsCodes: parentAnswerKey.hcpcsCodes ?? [],
          drgValue: parentAnswerKey.drgValue ?? "",
          modifiers: parentAnswerKey.modifiers ?? [],
          notes: parentAnswerKey.notes ?? "",
          adx: parentAnswerKey.adx ?? "", // NEW
          dynamicQuestions: (assignment.dynamicQuestions ?? []).map(q => ({
            questionText: q.questionText,
            options: q.options ?? [],
            answer: q.answer,
            _id: q._id
          }))
        },
        correctCount: 0,
        wrongCount: 0,
        progressPercent: 0
      };

      const subModulesSummary = [];

      (sub.submittedAnswers || []).forEach((sa) => {
        const defSub = (assignment.subAssignments || []).find(
          (s) => sa.subAssignmentId && s._id.toString() === sa.subAssignmentId.toString()
        );

        // ================= CASE A: TRUE SUB-ASSIGNMENT =================
        if (defSub) {
          const defKey = defSub.answerKey || {};
          const targetDynamics = defSub.dynamicQuestions || [];

          let correctCount = 0;
          let wrongCount = 0;
          let denom = 0;

          // Prefer dynamic when present
          if (Array.isArray(targetDynamics) && targetDynamics.length > 0) {
            const { correct, wrong, denom: d, enteredDynamics } =
              gradeDynamic(targetDynamics, sa.dynamicQuestions || []);
            correctCount += correct; wrongCount += wrong; denom += d;

            // build summaries
            subModulesSummary.push({
              subAssignmentId: sa.subAssignmentId,
              subModuleName: getSubModuleName(defSub),
              enteredValues: {
                patientName: sa.patientName ?? null,
                ageOrDob: sa.ageOrDob ?? null,
                icdCodes: Array.isArray(sa.icdCodes) ? sa.icdCodes : [],
                cptCodes: Array.isArray(sa.cptCodes) ? sa.cptCodes : [],
                pcsCodes: Array.isArray(sa.pcsCodes) ? sa.pcsCodes : [],
                hcpcsCodes: Array.isArray(sa.hcpcsCodes) ? sa.hcpcsCodes : [],
                drgValue: sa.drgValue ?? null,
                modifiers: Array.isArray(sa.modifiers) ? sa.modifiers : [],
                notes: sa.notes ?? null,
                adx: sa.adx ?? null, // NEW: include student-entered Adx
                dynamicQuestions: enteredDynamics
              },
              answerKey: {
                patientName: defKey.patientName ?? "",
                ageOrDob: defKey.ageOrDob ?? "",
                icdCodes: defKey.icdCodes ?? [],
                cptCodes: defKey.cptCodes ?? [],
                pcsCodes: defKey.pcsCodes ?? [],
                hcpcsCodes: defKey.hcpcsCodes ?? [],
                drgValue: defKey.drgValue ?? "",
                modifiers: defKey.modifiers ?? [],
                notes: defKey.notes ?? "",
                adx: defKey.adx ?? "", // NEW
                dynamicQuestions: targetDynamics.map(q => ({
                  questionText: q.questionText,
                  options: q.options || [],
                  answer: q.answer,
                  _id: q._id
                }))
              },
              correctCount,
              wrongCount,
              progressPercent: denom > 0 ? Math.round((correctCount / denom) * 100) : 0
            });

            totalCorrect += correctCount; totalWrong += wrongCount;
            return; // done with CASE A (dynamic path)
          }

          // Otherwise grade answerKey BUT ONLY non-empty keys
          const add = (cond) => { denom++; cond ? correctCount++ : wrongCount++; };
          if (hasNonEmptyText(defKey.patientName)) add(textMatchIgnoreCase_b(sa.patientName, defKey.patientName));
          if (hasNonEmptyText(defKey.ageOrDob))   add(textMatchIgnoreCase_b(sa.ageOrDob, defKey.ageOrDob));
          if (hasNonEmptyArray(defKey.icdCodes))  add(arraysMatchIgnoreOrder_b(sa.icdCodes, defKey.icdCodes));
          if (hasNonEmptyArray(defKey.cptCodes))  add(arraysMatchIgnoreOrder_b(sa.cptCodes, defKey.cptCodes));
          if (hasNonEmptyArray(defKey.pcsCodes))  add(arraysMatchIgnoreOrder_b(sa.pcsCodes, defKey.pcsCodes));
          if (hasNonEmptyArray(defKey.hcpcsCodes))add(arraysMatchIgnoreOrder_b(sa.hcpcsCodes, defKey.hcpcsCodes));
          if (hasNonEmptyText(defKey.drgValue))   add(textMatchIgnoreCase_b(sa.drgValue, defKey.drgValue));
          if (hasNonEmptyArray(defKey.modifiers)) add(arraysMatchIgnoreOrder_b(sa.modifiers, defKey.modifiers));
          if (hasNonEmptyText(defKey.notes))      add(textMatchIgnoreCase_b(sa.notes, defKey.notes));
          if (hasNonEmptyText(defKey.adx))        add(textMatchIgnoreCase_b(sa.adx, defKey.adx)); // NEW

          subModulesSummary.push({
            subAssignmentId: sa.subAssignmentId,
            subModuleName: getSubModuleName(defSub),
            enteredValues: {
              patientName: sa.patientName ?? null,
              ageOrDob: sa.ageOrDob ?? null,
              icdCodes: Array.isArray(sa.icdCodes) ? sa.icdCodes : [],
              cptCodes: Array.isArray(sa.cptCodes) ? sa.cptCodes : [],
              pcsCodes: Array.isArray(sa.pcsCodes) ? sa.pcsCodes : [],
              hcpcsCodes: Array.isArray(sa.hcpcsCodes) ? sa.hcpcsCodes : [],
              drgValue: sa.drgValue ?? null,
              modifiers: Array.isArray(sa.modifiers) ? sa.modifiers : [],
              notes: sa.notes ?? null,
              adx: sa.adx ?? null, // NEW
              dynamicQuestions: [] // none graded in key path
            },
            answerKey: {
              patientName: defKey.patientName ?? "",
              ageOrDob: defKey.ageOrDob ?? "",
              icdCodes: defKey.icdCodes ?? [],
              cptCodes: defKey.cptCodes ?? [],
              pcsCodes: defKey.pcsCodes ?? [],
              hcpcsCodes: defKey.hcpcsCodes ?? [],
              drgValue: defKey.drgValue ?? "",
              modifiers: defKey.modifiers ?? [],
              notes: defKey.notes ?? "",
              adx: defKey.adx ?? "", // NEW
              dynamicQuestions: []
            },
            correctCount,
            wrongCount,
            progressPercent: denom > 0 ? Math.round((correctCount / denom) * 100) : 0
          });

          totalCorrect += correctCount; totalWrong += wrongCount;
          return;
        }
// ================= CASE B: PARENT-LEVEL ONLY =================
        const targetDynamics = assignment.dynamicQuestions || [];

        let pCorrect = 0, pWrong = 0, pDenom = 0;

        if (Array.isArray(targetDynamics) && targetDynamics.length > 0) {
          const { correct, wrong, denom, enteredDynamics } =
            gradeDynamic(targetDynamics, sa.dynamicQuestions || []);
          pCorrect += correct; pWrong += wrong; pDenom += denom;

          parentSummary.enteredValues = {
            patientName: sa.patientName ?? null,
            ageOrDob: sa.ageOrDob ?? null,
            icdCodes: Array.isArray(sa.icdCodes) ? sa.icdCodes : [],
            cptCodes: Array.isArray(sa.cptCodes) ? sa.cptCodes : [],
            pcsCodes: Array.isArray(sa.pcsCodes) ? sa.pcsCodes : [],
            hcpcsCodes: Array.isArray(sa.hcpcsCodes) ? sa.hcpcsCodes : [],
            drgValue: sa.drgValue ?? null,
            modifiers: Array.isArray(sa.modifiers) ? sa.modifiers : [],
            notes: sa.notes ?? null,
            adx: sa.adx ?? null, // NEW
            dynamicQuestions: enteredDynamics
          };
        } else if (keyHasAny(parentAnswerKey)) {
          // Grade only non-empty parent key fields
          const addP = (cond) => { pDenom++; cond ? pCorrect++ : pWrong++; };
          if (hasNonEmptyText(parentAnswerKey.patientName)) addP(textMatchIgnoreCase_b(sa.patientName, parentAnswerKey.patientName));
          if (hasNonEmptyText(parentAnswerKey.ageOrDob))   addP(textMatchIgnoreCase_b(sa.ageOrDob, parentAnswerKey.ageOrDob));
          if (hasNonEmptyArray(parentAnswerKey.icdCodes))  addP(arraysMatchIgnoreOrder_b(sa.icdCodes, parentAnswerKey.icdCodes));
          if (hasNonEmptyArray(parentAnswerKey.cptCodes))  addP(arraysMatchIgnoreOrder_b(sa.cptCodes, parentAnswerKey.cptCodes));
          if (hasNonEmptyArray(parentAnswerKey.pcsCodes))  addP(arraysMatchIgnoreOrder_b(sa.pcsCodes, parentAnswerKey.pcsCodes));
          if (hasNonEmptyArray(parentAnswerKey.hcpcsCodes))addP(arraysMatchIgnoreOrder_b(sa.hcpcsCodes, parentAnswerKey.hcpcsCodes));
          if (hasNonEmptyText(parentAnswerKey.drgValue))   addP(textMatchIgnoreCase_b(sa.drgValue, parentAnswerKey.drgValue));
          if (hasNonEmptyArray(parentAnswerKey.modifiers)) addP(arraysMatchIgnoreOrder_b(sa.modifiers, parentAnswerKey.modifiers));
          if (hasNonEmptyText(parentAnswerKey.notes))      addP(textMatchIgnoreCase_b(sa.notes, parentAnswerKey.notes));
          if (hasNonEmptyText(parentAnswerKey.adx))        addP(textMatchIgnoreCase_b(sa.adx, parentAnswerKey.adx)); // NEW

          parentSummary.enteredValues = {
            patientName: sa.patientName ?? null,
            ageOrDob: sa.ageOrDob ?? null,
            icdCodes: Array.isArray(sa.icdCodes) ? sa.icdCodes : [],
            cptCodes: Array.isArray(sa.cptCodes) ? sa.cptCodes : [],
            pcsCodes: Array.isArray(sa.pcsCodes) ? sa.pcsCodes : [],
            hcpcsCodes: Array.isArray(sa.hcpcsCodes) ? sa.hcpcsCodes : [],
            drgValue: sa.drgValue ?? null,
            modifiers: Array.isArray(sa.modifiers) ? sa.modifiers : [],
            notes: sa.notes ?? null,
            adx: sa.adx ?? null, // NEW
            dynamicQuestions: [] // none graded in key path
          };
        } else {
          parentSummary.enteredValues = {
            patientName: sa.patientName ?? null,
            ageOrDob: sa.ageOrDob ?? null,
            icdCodes: Array.isArray(sa.icdCodes) ? sa.icdCodes : [],
            cptCodes: Array.isArray(sa.cptCodes) ? sa.cptCodes : [],
            pcsCodes: Array.isArray(sa.pcsCodes) ? sa.pcsCodes : [],
            hcpcsCodes: Array.isArray(sa.hcpcsCodes) ? sa.hcpcsCodes : [],
            drgValue: sa.drgValue ?? null,
            modifiers: Array.isArray(sa.modifiers) ? sa.modifiers : [],
            notes: sa.notes ?? null,
            adx: sa.adx ?? null, // NEW
            dynamicQuestions: []
          };
        }

        parentSummary.correctCount = pCorrect;
        parentSummary.wrongCount = pWrong;
        parentSummary.progressPercent = pDenom > 0 ? Math.round((pCorrect / pDenom) * 100) : 0;

        totalCorrect += pCorrect;
        totalWrong += pWrong;
      });

      const overallProgress =
        totalCorrect + totalWrong > 0
          ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100)
          : 0;

      return {
        studentId: sub.studentId?._id || null,
        studentName: sub.studentId?.name || null,
        courseName: sub.studentId?.courseName || null,
        assignmentId: sub.assignmentId,
        totalCorrect,
        totalWrong,
        overallProgress,
        parentSummary,
        subModulesSummary,
        submissionDate: sub.submissionDate || null,
      };
    });

    res.json({
      assignmentId,
      moduleName: assignment.moduleName,
      windowStart: assignment.windowStart || null,
      windowEnd: assignment.windowEnd || null,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

        