import React, { useEffect, useState } from 'react';
import { GeoJSON, MapContainer, LayersControl, useMap } from 'react-leaflet';
import { Button, Form, Modal, Row } from 'react-bootstrap';
import axios from 'axios';

import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "./leaflet-geoman.css";  // I'm doing it manually
import * as turf from '@turf/turf';

function ImageOverlay({ image }) {
  const map = useMap();

  useEffect(() => {
    if (image) {
      const img = new Image();
      img.onload = function() {
        const bounds = [[0, 0], [this.height, this.width]];
        L.imageOverlay(image, bounds).addTo(map);
        const center = [this.height / 2, this.width / 2];
        map.setView(center, 0);
      }
      img.src = image;
    }
  }, [image, map]);

  return null;
}

class LayerSelectControl extends L.Control {
  onAdd(map) {
    this._div = L.DomUtil.create('div', 'layer-select-control');
    this._div.innerHTML = '<select id="layer-select"><option value="">Select a layer</option></select>';
    return this._div;
  }
}

function SettlementManager({ headers, socket }) {
  const [showModal, setShowModal] = useState(true);
  const [settlements, setSettlements] = useState([]);
  const [selectedSettlement, setSelectedSettlement] = useState({name: ''});
  const [newSettlementModal, setNewSettlementModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [layerInstances, setLayerInstances] = useState({});
  const [selectedLayer, setSelectedLayer] = useState(null);
  const [waterFeatures, setWaterFeatures] = useState(null);
  const [treeFeatures, setTreeFeatures] = useState(null);
  const [districts, setDistricts] = useState(null);
  const [cityLimits, setCityLimits] = useState(null);

  const [uploadedImage, setUploadedImage] = useState(null);
  const [settlementName, setSettlementName] = useState('');

  // Debugging
  useEffect(() => {
    console.log('waterFeatures:', waterFeatures)
  }, [waterFeatures])

  useEffect(() => {
    console.log('treeFeatures:', treeFeatures)
  }, [treeFeatures])

  // Get the list of existing settlements
  useEffect(() => {
    const fetchSettelements = async () => {
      const response = await axios.get('/api/settlements', { headers: headers });
      console.log("Settlements- response.data:", response.data);
      setSettlements(response.data);
    }

    fetchSettelements();
  }, []);

  // Listen for map feature updates continuously
  useEffect(() => {
    const handleWaterFeatures = (data) => {  // <-- Receive the data here
      console.log("Settlement- Water layer ready!")
      setWaterFeatures(data);
      console.log("Got Water layer:", data);
    };

    const handleTreeFeatures = (data) => {  // <-- Receive the data here
      console.log("Settlement- Tree layer ready!")
      setTreeFeatures(data);
      console.log("Got Tree layer:", data);
    };

    // Register the event handlers
    socket.on('water_features', handleWaterFeatures);
    socket.on('tree_features', handleTreeFeatures);

    return () => {
      // Unregister the event handlers
      socket.off('water_features');
      socket.off('tree_features');
    };
  }, [socket]);

  useEffect(() => {
    // Get the currently selected layer
    const selectedLayerInstance = layerInstances[selectedLayer];

    if (selectedLayerInstance) {
      // Enable editing for the selected layer
      selectedLayerInstance.pm.enable();

      selectedLayerInstance.on('pm:edit', () => {
        // ... send the updated GeoJSON to the server ...
      });
    }

    // Disable editing for all other layers
    for (const layerName in layerInstances) {
      if (layerName !== selectedLayer) {
        const layerInstance = layerInstances[layerName];
        layerInstance.pm.disable();
      }
    }
  }, [selectedLayer, layerInstances]);

  useEffect(() => {
    const select = document.getElementById('layer-select');
    if (select) {
      select.addEventListener('change', (event) => {
        setSelectedLayer(event.target.value);
      });
    }
  }, [layerInstances]);


  // Handles the selection of a settlement
  const handleSelectSettlement = (settlement) => {
    setSelectedSettlement(settlement);
    setShowModal(false);

    // Load the water features
    axios.get(`/api/feature/water/${settlement.name}`)
      .then(response => setWaterFeatures(response.data))
      .catch(error => console.error(`Error loading water features:`, error));

    // Load the tree features
    axios.get(`/api/feature/trees/${settlement.name}`)
      .then(response => setTreeFeatures(response.data))
      .catch(error => console.error(`Error loading tree features:`, error));

    // Load the districts
    axios.get(`/api/feature/districts/${settlement.name}`)
      .then(response => setDistricts(response.data))
      .catch(error => console.error(`Error loading districts:`, error));

    // Load the city limits
    axios.get(`/api/feature/cityLimits/${settlement.name}`)
      .then(response => setCityLimits(response.data))
      .catch(error => console.error(`Error loading city limits:`, error));
  };

  const handleNewSettlement = () => {
    setSelectedSettlement({name: ''});
    setNewSettlementModal(true);
    setShowModal(false);
  }

  const handleNewSettlementClose = () => {
    setShowModal(true);
    setNewSettlementModal(false);
  }

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  const handleFileUpload = () => {
    setUploading(true);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('settlementName', settlementName);

    axios.post('api/settlementMap', formData, { headers })
    .then(response => {
      console.log("Settlement Creation- successfully uploaded map!");
      console.log("Settlement Creation- response.data:", response.data);

      // Save the new settlement information to the server
      const newSettlement = {
        name: settlementName,
        file: response.data.file.name
      };
      // TODO: Update the server with the new settlement info?
      // axios.post('/api/settlements', newSettlement, { headers })
      // .then(response => {
      //   setSelectedSettlement(newSettlement);
      //   console.log("Successfully saved the new settlement information to the server");
      // })
      // .catch(error => {
      //   console.error("Error saving the new settlement information to the server:", error);
      // });

      setNewSettlementModal(false);
      setUploadedImage(URL.createObjectURL(selectedFile));
      setUploading(false);
      })
    .catch(error => {
      console.error("Settlement Creation- error uploading map:", error);
      setUploading(false);
    });
  };

  const handleClose = () => setShowModal(false);
  const handleShow = () => setShowModal(true);

  const handleLayerEdit = (layer, data, setData, layerName) => {
    if (selectedLayer === layerName) {
      layer.pm.enable();
      layer.on('pm:edit', () => {
        axios.post(`/api/feature/${layerName}/${selectedSettlement.name}`, { data: data })
          .then(response => setData(response.data))  // update the layer data with the server's response
          .catch(error => console.error(`Error saving ${layerName}:`, error));
      });
    } else {
      layer.pm.disable();
    }
  };

  return (
    <>
      <div id="leaflet-container" style={{ height: '100vh', width: '100vw' }}>
        <MapContainer
          center={[0, 0]}
          zoom={0}
          minZoom={-3}
          style={{ height: "100%", width: "100%" }}
          crs={L.CRS.Simple}
          whenCreated={mapInstance => {
            mapInstance.pm.addControls({
              position: 'topleft',
              drawCircle: true,
            });

            const layerSelectControl = new LayerSelectControl({ position: 'topleft' });
            layerSelectControl.addTo(mapInstance);
          }}>
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Background Image">
              {uploadedImage && <ImageOverlay image={uploadedImage} />}
            </LayersControl.BaseLayer>
            <LayersControl.Overlay checked name="Water Bodies">
              {waterFeatures && (
                <GeoJSON
                  data={waterFeatures}
                  onEachFeature={(feature, layer) => {
                    // Store the layer instance in the state
                    setLayerInstances((prevState) => ({
                      ...prevState,
                      WaterBodies: layer,
                    }));

                    // Add an option to the dropdown menu
                    const select = document.getElementById('layer-select');
                    console.log("select:", select)
                    const option = document.createElement('option');
                    console.log("option:", option)
                    option.value = 'WaterBodies';
                    option.text = 'Water Bodies';
                    select.add(option);
                  }}
                />
              )}
            </LayersControl.Overlay>
            <LayersControl.Overlay checked name="Tree Features">
              {treeFeatures && (
                <GeoJSON
                  data={treeFeatures}
                  onEachFeature={(feature, layer) => {
                    // Store the layer instance in the state
                    setLayerInstances((prevState) => ({
                      ...prevState,
                      TreeFeatures: layer,
                    }));

                    // Add an option to the dropdown menu
                    const select = document.getElementById('layer-select');
                    const option = document.createElement('option');
                    option.value = 'TreeFeatures';
                    option.text = 'Tree Features';
                    select.add(option);
                  }}
                />
              )}
            </LayersControl.Overlay>
            <LayersControl.Overlay checked name="Districts">
              <GeoJSON
                data={districts}
                onEachFeature={(feature, layer) => {
                  console.log("layer- districts:", layer)
                  handleLayerEdit(layer, districts, setDistricts, "Districts");
                  // Add an option to the dropdown menu
                  const select = document.getElementById('layer-select');
                  const option = document.createElement('option');
                  option.value = 'Districts';
                  option.text = 'Districts';
                  select.add(option);
                }}
              />
            </LayersControl.Overlay>
            <LayersControl.Overlay checked name="City Limits">
              <GeoJSON
                data={cityLimits}
                onEachFeature={(feature, layer) => {
                  console.log("layer- city limits:", layer)
                  handleLayerEdit(layer, cityLimits, setCityLimits, "City Limits");
                  // Add an option to the dropdown menu
                  const select = document.getElementById('layer-select');
                  const option = document.createElement('option');
                  option.value = 'CityLimits';
                  option.text = 'City Limits';
                  select.add(option);
                }}
              />
            </LayersControl.Overlay>
          </LayersControl>
        </MapContainer>
      </div>

      <Modal show={showModal} onHide={handleClose}>
        <Modal.Header>
          <Modal.Title>Select a Settlement</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {settlements.length === 0 ? (
            <p>You don't have any settlements yet!</p>
          ) : (
            settlements.map((settlement, index) => (
              <Button key={index} onClick={() => handleSelectSettlement(settlement)}>
                {settlement.name}
              </Button>
            ))
          )}
          <Button onClick={handleNewSettlement}>
            Create New Settlement
          </Button>
        </Modal.Body>
      </Modal>

      <Modal show={newSettlementModal} onHide={handleNewSettlementClose}>
        <Modal.Header closeButton>
          <Modal.Title>
            Create a New Settlement
          </Modal.Title>
          {uploading && (
            <div className="spinner">
              <div className="circle"></div>
            </div>)}
        </Modal.Header>
        <Modal.Body>
          <Row>
            <Form.Group>
              <label>
                Settlement Name:
                <Form.Control
                  type="text"
                  value={settlementName}
                  onChange={(event) => setSettlementName(event.target.value)}
                />
              </label>
              <label>
                Upload Map:
                <Form.Control
                  type="file"
                  id="file-upload"
                  label="Choose a file"
                  onChange={handleFileChange}
                />
              </label>
            </Form.Group>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          {selectedFile ? (
            <Button variant="primary" onClick={handleFileUpload}>
              Upload
            </Button>
          ) : (
            <Button variant="primary" onClick={handleNewSettlementClose}>
              Close
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default SettlementManager;
