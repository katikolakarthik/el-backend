const Session = require("../models/Session");
const { v4: uuidv4 } = require("uuid");

// Create a new session
exports.createSession = async (userId, userAgent, ipAddress) => {
  try {
    // First, invalidate any existing sessions for this user
    await Session.deleteMany({ userId });
    
    // Create new session
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    const session = new Session({
      userId,
      sessionId,
      userAgent,
      ipAddress,
      expiresAt
    });
    
    await session.save();
    return sessionId;
  } catch (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }
};

// Validate session
exports.validateSession = async (sessionId) => {
  try {
    const session = await Session.findOne({ 
      sessionId,
      expiresAt: { $gt: new Date() }
    });
    
    if (!session) {
      return null;
    }
    
    // Update last activity
    session.lastActivity = new Date();
    await session.save();
    
    return session;
  } catch (error) {
    throw new Error(`Failed to validate session: ${error.message}`);
  }
};

// Invalidate session (logout)
exports.invalidateSession = async (sessionId) => {
  try {
    const result = await Session.deleteOne({ sessionId });
    return result.deletedCount > 0;
  } catch (error) {
    throw new Error(`Failed to invalidate session: ${error.message}`);
  }
};

// Invalidate all sessions for a user
exports.invalidateAllUserSessions = async (userId) => {
  try {
    const result = await Session.deleteMany({ userId });
    return result.deletedCount;
  } catch (error) {
    throw new Error(`Failed to invalidate user sessions: ${error.message}`);
  }
};

// Get active sessions for a user
exports.getUserActiveSessions = async (userId) => {
  try {
    const sessions = await Session.find({ 
      userId,
      expiresAt: { $gt: new Date() }
    });
    return sessions;
  } catch (error) {
    throw new Error(`Failed to get user sessions: ${error.message}`);
  }
};
