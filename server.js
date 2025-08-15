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

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      "http://localhost:5173",
      "https://el-front-ebon.vercel.app"
    ];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));

app.use(express.json());

// Database Connection
mongoose.connect("mongodb+srv://adepusanjay444:12345@cluster0.nbd7uta.mongodb.net/Wellmed")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// Test Route
app.get("/", (req, res) => res.send("Server is running 🚀"));

// ================== Student Routes ==================
app.post("/admin/add-student", upload.single("profileImage"), studentController.addStudent);
app.get("/admin/students", studentController.getStudents);
app.delete("/admin/student/:id", studentController.deleteStudent);
app.put("/admin/student/:id", upload.single("profileImage"), studentController.updateStudent);
app.post("/admin/create", studentController.addAdmin);
app.post("/login", studentController.login);
app.get("/admin/students/summary", studentController.getStudentsWithSummary);
app.get("/student/profile/:studentId", studentController.getStudentProfile);
app.get("/admin/dashboard", studentController.getDashboardSummary);
app.get("/admin/studentslist", studentController.getRecentStudents);
app.get('/student/:studentId/summary', studentController.getStudentSummary);

// ================== Assignment Routes ==================
app.post("/admin/add-assignment", 
  upload.fields([{ name: "assignmentPdf", maxCount: 100 }]), 
  assignmentController.addAssignment
);
app.get("/admin/assignments", assignmentController.getAssignments);
app.delete("/admin/assignments/:id", assignmentController.deleteAssignmentById);
app.delete("/admin/assignments", assignmentController.deleteAllAssignments);
app.delete("/admin/assignments/:moduleId/sub/:subId", assignmentController.deleteSubAssignment);
app.get("/admin/recentassignments", assignmentController.getRecentAssignments);
app.get("/assignments/student/:studentId", assignmentController.getAssignmentsByStudentId);

// ================== Submission Routes ==================
app.post("/student/submit-assignment", submissionController.submitAssignment);
app.post("/student/submithistory", submissionController.getStudentAssignmentSummary);

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

// Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = app;