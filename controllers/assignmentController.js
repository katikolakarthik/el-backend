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
    answerKey.notes
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
exports.addAssignment = async (req, res) => {
  try {
    const { moduleName, subAssignments, category } = req.body;
    const files = req.files?.assignmentPdf || [];

    if (!category || !category.trim()) {
      return res.status(400).json({ success: false, message: "category is required" });
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
    });

    let assignmentData = {
      moduleName,
      category: toUpperTrim(category), // normalize to uppercase for consistency
      // assignedStudents is deprecated; ignore any incoming values
    };

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
        "Assignment saved to category successfully (supports predefined, text, and MCQ dynamic questions)",
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

      // Parent level data
      answerKey: assignment.answerKey || null,
      dynamicQuestions: assignment.dynamicQuestions || [],

      // Sub-assignments
      subAssignments: assignment.subAssignments?.map((sa) => ({
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

// Update assignment module
exports.updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { moduleName, assignedStudents, subAssignments, category } = req.body;
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
    });

    // Prepare update data
    let updateData = {
      moduleName,
      assignedStudents: assignedStudents ? assignedStudents.split(",") : [],
    };

    if (category) {
      updateData.category = toUpperTrim(category);
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

    // ---- SETTINGS (CHANGED) ----
    const REQUIRE_100_EACH_SUB = false;      // was true; this was causing your “only 1 completed”
    const NO_SUB_MIN_PROGRESS   = 0;         // no-sub parent counts as soon as there’s a submission
    const USE_OVERALL_FOR_MULTI_SUB = true;  // if overallProgress exists, allow it to mark completion
    const MULTI_SUB_MIN_OVERALL = 0;         // threshold for overallProgress to count as complete
    // ----------------------------

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
        complete = prog >= NO_SUB_MIN_PROGRESS; // (CHANGED)
      } else {
        // With subs:
        const answers = Array.isArray(subm.submittedAnswers) ? subm.submittedAnswers : [];
        const uniqueCovered = new Set(
          answers.map(sa => sa?.subAssignmentId ? String(sa.subAssignmentId) : null).filter(Boolean)
        );
        const coversAllByIds   = uniqueCovered.size >= subCount;     // (CHANGED) allow >= in case of dup
        const coversAllByCount = answers.length   >= subCount;       // (CHANGED) fallback when ids missing

        if (coversAllByIds || coversAllByCount) {
          if (REQUIRE_100_EACH_SUB) {
            complete = answers.every(sa => Number(sa?.progressPercent) === 100);
          } else {
            complete = true; // (CHANGED) mark as completed once all subs answered (any score)
          }
        } else if (USE_OVERALL_FOR_MULTI_SUB) {
          const overall = Number(subm.overallProgress ?? 0);
          if (Number.isFinite(overall) && overall >= MULTI_SUB_MIN_OVERALL) {
            complete = true; // (CHANGED) rescue path when subAssignmentId isn’t stored
          }
        }
      }

      completionByAssignment.set(aId, complete);

      const prog = Number(subm.overallProgress);
      if (Number.isFinite(prog)) scoreByAssignment.set(aId, prog);
    }

    // Count how many parents have ANY submission (useful for debugging your case)
    const submittedParents = latestSubmissionByAssignment.size; // (NEW)

    const completed = Array.from(completionByAssignment.values()).filter(Boolean).length;
    const pending = totalAssigned - completed;

    // Average over completed parents (change if you prefer all submissions)
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
      debug: { submittedParents } // (optional) remove once verified
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
        });
      } else {
        pendingAssignments.push({
          assignment: assignment.moduleName,
          assignedDate: assignment.assignedDate,
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

exports.getAssignmentSubmissions = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await Assignment.findById(assignmentId).lean();
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    const getSubModuleName = (defSub) =>
      defSub?.subModuleName || defSub?.name || defSub?.title || "";

    const parentAnswerKey = assignment?.answerKey || {
      patientName: "",
      ageOrDob: "",
      icdCodes: [],
      cptCodes: [],
      pcsCodes: [],
      hcpcsCodes: [],
      drgValue: "",
      modifiers: [],
      notes: "",
      dynamicQuestions: [],
    };

    const submissions = await Submission.find({ assignmentId })
      .populate("studentId", "name courseName")
      .lean();

    const results = submissions.map((sub) => {
      let totalCorrect = 0;
      let totalWrong = 0;

      // Initialize parent summary with only the answerKey
      const parentSummary = {
        enteredValues: null, // will be filled if we detect a parent-level entry
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
          dynamicQuestions: (parentAnswerKey.dynamicQuestions ?? []).map((q) => ({
            questionText: q.questionText,
            options: q.options ?? [],
            answer: q.answer,
            _id: q._id,
          })),
        },
        correctCount: 0,
        wrongCount: 0,
        progressPercent: 0,
      };

      const subModulesSummary = [];

      // For each submitted "answer group"
      (sub.submittedAnswers || []).forEach((sa) => {
        // Try to resolve as a sub-assignment
        const defSub = (assignment.subAssignments || []).find(
          (s) => sa.subAssignmentId && s._id.toString() === sa.subAssignmentId.toString()
        );

        // ---------- CASE A: TRUE SUB-ASSIGNMENT ----------
        if (defSub) {
          const defKey = defSub.answerKey || {
            patientName: "",
            ageOrDob: "",
            icdCodes: [],
            cptCodes: [],
            pcsCodes: [],
            hcpcsCodes: [],
            drgValue: "",
            modifiers: [],
            notes: "",
          };

          // Compare dynamic questions (index-based)
          const comparedDynamic = (sa.dynamicQuestions || []).map((dq, idx) => {
            const defQ = (defSub.dynamicQuestions || [])[idx];
            const isCorrect = defQ ? textMatchIgnoreCase(dq.submittedAnswer, defQ.answer) : false;
            return {
              entered: {
                questionText: defQ?.questionText || dq.questionText,
                type: dq.type || "dynamic",
                options: defQ?.options || dq.options || [],
                correctAnswer: defQ?.answer ?? null,
                submittedAnswer: dq.submittedAnswer ?? null,
                isCorrect,
                _id: dq._id,
              },
              key: defQ
                ? {
                    questionText: defQ.questionText,
                    options: defQ.options || [],
                    answer: defQ.answer,
                    _id: defQ._id,
                  }
                : null,
              isCorrect,
            };
          });

          let correctCount = 0;
          let wrongCount = 0;

          if (textMatchIgnoreCase(sa.patientName, defKey.patientName)) correctCount++;
          else wrongCount++;

          if (textMatchIgnoreCase(sa.ageOrDob, defKey.ageOrDob)) correctCount++;
          else wrongCount++;

          if (arraysMatchIgnoreOrder(sa.icdCodes, defKey.icdCodes)) correctCount++;
          else wrongCount++;

          if (arraysMatchIgnoreOrder(sa.cptCodes, defKey.cptCodes)) correctCount++;
          else wrongCount++;

          if (arraysMatchIgnoreOrder(sa.pcsCodes, defKey.pcsCodes)) correctCount++;
          else wrongCount++;

          if (arraysMatchIgnoreOrder(sa.hcpcsCodes, defKey.hcpcsCodes)) correctCount++;
          else wrongCount++;

          if (textMatchIgnoreCase(sa.drgValue, defKey.drgValue)) correctCount++;
          else wrongCount++;

          if (arraysMatchIgnoreOrder(sa.modifiers, defKey.modifiers)) correctCount++;
          else wrongCount++;

          if (textMatchIgnoreCase(sa.notes, defKey.notes)) correctCount++;
          else wrongCount++;

          comparedDynamic.forEach((d) => (d.isCorrect ? correctCount++ : wrongCount++));

          const progressPercent =
            correctCount + wrongCount > 0
              ? Math.round((correctCount / (correctCount + wrongCount)) * 100)
              : 0;

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
              dynamicQuestions: comparedDynamic.map((d) => d.entered),
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
              dynamicQuestions: comparedDynamic.map((d) => d.key).filter(Boolean),
            },
            correctCount,
            wrongCount,
            progressPercent,
          });

          totalCorrect += correctCount;
          totalWrong += wrongCount;
          return; // done with CASE A
        }

        // ---------- CASE B: PARENT-LEVEL ONLY ----------
        // Compare against parentAnswerKey and fill parentSummary.enteredValues
        const parentComparedDynamic = (sa.dynamicQuestions || []).map((dq, idx) => {
          // Prefer assignment-level explicit dynamicQuestions; else use answerKey's
          const defQ =
            (assignment.dynamicQuestions || [])[idx] ||
            (parentAnswerKey.dynamicQuestions || [])[idx];
          const isCorrect = defQ ? textMatchIgnoreCase(dq.submittedAnswer, defQ.answer) : false;
          return {
            entered: {
              questionText: defQ?.questionText || dq.questionText,
              type: dq.type || "dynamic",
              options: defQ?.options || dq.options || [],
              correctAnswer: defQ?.answer ?? null,
              submittedAnswer: dq.submittedAnswer ?? null,
              isCorrect,
              _id: dq._id,
            },
            isCorrect,
          };
        });

        let pCorrect = 0;
        let pWrong = 0;

        if (textMatchIgnoreCase(sa.patientName, parentAnswerKey.patientName)) pCorrect++;
        else pWrong++;

        if (textMatchIgnoreCase(sa.ageOrDob, parentAnswerKey.ageOrDob)) pCorrect++;
        else pWrong++;

        if (arraysMatchIgnoreOrder(sa.icdCodes, parentAnswerKey.icdCodes)) pCorrect++;
        else pWrong++;

        if (arraysMatchIgnoreOrder(sa.cptCodes, parentAnswerKey.cptCodes)) pCorrect++;
        else pWrong++;

        if (arraysMatchIgnoreOrder(sa.pcsCodes, parentAnswerKey.pcsCodes)) pCorrect++;
        else pWrong++;

        if (arraysMatchIgnoreOrder(sa.hcpcsCodes, parentAnswerKey.hcpcsCodes)) pCorrect++;
        else pWrong++;

        if (textMatchIgnoreCase(sa.drgValue, parentAnswerKey.drgValue)) pCorrect++;
        else pWrong++;

        if (arraysMatchIgnoreOrder(sa.modifiers, parentAnswerKey.modifiers)) pCorrect++;
        else pWrong++;

        if (textMatchIgnoreCase(sa.notes, parentAnswerKey.notes)) pCorrect++;
        else pWrong++;

        parentComparedDynamic.forEach((d) => (d.isCorrect ? pCorrect++ : pWrong++));

        const pProgress =
          pCorrect + pWrong > 0 ? Math.round((pCorrect / (pCorrect + pWrong)) * 100) : 0;

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
          dynamicQuestions: parentComparedDynamic.map((d) => d.entered),
        };
        parentSummary.correctCount = pCorrect;
        parentSummary.wrongCount = pWrong;
        parentSummary.progressPercent = pProgress;

        totalCorrect += pCorrect;
        totalWrong += pWrong;

        // IMPORTANT: do NOT push anything into subModulesSummary here.
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
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};