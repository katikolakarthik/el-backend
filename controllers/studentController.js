const Student = require("../models/Student");
const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");
const mongoose = require("mongoose");
 

// Add Subadmin (no auth required)
exports.addSubadmin = async (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ success: false, message: "Name and password are required" });
    }

    // Check if user exists already
    const existingUser = await Student.findOne({ name, role: "subadmin" });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: "Subadmin with this name already exists" 
      });
    }

    const subadmin = new Student({
      name,
      password,
      role: "subadmin"
    });

    await subadmin.save();
    res.json({ 
      success: true, 
      message: "Subadmin created successfully", 
      subadmin: {
        _id: subadmin._id,
        name: subadmin.name,
        role: subadmin.role
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update Subadmin (no auth required)
exports.updateSubadmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, password } = req.body;

    // Find the subadmin to update
    const subadmin = await Student.findOne({ _id: id, role: "subadmin" });
    if (!subadmin) {
      return res.status(404).json({ 
        success: false, 
        message: "Subadmin not found" 
      });
    }

    // Update fields
    if (name) subadmin.name = name;
    if (password) subadmin.password = password;

    await subadmin.save();
    res.json({ 
      success: true, 
      message: "Subadmin updated successfully", 
      subadmin: {
        _id: subadmin._id,
        name: subadmin.name,
        role: subadmin.role
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete Subadmin (no auth required)
exports.deleteSubadmin = async (req, res) => {
  try {
    const { id } = req.params;

    const subadmin = await Student.findOneAndDelete({ 
      _id: id, 
      role: "subadmin"
    });

    if (!subadmin) {
      return res.status(404).json({ 
        success: false, 
        message: "Subadmin not found" 
      });
    }

    res.json({ 
      success: true, 
      message: "Subadmin deleted successfully" 
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all Subadmins (no auth required)
exports.getAllSubadmins = async (req, res) => {
  try {
    const subadmins = await Student.find({ role: "subadmin" })
      .select("-password -__v");

    res.json({ 
      success: true, 
      subadmins 
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.addStudent = async (req, res) => {
  try {
    const { name, password, courseName, paidAmount, remainingAmount, enrolledDate, expiryDate } = req.body;
    const profileImage = req.file ? req.file.path : null;

    const student = new Student({      
      name,      
      password,
      courseName,      
      paidAmount,      
      remainingAmount,      
      enrolledDate,
      expiryDate, // Admin provides expiry date
      expiresAt: expiryDate, // Set TTL field to same as expiry date
      profileImage      
    });      
    
    await student.save();      
    res.json({ success: true, message: "Student added successfully", student });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// Get Students (excluding admins)
exports.getStudents = async (req, res) => {
  try {
    const students = await Student.find({ role: { $ne: "admin" } }); // exclude admins
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: "Error fetching students", error });
  }
};



// Delete Student (still works normally)
exports.deleteStudent = async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Student deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete student" });
  }
};

exports.deleteStudent = async (req, res) => {
  await Student.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: "Student deleted" });
};


// Add Admin user (similar to addStudent but role: "admin")
exports.addAdmin = async (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ success: false, message: "Name and password are required" });
    }

    // Check if admin exists already
    const existingAdmin = await Student.findOne({ name, role: "admin" });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: "Admin already exists" });
    }

    const admin = new Student({
      name,
      password,
      role: "admin"
    });

    await admin.save();
    res.json({ success: true, message: "Admin created successfully", admin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};




// ==================== Student Login ====================
exports.login = async (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ success: false, message: "Name and password are required" });
    }

    // Find user/admin by name
    const user = await Student.findOne({ name });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check password (plain text)
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    // Create session
    const sessionController = require("../controllers/sessionController");
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ipAddress = req.ip || req.connection.remoteAddress || 'Unknown';
    
    const sessionId = await sessionController.createSession(user._id, userAgent, ipAddress);

    // Return user data with role and session
    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        role: user.role,  // "admin" or "user"
        courseName: user.courseName,
        profileImage: user.profileImage,
        enrolledDate: user.enrolledDate,
      },
      sessionId: sessionId
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ==================== Logout ====================
exports.logout = async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
      return res.status(400).json({ 
        success: false, 
        message: "Session ID required" 
      });
    }

    const sessionController = require("../controllers/sessionController");
    const success = await sessionController.invalidateSession(sessionId);
    
    if (success) {
      res.json({ 
        success: true, 
        message: "Logout successful" 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        message: "Session not found" 
      });
    }
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};

