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



// Get all students with summary info (can be paginated)
exports.getStudentsWithSummary = async (req, res) => {
  try {
    const students = await Student.find().lean();

    const result = await Promise.all(students.map(async (student) => {
      // Get all assignments assigned to this student
      const assignedAssignments = await Assignment.find({
        assignedStudents: student._id
      }).lean();

      // Flatten both parent-level assignments and their subAssignments
      const allAssignedModules = assignedAssignments.flatMap(a => {
        const subModules = Array.isArray(a.subAssignments) && a.subAssignments.length
          ? a.subAssignments.map(sa => ({
              _id: sa._id.toString(),
              subModuleName: sa.subModuleName,
              assignmentId: a._id.toString(),
              moduleName: a.moduleName,
              isParentLevel: false
            }))
          : [];

        // Include parent-level assignment if it has dynamicQuestions or answerKey
        const parentModule = (a.dynamicQuestions?.length || a.answerKey)
          ? [{
              _id: a._id.toString(), // Use assignmentId as identifier
              subModuleName: null,
              assignmentId: a._id.toString(),
              moduleName: a.moduleName,
              isParentLevel: true
            }]
          : [];

        return [...parentModule, ...subModules];
      });

      const assignedAssignmentsCount = allAssignedModules.length;

      // Get submissions for this student
      const submissions = await Submission.find({ studentId: student._id }).lean();

      // Extract submitted IDs (parent-level or subAssignments)
      const submittedIds = new Set(
        submissions.flatMap(s =>
          Array.isArray(s.submittedAnswers)
            ? s.submittedAnswers.map(ans =>
                ans.subAssignmentId
                  ? ans.subAssignmentId.toString()
                  : ans.assignmentId?.toString() // parent-level
              )
            : []
        )
      );

      // Build submitted & not submitted lists
      const submittedList = allAssignedModules.filter(m => submittedIds.has(m._id));
      const notSubmittedList = allAssignedModules.filter(m => !submittedIds.has(m._id));

      return {
        id: student._id,
        name: student.name,
        courseName: student.courseName,
        paidAmount: student.paidAmount,
        remainingAmount: student.remainingAmount,
        enrolledDate: student.enrolledDate,
        assignedAssignmentsCount,
        submittedCount: submittedList.length,
        notSubmittedCount: notSubmittedList.length,
        submittedAssignments: submittedList,
        notSubmittedAssignments: notSubmittedList,
        profileImage: student.profileImage
      };
    }));

    res.json(result);
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






// ==================== Dashboard Summary ====================
exports.getDashboardSummary = async (req, res) => {
  try {
    // Total counts
    const totalStudents = await Student.countDocuments();
    const totalAssignments = await Assignment.countDocuments();
    
    // Get only distinct student submissions (count students who submitted at least once)
    const studentsWithSubmissions = await Submission.distinct('studentId');
    const totalStudentsSubmitted = studentsWithSubmissions.length;

    // Calculate average progress from all submissions
    const avgProgressData = await Submission.aggregate([
      { 
        $group: { 
          _id: null,
          avgProgress: { $avg: "$overallProgress" },
          totalSubmissions: { $sum: 1 }
        } 
      }
    ]);

    const result = {
      totalStudents,
      totalStudentsSubmitted, // More meaningful than totalSubmissions
      totalAssignments,
      averageProgress: avgProgressData[0]?.avgProgress 
        ? Number(avgProgressData[0].avgProgress.toFixed(2)) 
        : 0,
      totalSubmissions: avgProgressData[0]?.totalSubmissions || 0
    };

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};








//recent students

exports.getRecentStudents = async (req, res) => {
  try {
    // Get latest students (limit can be passed as query ?limit=5)
    const limit = parseInt(req.query.limit) || 5;

    const students = await Student.find({}, { name: 1, courseName: 1, _id: 0 })
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



