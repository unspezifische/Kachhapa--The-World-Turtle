import React, { useEffect, useMemo, useState } from 'react';
import { Container, Row, Col, Button, Modal, Form } from 'react-bootstrap';
import axios from 'axios';
import './Calendar.css';

function Calendar({ headers, campaignID, accountType, socket }) {
  const [calendarMeta, setCalendarMeta] = useState(null);
  const [monthView, setMonthView] = useState(null);
  const [viewYear, setViewYear] = useState(null);
  const [viewMonthIndex, setViewMonthIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calendarMissing, setCalendarMissing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [calendarFormats, setCalendarFormats] = useState([]);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [calendarSetup, setCalendarSetup] = useState({
    name: '',
    format_slug: 'gregorian',
    year: 1,
    month: 1,
    day: 1,
  });
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);

  const [newEventName, setNewEventName] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('');

  useEffect(() => {
    fetchCalendarMeta();
  }, [campaignID]);

  useEffect(() => {
    if (!socket || !campaignID) return;

    const handleCalendarUpdated = async (payload) => {
      if (!payload || payload.campaign_id !== campaignID) return;

      if (payload.kind === 'calendar_created') {
        await fetchCalendarMeta();
        return;
      }

      let shouldRefreshMeta = false;
      let shouldRefreshMonth = false;

      if (payload.kind === 'current_date') {
        shouldRefreshMeta = true;

        const newDate = payload.current_date;
        if (
          newDate &&
          newDate.year === viewYear &&
          newDate.month_index === viewMonthIndex
        ) {
          shouldRefreshMonth = true;
        }
      }

      if (payload.kind === 'event' || payload.kind === 'event_deleted') {
        if (
          payload.year === viewYear &&
          payload.month_index === viewMonthIndex
        ) {
          shouldRefreshMonth = true;
        }
      }

      if (payload.kind === 'event_updated') {
        const affectsOldView =
          payload.old_year === viewYear &&
          payload.old_month_index === viewMonthIndex;

        const affectsNewView =
          payload.year === viewYear &&
          payload.month_index === viewMonthIndex;

        if (affectsOldView || affectsNewView) {
          shouldRefreshMonth = true;
        }
      }

      if (shouldRefreshMeta) {
        await fetchCalendarMeta();
      }

      if (shouldRefreshMonth) {
        await fetchMonthView(viewYear, viewMonthIndex);

        if (selectedDay) {
          const selectedStillRelevant =
            selectedDay.year === viewYear &&
            selectedDay.month_index === viewMonthIndex;

          if (selectedStillRelevant) {
            const refreshed = await axios.get(
              `/api/calendar/${campaignID}/month-view`,
              {
                headers,
                params: {
                  year: viewYear,
                  month_index: viewMonthIndex
                }
              }
            );

            const updatedDay = refreshed.data.days.find(
              (d) =>
                d.year === selectedDay.year &&
                d.month_index === selectedDay.month_index &&
                d.day === selectedDay.day
            );

            if (updatedDay) {
              setSelectedDay(updatedDay);
            }
          }
        }
      }
    };

    socket.on('calendar_updated', handleCalendarUpdated);

    return () => {
      socket.off('calendar_updated', handleCalendarUpdated);
    };
  }, [socket, campaignID, viewYear, viewMonthIndex, selectedDay, headers]);

  useEffect(() => {
    if (viewYear !== null && viewMonthIndex !== null) {
      fetchMonthView(viewYear, viewMonthIndex);
    }
  }, [viewYear, viewMonthIndex, campaignID]);

  const fetchCalendarMeta = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const response = await axios.get(`/api/calendar/${campaignID}`, { headers });
      const data = response.data;

      if (data?.configured === false) {
        setCalendarMeta(null);
        setMonthView(null);
        setCalendarMissing(true);
        if (accountType?.toLowerCase() === 'dm') {
          await fetchCalendarFormats();
        }
        return;
      }

      setCalendarMeta(data);
      setCalendarMissing(false);

      if (data?.current_date) {
        setViewYear(data.current_date.year);
        setViewMonthIndex(data.current_date.month_index);
      }
    } catch (error) {
      if (error.response?.status === 404) {
        setCalendarMeta(null);
        setMonthView(null);
        setCalendarMissing(true);
        if (accountType?.toLowerCase() === 'dm') {
          await fetchCalendarFormats();
        }
      } else {
        console.error('Error fetching calendar metadata:', error);
        setLoadError(error.response?.data?.message || 'The calendar could not be loaded.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendarFormats = async () => {
    try {
      const response = await axios.get('/api/calendar-formats', { headers });
      const formats = response.data.formats || [];
      setCalendarFormats(formats);
      if (formats.length && !formats.some((format) => format.slug === calendarSetup.format_slug)) {
        setCalendarSetup((current) => ({ ...current, format_slug: formats[0].slug }));
      }
    } catch (error) {
      console.error('Error fetching calendar formats:', error);
      setSetupError(error.response?.data?.message || 'Calendar formats could not be loaded.');
    }
  };

  const handleCreateCalendar = async (event) => {
    event.preventDefault();
    setSetupSaving(true);
    setSetupError('');
    try {
      const response = await axios.post(
        `/api/calendar/${campaignID}`,
        {
          name: calendarSetup.name,
          format_slug: calendarSetup.format_slug,
          year: Number(calendarSetup.year),
          month_index: Number(calendarSetup.month) - 1,
          day: Number(calendarSetup.day),
        },
        { headers }
      );
      const data = response.data;
      setCalendarMeta(data);
      setCalendarMissing(false);
      setViewYear(data.current_date.year);
      setViewMonthIndex(data.current_date.month_index);
    } catch (error) {
      setSetupError(error.response?.data?.message || 'The calendar could not be created.');
    } finally {
      setSetupSaving(false);
    }
  };

  const fetchMonthView = async (year, monthIndex) => {
    try {
      const response = await axios.get(
        `/api/calendar/${campaignID}/month-view`,
        {
          headers,
          params: {
            year,
            month_index: monthIndex
          }
        }
      );
      setMonthView(response.data);
    } catch (error) {
      console.error('Error fetching month view:', error);
    }
  };

  const handlePreviousMonth = () => {
    if (!calendarMeta?.months?.length) return;

    if (viewMonthIndex === 0) {
      setViewMonthIndex(calendarMeta.months.length - 1);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonthIndex(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (!calendarMeta?.months?.length) return;

    if (viewMonthIndex === calendarMeta.months.length - 1) {
      setViewMonthIndex(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonthIndex(prev => prev + 1);
    }
  };

  const handleSetTodayMonth = () => {
    if (!calendarMeta?.current_date) return;
    setViewYear(calendarMeta.current_date.year);
    setViewMonthIndex(calendarMeta.current_date.month_index);
  };

  const handleAdvanceDay = async () => {
    try {
      const response = await axios.post(
        `/api/calendar/${campaignID}/date/advance`,
        { days: 1 },
        { headers }
      );

      setCalendarMeta(response.data);
      const updatedDate = response.data.current_date;
      setViewYear(updatedDate.year);
      setViewMonthIndex(updatedDate.month_index);
    } catch (error) {
      console.error('Error advancing date:', error);
    }
  };

  const handleCreateEvent = async () => {
    if (!isDM || !newEventName || !selectedDay || viewYear === null || viewMonthIndex === null) return;

    try {
      await axios.post(
        `/api/calendar/${campaignID}/events`,
        {
          name: newEventName,
          description: newEventDescription,
          year: selectedDay.year,
          month_index: selectedDay.month_index,
          day: selectedDay.day,
        },
        { headers }
      );

      setNewEventName('');
      setNewEventDescription('');
      await fetchMonthView(viewYear, viewMonthIndex);
      await fetchCalendarMeta();
      setShowDayModal(false);
      setSelectedDay(null);
    } catch (error) {
      console.error('Error creating event:', error);
    }
  };

  const openDayModal = (dayObj) => {
    setSelectedDay(dayObj);
    setShowDayModal(true);
    setNewEventName('');
    setNewEventDescription('');
  };

  const closeDayModal = () => {
    setShowDayModal(false);
    setSelectedDay(null);
    setNewEventName('');
    setNewEventDescription('');
  };

  const currentMonthLabel = useMemo(() => {
    if (!monthView?.month) return '';
    return monthView.month.subtitle
      ? `${monthView.month.name} (${monthView.month.subtitle})`
      : monthView.month.name;
  }, [monthView]);

  const isDM = accountType?.toLowerCase() === 'dm';

  if (loading) {
    return (
      <Container className="calendar-page">
        <div className="calendar-loading">Loading calendar...</div>
      </Container>
    );
  }

  if (calendarMissing) {
    return (
      <Container fluid className="calendar-page">
        <div className="calendar-empty-state">
          <div className="calendar-empty-icon" aria-hidden="true">◫</div>
          {isDM ? (
            <>
              <h1>Set up this campaign's calendar</h1>
              <p>Choose a calendar system and starting date. You can begin adding events as soon as it is created.</p>
              <Form className="calendar-setup-form" onSubmit={handleCreateCalendar}>
                <Form.Group>
                  <Form.Label htmlFor="calendar-setup-name">Calendar name</Form.Label>
                  <Form.Control
                    id="calendar-setup-name"
                    value={calendarSetup.name}
                    placeholder="Campaign calendar"
                    maxLength={100}
                    onChange={(event) => setCalendarSetup((current) => ({ ...current, name: event.target.value }))}
                  />
                </Form.Group>
                <Form.Group>
                  <Form.Label htmlFor="calendar-setup-format">Calendar system</Form.Label>
                  <Form.Select
                    id="calendar-setup-format"
                    value={calendarSetup.format_slug}
                    onChange={(event) => setCalendarSetup((current) => ({ ...current, format_slug: event.target.value }))}
                  >
                    {calendarFormats.map((format) => (
                      <option value={format.slug} key={format.slug}>{format.display_name}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
                <div className="calendar-setup-date">
                  <Form.Group>
                    <Form.Label htmlFor="calendar-setup-year">Starting year</Form.Label>
                    <Form.Control id="calendar-setup-year" type="number" required value={calendarSetup.year} onChange={(event) => setCalendarSetup((current) => ({ ...current, year: event.target.value }))} />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label htmlFor="calendar-setup-month">Month</Form.Label>
                    <Form.Control id="calendar-setup-month" type="number" required min="1" max="12" value={calendarSetup.month} onChange={(event) => setCalendarSetup((current) => ({ ...current, month: event.target.value }))} />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label htmlFor="calendar-setup-day">Day</Form.Label>
                    <Form.Control id="calendar-setup-day" type="number" required min="1" max="31" value={calendarSetup.day} onChange={(event) => setCalendarSetup((current) => ({ ...current, day: event.target.value }))} />
                  </Form.Group>
                </div>
                {setupError ? <div className="calendar-setup-error" role="alert">{setupError}</div> : null}
                <Button type="submit" disabled={setupSaving || calendarFormats.length === 0}>
                  {setupSaving ? 'Creating Calendar…' : 'Create Calendar'}
                </Button>
              </Form>
            </>
          ) : (
            <>
              <h1>Calendar unavailable</h1>
              <p>The DM hasn't set up a calendar for this campaign yet.</p>
            </>
          )}
        </div>
      </Container>
    );
  }

  if (loadError) {
    return (
      <Container className="calendar-page">
        <div className="calendar-error" role="alert">{loadError}</div>
      </Container>
    );
  }

  if (!calendarMeta || !monthView) {
    return (
      <Container className="calendar-page">
        <div className="calendar-loading">Loading calendar...</div>
      </Container>
    );
  }

  return (
    <Container fluid className="calendar-page">
      <div className="calendar-shell">

        <Row className="year-banner align-items-center">
          <Col xs="auto">
            <Button onClick={handlePreviousMonth}>Previous Month</Button>
          </Col>
          <Col className="text-center">
            <h1>Year {monthView.year}</h1>
          </Col>
          <Col xs="auto" className="text-end">
            <Button onClick={handleNextMonth}>Next Month</Button>
          </Col>
        </Row>

        <Row className="month-banner align-items-center">
          <Col className="text-center">
            <h2>
              {currentMonthLabel} - Month {monthView.month_index + 1}
            </h2>
          </Col>
        </Row>

        <Row className="calendar-controls mb-3">
          <Col xs="auto">
            <Button variant="secondary" onClick={handleSetTodayMonth}>
              Go to Current Month
            </Button>
          </Col>
          {isDM && (
            <Col xs="auto">
              <Button variant="warning" onClick={handleAdvanceDay}>
                Advance 1 Day
              </Button>
            </Col>
          )}
          <Col className="text-end">
            {calendarMeta.current_date && (
              <div className="current-date-readout">
                Current Date: {calendarMeta.current_date.month_name} {calendarMeta.current_date.day}, Year {calendarMeta.current_date.year}
              </div>
            )}
          </Col>
        </Row>

        <div
          className="calendar-weekday-row"
          style={{ gridTemplateColumns: `repeat(${monthView.columns.length}, 1fr)` }}
        >
          {monthView.columns.map((col, index) => (
            <div key={index} className="calendar-weekday-cell">
              {col.short_name || col.name || col}
            </div>
          ))}
        </div>

        <div
          className="calendar-grid"
          style={{ gridTemplateColumns: `repeat(${monthView.columns.length}, 1fr)` }}
        >
          {monthView.days.map((dayObj) => {
            const isCurrentDay =
              calendarMeta.current_date?.year === dayObj.year &&
              calendarMeta.current_date?.month_index === dayObj.month_index &&
              calendarMeta.current_date?.day === dayObj.day;

            return (
              <div
                key={`${dayObj.year}-${dayObj.month_index}-${dayObj.day}`}
                className={`calendar-day day-clickable ${isCurrentDay ? 'current-day' : ''}`}
                onClick={() => openDayModal(dayObj)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openDayModal(dayObj);
                  }
                }}
              >
                <div className="day-header">
                  <div className="day-number">{dayObj.day}</div>
                  <div className="moon-row">
                    {dayObj.moons?.map((moon, idx) => (
                      <span key={idx} className="moon-phase" title={`${moon.name}: ${moon.phase}`}>
                        {renderMoonPhase(moon.phase)}
                      </span>
                    ))}
                  </div>
                </div>

                {dayObj.holidays?.length > 0 && (
                  <div className="holiday-list">
                    {dayObj.holidays.map((holiday, idx) => (
                      <div key={idx} className="holiday-item">
                        {holiday.name}
                      </div>
                    ))}
                  </div>
                )}

                <div className="event-list">
                  {dayObj.events?.map((event) => (
                    <div
                      key={event.id}
                      className="event"
                      style={{ borderLeft: `4px solid ${event.color || '#c084fc'}` }}
                    >
                      <strong>{event.name}</strong>
                      {event.description ? <div>{event.description}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <Modal show={showDayModal} onHide={closeDayModal} centered>
          <Modal.Header closeButton>
            <Modal.Title>
              {selectedDay ? `${currentMonthLabel} ${selectedDay.day}, Year ${selectedDay.year}` : 'Day Details'}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <h5 className="mb-2">Events</h5>
            {selectedDay?.events?.length ? (
              <div className="modal-event-list">
                {selectedDay.events.map((event) => (
                  <div key={event.id} className="modal-event-item" style={{ borderLeft: `4px solid ${event.color || '#c084fc'}` }}>
                    <strong>{event.name}</strong>
                    {event.description ? <div>{event.description}</div> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-3">No events for this day.</p>
            )}

            {selectedDay?.holidays?.length ? (
              <>
                <h6 className="mb-2">Holidays</h6>
                <ul className="mb-3">
                  {selectedDay.holidays.map((holiday, idx) => (
                    <li key={`${holiday.name}-${idx}`}>{holiday.name}</li>
                  ))}
                </ul>
              </>
            ) : null}

            {isDM && (
              <div className="modal-add-event-section">
                <h5 className="mb-2">Add Event</h5>
                <input
                  className="form-control mb-2"
                  type="text"
                  placeholder="Event name"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                />
                <input
                  className="form-control"
                  type="text"
                  placeholder="Description"
                  value={newEventDescription}
                  onChange={(e) => setNewEventDescription(e.target.value)}
                />
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeDayModal}>Close</Button>
            {isDM && (
              <Button onClick={handleCreateEvent}>Save Event</Button>
            )}
          </Modal.Footer>
        </Modal>

      </div>
    </Container>
  );
}

function renderMoonPhase(phase) {
  switch (phase) {
    case 'new':
      return '●';
    case 'waxing-crescent':
      return '◔';
    case 'first-quarter':
      return '◑';
    case 'waxing-gibbous':
      return '◕';
    case 'full':
      return '○';
    case 'waning-gibbous':
      return '◕';
    case 'last-quarter':
      return '◐';
    case 'waning-crescent':
      return '◓';
    default:
      return '○';
  }
}

export default Calendar;
