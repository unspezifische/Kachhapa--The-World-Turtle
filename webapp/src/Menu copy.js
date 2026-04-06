import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import SideNav, { NavItem, NavIcon, NavText } from '@trendmicro/react-sidenav';

import '@trendmicro/react-sidenav/dist/react-sidenav.css';
import 'bootstrap/dist/css/bootstrap.min.css';

import ConstructionIcon from '@mui/icons-material/Construction';
import PersonIcon from '@mui/icons-material/Person';
import BackpackIcon from '@mui/icons-material/Backpack';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import LocalLibraryIcon from '@mui/icons-material/LocalLibrary';
import CalendarIcon from '@mui/icons-material/CalendarToday';
import HikingIcon from '@mui/icons-material/Hiking';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';

function Menu({ headers, accountType, selectedCampaign, setSelectedCampaign, theme, setTheme }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const toggleOpen = () => setIsOpen(!isOpen);
  const toggleClosed = () => setIsOpen(false);

  function navigateToExternalLink(url) {
    window.open(url, '_blank');
  }

  function openWiki() {
    if (selectedCampaign && selectedCampaign.name) {
      localStorage.setItem('userID', headers['userID']);
      localStorage.setItem('characterName', headers['characterName']);

      const protocol = window.location.protocol;
      const host = window.location.host;
      const baseUrl = `${protocol}//${host}/`;

      const destinationPage = encodeURIComponent(selectedCampaign.name) + "/Main Page";
      const loginUrl = `${baseUrl}login?redirect=/wiki/${encodeURIComponent(destinationPage)}`;

      window.open(loginUrl, '_blank');
    }
  }

  function logOut() {
    localStorage.clear();
    window.location.reload();
  }

  function handleThemeToggle() {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }

  return (
    <div className="menu-shell">
      <SideNav
        onSelect={(selected) => {
          if (selected === "accountProfile") {
            setSelectedCampaign({ id: null, name: null, dmId: null, ownerId: null });
          }
          if (selected) {
            navigate(selected);
          }
          toggleClosed();
        }}
        onToggle={toggleOpen}
        expanded={isOpen}
        className={`kachhapa-sidenav ${isOpen ? 'is-expanded' : ''}`}
      >
        <SideNav.Toggle />

        <SideNav.Nav className="kachhapa-sidenav-main">
          {accountType === 'DM' && (
            <NavItem eventKey="dmTools" className={location.pathname === "/dmTools" ? "active" : ""}>
              <NavIcon><ConstructionIcon /></NavIcon>
              <NavText>DM Tools</NavText>
            </NavItem>
          )}

          {accountType === 'Player' && (
            <NavItem eventKey="characterSheet" className={location.pathname === "/characterSheet" ? "active" : ""}>
              <NavIcon><PersonIcon /></NavIcon>
              <NavText>Character Profile</NavText>
            </NavItem>
          )}

          <NavItem eventKey="inventoryView" className={location.pathname === "/inventoryView" ? "active" : ""}>
            <NavIcon><BackpackIcon /></NavIcon>
            <NavText>Inventory</NavText>
          </NavItem>

          <NavItem eventKey="journal" className={location.pathname === "/journal" ? "active" : ""}>
            <NavIcon><HistoryEduIcon /></NavIcon>
            <NavText>Journal</NavText>
          </NavItem>

          <NavItem eventKey="library" className={location.pathname === "/library" ? "active" : ""}>
            <NavIcon><LocalLibraryIcon /></NavIcon>
            <NavText>Library</NavText>
          </NavItem>

          <NavItem eventKey="calendar" className={location.pathname === "/calendar" ? "active" : ""}>
            <NavIcon><CalendarIcon /></NavIcon>
            <NavText>Calendar</NavText>
          </NavItem>

          {accountType === 'DM' && (
            <NavItem onClick={() => navigateToExternalLink(window.location.origin + '/5etools/')}>
              <NavIcon><AutoStoriesIcon /></NavIcon>
              <NavText>Compendium</NavText>
            </NavItem>
          )}

          <NavItem onClick={() => openWiki()}>
            <NavIcon><HikingIcon /></NavIcon>
            <NavText>Wiki</NavText>
          </NavItem>

          {accountType === 'DM' && (
            <>
              <NavItem onClick={() => navigateToExternalLink(window.location.origin + '/dashboard/')}>
                <NavIcon><DashboardIcon /></NavIcon>
                <NavText>Flask Dashboard</NavText>
              </NavItem>
              <NavItem onClick={() => navigateToExternalLink(window.location.origin + '/admin/')}>
                <NavIcon><AdminPanelSettingsIcon /></NavIcon>
                <NavText>Flask Admin</NavText>
              </NavItem>
            </>
          )}

          <NavItem eventKey="accountProfile" className={location.pathname === "/accountProfile" ? "active" : ""}>
            <NavIcon><AccountCircleIcon /></NavIcon>
            <NavText>Account Profile</NavText>
          </NavItem>

          <NavItem
            onClick={handleThemeToggle}
            className="menu-utility-item"
          >
            <NavIcon>
              {theme === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
            </NavIcon>
            <NavText>
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </NavText>
          </NavItem>

          <NavItem
            onClick={logOut}
            className="menu-utility-item"
          >
            <NavIcon><LogoutIcon /></NavIcon>
            <NavText>Log Out</NavText>
          </NavItem>
        </SideNav.Nav>
      </SideNav>
    </div>
  );
}

export default Menu;