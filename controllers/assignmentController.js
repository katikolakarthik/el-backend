const Assignment = require("../models/Assignment");

exports.addAssignment = async (req, res) => {
  try {
    console.log("📥 Incoming form data:", req.body);
    console.log("📂 Uploaded files:", req.files);

    const {
      moduleName,
      subModuleName,
      assignedStudents,
      answerPatientName,
      answerIcdCodes,
      answerCptCodes,
      answerNotes
    } = req.body;

    // PDF path
    const assignmentPdf = req.files?.assignmentPdf?.[0]?.path || null;

    // Admin only provides answer key
    const answerKey = {
      patientName: answerPatientName,
      icdCodes: answerIcdCodes ? answerIcdCodes.split(",") : [],
      cptCodes: answerCptCodes ? answerCptCodes.split(",") : [],
      notes: answerNotes
    };

    const assignment = new Assignment({
      moduleName,
      subModuleName,
      patientName: null,  // No question data from admin
      icdCodes: [],
      cptCodes: [],
      notes: null,
      assignmentPdf,
      answerKey,
      assignedStudents: assignedStudents ? assignedStudents.split(",") : []
    });

    await assignment.save();
    res.json({ success: true, message: "Assignment added successfully", assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAssignments = async (req, res) => {
  const assignments = await Assignment.find().populate("assignedStudents");
  res.json(assignments);
};



exports.deleteAssignmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Assignment.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    // TODO: Delete PDF file if stored locally or in cloud

    res.json({ success: true, message: "Assignment deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteAllAssignments = async (req, res) => {
  try {
    await Assignment.deleteMany({});

    // TODO: Delete all PDFs if needed

    res.json({ success: true, message: "All assignments deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};