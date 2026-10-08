import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Bot, Plus, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-layout">
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />
      
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">BH</div>
          <span className="sidebar-title">BotHost</span>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar}>
            <LayoutDashboard /> Dashboard
          </NavLink>
          <NavLink to="/bots" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar}>
            <Bot /> Meus Bots
          </NavLink>
          <NavLink to="/bots/create" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar}>
            <Plus /> Criar Bot
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div style={{ padding: '0.5rem 0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{user?.name}</div>
            <div className="text-sm text-muted">{user?.email}</div>
          </div>
          <button className="nav-item" onClick={handleLogout}>
            <LogOut /> Sair
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <button className="mobile-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
            Plataforma de Hospedagem
          </div>
          <div className="text-sm text-muted">
            {user?.role === 'admin' ? 'Admin' : 'Usuário'}
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
