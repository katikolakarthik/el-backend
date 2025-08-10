const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  password: { type: String, required: true },
  courseName: String,
  paidAmount: Number,
  remainingAmount: Number,
  enrolledDate: Date,
  profileImage: String,
  role: { type: String, default: "user" }
});

module.exports = mongoose.model("Student", studentSchema);