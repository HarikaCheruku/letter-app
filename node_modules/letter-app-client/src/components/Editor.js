import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import {jwtDecode} from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

function Editor() {
  const [content, setContent] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [allDrafts, setAllDrafts] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [userRole, setUserRole] = useState('user');
  const [roomId, setRoomId] = useState('');
  const [isCollaborating, setIsCollaborating] = useState(false);
  const quillRef = useRef(null);
  const socketRef = useRef(null);

  const navigate = useNavigate();

  // Get the token and access token from the URL
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const accessToken = urlParams.get('accessToken');

  // Store the token in localStorage and decode the role
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      const decoded = jwtDecode(token);
      setUserRole(decoded.role || 'user');
      console.log('User role:', decoded.role);
    }
  }, [token]);

  // Connect to Socket.IO server
  useEffect(() => {
    const token = localStorage.getItem('token');
    socketRef.current = io('http://localhost:5001', {
      auth: { token },
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error.message);
    });

    socketRef.current.on('room-error', (message) => {
      alert(message);
      setIsCollaborating(false);
      setRoomId('');
    });

    socketRef.current.on('load-document', (documentContent) => {
      setContent(documentContent);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  // Handle real-time collaboration
  useEffect(() => {
    if (!isCollaborating || !quillRef.current) return;

    const quill = quillRef.current.getEditor();

    socketRef.current.emit('join-room', roomId);

    socketRef.current.on('receive-changes', (delta) => {
      quill.updateContents(delta, 'api');
    });

    const handleTextChange = (delta, oldDelta, source) => {
      if (source !== 'user') return;
      socketRef.current.emit('send-changes', { roomId, delta, content });
    };

    quill.on('text-change', handleTextChange);

    return () => {
      quill.off('text-change', handleTextChange);
      socketRef.current.off('receive-changes');
    };
  }, [isCollaborating, roomId, content]);

  // Fetch user's drafts
  useEffect(() => {
    const fetchDrafts = async () => {
      const storedToken = localStorage.getItem('token');
      console.log('Fetching drafts with token:', storedToken);
      if (!storedToken) {
        console.error('No token found in localStorage');
        return;
      }
      try {
        const res = await axios.get('http://localhost:5001/api/drafts', {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        setDrafts(res.data);
        console.log('Drafts fetched:', res.data);
      } catch (error) {
        console.error('Failed to fetch drafts:', error.response?.data || error.message);
      }
    };
    fetchDrafts();
  }, []);

  // Fetch all drafts (admin only)
  useEffect(() => {
    const fetchAllDrafts = async () => {
      const storedToken = localStorage.getItem('token');
      if (!storedToken || userRole !== 'admin') return;
      try {
        const res = await axios.get('http://localhost:5001/api/admin/drafts', {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        setAllDrafts(res.data);
        console.log('All drafts fetched (admin):', res.data);
      } catch (error) {
        console.error('Failed to fetch all drafts:', error.response?.data || error.message);
      }
    };
    fetchAllDrafts();
  }, [userRole]);

  const saveDraft = async () => {
    const token = localStorage.getItem('token');
    console.log('Saving draft with content:', content, 'and token:', token);
    try {
      const res = await axios.post(
        'http://localhost:5001/api/draft',
        { content },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDrafts([...drafts, res.data]);
      setContent('');
      setIsCollaborating(false);
      setRoomId('');
      console.log('Draft saved:', res.data);
    } catch (error) {
      console.error('Failed to save draft:', error.response?.data || error.message);
    }
  };

  const saveToDrive = async () => {
    const token = localStorage.getItem('token');
    if (!content) {
      alert('Please write a letter before saving to Google Drive');
      return;
    }
    setIsSaving(true);
    console.log('Saving to Google Drive with content:', content, 'and token:', token);
    try {
      const res = await axios.post(
        'http://localhost:5001/api/save-to-drive',
        { content, accessToken },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(res.data.message);
      setContent('');
      setIsCollaborating(false);
      setRoomId('');
      console.log('Google Drive response:', res.data);
    } catch (error) {
      console.error('Failed to save to Google Drive:', error.response?.data || error.message);
      alert(`Failed to save to Google Drive: ${error.response?.data?.details || error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteDraft = async (id) => {
    const token = localStorage.getItem('token');
    if (!confirm('Are you sure you want to delete this draft?')) return;
    try {
      await axios.delete(`http://localhost:5001/api/draft/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDrafts(drafts.filter((draft) => draft.id !== id));
      alert('Draft deleted successfully');
      console.log('Draft deleted:', id);
    } catch (error) {
      console.error('Failed to delete draft:', error.response?.data || error.message);
      alert('Failed to delete draft');
    }
  };

  const deleteDraftAdmin = async (id) => {
    const token = localStorage.getItem('token');
    if (!confirm('Are you sure you want to delete this draft (admin)?')) return;
    try {
      await axios.delete(`http://localhost:5001/api/admin/draft/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAllDrafts(allDrafts.filter((draft) => draft.id !== id));
      alert('Draft deleted successfully (admin)');
      console.log('Draft deleted by admin:', id);
    } catch (error) {
      console.error('Failed to delete draft (admin):', error.response?.data || error.message);
      alert('Failed to delete draft (admin)');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  const createRoom = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.post(
        'http://localhost:5001/api/room',
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRoomId(res.data.roomId);
      alert(`Room created! Share this Room ID: ${res.data.roomId}`);
    } catch (error) {
      console.error('Failed to create room:', error.response?.data || error.message);
      alert('Failed to create room');
    }
  };

  const startCollaboration = () => {
    if (!roomId) {
      alert('Please enter a room ID to start collaboration');
      return;
    }
    setIsCollaborating(true);
    setContent('');
  };

  const shareRoomId = () => {
    if (!roomId) {
      alert('No room ID to share. Create or join a room first.');
      return;
    }
    navigator.clipboard.writeText(roomId).then(() => {
      alert('Room ID copied to clipboard! Share it with others to collaborate.');
    }).catch((error) => {
      console.error('Failed to copy room ID:', error);
      alert('Failed to copy room ID. Please copy it manually: ' + roomId);
    });
  };

  const leaveCollaboration = () => {
    setIsCollaborating(false);
    setRoomId('');
    setContent('');
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
        onChange={setContent}
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