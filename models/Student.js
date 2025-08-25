const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  password: { type: String, required: true },
  courseName: String,
  paidAmount: Number,
  remainingAmount: Number,
  enrolledDate: Date,
  expiryDate: { type: Date, required: false}, // Add expiry date field
  profileImage: String,
  role: { type: String, default: "user" },
  // Add a field that will be used for TTL index
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }
});

// Create a TTL index on expiresAt field
studentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Student", studentSchema);