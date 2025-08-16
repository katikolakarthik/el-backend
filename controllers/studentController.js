const Student = require("../models/Student");
const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");

exports.addStudent = async (req, res) => {
  try {
    const { name, password, courseName, paidAmount, remainingAmount, enrolledDate } = req.body;
    const profileImage = req.file ? req.file.path : null;

    const student = new Student({
      name,
      password, // Plain text for now (can be hashed later)
      courseName,
      paidAmount,
      remainingAmount,
      enrolledDate,
      profileImage
    });

    await student.save();
    res.json({ success: true, message: "Student added successfully", student });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStudents = async (req, res) => {
  const students = await Student.find();
  res.json(students);
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

    // Return user data with role
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
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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

    // Use existing values if not provided in request body
    const updatedData = {
      name: req.body.name || existingStudent.name,
      password: req.body.password || existingStudent.password,
      courseName: req.body.courseName || existingStudent.courseName,
      paidAmount: req.body.paidAmount !== undefined ? req.body.paidAmount : existingStudent.paidAmount,
      remainingAmount: req.body.remainingAmount !== undefined ? req.body.remainingAmount : existingStudent.remainingAmount,
      enrolledDate: req.body.enrolledDate || existingStudent.enrolledDate,
      profileImage: req.file ? req.file.path : existingStudent.profileImage
    };

    const updatedStudent = await Student.findByIdAndUpdate(id, updatedData, { new: true });

    res.json({ success: true, message: "Student updated successfully", student: updatedStudent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// Get all students with summary info + progress
exports.getStudentsWithSummary = async (req, res) => {
  try {
    // ✅ Fetch only users (exclude admins)
    const students = await Student.find({ role: { $ne: "admin" } });

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
            progressPercent: subAnswer?.progressPercent || 0,
            correctCount: subAnswer?.correctCount || 0,
            wrongCount: subAnswer?.wrongCount || 0,
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

    // Step 3: Get all submissions (populate only parent assignment name)
    const submissions = await Submission.find({ studentId })
      .populate({
        path: "assignmentId",
        select: "moduleName assignedDate" // only parent assignment info
      })
      .sort({ submissionDate: -1 });

    // Step 4: Calculate stats
    const totalAssignments = assignments.length;
    const completedCount = submissions.length;
    const pendingCount = totalAssignments - completedCount;

    // Average score
    let averageScore = 0;
    if (submissions.length > 0) {
      const totalProgress = submissions.reduce((sum, s) => sum + (s.overallProgress || 0), 0);
      averageScore = (totalProgress / submissions.length).toFixed(2);
    }

    // Step 5: Prepare recent submissions list
    const recentSubmissions = submissions.slice(0, 5).map(sub => ({
      assignmentId: sub.assignmentId?._id || null,
      moduleName: sub.assignmentId?.moduleName || "Unknown",
      submissionDate: sub.submissionDate,
      overallProgress: sub.overallProgress || 0,
      totalCorrect: sub.totalCorrect || 0,
      totalWrong: sub.totalWrong || 0
    }));

    // Step 6: Send response
    res.json({
      id: student._id,
      name: student.name,
      courseName: student.courseName,
      paidAmount: student.paidAmount,
      remainingAmount: student.remainingAmount,
      enrolledDate: student.enrolledDate,
      profileImage: student.profileImage,

      // Dashboard stats
      totalAssignments,
      completedCount,
      pendingCount,
      averageScore: Number(averageScore),

      courseProgress: averageScore, // you can adjust if course progress logic is different
      assignmentCompletion: `${completedCount}/${totalAssignments}`,

      // Only parent assignment info in recent submissions
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



// ==================== Dashboard Summary ====================
exports.getDashboardSummary = async (req, res) => {
  try {
    // 1. Total students (excluding admin)
    const totalStudents = await Student.countDocuments({ role: { $ne: "admin" } });

    // 2. Total assignments (only parent level)
    const totalAssignments = await Assignment.countDocuments();

    // 3. Students who submitted at least one assignment (excluding admin submissions)
    const adminIds = await Student.find({ role: "admin" }).distinct("_id");
    const submittedStudentIds = await Submission.distinct("studentId", { studentId: { $nin: adminIds } });
    const studentsSubmittedCount = submittedStudentIds.length;

    // 4. Completion rate (averageProgress)
    const averageProgress = totalStudents > 0
      ? (studentsSubmittedCount / totalStudents) * 100
      : 0;

    // 5. Average score (excluding admin submissions)
    const scoreData = await Submission.aggregate([
      { $match: { studentId: { $nin: adminIds } } },
      {
        $group: {
          _id: null,
          avgScore: {
            $avg: {
              $cond: [
                { $gt: ["$totalCorrect", 0] },
                {
                  $multiply: [
                    { $divide: ["$totalCorrect", { $add: ["$totalCorrect", "$totalWrong"] }] },
                    100
                  ]
                },
                0
              ]
            }
          }
        }
      }
    ]);

    const averageScore = scoreData.length > 0 ? scoreData[0].avgScore || 0 : 0;

    // 6. Total submissions (excluding admin submissions)
    const totalSubmissions = await Submission.countDocuments({ studentId: { $nin: adminIds } });

    res.json({
      totalStudents,
      totalAssignments,
      studentsSubmittedCount,
      totalSubmissions,
      averageProgress: Number(averageProgress.toFixed(2)), // completion %
      averageScore: Number(averageScore.toFixed(2)) // marks %
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



//recent students
exports.getRecentStudents = async (req, res) => {
  try {
    // Get latest students (limit can be passed as query ?limit=5)
    const limit = parseInt(req.query.limit) || 5;

    // ✅ Exclude admins
    const students = await Student.find(
      { role: { $ne: "admin" } }, // filter condition
      { name: 1, courseName: 1, _id: 0 }
    )
      .sort({ enrolledDate: -1 })
      .limit(limit);

    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



//recent assignments 

exports.getRecentAssignments = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const assignments = await Assignment.find({}, { moduleName: 1, assignedDate: 1, _id: 0 })
      .sort({ assignedDate: -1 })
      .limit(limit);

    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.getAssignmentResult = async (req, res) => {
  try {
    const { studentId, assignmentId } = req.body;
    if (!studentId || !assignmentId) {
      return res.status(400).json({ error: "studentId and assignmentId are required" });
    }

    // Get student & assignment
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const assignment = await Assignment.findOne({
      $or: [
        { _id: assignmentId },
        { "subAssignments._id": assignmentId }
      ]
    });

    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    // Get submission
    const submission = await Submission.findOne({
      studentId,
      assignmentId: assignment._id
    });

    if (!submission) {
      return res.status(404).json({ error: "No submission found for this student" });
    }

    let result;

    // ✅ Case 1: Parent assignment requested
    if (assignment._id.toString() === assignmentId) {
      result = {
        type: "parent",
        moduleName: assignment.moduleName,
        submitted: submission.submittedAnswers.map(sa => ({
          subAssignmentId: sa.subAssignmentId,
          patientName: {
            submitted: sa.patientName,
            correct: assignment.answerKey?.patientName || null,
            isCorrect: sa.patientName === assignment.answerKey?.patientName
          },
          ageOrDob: {
            submitted: sa.ageOrDob,
            correct: assignment.answerKey?.ageOrDob || null,
            isCorrect: sa.ageOrDob === assignment.answerKey?.ageOrDob
          },
          icdCodes: {
            submitted: sa.icdCodes,
            correct: assignment.answerKey?.icdCodes || [],
            isCorrect: JSON.stringify(sa.icdCodes) === JSON.stringify(assignment.answerKey?.icdCodes || [])
          },
          cptCodes: {
            submitted: sa.cptCodes,
            correct: assignment.answerKey?.cptCodes || [],
            isCorrect: JSON.stringify(sa.cptCodes) === JSON.stringify(assignment.answerKey?.cptCodes || [])
          },
          notes: {
            submitted: sa.notes,
            correct: assignment.answerKey?.notes || null,
            isCorrect: sa.notes === assignment.answerKey?.notes
          },
          dynamicQuestions: sa.dynamicQuestions.map((dq, i) => ({
            questionText: dq.questionText,
            submittedAnswer: dq.submittedAnswer,
            correctAnswer: dq.correctAnswer,
            isCorrect: dq.isCorrect
          })),
          correctCount: sa.correctCount,
          wrongCount: sa.wrongCount,
          progressPercent: sa.progressPercent
        })),
        totalCorrect: submission.totalCorrect,
        totalWrong: submission.totalWrong,
        overallProgress: submission.overallProgress
      };
    }

    // ✅ Case 2: Sub-assignment requested
    else {
      const subAssignment = assignment.subAssignments.find(
        s => s._id.toString() === assignmentId
      );

      const submitted = submission.submittedAnswers.find(
        s => s.subAssignmentId.toString() === assignmentId
      );

      if (!subAssignment || !submitted) {
        return res.status(404).json({ error: "Sub-assignment submission not found" });
      }

      result = {
        type: "sub",
        moduleName: assignment.moduleName,
        subModuleName: subAssignment.subModuleName,
        submitted: {
          patientName: {
            submitted: submitted.patientName,
            correct: subAssignment.answerKey?.patientName || null,
            isCorrect: submitted.patientName === subAssignment.answerKey?.patientName
          },
          ageOrDob: {
            submitted: submitted.ageOrDob,
            correct: subAssignment.answerKey?.ageOrDob || null,
            isCorrect: submitted.ageOrDob === subAssignment.answerKey?.ageOrDob
          },
          icdCodes: {
            submitted: submitted.icdCodes,
            correct: subAssignment.answerKey?.icdCodes || [],
            isCorrect: JSON.stringify(submitted.icdCodes) === JSON.stringify(subAssignment.answerKey?.icdCodes || [])
          },
          cptCodes: {
            submitted: submitted.cptCodes,
            correct: subAssignment.answerKey?.cptCodes || [],
            isCorrect: JSON.stringify(submitted.cptCodes) === JSON.stringify(subAssignment.answerKey?.cptCodes || [])
          },
          notes: {
            submitted: submitted.notes,
            correct: subAssignment.answerKey?.notes || null,
            isCorrect: submitted.notes === subAssignment.answerKey?.notes
          },
          dynamicQuestions: submitted.dynamicQuestions.map((dq, i) => {
            const correctQ = subAssignment.dynamicQuestions[i];
            return {
              questionText: dq.questionText,
              submittedAnswer: dq.submittedAnswer,
              correctAnswer: correctQ?.answer,
              isCorrect: dq.isCorrect
            };
          }),
          correctCount: submitted.correctCount,
          wrongCount: submitted.wrongCount,
          progressPercent: submitted.progressPercent
        }
      };
    }

    res.json({
      student: { id: student._id, name: student.name, courseName: student.courseName },
      result
    });

  } catch (err) {
    console.error("Error in getAssignmentResult:", err);
    res.status(500).json({ error: err.message });
  }
};
