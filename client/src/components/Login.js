import React from 'react';
import { useNavigate } from 'react-router-dom';
import backgroundImage from '../images/vintage-image.jpg';

function Login() {
  const navigate = useNavigate();

  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:5001/auth/google';
  };

  return (
    <div
      className="login-container"
      style={{
        background: `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url(${backgroundImage}) no-repeat center center/cover`,
      }}
    >
      <h1 className="fade-in">Letter App</h1>
      <p className="fade-in">Sign in with Google to start writing letters</p>
      <button className="fade-in" onClick={handleGoogleLogin}>Login with Google</button>
    </div>
  );
}

export default Login;