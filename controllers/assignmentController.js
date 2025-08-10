const Assignment = require("../models/Assignment");

exports.addAssignment = async (req, res) => {
  try {
    const { moduleName, assignedStudents, subAssignments } = req.body;

    // Parse subAssignments (frontend should send as JSON string if using form-data)
    let parsedSubAssignments = [];
    if (subAssignments) {
      parsedSubAssignments = JSON.parse(subAssignments).map(sub => ({
        subModuleName: sub.subModuleName,
        patientName: sub.patientName || null,
        icdCodes: sub.icdCodes ? sub.icdCodes.split(",") : [],
        cptCodes: sub.cptCodes ? sub.cptCodes.split(",") : [],
        notes: sub.notes || null,
        assignmentPdf: sub.assignmentPdfPath || null,
        answerKey: {
          patientName: sub.answerPatientName || null,
          icdCodes: sub.answerIcdCodes ? sub.answerIcdCodes.split(",") : [],
          cptCodes: sub.answerCptCodes ? sub.answerCptCodes.split(",") : [],
          notes: sub.answerNotes || null
        },
        assignedStudents: sub.assignedStudents ? sub.assignedStudents.split(",") : []
      }));
    }

    const assignment = new Assignment({
      moduleName,
      subAssignments: parsedSubAssignments,
      assignedStudents: assignedStudents ? assignedStudents.split(",") : []
    });

    await assignment.save();

    res.json({ success: true, message: "Assignment hierarchy saved", assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



exports.getAssignments = async (req, res) => {
  try {
    const assignments = await Assignment.find()
      .populate("assignedStudents")
      .populate("subAssignments.assignedStudents");
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Delete whole module
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

// Delete specific sub-assignment from module
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
    const result = await Assignment.deleteMany({});
    res.json({
      success: true,
      message: "All assignments (modules & sub-assignments) deleted successfully",
      deletedCount: result.deletedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
