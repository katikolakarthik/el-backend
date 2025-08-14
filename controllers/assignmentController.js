const Assignment = require("../models/Assignment");


exports.addAssignment = async (req, res) => {
  try {
    const { moduleName, assignedStudents, subAssignments, dynamicQuestions } = req.body;
    const files = req.files?.assignmentPdf || [];

    let assignmentData = {
      moduleName,
      assignedStudents: assignedStudents ? assignedStudents.split(",") : []
    };

    // Handle dynamic questions at assignment level
    if (dynamicQuestions) {
      const parsedDynamic = JSON.parse(dynamicQuestions);
      assignmentData.dynamicQuestions = parsedDynamic.map(q => ({
        questionText: q.questionText,
        answer: q.answer
      }));
      assignmentData.dynamicAnswerKey = parsedDynamic.map(q => ({
        questionText: q.questionText,
        answer: q.answer
      }));
    }

    // Handle predefined or subAssignments
    if (subAssignments) {
      const parsed = JSON.parse(subAssignments);

      if (parsed.length === 1 && !parsed[0].isDynamic) {
        const single = parsed[0];
        assignmentData.assignmentPdf = files[0]
          ? files[0].path || files[0].url || files[0].secure_url || null
          : null;
        assignmentData.answerKey = {
          patientName: single.answerPatientName || null,
          ageOrDob: single.answerAgeOrDob || null,
          icdCodes: single.answerIcdCodes ? single.answerIcdCodes.split(",") : [],
          cptCodes: single.answerCptCodes ? single.answerCptCodes.split(",") : [],
          notes: single.answerNotes || null
        };
      } else {
        assignmentData.subAssignments = parsed.map((sub, index) => {
          if (sub.isDynamic) {
            return {
              subModuleName: sub.subModuleName || `${moduleName} - Sub ${index + 1}`,
              dynamicQuestions: sub.questions.map(q => ({
                questionText: q.questionText,
                answer: q.answer
              })),
              dynamicAnswerKey: sub.questions.map(q => ({
                questionText: q.questionText,
                answer: q.answer
              })),
              assignmentPdf: files[index]
                ? files[index].path || files[index].url || files[index].secure_url || null
                : null
            };
          } else {
            return {
              subModuleName: sub.subModuleName || `${moduleName} - Sub ${index + 1}`,
              patientName: null,
              ageOrDob: null,
              icdCodes: [],
              cptCodes: [],
              notes: null,
              assignmentPdf: files[index]
                ? files[index].path || files[index].url || files[index].secure_url || null
                : null,
              answerKey: {
                patientName: sub.answerPatientName || null,
                ageOrDob: sub.answerAgeOrDob || null,
                icdCodes: sub.answerIcdCodes ? sub.answerIcdCodes.split(",") : [],
                cptCodes: sub.answerCptCodes ? sub.answerCptCodes.split(",") : [],
                notes: sub.answerNotes || null
              }
            };
          }
        });
      }
    }

    const assignment = new Assignment(assignmentData);
    await assignment.save();

    res.json({
      success: true,
      message: "Assignment saved with predefined and/or dynamic questions",
      assignment
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// Get all assignments

// Get all assignments with merged question format
exports.getAssignments = async (req, res) => {
  try {
    const assignments = await Assignment.find().populate("assignedStudents");

    const formatted = assignments.map(a => {
      return {
        _id: a._id,
        moduleName: a.moduleName,
        assignedStudents: a.assignedStudents,
        assignedDate: a.assignedDate,
        assignmentPdf: a.assignmentPdf || null,

        // Merge predefined and dynamic at parent level
        questions: [
          // Predefined fields (if any)
          ...(a.answerKey && (
            a.answerKey.patientName ||
            a.answerKey.ageOrDob ||
            (a.answerKey.icdCodes && a.answerKey.icdCodes.length) ||
            (a.answerKey.cptCodes && a.answerKey.cptCodes.length) ||
            a.answerKey.notes
          ) ? [{
            type: "predefined",
            answerKey: a.answerKey
          }] : []),

          // Dynamic questions (if any)
          ...(a.dynamicQuestions?.length
            ? a.dynamicQuestions.map(q => ({
                type: "dynamic",
                questionText: q.questionText,
                answer: q.answer
              }))
            : [])
        ],

        subAssignments: a.subAssignments.map(sa => ({
          _id: sa._id,
          subModuleName: sa.subModuleName,
          assignmentPdf: sa.assignmentPdf || null,

          questions: [
            // Predefined sub-assignment
            ...(sa.answerKey && (
              sa.answerKey.patientName ||
              sa.answerKey.ageOrDob ||
              (sa.answerKey.icdCodes && sa.answerKey.icdCodes.length) ||
              (sa.answerKey.cptCodes && sa.answerKey.cptCodes.length) ||
              sa.answerKey.notes
            ) ? [{
              type: "predefined",
              answerKey: sa.answerKey
            }] : []),

            // Dynamic sub-assignment
            ...(sa.dynamicQuestions?.length
              ? sa.dynamicQuestions.map(q => ({
                  type: "dynamic",
                  questionText: q.questionText,
                  answer: q.answer
                }))
              : [])
          ]
        }))
      };
    });

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


// Get only parent assignments assigned to a specific student
exports.getAssignmentsByStudentId = async (req, res) => {
  try {
    const { studentId } = req.params;

    const assignments = await Assignment.find(
      { assignedStudents: studentId },
      { moduleName: 1, assignedDate: 1 } // projection to only include needed fields
    )
      .sort({ assignedDate: -1 }) // latest first
      .lean();

    if (!assignments || assignments.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No assignments found for this student"
      });
    }

    res.json({
      success: true,
      assignments
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};