import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import SideNav, { NavItem, NavIcon, NavText } from '@trendmicro/react-sidenav';

import '@trendmicro/react-sidenav/dist/react-sidenav.css';
import 'bootstrap/dist/css/bootstrap.min.css';

import ConstructionIcon from '@mui/icons-material/Construction';  // DM Tools
import PersonIcon from '@mui/icons-material/Person';            // Profile Page
import BackpackIcon from '@mui/icons-material/Backpack';          // Inventory
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';    // SpellBook
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';    // Journal
import LocalLibraryIcon from '@mui/icons-material/LocalLibrary';  // Library
import HikingIcon from '@mui/icons-material/Hiking';            // Wiki
import MapIcon from '@mui/icons-material/Map';       // Link to Settlement page
import AccountCircleIcon from '@mui/icons-material/AccountCircle';


function Menu({ accountType, selectedCampaign, setSelectedCampaign }) {
  const [isOpen, setIsOpen] = useState(false); // Start closed on desktop
  const navigate = useNavigate(); // used to navigate between pages
  const location = useLocation(); // used to get the current location

  const toggleOpen = () => setIsOpen(!isOpen);
  const toggleClosed = () => setIsOpen(false);



  function navigateToExternalLink(url) {
    // window.location.href = url;
    window.open(url, '_blank');
  }

  function openWiki() {
    if (selectedCampaign && selectedCampaign.name) {
      console.log("selectedCampaign: ", selectedCampaign)
      var encodedName = encodeURIComponent(selectedCampaign.name + "/Main Page");
      var destination = 'http://raspberrypi.local/' + encodedName;
      window.open(destination, '_blank');
      console.log("Opening wiki: " + destination);
    } else {
      console.log("No selected campaign or campaign name");
    }
  }

  return (
    <>
      <SideNav
        onSelect={(selected) => {
          console.log("MENU- Current location: " + location.pathname);
          console.log("MENU- Navigating to: " + selected);
          if (selected === "accountProfile") {
            setSelectedCampaign({ id: null, name: null, dmId: null, ownerId: null });
          }
          navigate(selected);
          toggleClosed();
        }}
        onToggle={toggleOpen}
        expanded={isOpen}
        className="d-none d-md-block menu-column"
      >
        <SideNav.Toggle />
        <SideNav.Nav>
          {accountType === 'DM' &&
            <NavItem eventKey="dmTools" className={location.pathname === "/dmTools" ? "active" : ""}>
              <NavIcon>
                <ConstructionIcon />
              </NavIcon>
              <NavText>
                DM Tools
              </NavText>
            </NavItem>
          }
          {accountType === 'Player' &&
            <NavItem eventKey="characterSheet" className={location.pathname === "/characterSheet" ? "active" : ""}>
              <NavIcon>
                <PersonIcon />
              </NavIcon>
              <NavText>
                Character Profile
              </NavText>
            </NavItem>
          }
          <NavItem eventKey="inventoryView" className={location.pathname === "/inventoryView" ? "active" : ""}>
            <NavIcon>
              <BackpackIcon />
            </NavIcon>
            <NavText>
              Inventory
            </NavText>
          </NavItem>
          {/* Comment out this block if Spellbook isn't ready in time */}
          {/* <NavItem eventKey="Spellbook" className={location.pathname === "/Spellbook" ? "active" : ""}>
            <NavIcon>
              <AutoFixHighIcon />
            </NavIcon>
            <NavText>
              Spellbook
            </NavText>
          </NavItem> */}
          <NavItem eventKey="journal" className={location.pathname === "/journal" ? "active" : ""}>
            <NavIcon>
              <HistoryEduIcon />
            </NavIcon>
            <NavText>
              Journal
            </NavText>
          </NavItem>
          <NavItem eventKey="library" className={location.pathname === "/library" ? "active" : ""}>
            <NavIcon>
              <LocalLibraryIcon />
            </NavIcon>
            <NavText>
              Library
            </NavText>
          </NavItem>
          {/* External Links */}
          {/* <NavItem onClick={() => navigateToExternalLink('http://maps.raspberrypi.local')}>
            <NavIcon>
              <MapIcon />
            </NavIcon>
            <NavText>
              Settlement Manager
            </NavText>
          </NavItem> */}
          <NavItem onClick={() => openWiki()}>
            <NavIcon>
              <HikingIcon />
            </NavIcon>
            <NavText>
              Wiki
            </NavText>
          </NavItem>
          <NavItem eventKey="accountProfile" className={location.pathname === "/accountProfile" ? "active" : ""}>
            <NavIcon>
              <AccountCircleIcon />
            </NavIcon>
            <NavText>
              Account Profile
            </NavText>
          </NavItem>
        </SideNav.Nav>
      </SideNav>
    </>
  );
}

export default Menu;