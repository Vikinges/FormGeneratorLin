import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import FormEditor from './components/FormEditor';
import FormViewer from './components/FormViewer';
import AdminPanel from './components/AdminPanel';
import { authService } from './services/authService';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && authService.isValidToken(token)) {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/" 
          element={
            isAuthenticated ? (
              <Dashboard onLogout={handleLogout} />
            ) : (
              <Auth onLogin={handleLogin} />
            )
          } 
        />
        <Route 
          path="/admin" 
          element={
            isAuthenticated ? (
              <AdminPanel onLogout={handleLogout} />
            ) : (
              <Navigate to="/" />
            )
          } 
        />
        <Route 
          path="/editor/:id?" 
          element={
            isAuthenticated ? (
              <FormEditor onLogout={handleLogout} />
            ) : (
              <Navigate to="/" />
            )
          } 
        />
        <Route 
          path="/form/:id" 
          element={<FormViewer />} 
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;

