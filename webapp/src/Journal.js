import React, { useState, useEffect, useRef, useMemo } from 'react';
import EasyMDE from 'easymde';
import { Stack, Container, Button, Row, Col, Form, Table } from 'react-bootstrap';
import axios from 'axios';
import DeleteIcon from '@mui/icons-material/Delete';

import 'easymde/dist/easymde.min.css';
import './Journal.css';

function Journal({ headers, characterName, campaignID, theme }) {
  const editorRef = useRef(null);

  const [title, setTitle] = useState('');
  const [entries, setEntries] = useState([]);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const autosaveKey = `journal-${campaignID}-${characterName || 'unknown'}`;

  const [calendarMeta, setCalendarMeta] = useState(null);
  const [useJournalDate, setUseJournalDate] = useState(false);
  const [journalDate, setJournalDate] = useState({
    year: '',
    month_index: '',
    day: '',
    hour: '',
    minute: ''
  });

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

  useEffect(() => {
    let easyMDE = new EasyMDE({
      element: document.getElementById('editor'),
      previewRender: function (plainText) {
        return this.parent.markdown(plainText);
      },
      toolbar: toolbarOptions,
      autofocus: true,
      autosave: {
        enabled: true,
        uniqueId: autosaveKey,
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

    return () => {
      easyMDE.toTextArea();
      easyMDE = null;
    };
  }, [theme, autosaveKey]);

  useEffect(() => {
    fetchEntries();
    fetchCalendarMeta();
  }, [headers, campaignID]);

  const fetchEntries = async () => {
    try {
      const response = await axios.get('/api/journal', { headers });
      setEntries(response.data.entries);
    } catch (error) {
      console.error('Error loading journal entries:', error.response?.data || error);
    }
  };

  const fetchCalendarMeta = async () => {
    try {
      const response = await axios.get(`/api/calendar/${campaignID}`, { headers });
      setCalendarMeta(response.data);
    } catch (error) {
      console.error('Error loading calendar metadata:', error.response?.data || error);
    }
  };

  const months = calendarMeta?.months || [];
  const currentDate = calendarMeta?.current_date || null;
  const hoursInDay = calendarMeta?.hours_in_day ?? 24;

  const selectedMonth = useMemo(() => {
    if (journalDate.month_index === '' || journalDate.month_index === null) return null;
    return months[Number(journalDate.month_index)] || null;
  }, [months, journalDate.month_index]);

  const availableDays = useMemo(() => {
    if (!selectedMonth) return [];
    const monthLength = selectedMonth.length || 30;
    return Array.from({ length: monthLength }, (_, i) => i + 1);
  }, [selectedMonth]);

  const availableHours = useMemo(() => {
    return Array.from({ length: hoursInDay }, (_, i) => i);
  }, [hoursInDay]);

  const handleUseCurrentDate = () => {
    if (!currentDate) return;

    setUseJournalDate(true);
    setJournalDate({
      year: currentDate.year ?? '',
      month_index: currentDate.month_index ?? '',
      day: currentDate.day ?? '',
      hour: currentDate.hour ?? 0,
      minute: currentDate.minute ?? 0
    });
  };

  const handleJournalDateChange = (field, value) => {
    setJournalDate(prev => {
      const updated = {
        ...prev,
        [field]: value
      };

      if (field === 'month_index') {
        updated.day = '';
      }

      return updated;
    });
  };

  const handleEntrySelection = (entry) => {
    setTitle(entry.title);

    let isDraftJS = false;
    try {
      const parsedContent = JSON.parse(entry.content);
      if (parsedContent.blocks && parsedContent.entityMap) {
        isDraftJS = true;
      }
    } catch (err) {
      console.warn('Error parsing entry content:', err);
    }

    let contentToSet = entry.content;
    if (isDraftJS) {
      contentToSet = draftToMarkdown(JSON.parse(entry.content));
    }

    if (editorRef.current) {
      editorRef.current.value(contentToSet);
    }

    if (entry.journal_date) {
      setUseJournalDate(true);
      setJournalDate({
        year: entry.journal_date.year ?? '',
        month_index: entry.journal_date.month_index ?? '',
        day: entry.journal_date.day ?? '',
        hour: entry.journal_date.hour ?? '',
        minute: entry.journal_date.minute ?? ''
      });
    } else {
      setUseJournalDate(false);
      setJournalDate({
        year: '',
        month_index: '',
        day: '',
        hour: '',
        minute: ''
      });
    }

    setSelectedEntry(entry);
  };

  function draftToMarkdown(draftContent) {
    let markdown = '';

    if (!draftContent || !draftContent.blocks) {
      return markdown;
    }

    draftContent.blocks.forEach((block, index, blocks) => {
      let blockText = block.text;

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

      switch (block.type) {
        case 'unordered-list-item':
          markdown += `- ${blockText}\n`;
          if (blocks[index + 1] && blocks[index + 1].type !== 'unordered-list-item') {
            markdown += '\n';
          }
          break;
        case 'ordered-list-item':
          markdown += `1. ${blockText}\n`;
          if (blocks[index + 1] && blocks[index + 1].type !== 'ordered-list-item') {
            markdown += '\n';
          }
          break;
        case 'checkbox':
          {
            const isChecked = blockText.startsWith('[x]');
            if (isChecked) {
              blockText = blockText.substring(3).trim();
              markdown += `- [x] ${blockText}\n`;
            } else {
              markdown += `- [ ] ${blockText}\n`;
            }
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

  const buildJournalDatePayload = () => {
    if (!useJournalDate) return null;
    if (journalDate.year === '' || journalDate.month_index === '' || journalDate.day === '') return null;

    return {
      year: Number(journalDate.year),
      month_index: Number(journalDate.month_index),
      day: Number(journalDate.day),
      hour: journalDate.hour === '' ? null : Number(journalDate.hour),
      minute: journalDate.minute === '' ? null : Number(journalDate.minute)
    };
  };

  const saveEntry = async () => {
    const entryContent = editorRef.current.value();
    const payload = {
      entry: entryContent,
      title,
      journal_date: buildJournalDatePayload()
    };

    try {
      if (selectedEntry) {
        await axios.put(`/api/journal/${selectedEntry.id}`, payload, { headers });
      } else {
        await axios.post('/api/journal', payload, { headers });
      }
      fetchEntries();
    } catch (error) {
      console.error('Error saving journal entry:', error.response?.data || error);
    }
  };

  const deleteEntry = async (event, entryId) => {
    event.stopPropagation();

    const userConfirmation = window.confirm("Are you sure you want to delete this entry?");
    if (!userConfirmation) return;

    try {
      await axios.delete(`/api/journal/${entryId}`, { headers });
      fetchEntries();
    } catch (error) {
      console.error('Error deleting journal entry:', error.response?.data || error);
    }
  };

  const clearEntry = () => {
    setTitle('');
    if (editorRef.current) {
      editorRef.current.value('');
    }
    setSelectedEntry(null);
    setUseJournalDate(false);
    setJournalDate({
      year: '',
      month_index: '',
      day: '',
      hour: '',
      minute: ''
    });
  };

  return (
    <Stack className="journal-page page-shell">
      <h1>{characterName}'s Journal</h1>

      <Form.Group>
        <Row className="g-2 align-items-start mb-2">
          <Col md={6}>
            <Form.Control
              type="text"
              placeholder="Entry Title"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </Col>

          <Col md={6}>
            <div className="journal-date-picker-wrap">
              <div className="journal-date-picker-header">
                <Form.Check
                  type="checkbox"
                  id="use-journal-date"
                  label="Attach in-game date"
                  checked={useJournalDate}
                  onChange={(e) => setUseJournalDate(e.target.checked)}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleUseCurrentDate}
                  disabled={!calendarMeta}
                >
                  Use Current Date
                </Button>
              </div>

              {useJournalDate && (
                <Row className="g-2 mt-1">
                  <Col xs={3}>
                    <Form.Control
                      type="number"
                      placeholder="Year"
                      value={journalDate.year}
                      onChange={(e) => handleJournalDateChange('year', e.target.value)}
                    />
                  </Col>

                  <Col xs={4}>
                    <Form.Select
                      value={journalDate.month_index}
                      onChange={(e) => handleJournalDateChange('month_index', e.target.value)}
                    >
                      <option value="">Month</option>
                      {months.map((month, idx) => (
                        <option key={`${month.name}-${idx}`} value={idx}>
                          {month.subtitle ? `${month.name} (${month.subtitle})` : month.name}
                        </option>
                      ))}
                    </Form.Select>
                  </Col>

                  <Col xs={2}>
                    <Form.Select
                      value={journalDate.day}
                      onChange={(e) => handleJournalDateChange('day', e.target.value)}
                      disabled={!selectedMonth}
                    >
                      <option value="">Day</option>
                      {availableDays.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </Form.Select>
                  </Col>

                  <Col xs={3}>
                    <Form.Select
                      value={journalDate.hour}
                      onChange={(e) => handleJournalDateChange('hour', e.target.value)}
                    >
                      <option value="">Hour</option>
                      {availableHours.map((hour) => (
                        <option key={hour} value={hour}>
                          {hour}
                        </option>
                      ))}
                    </Form.Select>
                  </Col>
                </Row>
              )}
            </div>
          </Col>
        </Row>

        <div className="journal-editor-wrap">
          <Form.Control
            id="editor"
            as="textarea"
            rows={10}
            onChange={e => editorRef.current.value(e.target.value)}
          />
        </div>
      </Form.Group>

      <Stack direction="horizontal" gap={3} className="mt-2 mb-3">
        <Button onClick={saveEntry}>Save Entry</Button>
        <Button variant="danger" onClick={clearEntry}>Clear Entry</Button>
      </Stack>

      <div className="journal-table-wrap">
        <Table striped bordered hover>
          <colgroup>
            <col style={{ width: '35%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Title</th>
              <th>In-Game Date</th>
              <th>Date Created</th>
              <th>Date Modified</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan="5">You haven't created any journal entries yet!</td>
              </tr>
            ) : (
              entries.map((entry, index) => (
                <tr key={index} onClick={() => handleEntrySelection(entry)}>
                  <td>{entry.title}</td>
                  <td>{entry.journal_date_display || ''}</td>
                  <td>{new Date(entry.date_created).toLocaleDateString()}</td>
                  <td>{new Date(entry.date_modified).toLocaleDateString()}</td>
                  <td>
                    <Button variant="danger" onClick={(event) => deleteEntry(event, entry.id)}>
                      <DeleteIcon />
                    </Button>
                  </td>
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