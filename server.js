const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const { upload } = require("./config/cloudinary");

const studentController = require("./controllers/studentController");
const assignmentController = require("./controllers/assignmentController");
const submissionController = require("./controllers/submissionController");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "http://localhost:5173",
        "https://el-front-umber.vercel.app"
      ];
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);


app.use(express.json());

// MongoDB Connection
mongoose.connect(
  "mongodb+srv://adepusanjay444:12345@cluster0.nbd7uta.mongodb.net/Wellmed",
  { useNewUrlParser: true, useUnifiedTopology: true }
).then(() => console.log("✅ MongoDB Connected"))
 .catch(err => console.error("❌ MongoDB Error:", err));

// Test Route
app.get("/", (req, res) => res.send("Server is running 🚀"));

// ================== Routes ==================

// Add Student
app.post("/admin/add-student", upload.single("profileImage"), studentController.addStudent);

// Get Students
app.get("/admin/students", studentController.getStudents);

// Delete Student
app.delete("/admin/student/:id", studentController.deleteStudent);


// ================== Assignment Routes ==================

// Add Assignment Module (with sub-assignments)
app.post(
  "/admin/add-assignment",
  upload.fields([{ name: "assignmentPdf", maxCount: 100 }]),
  assignmentController.addAssignment
);

// Get All Assignments (Hierarchy)
app.get("/admin/assignments", assignmentController.getAssignments);

// Delete whole module by ID
app.delete("/admin/assignments/:id", assignmentController.deleteAssignmentById);

// Delete all modules
app.delete("/admin/assignments", assignmentController.deleteAllAssignments);

// Delete specific sub-assignment from a module
app.delete(
  "/admin/assignments/:moduleId/sub/:subId",
  assignmentController.deleteSubAssignment
);






// Student Submission
app.post("/student/submit-assignment", submissionController.submitAssignment);



// With
app.post("/login", studentController.login);

// Add admin creation route (make sure it's protected or used carefully)
app.post("/admin/create", studentController.addAdmin);

// Update Student
app.put("/admin/student/:id", upload.single("profileImage"), studentController.updateStudent);
// =============================================
// Get Students with summary info
app.get("/admin/students/summary", studentController.getStudentsWithSummary);

// Get student submissions with optional filtering by module/submodule
app.get("/student/submissions", studentController.getStudentSubmissions);

// Get student profile by ID
app.get("/student/profile/:studentId", studentController.getStudentProfile);

app.get("/admin/dashboard", studentController.getDashboardSummary);


app.get("/admin/studentslist", studentController.getRecentStudents);

app.get("/admin/recentassignments", studentController.getRecentAssignments);

app.post("/student/submithistory", submissionController.getStudentAssignmentSummary);



app.get("/assignments/student/:studentId", assignmentController.getAssignmentsByStudentId);



// GET /assignments/:assignmentId/student/:studentId
app.get("/assignments/:assignmentId/student/:studentId", assignmentController.getAssignmentDetailsForStudent);


//individual student summary
app.get('/student/:studentId/summary', studentController.getStudentSummary);


app.get("/student/submission", submissionController.getSubmission);


// ✅ Get full result (parent or sub-assignment) using POST
app.post("/result", studentController.getAssignmentResult);


// Edit Assignment Module (update single or multi-sub-assignments)
app.put(
  "/admin/edit-assignment/:assignmentId",
  upload.fields([{ name: "assignmentPdf", maxCount: 100 }]),
  assignmentController.editAssignment
);



app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = app;


