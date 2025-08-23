const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const mongoose = require("mongoose");


exports.addAssignment = async (req, res) => {
  try {
    const { moduleName, subAssignments, category } = req.body;
    const files = req.files?.assignmentPdf || [];

    if (!category || !category.trim()) {
      return res.status(400).json({ success: false, message: "category is required" });
    }

    let assignmentData = {
      moduleName,
      category: category.trim(),
      // assignedStudents is deprecated; ignore any incoming values
    };

    if (subAssignments) {
      const parsed = JSON.parse(subAssignments);

      // Helper: Format dynamic questions (MCQ or text)
      const formatDynamic = (questions) =>
        (questions || []).map((q) => ({
          questionText: q.questionText,
          options: q.options || [],
          answer: q.answer
        }));

      // Helper: Format predefined answers
      const formatPredefined = (sub) => ({
        patientName: sub.answerPatientName || null,
        ageOrDob: sub.answerAgeOrDob || null,
        icdCodes: sub.answerIcdCodes ? sub.answerIcdCodes.split(",") : [],
        cptCodes: sub.answerCptCodes ? sub.answerCptCodes.split(",") : [],
        notes: sub.answerNotes || null
      });

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
              assignmentPdf: pdfPath
            };
          } else {
            return {
              subModuleName: sub.subModuleName || `${moduleName} - Sub ${index + 1}`,
              assignmentPdf: pdfPath,
              answerKey: formatPredefined(sub)
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
      assignment
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};




// Get all assignments with merged question format
exports.getAssignments = async (req, res) => {
try {
const assignments = await Assignment.find().populate("assignedStudents");

// Helper: format predefined questions          
const formatPredefined = (answerKey) => {          
  if (!answerKey) return [];          
  const hasData =          
    answerKey.patientName ||          
    answerKey.ageOrDob ||          
    (answerKey.icdCodes && answerKey.icdCodes.length) ||          
    (answerKey.cptCodes && answerKey.cptCodes.length) ||          
    answerKey.notes;          
      
  return hasData          
    ? [{          
        type: "predefined",          
        answerKey          
      }]          
    : [];          
};          
      
// Helper: format dynamic questions (with MCQ options + on-the-fly dynamicAnswerKey)          
const formatDynamic = (dynamicQuestions) => {          
  if (!dynamicQuestions || !dynamicQuestions.length) return [];          
  return dynamicQuestions.map(q => ({          
    type: "dynamic",          
    questionText: q.questionText,          
    options: q.options || [],          
    answer: q.answer          
  }));          
};          
      
const formatted = assignments.map(a => ({          
  _id: a._id,          
  moduleName: a.moduleName,          
  assignedStudents: a.assignedStudents,          
  assignedDate: a.assignedDate,          
  assignmentPdf: a.assignmentPdf || null,          
      
  // Merged questions (parent level)          
  questions: [          
    ...formatPredefined(a.answerKey),          
    ...formatDynamic(a.dynamicQuestions)          
  ],          
      
  // On-the-fly dynamicAnswerKey (parent level)          
  dynamicAnswerKey: a.dynamicQuestions?.map(q => ({          
    questionText: q.questionText,          
    answer: q.answer          
  })) || [],          
      
  // Sub-assignments          
  subAssignments: a.subAssignments.map(sa => ({          
    _id: sa._id,          
    subModuleName: sa.subModuleName,          
    assignmentPdf: sa.assignmentPdf || null,          
      
    questions: [          
      ...formatPredefined(sa.answerKey),          
      ...formatDynamic(sa.dynamicQuestions)          
    ],          
      
    // On-the-fly dynamicAnswerKey (sub-assignment level)          
    dynamicAnswerKey: sa.dynamicQuestions?.map(q => ({          
      questionText: q.questionText,          
      answer: q.answer          
    })) || []          
  }))          
}));          
      
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
      sub => sub._id.toString() !== subId
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
      deletedCount: result.deletedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update assignment module
exports.updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { moduleName, assignedStudents, subAssignments } = req.body;
    const files = req.files?.assignmentPdf || [];

    // Find the existing assignment
    const existingAssignment = await Assignment.findById(id);
    if (!existingAssignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    // Prepare update data
    let updateData = {
      moduleName,
      assignedStudents: assignedStudents ? assignedStudents.split(",") : []
    };

    if (subAssignments) {
      const parsed = JSON.parse(subAssignments);

      // Helper: Format dynamic questions (MCQ or text)
      const formatDynamic = (questions) => questions.map(q => ({
        _id: q._id || new mongoose.Types.ObjectId(), // Preserve existing ID or create new one
        questionText: q.questionText,
        options: q.options || [],
        answer: q.answer
      }));

      // Helper: Format predefined answers
      const formatPredefined = (sub) => ({
        patientName: sub.answerPatientName || null,
        ageOrDob: sub.answerAgeOrDob || null,
        icdCodes: sub.answerIcdCodes ? sub.answerIcdCodes.split(",") : [],
        cptCodes: sub.answerCptCodes ? sub.answerCptCodes.split(",") : [],
        notes: sub.answerNotes || null
      });

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
              answerKey: null // Clear predefined answers
            };
          } else {
            return {
              _id: sub._id || new mongoose.Types.ObjectId(), // Preserve existing ID or create new one
              subModuleName: sub.subModuleName || `${moduleName} - Sub ${index + 1}`,
              assignmentPdf: pdfPath || sub.assignmentPdf, // Keep existing PDF if no new one
              answerKey: formatPredefined(sub),
              dynamicQuestions: [] // Clear dynamic questions
            };
          }
        });
      }
    }

    // Update the assignment
    const updatedAssignment = await Assignment.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate("assignedStudents");

    res.json({
      success: true,
      message: "Assignment updated successfully",
      assignment: updatedAssignment
    });
  } catch (err) {
    console.error("Update assignment error:", err);
    res.status(500).json({ error: err.message });
  }
};


