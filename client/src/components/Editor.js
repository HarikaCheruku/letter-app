import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { jwtDecode } from 'jwt-decode';
import { useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';

function Editor() {
  const [content, setContent] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [allDrafts, setAllDrafts] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [userRole, setUserRole] = useState('user');
  const [roomId, setRoomId] = useState('');
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [error, setError] = useState(null); // Added for error handling
  const quillRef = useRef(null);
  const socketRef = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();

  // Get the token and access token from the URL
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get('token');
  const accessToken = queryParams.get('accessToken');

  // Store the token in localStorage and decode the role
  useEffect(() => {
    if (token) {
      try {
        localStorage.setItem('token', token);
        const decoded = jwtDecode(token);
        setUserRole(decoded.role || 'user');
        console.log('Token decoded:', decoded);
        console.log('User role set to:', decoded.role || 'user');
      } catch (err) {
        console.error('Failed to decode token:', err.message);
        setError('Invalid token. Please log in again.');
        navigate('/');
      }
    } else {
      console.error('No token found in URL');
      setError('No token found. Please log in again.');
      navigate('/');
    }
  }, [token, navigate]);

  // Connect to Socket.IO server
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      console.error('No token in localStorage for Socket.IO connection');
      setError('Authentication required. Please log in again.');
      navigate('/');
      return;
    }

    console.log('Connecting to Socket.IO with backend URL:', process.env.REACT_APP_BACKEND_URL);
    socketRef.current = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001', {
      auth: { token: storedToken },
      transports: ['websocket'], // Force WebSocket transport for better mobile compatibility
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => {
      console.log('Socket.IO connected:', socketRef.current.id);
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error.message);
      setError('Failed to connect to collaboration server. Please try again.');
    });

    socketRef.current.on('room-error', (message) => {
      console.log('Room error:', message);
      setError(message);
      setIsCollaborating(false);
      setRoomId('');
    });

    socketRef.current.on('load-document', (documentContent) => {
      console.log('Loaded document content:', documentContent);
      setContent(documentContent);
    });

    // Listen for draft updates (admin only)
    if (userRole === 'admin') {
      socketRef.current.on('draft-saved', (newDraft) => {
        console.log('Received draft-saved event:', newDraft);
        setAllDrafts((prevDrafts) => [...prevDrafts, newDraft]);
      });

      socketRef.current.on('draft-deleted', (draftId) => {
        console.log('Received draft-deleted event:', draftId);
        setAllDrafts((prevDrafts) => prevDrafts.filter((draft) => draft.id !== parseInt(draftId)));
      });
    }

    return () => {
      console.log('Disconnecting Socket.IO');
      socketRef.current.disconnect();
    };
  }, [userRole]);

  // Handle real-time collaboration
  useEffect(() => {
    if (!isCollaborating || !quillRef.current) return;

    const quill = quillRef.current.getEditor();
    console.log('Starting collaboration for room:', roomId);

    socketRef.current.emit('join-room', roomId);

    socketRef.current.on('receive-changes', (delta) => {
      console.log('Received changes:', delta);
      quill.updateContents(delta, 'api');
    });

    const handleTextChange = (delta, oldDelta, source) => {
      console.log('Text change detected:', { delta, source });
      if (source !== 'user') return;
      socketRef.current.emit('send-changes', { roomId, delta, content });
    };

    quill.on('text-change', handleTextChange);

    return () => {
      quill.off('text-change', handleTextChange);
      socketRef.current.off('receive-changes');
    };
  }, [isCollaborating, roomId, content]);

  // Sync Quill content with state
  const handleEditorChange = (value) => {
    setContent(value);
  };

  // Fetch user's drafts
  useEffect(() => {
    const fetchDrafts = async () => {
      const storedToken = localStorage.getItem('token');
      console.log('Fetching drafts with token:', storedToken);
      if (!storedToken) {
        console.error('No token found in localStorage');
        setError('Authentication required. Please log in again.');
        navigate('/');
        return;
      }
      try {
        const res = await axios.get(`${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001'}/api/drafts`, {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        setDrafts(res.data);
        console.log('Drafts fetched:', res.data);
      } catch (error) {
        console.error('Failed to fetch drafts:', error.response?.data || error.message);
        setError('Failed to fetch drafts. Please try again.');
      }
    };
    fetchDrafts();
  }, [navigate]);

  // Fetch all drafts (admin only)
  const fetchAllDrafts = async () => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken || userRole !== 'admin') return;
    try {
      const res = await axios.get(`${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001'}/api/admin/drafts`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      setAllDrafts(res.data);
      console.log('All drafts fetched (admin):', res.data);
    } catch (error) {
      console.error('Failed to fetch all drafts:', error.response?.data || error.message);
      setError('Failed to fetch all drafts (admin).');
    }
  };

  useEffect(() => {
    fetchAllDrafts();
  }, [userRole]);

  const saveDraft = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Authentication required. Please log in again.');
      navigate('/');
      return;
    }
    if (!content) {
      setError('Please write something before saving a draft.');
      return;
    }
    console.log('Saving draft with content:', content, 'and token:', token);
    try {
      const res = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001'}/api/draft`,
        { content },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDrafts([...drafts, res.data]);
      setContent('');
      console.log('Draft saved:', res.data);

      // Fetch all drafts again for admin view (as a fallback)
      if (userRole === 'admin') {
        fetchAllDrafts();
      }
    } catch (error) {
      console.error('Failed to save draft:', error.response?.data || error.message);
      setError('Failed to save draft: ' + (error.response?.data?.details || error.message));
    }
  };

  const saveToDrive = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Authentication required. Please log in again.');
      navigate('/');
      return;
    }
    if (!accessToken) {
      setError('Google access token missing. Please log in again.');
      navigate('/');
      return;
    }
    if (!content) {
      setError('Please write a letter before saving to Google Drive.');
      return;
    }
    setIsSaving(true);
    console.log('Saving to Google Drive with content:', content, 'and token:', token, 'accessToken:', accessToken);
    try {
      const res = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001'}/api/save-to-drive`,
        { content, accessToken },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setError(null); // Clear any previous errors
      alert(res.data.message);
      setContent('');
      console.log('Google Drive response:', res.data);
    } catch (error) {
      console.error('Failed to save to Google Drive:', error.response?.data || error.message);
      setError(`Failed to save to Google Drive: ${error.response?.data?.details || error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteDraft = async (id) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Authentication required. Please log in again.');
      navigate('/');
      return;
    }
    if (!confirm('Are you sure you want to delete this draft?')) return;
    try {
      await axios.delete(`${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001'}/api/draft/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDrafts(drafts.filter((draft) => draft.id !== id));
      setError(null);
      alert('Draft deleted successfully');
      console.log('Draft deleted:', id);

      // Fetch all drafts again for admin view (as a fallback)
      if (userRole === 'admin') {
        fetchAllDrafts();
      }
    } catch (error) {
      console.error('Failed to delete draft:', error.response?.data || error.message);
      setError('Failed to delete draft: ' + (error.response?.data?.details || error.message));
    }
  };

  const deleteDraftAdmin = async (id) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Authentication required. Please log in again.');
      navigate('/');
      return;
    }
    if (!confirm('Are you sure you want to delete this draft (admin)?')) return;
    try {
      await axios.delete(`${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001'}/api/admin/draft/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAllDrafts(allDrafts.filter((draft) => draft.id !== id));
      setError(null);
      alert('Draft deleted successfully (admin)');
      console.log('Draft deleted by admin:', id);
    } catch (error) {
      console.error('Failed to delete draft (admin):', error.response?.data || error.message);
      setError('Failed to delete draft (admin): ' + (error.response?.data?.details || error.message));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  const createRoom = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Authentication required. Please log in again.');
      navigate('/');
      return;
    }
    try {
      const res = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001'}/api/room`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRoomId(res.data.roomId);
      setError(null);
      alert(`Room created! Share this Room ID: ${res.data.roomId}`);
      console.log('Room created:', res.data.roomId);
    } catch (error) {
      console.error('Failed to create room:', error.response?.data || error.message);
      setError('Failed to create room: ' + (error.response?.data?.details || error.message));
    }
  };

  const startCollaboration = () => {
    if (!roomId) {
      setError('Please enter a room ID to start collaboration.');
      return;
    }
    setIsCollaborating(true);
    setContent('');
    setError(null);
  };

  const shareRoomId = () => {
    if (!roomId) {
      setError('No room ID to share. Create or join a room first.');
      return;
    }
    navigator.clipboard.writeText(roomId).then(() => {
      setError(null);
      alert('Room ID copied to clipboard! Share it with others to collaborate.');
    }).catch((error) => {
      console.error('Failed to copy room ID:', error);
      setError('Failed to copy room ID. Please copy it manually: ' + roomId);
    });
  };

  const leaveCollaboration = () => {
    setIsCollaborating(false);
    setRoomId('');
    setContent('');
    setError(null);
  };

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      ['link'],
      ['clean'],
    ],
  };

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet',
    'link',
  ];

  return (
    <div className="editor-container">
      {error && (
        <div className="error-message" style={{ color: 'red', marginBottom: '10px' }}>
          {error}
        </div>
      )}
      <div className="header">
        <h1>Letter Editor</h1>
        <button className="logout-btn" onClick={handleLogout}>Logout</button>
      </div>

      <div className="collaboration-controls">
        <button className="collab-btn" onClick={createRoom} disabled={isCollaborating}>
          Create Room
        </button>
        <input
          type="text"
          placeholder="Enter Room ID for Collaboration"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          disabled={isCollaborating}
        />
        <button
          className="collab-btn"
          onClick={startCollaboration}
          disabled={isCollaborating}
        >
          Start Collaboration
        </button>
        {isCollaborating && (
          <button className="collab-btn" onClick={leaveCollaboration}>
            Leave Collaboration
          </button>
        )}
        <button className="collab-btn" onClick={shareRoomId}>
          Share Room ID
        </button>
      </div>

      <ReactQuill
        ref={quillRef}
        value={content}
        onChange={handleEditorChange}
        modules={modules}
        formats={formats}
        placeholder="Write your letter here..."
        style={{ height: '300px', marginBottom: '50px' }}
      />
      <p className="char-counter">{content.replace(/<[^>]+>/g, '').length} characters</p>
      <div className="button-group">
        <button className="fade-in" onClick={saveDraft}>Save Draft</button>
        <button className="fade-in" onClick={saveToDrive} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save to Google Drive'}
        </button>
      </div>
      <h2>Your Drafts</h2>
      <ul>
        {drafts.map((draft) => {
          const previewText = draft.content.replace(/<[^>]+>/g, '');
          const preview = previewText.length > 50 ? `${previewText.substring(0, 50)}...` : previewText;
          return (
            <li key={draft.id}>
              <span onClick={() => setContent(draft.content)}>
                {preview}
              </span>
              <button className="delete-btn" onClick={() => deleteDraft(draft.id)}>
                Delete
              </button>
            </li>
          );
        })}
      </ul>

      {userRole === 'admin' && (
        <>
          <h2 className="admin-section">All Drafts (Admin)</h2>
          <ul>
            {allDrafts.map((draft) => {
              const previewText = draft.content.replace(/<[^>]+>/g, '');
              const preview = previewText.length > 50 ? `${previewText.substring(0, 50)}...` : previewText;
              return (
                <li key={draft.id}>
                  <span onClick={() => setContent(draft.content)}>
                    {preview} (by {draft.email})
                  </span>
                  <button className="delete-btn" onClick={() => deleteDraftAdmin(draft.id)}>
                    Delete (Admin)
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

export default Editor;