// ==================== Validate Session ====================
exports.validateSession = async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
      return res.status(400).json({ 
        success: false, 
        message: "Session ID required" 
      });
    }

    const sessionController = require("../controllers/sessionController");
    const session = await sessionController.validateSession(sessionId);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid or expired session" 
      });
    }

    // Get user details
    const user = await Student.findById(session.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    res.json({
      success: true,
      message: "Session valid",
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        courseName: user.courseName,
        profileImage: user.profileImage,
        enrolledDate: user.enrolledDate,
      }
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};


// ==================== Update Student ====================
exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;

    // Find existing student
    const existingStudent = await Student.findById(id);
    if (!existingStudent) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // Base updates (use existing values if not provided)
    const updatedData = {
      name: req.body.name ?? existingStudent.name,
      password: req.body.password ?? existingStudent.password,
      courseName: req.body.courseName ?? existingStudent.courseName,
      paidAmount: req.body.paidAmount !== undefined ? req.body.paidAmount : existingStudent.paidAmount,
      remainingAmount: req.body.remainingAmount !== undefined ? req.body.remainingAmount : existingStudent.remainingAmount,
      enrolledDate: req.body.enrolledDate ?? existingStudent.enrolledDate,
      profileImage: req.file ? req.file.path : existingStudent.profileImage,
    };

    // Build update object so we can $unset when needed
    const update = { $set: updatedData };

    // expiryDate handling (same as addStudent)
    if ("expiryDate" in req.body) {
      const incoming = req.body.expiryDate;

      if (incoming === null || incoming === "") {
        // Clear expiry if explicitly sent as null/empty
        update.$unset = { ...(update.$unset || {}), expiryDate: "", expiresAt: "" };
      } else {
        // Set/Update both fields
        update.$set.expiryDate = incoming;          // Admin-provided expiry date
        update.$set.expiresAt = incoming;           // TTL field mirrors expiry date
      }
    } else {
      // Not provided => keep existing values
      update.$set.expiryDate = existingStudent.expiryDate;
      update.$set.expiresAt = existingStudent.expiresAt;
    }

    const updatedStudent = await Student.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, message: "Student updated successfully", student: updatedStudent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Get all students with summary info + progress





exports.getStudentSubmissions = async (req, res) => {
  try {
    const { studentId, moduleName, subModuleName } = req.query;

    // Build filter for assignments by module/submodule if provided
    const assignmentFilter = {};
    if (moduleName) assignmentFilter.moduleName = moduleName;
    if (subModuleName) assignmentFilter.subModuleName = subModuleName;

    // Find assignments matching filter
    const assignments = await Assignment.find(assignmentFilter).select('_id');

    const assignmentIds = assignments.map(a => a._id);

    // Find submissions by student and filtered assignments
    const submissions = await Submission.find({
      studentId,
      assignmentId: { $in: assignmentIds }
    })
    .populate({
      path: 'assignmentId',
      select: 'moduleName subModuleName assignedDate assignmentPdf'
    })
    .sort({ submissionDate: -1 });

    // Format response
    const formatted = submissions.map(sub => ({
      submissionId: sub._id,
      assignmentId: sub.assignmentId._id,
      moduleName: sub.assignmentId.moduleName,
      subModuleName: sub.assignmentId.subModuleName,
      assignmentPdf: sub.assignmentId.assignmentPdf,
      submittedAnswers: sub.submittedAnswers,
      correctCount: sub.correctCount,
      wrongCount: sub.wrongCount,
      progressPercent: sub.progressPercent,
      submissionDate: sub.submissionDate
    }));

    res.json(formatted);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};




exports.getStudentProfile = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Step 1: Get student info
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    // Step 2: Get all assignments assigned to this student
    const assignments = await Assignment.find({ assignedStudents: studentId });

    // Step 3: Get all submissions (with parent assignment + sub answers)
    const submissions = await Submission.find({ studentId })
      .populate({
        path: "assignmentId",
        select: "moduleName assignedDate subAssignments" // parent assignment
      })
      .sort({ submissionDate: -1 });

    // Step 4: Stats
    const totalAssignments = assignments.length;
    let completedCount = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalProgressSum = 0;

    submissions.forEach(sub => {
      if (sub.submittedAnswers?.length > 0) {
        completedCount++;
        totalCorrect += sub.totalCorrect || 0;
        totalWrong += sub.totalWrong || 0;
        totalProgressSum += sub.overallProgress || 0;
      }
    });

    const pendingCount = totalAssignments - completedCount;
    const averageScore =
      submissions.length > 0 ? Number((totalProgressSum / submissions.length).toFixed(2)) : 0;

    // Step 5: Group by parent assignmentId → only their sub-assignments
    const recentSubmissions = submissions.slice(0, 5).map(sub => ({
      assignmentId: sub.assignmentId?._id || null,
      moduleName: sub.assignmentId?.moduleName || "Unknown",
      submissionDate: sub.submissionDate,
      overallProgress: sub.overallProgress || 0,
      totalCorrect: sub.totalCorrect || 0,
      totalWrong: sub.totalWrong || 0,
      subAssignments: sub.submittedAnswers.map(ans => ({
        subAssignmentId: ans.subAssignmentId,
        patientName: ans.patientName,
        ageOrDob: ans.ageOrDob,
        icdCodes: ans.icdCodes,
        cptCodes: ans.cptCodes,
        notes: ans.notes,
        correctCount: ans.correctCount,
        wrongCount: ans.wrongCount,
        progressPercent: ans.progressPercent,
        dynamicQuestions: ans.dynamicQuestions.map(q => ({
          questionText: q.questionText,
          type: q.type,
          submittedAnswer: q.submittedAnswer,
          correctAnswer: q.correctAnswer,
          isCorrect: q.isCorrect
        }))
      }))
    }));

    // Step 6: Response
    res.json({
      id: student._id,
      name: student.name,
      courseName: student.courseName,
      paidAmount: student.paidAmount,
      remainingAmount: student.remainingAmount,
      enrolledDate: student.enrolledDate,
      profileImage: student.profileImage,

      // Stats
      totalAssignments,
      completedCount,
      pendingCount,
      totalCorrect,
      totalWrong,
      averageScore,
      courseProgress: averageScore,
      assignmentCompletion: `${completedCount}/${totalAssignments}`,

      // Parent assignment → only its sub-assignment submissions
      recentSubmissions
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};





//individual student summary 


exports.getStudentSummary = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Find student
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Find assignments assigned to this student
    const assignedAssignments = await Assignment.find({
      assignedStudents: student._id
    }).select('_id');

    const assignedAssignmentsCount = assignedAssignments.length;
    const assignedAssignmentIds = assignedAssignments.map(a => a._id);

    // Count submissions by student for assigned assignments
    const submissionsCount = await Submission.countDocuments({
      studentId: student._id,
      assignmentId: { $in: assignedAssignmentIds }
    });

    const notSubmittedCount = assignedAssignmentsCount - submissionsCount;

    // Return summary
    res.json({
      id: student._id,
      name: student.name,
      courseName: student.courseName,
      paidAmount: student.paidAmount,
      remainingAmount: student.remainingAmount,
      enrolledDate: student.enrolledDate,
      profileImage: student.profileImage,
      assignedAssignmentsCount,
      submittedCount: submissionsCount,
      notSubmittedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};








//recent assignments 
exports.getRecentAssignments = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const assignments = await Assignment.find(
      {}, 
      { moduleName: 1, assignedDate: 1 }
    )
      .sort({ assignedDate: -1 })
      .limit(limit)
      .lean();

    // Rename _id → assignmentId
    const formattedAssignments = assignments.map(a => ({
      assignmentId: a._id,
      moduleName: a.moduleName,
      assignedDate: a.assignedDate
    }));

    res.json(formattedAssignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


  
exports.getAssignmentResult = async (req, res) => {
  try {
    const { studentId, assignmentId } = req.body; // from body

    if (!studentId || !assignmentId) {
      return res.status(400).json({ error: "studentId and assignmentId are required in body" });
    }

    // 1. Fetch assignment
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    // 2. Fetch student's submission
    const submission = await Submission.findOne({
      studentId,
      assignmentId,
    });
    if (!submission) {
      return res.status(404).json({ error: "Submission not found for this student" });
    }

    let result;

    // ---------- CASE 1: MULTI (has sub-assignments) ----------
    if (assignment.subAssignments && assignment.subAssignments.length > 0) {
      result = assignment.subAssignments.map((sub) => {
        const studentSub = submission.submittedAnswers.find(
          (s) => s.subAssignmentId.toString() === sub._id.toString()
        );

        return {
          subModuleName: sub.subModuleName,
          assignmentPdf: sub.assignmentPdf,

          // Correct keys from assignment
          correctAnswerKey: sub.answerKey,
          correctDynamicQuestions: sub.dynamicQuestions,

          // Student's submitted data
          submitted: studentSub || null,
        };
      });
    } 
    // ---------- CASE 2: SINGLE ----------
    else {
      result = {
        moduleName: assignment.moduleName,
        assignmentPdf: assignment.assignmentPdf,
        correctAnswerKey: assignment.answerKey,
        correctDynamicQuestions: assignment.dynamicQuestions,
        submitted: submission.submittedAnswers[0] || null,
      };
    }

    // ---------- GLOBAL TOTALS ----------
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalProgress = 0;
    let count = 0;

    if (Array.isArray(result)) {
      // multi
      result.forEach((r) => {
        if (r.submitted) {
          totalCorrect += r.submitted.correctCount || 0;
          totalWrong += r.submitted.wrongCount || 0;
          totalProgress += r.submitted.progressPercent || 0;
          count++;
        }
      });
    } else {
      // single
      if (result.submitted) {
        totalCorrect = result.submitted.correctCount || 0;
        totalWrong = result.submitted.wrongCount || 0;
        totalProgress = result.submitted.progressPercent || 0;
        count = 1;
      }
    }

    const overallProgress = count > 0 ? Math.round(totalProgress / count) : 0;

    // ---------- RESPONSE ----------
    res.json({
      assignmentId,
      studentId,
      assignmentType: assignment.subAssignments.length > 0 ? "multi" : "single",
      totalCorrect,
      totalWrong,
      overallProgress,
      data: result,
    });

  } catch (err) {
    console.error("Error in getAssignmentResult:", err);
    res.status(500).json({ error: err.message });
  }
};




const EXCLUDED_ROLES = ["admin", "subadmin"];

// Get all students with summary info + progress
exports.getStudentsWithSummary = async (req, res) => {
  try {
    // ✅ Fetch only students (exclude admins & subadmins)
    const students = await Student.find({ role: { $nin: EXCLUDED_ROLES } });

    const result = await Promise.all(
      students.map(async (student) => {
        // Get all assignments assigned to this student
        const assignedAssignments = await Assignment.find({
          assignedStudents: student._id,
        }).lean();

        // Flatten subAssignments with assignment details
        const allAssignedSubAssignments = assignedAssignments.flatMap((a) =>
          Array.isArray(a.subAssignments)
            ? a.subAssignments.map((sa) => ({
                _id: sa._id.toString(),
                subModuleName: sa.subModuleName,
                assignmentId: a._id.toString(),
                moduleName: a.moduleName,
              }))
            : []
        );

        const assignedAssignmentsCount = allAssignedSubAssignments.length;

        // Get submissions for this student
        const submissions = await Submission.find({
          studentId: student._id,
        }).lean();

        // Extract submitted subAssignmentIds
        const submittedSubAssignmentIds = new Set(
          submissions.flatMap((s) =>
            Array.isArray(s.submittedAnswers)
              ? s.submittedAnswers.map((ans) => ans.subAssignmentId?.toString())
              : []
          )
        );

        // Build submitted & not submitted lists
        let submittedList = allAssignedSubAssignments.filter((sa) =>
          submittedSubAssignmentIds.has(sa._id)
        );

        const notSubmittedList = allAssignedSubAssignments.filter(
          (sa) => !submittedSubAssignmentIds.has(sa._id)
        );

        // Attach progressPercent per submitted sub-assignment
        submittedList = submittedList.map((sa) => {
          const submission = submissions.find((s) =>
            s.submittedAnswers?.some(
              (ans) => ans.subAssignmentId?.toString() === sa._id
            )
          );

          const subAnswer = submission?.submittedAnswers?.find(
            (ans) => ans.subAssignmentId?.toString() === sa._id
          );

          return {
            ...sa,
            progressPercent: subAnswer?.progressPercent ?? 0,
            correctCount: subAnswer?.correctCount ?? 0,
            wrongCount: subAnswer?.wrongCount ?? 0,
          };
        });

        const submittedCount = submittedList.length;
        const notSubmittedCount = notSubmittedList.length;

        // Overall progress calculation
        let totalCorrect = 0;
        let totalWrong = 0;
        let overallProgress = 0;

        if (submissions.length > 0) {
          totalCorrect = submissions.reduce(
            (sum, s) => sum + (s.totalCorrect || 0),
            0
          );
          totalWrong = submissions.reduce(
            (sum, s) => sum + (s.totalWrong || 0),
            0
          );

          const totalProgress = submissions.reduce(
            (sum, s) => sum + (s.overallProgress || 0),
            0
          );
          overallProgress = Math.round(totalProgress / submissions.length);
        }

        return {
          id: student._id,
          name: student.name,
          courseName: student.courseName,
          paidAmount: student.paidAmount,
          remainingAmount: student.remainingAmount,
          enrolledDate: student.enrolledDate,
           expiryDate: student.expiryDate,
          assignedAssignmentsCount,
          submittedCount,
          notSubmittedCount,
          submittedAssignments: submittedList,
          notSubmittedAssignments: notSubmittedList,
          profileImage: student.profileImage,

          progress: {
            totalCorrect,
            totalWrong,
            overallProgress, // percentage (0–100)
          },
        };
      })
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDashboardSummary = async (req, res) => {
  try {
    // 1. Total students (excluding admin & subadmin)
    const totalStudents = await Student.countDocuments({
      role: { $nin: EXCLUDED_ROLES },
    });

    // 2. Total assignments (only parent level)
    const totalAssignments = await Assignment.countDocuments();

    // 3. Students who submitted at least one assignment (excluding admin & subadmin submissions)
    const excludedIds = await Student.find({ role: { $in: EXCLUDED_ROLES } }).distinct("_id");
    const submittedStudentIds = await Submission.distinct("studentId", {
      studentId: { $nin: excludedIds },
    });
    const studentsSubmittedCount = submittedStudentIds.length;

    // 4. Completion rate (averageProgress)
    const averageProgress =
      totalStudents > 0 ? (studentsSubmittedCount / totalStudents) * 100 : 0;

    // 5. Average score (excluding admin & subadmin submissions)
    const scoreData = await Submission.aggregate([
      { $match: { studentId: { $nin: excludedIds } } },
      {
        $group: {
          _id: null,
          avgScore: {
            $avg: {
              $cond: [
                { $gt: ["$totalCorrect", 0] },
                {
                  $multiply: [
                    {
                      $divide: [
                        "$totalCorrect",
                        { $add: ["$totalCorrect", "$totalWrong"] },
                      ],
                    },
                    100,
                  ],
                },
                0,
              ],
            },
          },
        },
      },
    ]);

    const averageScore =
      scoreData.length > 0 ? scoreData[0].avgScore || 0 : 0;

    // 6. Total submissions (excluding admin & subadmin submissions)
    const totalSubmissions = await Submission.countDocuments({
      studentId: { $nin: excludedIds },
    });

    res.json({
      totalStudents,
      totalAssignments,
      studentsSubmittedCount,
      totalSubmissions,
      averageProgress: Number(averageProgress.toFixed(2)), // completion %
      averageScore: Number(averageScore.toFixed(2)), // marks %
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Recent students
exports.getRecentStudents = async (req, res) => {
  try {
    // Get latest students (limit can be passed as query ?limit=5)
    const limit = parseInt(req.query.limit, 10) || 5;

    // ✅ Exclude admins & subadmins
    const students = await Student.find(
      { role: { $nin: EXCLUDED_ROLES } }, // filter condition
      { name: 1, courseName: 1, _id: 0 }
    )
      .sort({ enrolledDate: -1 })
      .limit(limit)
      .lean();

    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Get student course name by studentId
exports.getStudentCourse = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Validate if studentId is provided
    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "Student ID is required"
      });
    }

    // Validate if studentId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Student ID format"
      });
    }

    // Find the student by ID
    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    // Return the course name
    res.json({
      success: true,
      studentId: student._id,
      studentName: student.name,
      courseName: student.courseName || "No course enrolled",
      enrolledDate: student.enrolledDate
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};




exports.getStudentPaymentDetails = async (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId) {
      return res.status(400).json({ error: "Missing studentId" });
    }

    const student = await Student.findById(studentId)
      .select("name courseName enrolledDate paidAmount remainingAmount")
      .lean();

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json({
      studentId: student._id,
      name: student.name,
      courseName: student.courseName,
      enrolledDate: student.enrolledDate,
      paidAmount: student.paidAmount,
      remainingAmount: student.remainingAmount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};





exports.getCategorySummary = async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ success: false, message: "category is required in the request body" });
    }

    // If you want only active students, uncomment the "activeOnly" block and add it to the query
    // const activeOnly = true;
    const now = new Date();

    // Build student filter: courseName === category and exclude subadmins
    const studentFilter = {
      courseName: category,
      role: { $ne: "subadmin" },
      // ...(activeOnly ? { expiryDate: { $gte: now } } : {})
    };

    const [ totalAssignments, assignments, totalStudents, students ] = await Promise.all([
      Assignment.countDocuments({ category }),
      Assignment.find({ category })
        .sort({ assignedDate: -1 })   // newest first
        .lean(),
      Student.countDocuments(studentFilter),
      Student.find(studentFilter)
        .select("name courseName enrolledDate expiryDate") // include what you need
        .sort({ enrolledDate: -1 })
        .lean()
    ]);

    // Optional: add a quick subAssignments count per assignment (handy for dashboards)
    const assignmentsWithCounts = assignments.map(a => ({
      ...a,
      subAssignmentsCount: Array.isArray(a.subAssignments) ? a.subAssignments.length : 0
    }));

    return res.json({
      success: true,
      category,
      totals: {
        assignments: totalAssignments,
        students: totalStudents
      },
      assignments: assignmentsWithCounts, // full docs + subAssignmentsCount
      students // name, course, enrolledDate, expiryDate
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