// Get only parent assignments assigned to a specific student
// Example update in getAssignmentsByStudentId


exports.getAssignmentsByStudentId = async (req, res) => {
  try {
    const { studentId } = req.params;

    // 1. Get all assignments for this student
    const assignments = await Assignment.find(
      { assignedStudents: studentId },
      {
        moduleName: 1,
        assignedDate: 1,
        subAssignments: 1
      }
    ).lean();

    // 2. Get all submissions by this student
    const submissions = await Submission.find({ studentId }).lean();

    const processedAssignments = assignments.map(ass => {
      // find this student's submission for the assignment
      const studentSubmission = submissions.find(
        sub => sub.assignmentId.toString() === ass._id.toString()
      );

      const subStatuses = (ass.subAssignments || []).map(sub => {
        const submittedSub = studentSubmission?.submittedAnswers?.find(
          ans => ans.subAssignmentId?.toString() === sub._id.toString()
        );
        return {
          ...sub,
          isCompleted: !!submittedSub
        };
      });

      const parentCompleted =
        subStatuses.length > 0
          ? subStatuses.every(sub => sub.isCompleted)
          : !!studentSubmission; // if no subAssignments, check if any parent-level submission exists

      return {
        ...ass,
        subAssignments: subStatuses,
        isCompleted: parentCompleted
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
      assignedStudents: studentId
    }).populate("assignedStudents");

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found or not assigned to this student"
      });
    }

    // Helper: format predefined answers
    const formatPredefined = (answerKey) => {
      if (!answerKey) return [];
      const hasData =
        answerKey.patientName ||
        answerKey.ageOrDob ||
        (answerKey.icdCodes && answerKey.icdCodes.length) ||
        (answerKey.cptCodes && answerKey.cptCodes.length) ||
        answerKey.notes;

      return hasData
        ? [{
            type: "predefined",
            answerKey
          }]
        : [];
    };

    // Helper: format dynamic questions
    const formatDynamic = (dynamicQuestions) => {
      if (!dynamicQuestions || !dynamicQuestions.length) return [];
      return dynamicQuestions.map(q => ({
        type: "dynamic",
        questionText: q.questionText,
        options: q.options || [],
        answer: q.answer
      }));
    };

    // Prepare the response
    const formattedAssignment = {
      _id: assignment._id,
      moduleName: assignment.moduleName,
      assignedStudents: assignment.assignedStudents,
      assignedDate: assignment.assignedDate,
      assignmentPdf: assignment.assignmentPdf || null,

      // Parent-level questions
      questions: [
        ...formatPredefined(assignment.answerKey),
        ...formatDynamic(assignment.dynamicQuestions)
      ],
      dynamicAnswerKey: assignment.dynamicQuestions?.map(q => ({
        questionText: q.questionText,
        answer: q.answer
      })) || [],

      // Sub-assignments
      subAssignments: assignment.subAssignments.map(sa => ({
        _id: sa._id,
        subModuleName: sa.subModuleName,
        assignmentPdf: sa.assignmentPdf || null,
        questions: [
          ...formatPredefined(sa.answerKey),
          ...formatDynamic(sa.dynamicQuestions)
        ],
        dynamicAnswerKey: sa.dynamicQuestions?.map(q => ({
          questionText: q.questionText,
          answer: q.answer
        })) || []
      }))
    };

    res.json({
      success: true,
      assignment: formattedAssignment
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Get all assignments by category
// Get all assignments by category
exports.getAssignmentsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { studentId } = req.query; // Get studentId from query params

    if (!category) {  
      return res.status(400).json({  
        success: false,  
        message: "Category parameter is required"  
      });  
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "Student ID is required to check completion status"
      });
    }

    // Find all assignments for the given category  
    const assignments = await Assignment.find({   
      category: category.trim().toUpperCase()   
    }).populate("assignedStudents");

    if (!assignments || assignments.length === 0) {  
      return res.status(404).json({  
        success: false,  
        message: `No assignments found for category: ${category}`  
      });  
    }

    // Check submissions for this student
    const submissions = await Submission.find({
      studentId: studentId,
      assignmentId: { $in: assignments.map(a => a._id) }
    });

    // Helper: format predefined answers  
    const formatPredefined = (answerKey) => {  
      if (!answerKey) return [];  
      const hasData =  
        answerKey.patientName ||  
        answerKey.ageOrDob ||  
        (answerKey.icdCodes && answerKey.icdCodes.length) ||  
        (answerKey.cptCodes && answerKey.cptCodes.length) ||  
        answerKey.notes;  

      return hasData  
        ? [{  
            type: "predefined",  
            answerKey  
          }]  
        : [];  
    };

    // Helper: format dynamic questions  
    const formatDynamic = (dynamicQuestions) => {  
      if (!dynamicQuestions || !dynamicQuestions.length) return [];  
      return dynamicQuestions.map(q => ({  
        type: "dynamic",  
        questionText: q.questionText,  
        options: q.options || [],  
        answer: q.answer  
      }));  
    };

    // Helper: check if parent assignment is completed
    const isParentCompleted = (assignmentId) => {
      const submission = submissions.find(sub => 
        sub.assignmentId.toString() === assignmentId.toString()
      );
      return !!submission;
    };

    // Helper: check if sub-assignment is completed
    const isSubAssignmentCompleted = (assignmentId, subAssignmentId) => {
      const submission = submissions.find(sub => 
        sub.assignmentId.toString() === assignmentId.toString()
      );
      
      if (!submission) return false;
      
      return submission.submittedAnswers.some(answer => 
        answer.subAssignmentId.toString() === subAssignmentId.toString()
      );
    };

    // Format all assignments for response  
    const formattedAssignments = assignments.map(assignment => {
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
          ...formatPredefined(assignment.answerKey),  
          ...formatDynamic(assignment.dynamicQuestions)  
        ],
        dynamicAnswerKey: assignment.dynamicQuestions?.map(q => ({  
          questionText: q.questionText,  
          answer: q.answer  
        })) || [],  

        // Sub-assignments  
        subAssignments: assignment.subAssignments.map(sa => ({
          _id: sa._id,
          subModuleName: sa.subModuleName,
          assignmentPdf: sa.assignmentPdf || null,
          isCompleted: isSubAssignmentCompleted(assignment._id, sa._id), // Sub-assignment completion status
          questions: [  
            ...formatPredefined(sa.answerKey),  
            ...formatDynamic(sa.dynamicQuestions)  
          ],
          dynamicAnswerKey: sa.dynamicQuestions?.map(q => ({  
            questionText: q.questionText,  
            answer: q.answer  
          })) || []  
        }))  
      };
    });

    res.json({  
      success: true,  
      count: formattedAssignments.length,  
      category: category.toUpperCase(),  
      assignments: formattedAssignments  
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
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
        message: "Category parameter is required"
      });
    }

    // Count assignments for the given category
    const count = await Assignment.countDocuments({ 
      category: category.trim().toUpperCase() 
    });

    res.json({
      success: true,
      category: category.toUpperCase(),
      totalAssignments: count
    });

  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};


