<a href="https://letter-app-hdli.onrender.com/" target="_blank">Letter App 🔗</a>

<h1>Letter App</h1>

<h2>Overview</h2>
<p>
    The Letter App is a collaborative writing platform designed to simplify the process of drafting, editing, and sharing letters. 
    It addresses the challenges of real-time collaboration by integrating Google OAuth for secure user authentication, 
    Socket.IO for live collaboration, and Google Drive for seamless storage. Users can create collaborative rooms, save drafts, 
    and export their letters to Google Drive in an organized "Letters" folder. 
    The app also includes admin features for managing drafts, ensuring a streamlined experience for both individual users and administrators.
</p>

<h2>Live Deployment</h2>
<p>
    The app is deployed live on Render and can be accessed on both laptops and mobile devices.  
    Click here to access:  
    <a href="https://letter-app-hdli.onrender.com/" target="_blank"><strong>Letter App</strong></a>
</p>

<h2>Features</h2>
<ul>
    <li><strong>Google OAuth Authentication:</strong> Securely log in using Google accounts to access the app.</li>
    <li><strong>Real-Time Collaboration:</strong> Collaborate on letters in real-time using Socket.IO, with changes broadcasted instantly to all users in the same room.</li>
    <li><strong>Draft Management:</strong> Save, retrieve, and delete drafts, with admin users able to view and manage all drafts.</li>
    <li><strong>Google Drive Integration:</strong> Export letters to Google Drive, automatically organized in a "Letters" folder.</li>
    <li><strong>Admin Features:</strong> Admins can monitor and delete drafts, receiving real-time updates via Socket.IO.</li>
    <li><strong>Secure Authentication:</strong> Uses JWT for secure API authentication and role-based access control.</li>
</ul>

<h2>Technologies Used</h2>
<ul>
    <li>Node.js (Express, Socket.IO) for the backend server</li>
    <li>React for the frontend user interface</li>
    <li>PostgreSQL for managing user data, rooms, and drafts</li>
    <li>Google APIs (OAuth2, Drive API) for authentication and file storage</li>
    <li>JWT (JSON Web Tokens) for secure authentication</li>
    <li>Render for deployment (both frontend and backend)</li>
</ul>

<h2>Project Structure</h2>
<pre>
Letter App
├── client/ - Frontend React application
│   ├── src/ - React source files (components, pages)
│   ├── public/ - Static assets (HTML, images)
│   ├── .env - Environment variables for the frontend
│   ├── package.json - Frontend dependencies
│   └── README.md - Frontend documentation
├── server/ - Backend Node.js application
│   ├── index.js - Main Express server file
│   ├── .env - Environment variables for the backend
│   ├── package.json - Backend dependencies
│   └── README.md - Backend documentation
├── .gitignore - Git ignore file
└── README.md - Project documentation (this file)
</pre>

<h2>Installation</h2>
<p>Clone the repository:</p>
<pre><code>git clone https://github.com/HarikaCheruku/letter-app.git
cd letter-app
</code></pre>

<p>Install the backend dependencies:</p>
<pre><code>cd server
npm install
</code></pre>

<p>Install the frontend dependencies:</p>
<pre><code>cd ../client
npm install
</code></pre>

<h2>Usage</h2>
<p>Start the backend server:</p>
<pre><code>cd server
npm start
</code></pre>

<p>Start the frontend development server:</p>
<pre><code>cd client
npm start
</code></pre>

<p>Visit <a href="http://localhost:3000">http://localhost:3000</a> to access the Letter App locally.</p>

<h2>Future Improvements</h2>
<ul>
    <li>Implement user profiles and the ability to save templates for frequently used letter formats.</li>
    <li>Enhance admin features with analytics and user activity tracking.</li>
    <li>Develop a mobile application for easier access on smartphones.</li>
</ul>

<h2>Contributing</h2>
<p>
    If you want to contribute to this project, feel free to open issues or submit pull requests. 
    Make sure to follow the contribution guidelines.
</p>
