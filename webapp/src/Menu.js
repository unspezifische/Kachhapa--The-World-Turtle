import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';

import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import ConstructionIcon from '@mui/icons-material/Construction';
import PersonIcon from '@mui/icons-material/Person';
import BackpackIcon from '@mui/icons-material/Backpack';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import LocalLibraryIcon from '@mui/icons-material/LocalLibrary';
import CalendarIcon from '@mui/icons-material/CalendarToday';
import HikingIcon from '@mui/icons-material/Hiking';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import MapIcon from '@mui/icons-material/Map';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';

const DRAWER_WIDTH = 240;
const COLLAPSED_WIDTH = 72;

function Menu({ headers, accountType, selectedCampaign, setSelectedCampaign, theme, setTheme, primaryOrigin = window.location.origin }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const toggleOpen = () => setIsOpen((prev) => !prev);
  const closeDrawer = () => setIsOpen(false);

  function navigateToExternalLink(url) {
    window.open(url, '_blank');
  }

  function openSettlementSimulator() {
    const context = new URLSearchParams({
      campaignID: String(selectedCampaign?.id || ''),
      campaignName: selectedCampaign?.name || '',
      accountType: accountType || '',
      tool: 'atlas',
    });
    const simulatorPath = `/settlementManager?${context.toString()}`;
    const dmWindow = window.open(simulatorPath, 'kachhapa-settlement-dm');

    if (!dmWindow) {
      navigate(simulatorPath);
      return;
    }

    dmWindow.focus();
    window.setTimeout(() => dmWindow.focus(), 0);
  }

  function openWiki() {
    if (selectedCampaign && selectedCampaign.name) {
      localStorage.setItem('userID', headers['userID']);
      localStorage.setItem('characterName', headers['characterName']);
      const campaignSegment = encodeURIComponent(selectedCampaign.name);
      const pageSegment = encodeURIComponent('Main Page');
      // The wiki is rendered by Flask, not React Router. Use a real browser
      // navigation so the SPA wildcard route cannot consume the wiki path.
      window.open(`${primaryOrigin}/wiki/${campaignSegment}/${pageSegment}`, '_blank');
    }
  }

  async function logOut() {
    try {
      await axios.post('/api/logout', {}, { withCredentials: true });
    } catch (error) {
      console.warn('Unable to clear shared session cookie:', error);
    } finally {
      localStorage.clear();
      window.location.reload();
    }
  }

  function handleThemeToggle() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  const navItems = [
    ...(accountType === 'DM'
      ? [{ key: 'dmTools', label: 'DM Tools', icon: <ConstructionIcon />, onClick: () => navigate('/dmTools') }]
      : []),

    ...(accountType === 'Player'
      ? [{ key: 'characterSheet', label: 'Character Profile', icon: <PersonIcon />, onClick: () => navigate('/characterSheet') }]
      : []),

    { key: 'inventoryView', label: 'Inventory', icon: <BackpackIcon />, onClick: () => navigate('/inventoryView') },
    { key: 'journal', label: 'Journal', icon: <HistoryEduIcon />, onClick: () => navigate('/journal') },
    { key: 'library', label: 'Library', icon: <LocalLibraryIcon />, onClick: () => navigate('/library') },
    { key: 'calendar', label: 'Calendar', icon: <CalendarIcon />, onClick: () => navigate('/calendar') },

    ...(accountType === 'DM'
      ? [
        { key: 'compendium', label: 'Compendium', icon: <AutoStoriesIcon />, onClick: () => navigateToExternalLink(primaryOrigin + '/5etools/') },
        { key: 'settlementManager', label: 'Settlement Simulator', icon: <MapIcon />, onClick: openSettlementSimulator },
      ]
      : []),

    { key: 'wiki', label: 'Wiki', icon: <HikingIcon />, onClick: openWiki },

    ...(accountType === 'DM'
      ? [
        { key: 'dashboard', label: 'Flask Dashboard', icon: <DashboardIcon />, onClick: () => navigateToExternalLink(primaryOrigin + '/dashboard/') },
        { key: 'admin', label: 'Flask Admin', icon: <AdminPanelSettingsIcon />, onClick: () => navigateToExternalLink(primaryOrigin + '/admin/') },
      ]
      : []),

    {
      key: 'accountProfile',
      label: 'Account Profile',
      icon: <AccountCircleIcon />,
      onClick: () => {
        setSelectedCampaign({ id: null, name: null, dmId: null, ownerId: null });
        navigate('/accountProfile');
      },
    },
  ];

  const utilityItems = [
    {
      key: 'theme',
      label: theme === 'dark' ? 'Light Mode' : 'Dark Mode',
      icon: theme === 'dark' ? <LightModeIcon /> : <DarkModeIcon />,
      custom: true,
    },
    {
      key: 'logout',
      label: 'Log Out',
      icon: <LogoutIcon />,
      onClick: logOut,
    },
  ];

  const paperStyles = {
    width: isOpen ? DRAWER_WIDTH : COLLAPSED_WIDTH,
    overflowX: 'hidden',
    backgroundColor: 'var(--menu-bg)',
    color: 'rgba(255,255,255,0.94)',
    borderRight: '1px solid rgba(255,255,255,0.08)',
    transition: 'width 0.2s ease',
    boxSizing: 'border-box',
  };

  const itemButtonSx = {
    minHeight: 64,
    px: 2,
    justifyContent: isOpen ? 'initial' : 'center',
    '&:hover': {
      backgroundColor: 'var(--menu-bg-hover)',
    },
  };

  const activeItemSx = {
    backgroundColor: 'var(--menu-bg-selected)',
  };

  const iconSx = {
    minWidth: 0,
    width: 40,
    mr: isOpen ? 1.5 : 'auto',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.9)',
    '& svg': {
      fontSize: '1.8rem',
    },
  };

  return (
    <Box className="menu-shell" sx={{ height: '100%' }}>
      <Drawer
        variant="permanent"
        open={isOpen}
        sx={{
          width: isOpen ? DRAWER_WIDTH : COLLAPSED_WIDTH,
          flexShrink: 0,
          whiteSpace: 'nowrap',
          '& .MuiDrawer-paper': paperStyles,
        }}
      >
        <Box
          sx={{
            height: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: isOpen ? 'space-between' : 'center',
            px: isOpen ? 1 : 0,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <IconButton
            onClick={toggleOpen}
            sx={{
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            {isOpen ? <CloseIcon /> : <MenuIcon />}
          </IconButton>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            height: 'calc(100% - 72px)',
          }}
        >
          <List sx={{ flex: '1 1 auto', overflowY: 'auto', pt: 0 }}>
            {navItems.map((item) => {
              const isActive =
                item.key === 'accountProfile'
                  ? location.pathname === '/accountProfile'
                  : location.pathname === `/${item.key}`;

              const button = (
                <ListItemButton
                  onClick={() => {
                    item.onClick();
                    closeDrawer();
                  }}
                  sx={{
                    ...itemButtonSx,
                    ...(isActive ? activeItemSx : {}),
                  }}
                >
                  <ListItemIcon sx={iconSx}>{item.icon}</ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    sx={{
                      opacity: isOpen ? 1 : 0,
                      whiteSpace: 'nowrap',
                      '& .MuiTypography-root': {
                        fontSize: '1rem',
                      },
                    }}
                  />
                </ListItemButton>
              );

              return (
                <ListItem key={item.key} disablePadding sx={{ display: 'block' }}>
                  {isOpen ? button : <Tooltip title={item.label} placement="right">{button}</Tooltip>}
                </ListItem>
              );
            })}
          </List>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

          <List sx={{ flexShrink: 0, pb: 1 }}>
            <ListItem disablePadding sx={{ display: 'block' }}>
              <ListItemButton sx={itemButtonSx}>
                <ListItemIcon sx={iconSx}>
                  {theme === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
                </ListItemIcon>

                {isOpen ? (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      pr: 1,
                    }}
                  >
                    <ListItemText
                      primary={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                      sx={{
                        '& .MuiTypography-root': {
                          fontSize: '1rem',
                          whiteSpace: 'nowrap',
                        },
                      }}
                    />
                    <Switch
                      checked={theme === 'light'}
                      onChange={handleThemeToggle}
                      color="default"
                    />
                  </Box>
                ) : (
                  <Tooltip title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'} placement="right">
                    <Box
                      onClick={handleThemeToggle}
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        cursor: 'pointer',
                      }}
                    />
                  </Tooltip>
                )}
              </ListItemButton>
            </ListItem>

            <ListItem disablePadding sx={{ display: 'block' }}>
              {isOpen ? (
                <ListItemButton onClick={logOut} sx={itemButtonSx}>
                  <ListItemIcon sx={iconSx}><LogoutIcon /></ListItemIcon>
                  <ListItemText
                    primary="Log Out"
                    sx={{
                      opacity: 1,
                      '& .MuiTypography-root': {
                        fontSize: '1rem',
                        whiteSpace: 'nowrap',
                      },
                    }}
                  />
                </ListItemButton>
              ) : (
                <Tooltip title="Log Out" placement="right">
                  <ListItemButton onClick={logOut} sx={itemButtonSx}>
                    <ListItemIcon sx={iconSx}><LogoutIcon /></ListItemIcon>
                  </ListItemButton>
                </Tooltip>
              )}
            </ListItem>
          </List>
        </Box>
      </Drawer>
    </Box>
  );
}

export default Menu;
