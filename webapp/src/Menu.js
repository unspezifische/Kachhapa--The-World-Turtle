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


function Menu({ headers, accountType, selectedCampaign, setSelectedCampaign }) {
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
      console.log("selectedCampaign: ", selectedCampaign);

      // Store headers in local storage
      localStorage.setItem('userID', headers['userID']);
      localStorage.setItem('characterName', headers['characterName']);
      console.log("Stored header in local storage");
        
      // Construct the destination URL without encoding
      var destinationURL = 'http://raspberrypi.local/' + encodeURIComponent(selectedCampaign.name) + "/Main Page";
      var destinationPage = encodeURIComponent(selectedCampaign.name) + "/Main Page";
      console.log("Destination URL: " + destinationURL);
      console.log("Destination Page: " + destinationPage);
        
        // Encode the entire destination URL
      var encodedDestination = encodeURIComponent(destinationPage);
      console.log("Encoded URL: " + encodedDestination);
      
      // Include the encoded destination URL as a query parameter in the login URL
      var loginUrl = 'http://raspberrypi.local/login?redirect=/wiki/' + encodedDestination;
      console.log("URL with Redirect: " + loginUrl);
      
      // Open the login URL in a new window
      window.open(loginUrl, '_blank');
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