// Get assignment statistics for a student by category
exports.getAssignmentStatsByCategory = async (req, res) => {
  try {
    const { category, studentId } = req.params;

    if (!category || !studentId) {
      return res.status(400).json({
        success: false,
        message: "Category and studentId parameters are required"
      });
    }

    // Validate studentId
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studentId format"
      });
    }

    const formattedCategory = category.trim().toUpperCase();

    // Get all assignments for the category
    const assignments = await Assignment.find({ 
      category: formattedCategory 
    });

    if (!assignments || assignments.length === 0) {
      return res.json({
        success: true,
        category: formattedCategory,
        totalAssigned: 0,
        completed: 0,
        averageScore: 0,
        pending: 0,
        message: "No assignments found for this category"
      });
    }

    // Get all submissions for this student and category
    const submissions = await Submission.find({
      studentId: new mongoose.Types.ObjectId(studentId),
      assignmentId: { $in: assignments.map(a => a._id) }
    });

    // Calculate statistics
    const totalAssigned = assignments.length;
    const completed = submissions.length;
    const pending = totalAssigned - completed;

    // Calculate average score
    let totalScore = 0;
    let totalSubmissionsWithScore = 0;

    submissions.forEach(submission => {
      if (submission.overallProgress !== undefined && submission.overallProgress !== null) {
        totalScore += submission.overallProgress;
        totalSubmissionsWithScore++;
      }
    });

    const averageScore = totalSubmissionsWithScore > 0 
      ? Math.round((totalScore / totalSubmissionsWithScore) * 100) / 100 
      : 0;

    res.json({
      success: true,
      category: formattedCategory,
      totalAssigned,
      completed,
      averageScore: `${averageScore}%`,
      pending,
      stats: {
        assigned: totalAssigned,
        completed: completed,
        averageScore: averageScore,
        pending: pending
      }
    });

  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};

