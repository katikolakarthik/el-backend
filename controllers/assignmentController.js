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
