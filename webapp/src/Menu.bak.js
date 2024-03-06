import * as React from 'react';
import { useTheme, styled } from '@mui/material/styles';
import { Box, CssBaseline, Typography, Divider, IconButton, List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import { Construction, Person, Backpack, HistoryEdu, LocalLibrary, Hiking, AccountCircle, Menu as MenuIcon, ChevronLeftIcon, ChevronRightIcon } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

const drawerWidth = 240;

const openedMixin = (theme) => ({
  width: drawerWidth,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: 'hidden',
});

const closedMixin = (theme) => ({
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: 'hidden',
  width: `calc(${theme.spacing(7)} + 1px)`,
  [theme.breakpoints.up('sm')]: {
    width: `calc(${theme.spacing(9)} + 1px)`,
  },
});

const DrawerHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: theme.spacing(0, 1),
  ...theme.mixins.toolbar,
}));

const Drawer = styled('div', { shouldForwardProp: (prop) => prop !== 'open' })(
  ({ theme, open }) => ({
    width: open ? drawerWidth : `calc(${theme.spacing(7)} + 1px)`,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    transition: theme.transitions.create('width', {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
    overflowX: 'hidden',
    '& .MuiDrawer-paper': {
      width: open ? drawerWidth : `calc(${theme.spacing(7)} + 1px)`,
      transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.enteringScreen,
      }),
      overflowX: 'hidden',
    },
    ...(open && {
      ...openedMixin(theme),
      '& .MuiDrawer-paper': openedMixin(theme),
    }),
    ...(!open && {
      ...closedMixin(theme),
      '& .MuiDrawer-paper': closedMixin(theme),
    }),
  }),
);

function Menu({ accountType, selectedCampaign, setSelectedCampaign }) {
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleDrawerOpen = () => {
    setOpen(true);
  };

  const handleDrawerClose = () => {
    setOpen(false);
  };

  function navigateToExternalLink(url) {
    window.open(url, '_blank');
  }

  function openWiki() {
    if (selectedCampaign && selectedCampaign.name) {
      console.log("selectedCampaign: ", selectedCampaign)
      var encodedName = encodeURIComponent(selectedCampaign.name);
      window.open('http://localhost:5001/' + encodedName + '/Main%20Page', '_blank');
      console.log("Opening wiki: localhost:5001/" + encodedName);
    } else {
      console.log("No selected campaign or campaign name");
    }
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <Drawer variant="permanent" open={open}>
        <DrawerHeader>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            onClick={handleDrawerOpen}
            edge="start"
            sx={{
              marginRight: 5,
              ...(open && { display: 'none' }),
            }}
          >
            <MenuIcon />
          </IconButton>
        </DrawerHeader>
        <List>
          {accountType === 'DM' && (
            <ListItem
              button
              selected={location.pathname === "/dmTools"}
              onClick={() => {
                setSelectedCampaign({ id: null, name: null, dmId: null, ownerId: null });
                navigate("/dmTools");
                handleDrawerClose();
              }}
            >
              <ListItemIcon>
                <Construction />
              </ListItemIcon>
              <ListItemText primary="DM Tools" />
            </ListItem>
          )}
          {accountType === 'Player' && (
            <ListItem
              button
              selected={location.pathname === "/characterSheet"}
              onClick={() => {
                setSelectedCampaign({ id: null, name: null, dmId: null, ownerId: null });
                navigate("/characterSheet");
                handleDrawerClose();
              }}
            >
              <ListItemIcon>
                <Person />
              </ListItemIcon>
              <ListItemText primary="Character Sheet" />
            </ListItem>
          )}
          <ListItem
            button
            selected={location.pathname === "/inventoryView"}
            onClick={() => {
              navigate("inventoryView");
              handleDrawerClose();
            }}
          >
            <ListItemIcon>
              <Backpack />
            </ListItemIcon>
            <ListItemText primary="Inventory" />
          </ListItem>
          <ListItem
            button
            selected={location.pathname === "/journal"}
            onClick={() => {
              navigate("journal");
              handleDrawerClose();
            }}
          >
            <ListItemIcon>
              <HistoryEdu />
            </ListItemIcon>
            <ListItemText primary="Journal" />
          </ListItem>
          <ListItem
            button
            selected={location.pathname === "/library"}
            onClick={() => {
              navigate("library");
              handleDrawerClose();
            }}
          >
            <ListItemIcon>
              <LocalLibrary />
            </ListItemIcon>
            <ListItemText primary="Library" />
          </ListItem>
          <ListItem
            button
            onClick={() => openWiki()}
          >
            <ListItemIcon>
              <Hiking />
            </ListItemIcon>
            <ListItemText primary="Wiki" />
          </ListItem>
          <ListItem
            button
            selected={location.pathname === "/accountProfile"}
            onClick={() => {
              setSelectedCampaign({ id: null, name: null, dmId: null, ownerId: null });
              navigate("accountProfile");
              handleDrawerClose();
            }}
          >
            <ListItemIcon>
              <AccountCircle />
            </ListItemIcon>
            <ListItemText primary="Account Profile" />
          </ListItem>
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <DrawerHeader />
        {/* Your main content goes here */}
      </Box>
    </Box>
  );
}

export default Menu;