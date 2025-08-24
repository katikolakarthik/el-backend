# Session Management System

This document explains the new session management system implemented to prevent multiple active sessions for the same user.

## Overview

The system now automatically logs out users from previous browser sessions when they log in from a new browser. This ensures that only one active session exists per user at any time.

## How It Works

### 1. Session Creation
- When a user logs in, a unique session ID is generated using UUID
- The session is stored in the database with user ID, user agent, IP address, and expiration time
- Any existing sessions for the same user are automatically invalidated
- The session ID is returned to the frontend and stored in localStorage

### 2. Session Validation
- All protected routes now require a valid session ID in the `x-session-id` header
- Sessions are validated against the database on each request
- Sessions automatically expire after 24 hours (configurable)
- Invalid or expired sessions result in automatic logout

### 3. Multiple Browser Prevention
- When a user logs in from Browser A, a session is created
- If the same user logs in from Browser B, the previous session from Browser A is automatically invalidated
- Browser A will be logged out on the next request due to invalid session

## Database Schema

### Session Model
```javascript
{
  userId: ObjectId,        // Reference to Student model
  sessionId: String,       // Unique UUID
  userAgent: String,       // Browser/device info
  ipAddress: String,       // User's IP address
  lastActivity: Date,      // Last request time
  expiresAt: Date          // Automatic expiration time
}
```

## API Endpoints

### Login
```
POST /login
Body: { name, password }
Response: { success, user, sessionId }
```

### Logout
```
POST /logout
Headers: { x-session-id: <sessionId> }
Response: { success, message }
```

### Validate Session
```
GET /validate-session
Headers: { x-session-id: <sessionId> }
Response: { success, user }
```

## Frontend Integration

### 1. Login
- Store sessionId in localStorage after successful login
- Include sessionId in all subsequent API requests

### 2. API Calls
- Use the new `api` utility from `src/utils/api.js`
- Automatically includes session ID in headers
- Handles session expiration automatically

### 3. Session Validation
- Use `useSessionValidation` hook in components
- Automatically validates sessions every 5 minutes
- Redirects to login on session expiration

### 4. Logout
- Call logout endpoint to invalidate server-side session
- Clear all localStorage data
- Redirect to login page

## Security Features

1. **Session Uniqueness**: Only one active session per user
2. **Automatic Expiration**: Sessions expire after 24 hours
3. **IP Tracking**: Records user's IP address for security
4. **User Agent Tracking**: Records browser/device information
5. **Automatic Cleanup**: Expired sessions are automatically removed from database

## Configuration

### Session Duration
- Default: 24 hours
- Configurable in `sessionController.js`:
```javascript
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
```

### Validation Frequency
- Frontend validates sessions every 5 minutes
- Configurable in `useSessionValidation.js`:
```javascript
setInterval(validateSession, 5 * 60 * 1000); // 5 minutes
```

## Testing the Feature

1. **Login from Browser A**: User logs in successfully
2. **Login from Browser B**: Same credentials, previous session is invalidated
3. **Browser A**: Next request will fail with 401, user is redirected to login
4. **Browser B**: Continues to work normally

## Error Handling

- **401 Unauthorized**: Invalid or expired session
- **400 Bad Request**: Missing session ID
- **500 Internal Server Error**: Server-side session management error

## Migration Notes

- Existing users will need to log in again to get session IDs
- All API calls now require session validation
- Protected routes automatically redirect to login on session expiration
