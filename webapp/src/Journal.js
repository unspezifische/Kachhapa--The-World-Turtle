import React, { useState, useEffect, useRef } from 'react';
import EasyMDE from 'easymde';
import { Stack, Container, Button, ButtonGroup, Row, Form, Table } from 'react-bootstrap';
import axios from 'axios';
import DeleteIcon from '@mui/icons-material/Delete';

import 'easymde/dist/easymde.min.css';
import './Journal.css';

function Journal({ headers, characterName, campaignID }) {
  const editorRef = useRef(null);

  const [title, setTitle] = useState('');
  const [entries, setEntries] = useState([]);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const underlineAction = {
    name: "underline",
    action: function customFunction(editor){
        // Toggle underline
        let cm = editor.codemirror;
        let output = '';
        let text = cm.getSelection();
        if(text.startsWith('__') && text.endsWith('__')) {
            // Remove the underscores
            output = text.substring(2, text.length - 2);
        } else {
            // Add the underscores
            output = '__' + text + '__';
        }
        cm.replaceSelection(output);
    },
    className: "fa fa-underline", // Font Awesome's underline icon
    title: "Underline (Ctrl+U)",
  };

// "bold", "italic", underlineAction, "strikethrough",

  const toolbarOptions = [
    "bold", "italic", "strikethrough",
    "|",
    "heading", "heading-smaller", "heading-bigger",
    "|",
    "code", "quote",
    "|",
    "unordered-list", "ordered-list", "checklist",
    "|",
    "guide"
  ];

  // initialValue: '',

  useEffect(() => {
    let easyMDE = new EasyMDE({
        element: document.getElementById('editor'),
        previewRender: function(plainText) {
          return this.parent.markdown(plainText);
        },
        toolbar: toolbarOptions,
        autofocus: true,
        autosave: {
            enabled: true,
            uniqueId: "MyUniqueID",
            delay: 1000,
            submit_delay: 5000,
            timeFormat: {
                locale: 'en-US',
                format: {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                },
            },
            text: "Autosaved: "
        },
        blockStyles: {
            bold: "**",
            italic: "_",
        },
        unorderedListStyle: "-",
        spellChecker: true,
        status: false
    });
    editorRef.current = easyMDE;

    // Clean up on component unmount
    return () => {
      easyMDE.toTextArea();
      easyMDE = null;
    };
  }, []);

  const fetchEntries = async () => {
    try {
      const response = await axios.get('/api/journal', { headers: headers });
      const entries = response.data.entries;
      console.log("fetchEntries entries:", entries);
      console.log("fetchEntries entries.length:", entries.length);
      setEntries(entries); // Save all entries in state
    } catch (error) {
      console.error('Error loading journal entries:', error.response.data);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [headers]);


  const handleEntrySelection = (entry) => {
    setTitle(entry.title); // Load the title

    // Check if the entry.content looks like DraftJS format
    let isDraftJS = false;
    try {
      const parsedContent = JSON.parse(entry.content);
      if (parsedContent.blocks && parsedContent.entityMap) {
        isDraftJS = true;
      }
    } catch (err) {
      console.warn('Error parsing entry content:', err);
      // Not a JSON or doesn't have the DraftJS structure
    }

    let contentToSet = entry.content;
    if (isDraftJS) {
      contentToSet = draftToMarkdown(JSON.parse(entry.content));
    }

    if (editorRef.current) {
      editorRef.current.value(contentToSet);
    }

    setSelectedEntry(entry);  // Keep track of the selected entry
  };

  function draftToMarkdown(draftContent) {
    let markdown = '';

    if (!draftContent || !draftContent.blocks) {
      return markdown;
    }

    draftContent.blocks.forEach((block, index, blocks) => {
      let blockText = block.text;

      // Handle inline styles
      if (block.inlineStyleRanges) {
        block.inlineStyleRanges.reverse().forEach(range => {
          switch (range.style) {
            case 'BOLD':
              blockText = insertString(blockText, '**', range.offset);
              blockText = insertString(blockText, '**', range.offset + range.length + 2);
              break;
            case 'ITALIC':
              blockText = insertString(blockText, '_', range.offset);
              blockText = insertString(blockText, '_', range.offset + range.length + 1);
              break;
            case 'UNDERLINE':
              blockText = insertString(blockText, '__', range.offset);
              blockText = insertString(blockText, '__', range.offset + range.length + 2);
              break;
            default:
              break;
          }
        });
      }

      // Handle block types
      switch (block.type) {
        case 'unordered-list-item':
          markdown += `- ${blockText}\n`;
          if (blocks[index + 1] && blocks[index + 1].type !== 'unordered-list-item') {
            markdown += '\n';
          }
          break;
        case 'ordered-list-item':
          markdown += `1. ${blockText}\n`; // Note: Markdown will auto-increment numbers, so we can always use "1."
          if (blocks[index + 1] && blocks[index + 1].type !== 'ordered-list-item') {
            markdown += '\n';
          }
          break;
        case 'checkbox':
          let isChecked = blockText.startsWith('[x]');
          if (isChecked) {
            blockText = blockText.substring(3).trim();
            markdown += `- [x] ${blockText}\n`;
          } else {
            markdown += `- [ ] ${blockText}\n`;
          }
          break;
        default:
          markdown += `${blockText}\n\n`;
          break;
      }
    });

    return markdown;
  }

  function insertString(original, insert, position) {
    return original.slice(0, position) + insert + original.slice(position);
  }

  const saveEntry = async () => {
    const entryContent = editorRef.current.value();
    if (selectedEntry) { // If an existing entry is selected, update it
        axios.put(`/api/journal/${selectedEntry.id}`, { entry: entryContent, title: title }, { headers })
        .then(response => {
            console.log(response.data);
            fetchEntries(); // Refetch entries after saving
        })
        .catch(error => {
            console.error('Error saving journal entry:', error.response.data);
        });
    } else { // Otherwise, create a new entry
        axios.post('/api/journal', { entry: entryContent, title: title }, { headers })
        .then(response => {
            console.log(response.data);
            fetchEntries(); // Refetch entries after saving
        })
        .catch(error => {
            console.error('Error creating journal entry:', error.response.data);
        });
    }
  };

  const deleteEntry = async (event, entryId) => {
    // Prevent the event from bubbling up to the parent elements
    event.stopPropagation();

    // Display confirmation dialog
    const userConfirmation = window.confirm("Are you sure you want to delete this entry?");

    // If user clicks "Cancel", exit function
    if (!userConfirmation) {
      return;
    }

    try {
      const response = await axios.delete(`/api/journal/${entryId}`, { headers });
      console.log(response.data);
      fetchEntries(); // Refetch entries after deleting
    } catch (error) {
      console.error('Error deleting journal entry:', error.response.data);
    }
  };

  const clearEntry = () => {
    setTitle('');
    if (editorRef.current) {
      editorRef.current.value('');
    }
    setSelectedEntry(null); // Clear the selected entry
  };

  // className="container"
  return (
    <Stack>
      <h1>{characterName}'s Journal</h1>
      <Form.Group>
        <Form.Control
          type="text"
          placeholder="Entry Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          <Form.Control
            id="editor"
            as="textarea"
            rows={10}
            value={selectedEntry ? selectedEntry.content : ''}
            onChange={e => editorRef.current.value(e.target.value)}>
          </Form.Control>
        </div>
      </Form.Group>
      
      <Stack direction="horizontal" gap={3}>
        <Button onClick={saveEntry}>Save Entry</Button>
        <Button variant="danger" onClick={clearEntry}>Clear Entry</Button>
      </Stack>
      <div style={{ maxHeight: '30vh', overflowY: 'auto' }}>
        <Table striped bordered hover>
          <colgroup>
            <col style={{ width: '40%' }}/>
            <col style={{ width: '25%' }}/>
            <col style={{ width: '25%' }}/>
            <col style={{ width: '10%' }}/>
          </colgroup>
          <thead>
            <tr>
              <th>Title</th>
              <th>Date Created</th>
              <th>Date Modified</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan="3">You haven't created any journal entries yet!</ td>
              </tr>
            ) : (
              entries.map((entry, index) => (
                <tr key={index} onClick={() => handleEntrySelection(entry)}>
                  <td>{entry.title}</td>
                  <td>{new Date(entry.date_created).toLocaleDateString()}</td>
                  <td>{new Date(entry.date_modified).toLocaleDateString()}</td>
                  <td><Button variant="danger" onClick={(event) => deleteEntry(event, entry.id)}>
                    <DeleteIcon />
                  </Button></td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </Stack>
  );
}

export default Journal;
