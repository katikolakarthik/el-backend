const Assignment = require("../models/Assignment");

// Add Assignment (with sub-assignments)
exports.addAssignment = async (req, res) => {
  try {
    const { moduleName, assignedStudents, subAssignments } = req.body;

    let parsedSubAssignments = [];
    if (subAssignments) {
      parsedSubAssignments = JSON.parse(subAssignments).map(sub => ({
        subModuleName: sub.subModuleName,
        
        // Always keep student fields empty for admin's uploaded assignment
        patientName: null,
        icdCodes: [],
        cptCodes: [],
        notes: null,

        // PDF file path if any
        assignmentPdf: sub.assignmentPdfPath || null,

        // Answer key provided by admin
        answerKey: {
          patientName: sub.answerPatientName || null,
          icdCodes: sub.answerIcdCodes ? sub.answerIcdCodes.split(",") : [],
          cptCodes: sub.answerCptCodes ? sub.answerCptCodes.split(",") : [],
          notes: sub.answerNotes || null
        }
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






// Get all assignments
exports.getAssignments = async (req, res) => {
  try {
    const assignments = await Assignment.find().populate("assignedStudents");
    res.json(assignments);
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