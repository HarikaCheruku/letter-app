const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const { Readable } = require('stream');
const { Server } = require('socket.io');
const http = require('http');
const { v4: uuidv4 } = require('uuid'); // For generating unique room IDs
require('dotenv').config();
const path = require('path');


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test database connection
pool.connect((err) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Connected to database');
  }
});

// Google OAuth2 client setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Socket.IO: Authenticate WebSocket connections
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
    socket.user = user;
    next();
  });
});

// Socket.IO: Handle real-time collaboration
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id, 'User:', socket.user.email);

  socket.on('join-room', async (roomId) => {
    try {
      // Validate the room ID
      const { rows } = await pool.query('SELECT * FROM rooms WHERE room_id = $1', [roomId]);
      if (rows.length === 0) {
        socket.emit('room-error', 'Invalid room ID');
        return;
      }

      socket.join(roomId);
      console.log(`User ${socket.user.email} (${socket.id}) joined room ${roomId}`);

      // Send the current document content to the user
      socket.emit('load-document', rows[0].content || '');
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('room-error', 'Failed to join room');
    }
  });

  socket.on('send-changes', async (data) => {
    const { roomId, delta, content } = data;
    socket.to(roomId).emit('receive-changes', delta);
    console.log(`Broadcasting changes in room ${roomId} by ${socket.user.email}:`, delta);

    // Save the updated content to the database
    try {
      await pool.query('UPDATE rooms SET content = $1 WHERE room_id = $2', [content, roomId]);
    } catch (error) {
      console.error('Error saving document content:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id, 'User:', socket.user.email);
  });
});

// Google OAuth route
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file'],
    access_type: 'offline',
  });
  res.redirect(url);
});

// Google OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  console.log('Received Google OAuth code:', code);
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Google OAuth tokens:', tokens);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const { id, email } = userInfo.data;
    console.log('User info:', { id, email });

    const { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [id]);
    let user = rows[0];
    console.log('Database user query result:', rows);

    if (!user) {
      const result = await pool.query(
        'INSERT INTO users (google_id, email, role) VALUES ($1, $2, $3) RETURNING *',
        [id, email || `${id}@google.com`, 'user']
      );
      user = result.rows[0];
      console.log('New user inserted:', user);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.redirect(`http://localhost:3000/editor?token=${token}&accessToken=${tokens.access_token}`);
  } catch (error) {
    console.error('Google auth error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
});

// Middleware to authenticate JWT
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  console.log('Auth token received:', token);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Middleware to check if the user is an admin
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admins only' });
  }
  next();
};

// Create a new collaborative room
app.post('/api/room', authenticateToken, async (req, res) => {
  try {
    const roomId = uuidv4(); // Generate a unique room ID
    const result = await pool.query(
      'INSERT INTO rooms (room_id, creator_id) VALUES ($1, $2) RETURNING *',
      [roomId, req.user.id]
    );
    res.json({ roomId: result.rows[0].room_id });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Draft routes
app.post('/api/draft', authenticateToken, async (req, res) => {
  const { content } = req.body;
  console.log('Received draft save request:', req.user, content);
  try {
    const result = await pool.query(
      'INSERT INTO drafts (user_id, content) VALUES ($1, $2) RETURNING *',
      [req.user.id, content]
    );
    console.log('Draft saved:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to save draft:', error);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

app.get('/api/drafts', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM drafts WHERE user_id = $1', [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch drafts:', error);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
});

app.delete('/api/draft/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM drafts WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Draft not found or not authorized' });
    }
    console.log('Draft deleted:', result.rows[0]);
    res.json({ message: 'Draft deleted successfully' });
  } catch (error) {
    console.error('Failed to delete draft:', error);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

// Admin-only endpoint: Fetch all drafts (from all users)
app.get('/api/admin/drafts', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT drafts.*, users.email FROM drafts JOIN users ON drafts.user_id = users.id');
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch all drafts:', error);
    res.status(500).json({ error: 'Failed to fetch all drafts' });
  }
});

// Admin-only endpoint: Delete any draft
app.delete('/api/admin/draft/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM drafts WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    console.log('Draft deleted by admin:', result.rows[0]);
    res.json({ message: 'Draft deleted successfully' });
  } catch (error) {
    console.error('Failed to delete draft:', error);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

// Save to Google Drive with folder organization
app.post('/api/save-to-drive', authenticateToken, async (req, res) => {
  const { content, accessToken } = req.body;
  console.log('Received Google Drive save request:', req.user, content);

  try {
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const folderQuery = "name='Letters' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    const folderResponse = await drive.files.list({
      q: folderQuery,
      fields: 'files(id, name)',
    });

    let folderId;
    if (folderResponse.data.files.length > 0) {
      folderId = folderResponse.data.files[0].id;
      console.log('Found "Letters" folder with ID:', folderId);
    } else {
      const folderMetadata = {
        name: 'Letters',
        mimeType: 'application/vnd.google-apps.folder',
      };
      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id',
      });
      folderId = folder.data.id;
      console.log('Created "Letters" folder with ID:', folderId);
    }

    const fileMetadata = {
      name: `Letter-${Date.now()}.html`,
      mimeType: 'text/html',
      parents: [folderId],
    };

    const buffer = Buffer.from(content, 'utf-8');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const response = await drive.files.create({
      resource: fileMetadata,
      media: {
        mimeType: 'text/html',
        body: stream,
      },
      fields: 'id',
    });

    console.log('Google Drive saved:', response.data);
    res.json({ message: 'Letter saved to Google Drive in "Letters" folder', fileId: response.data.id });
  } catch (error) {
    console.error('Failed to save to Google Drive:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to save to Google Drive', details: error.message });
  }
});
// Serve React frontend static files
app.use(express.static(path.join(__dirname, '../client/build')));

// Handle all other routes by serving the React app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));