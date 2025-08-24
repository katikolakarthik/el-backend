const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Student', 
    required: true 
  },
  sessionId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  userAgent: { 
    type: String, 
    required: true 
  },
  ipAddress: { 
    type: String, 
    required: true 
  },
  lastActivity: { 
    type: Date, 
    default: Date.now 
  },
  expiresAt: { 
    type: Date, 
    required: true,
    index: { expireAfterSeconds: 0 }
  }
});

// Create TTL index for automatic cleanup
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Session", sessionSchema);