// Alternative: Get detailed statistics including assignment lists
exports.getDetailedAssignmentStats = async (req, res) => {
  try {
    const { category, studentId } = req.params;

    if (!category || !studentId) {
      return res.status(400).json({
        success: false,
        message: "Category and studentId parameters are required"
      });
    }

    const formattedCategory = category.trim().toUpperCase();

    // Get all assignments for the category
    const assignments = await Assignment.find({ 
      category: formattedCategory 
    });

    // Get all submissions for this student and category
    const submissions = await Submission.find({
      studentId: new mongoose.Types.ObjectId(studentId),
      assignmentId: { $in: assignments.map(a => a._id) }
    }).populate('assignmentId');

    // Create a map of assignmentId to submission for quick lookup
    const submissionMap = {};
    submissions.forEach(sub => {
      submissionMap[sub.assignmentId._id.toString()] = sub;
    });

    // Categorize assignments
    const completedAssignments = [];
    const pendingAssignments = [];

    assignments.forEach(assignment => {
      const submission = submissionMap[assignment._id.toString()];
      if (submission) {
        completedAssignments.push({
          assignment: assignment.moduleName,
          score: submission.overallProgress || 0,
          submissionDate: submission.submissionDate
        });
      } else {
        pendingAssignments.push({
          assignment: assignment.moduleName,
          assignedDate: assignment.assignedDate
        });
      }
    });

    // Calculate statistics
    const totalAssigned = assignments.length;
    const completed = completedAssignments.length;
    const pending = pendingAssignments.length;

    // Calculate average score
    const totalScore = completedAssignments.reduce((sum, assignment) => sum + assignment.score, 0);
    const averageScore = completed > 0 ? Math.round((totalScore / completed) * 100) / 100 : 0;

    res.json({
      success: true,
      category: formattedCategory,
      summary: {
        totalAssigned,
        completed,
        averageScore: `${averageScore}%`,
        pending
      },
      completedAssignments,
      pendingAssignments
    });

  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};


// Helpers
function textMatchIgnoreCase(a, b) {
  const strA = (a ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  const strB = (b ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  return strA === strB;
}

function arraysMatchIgnoreOrder(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sortedA = a.map(v => (v ?? "").toString().trim().toLowerCase()).sort();
  const sortedB = b.map(v => (v ?? "").toString().trim().toLowerCase()).sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}






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
            notes: "",
          };

          // Compare dynamic questions (index-based)
          const comparedDynamic = (sa.dynamicQuestions || []).map((dq, idx) => {
            const defQ = (defSub.dynamicQuestions || [])[idx];
            const isCorrect = defQ
              ? textMatchIgnoreCase(dq.submittedAnswer, defQ.answer)
              : false;
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
              notes: sa.notes ?? null,
              dynamicQuestions: comparedDynamic.map((d) => d.entered),
            },
            answerKey: {
              patientName: defKey.patientName ?? "",
              ageOrDob: defKey.ageOrDob ?? "",
              icdCodes: defKey.icdCodes ?? [],
              cptCodes: defKey.cptCodes ?? [],
              notes: defKey.notes ?? "",
              dynamicQuestions: comparedDynamic
                .map((d) => d.key)
                .filter(Boolean),
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
        // No matching sub-assignment -> treat this as the parent-level submission.
        // Compare against parentAnswerKey and fill parentSummary.enteredValues
        const parentComparedDynamic = (sa.dynamicQuestions || []).map((dq, idx) => {
          // Prefer assignment-level explicit dynamicQuestions; else use answerKey's
          const defQ =
            (assignment.dynamicQuestions || [])[idx] ||
            (parentAnswerKey.dynamicQuestions || [])[idx];
          const isCorrect = defQ
            ? textMatchIgnoreCase(dq.submittedAnswer, defQ.answer)
            : false;
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

        if (textMatchIgnoreCase(sa.notes, parentAnswerKey.notes)) pCorrect++;
        else pWrong++;

        parentComparedDynamic.forEach((d) => (d.isCorrect ? pCorrect++ : pWrong++));

        const pProgress =
          pCorrect + pWrong > 0
            ? Math.round((pCorrect / (pCorrect + pWrong)) * 100)
            : 0;

        parentSummary.enteredValues = {
          patientName: sa.patientName ?? null,
          ageOrDob: sa.ageOrDob ?? null,
          icdCodes: Array.isArray(sa.icdCodes) ? sa.icdCodes : [],
          cptCodes: Array.isArray(sa.cptCodes) ? sa.cptCodes : [],
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