import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button, Card, Col, Container, Form, Modal, Row, Image } from 'react-bootstrap';

function Library({ headers, socket }) {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');  // 'asc' for ascending, 'desc' for descending

  // Listen for page updates
  useEffect(() => {
    // Fetch the list of files from the server
    axios.get('api/library', { headers })
      .then(response => {
        console.log("LIBRARY- response.data:", response.data);
        setFiles(response.data.files);
      });

    // Listen for the library_update event
    socket.on('library_update', data => {
        axios.get('api/library', { headers })
          .then(response => {
            console.log("LIBRARY- response.data:", response.data);
            setFiles(response.data.files);
          });
    });

    // Make sure to clean up the listener when the component unmounts
    return () => {
        socket.off('library_update');
    };
  }, [headers, socket]);


  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  const handleFileUpload = () => {
    const formData = new FormData();
    formData.append('file', selectedFile);

    axios.post('api/library', formData, { headers })
      .then(response => {
        // Add the new file to the list of files
        setFiles(prevFiles => [...prevFiles, response.data.file]);
        setShowUploadModal(false);
      });
  };

  const handleFileClick = (file) => {
    if (file.type === 'pdf') {
        window.open(`api/library/${file.originalName}`);
    } else {
        setCurrentFile(file);
        setShowFileModal(true);
    }
  };


  return (
    <Container>
      <h1>Library</h1>
      <div style={{ height: '100vh', overflow: 'auto' }}>
        <Row>
          <Col>
            <Button onClick={() => setShowUploadModal(true)}>Upload File</Button>
          </Col>
          <Col>
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." />
            <select value={sortDirection} onChange={e => setSortDirection(e.target.value)}>
              <option value="asc">A-Z</option>
              <option value="desc">Z-A</option>
            </select>
          </Col>
        </Row>
        <Row>
          {files
            .filter(file => file.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => {
              if (sortDirection === 'asc') {
                return a.name.localeCompare(b.name);
              } else {
                return b.name.localeCompare(a.name);
              }
            })
            .map((file, index) => (
            <Col sm={6} md={4} lg={3} key={index}>
              <div onClick={() => handleFileClick(file)}>
                <Card>
                  <Card.Img variant="top" src={`api/library/${file.originalName}`} />
                  <Card.Body>
                    <Card.Title>{file.name}</Card.Title>
                  </Card.Body>
                </Card>
              </div>
            </Col>
          ))}
        </Row>
      </div>

      {/* File Upload Modal */}
      <Modal show={showUploadModal} onHide={() => setShowUploadModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Upload a File</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Control type="file" id="file-upload" label="Choose a file" onChange={handleFileChange} />
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowUploadModal(false)}>Close</Button>
          <Button variant="primary" onClick={handleFileUpload}>Upload</Button>
        </Modal.Footer>
      </Modal>
      {/* File Viewing Modal */}
      <Modal show={showFileModal} onHide={() => setShowFileModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{currentFile?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Image src={`api/library/${currentFile?.originalName}`} fluid />
        </Modal.Body>
      </Modal>
    </Container>
  );
}

export default Library;
