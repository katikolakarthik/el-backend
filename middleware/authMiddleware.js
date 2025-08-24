const sessionController = require("../controllers/sessionController");

// Middleware to validate session
exports.validateSession = async (req, res, next) => {
  try {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
      return res.status(401).json({ 
        success: false, 
        message: "Session ID required" 
      });
    }
    
    const session = await sessionController.validateSession(sessionId);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid or expired session" 
      });
    }
    
    // Add user info to request
    req.user = {
      id: session.userId,
      sessionId: session.sessionId
    };
    
    next();
  } catch (error) {
    console.error("Session validation error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
  }
};

// Middleware to check if user has specific role
exports.requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      // First validate session
      await exports.validateSession(req, res, async () => {
        // Get user details from database to check role
        const Student = require("../models/Student");
        const user = await Student.findById(req.user.id);
        
        if (!user) {
          return res.status(404).json({ 
            success: false, 
            message: "User not found" 
          });
        }
        
        if (!allowedRoles.includes(user.role)) {
          return res.status(403).json({ 
            success: false, 
            message: "Access denied" 
          });
        }
        
        // Add role to request
        req.user.role = user.role;
        next();
      });
    } catch (error) {
      console.error("Role validation error:", error);
      return res.status(500).json({ 
        success: false, 
        message: "Internal server error" 
      });
    }
  };
};
