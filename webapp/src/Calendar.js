import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Button, Modal, Form } from 'react-bootstrap';
import axios from 'axios';
import './Calendar.css';

function Calendar({ headers, campaignID, accountType, socket }) {
  const [calendarMeta, setCalendarMeta] = useState(null);
  const [yearView, setYearView] = useState(null);
  const [viewYear, setViewYear] = useState(null);
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
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateDraft, setDateDraft] = useState({ year: '', month_index: '', day: '', hour: 0, minute: 0 });
  const [dateSaving, setDateSaving] = useState(false);
  const [dateError, setDateError] = useState('');
  const [contextMenu, setContextMenu] = useState(null);

  const [newEventName, setNewEventName] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('');
  const [newEventVisible, setNewEventVisible] = useState(false);

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
      let shouldRefreshYear = false;

      if (payload.kind === 'current_date') {
        shouldRefreshMeta = true;

        const newDate = payload.current_date;
        if (
          newDate &&
          newDate.year === viewYear
        ) {
          shouldRefreshYear = true;
        }
      }

      if (payload.kind === 'event' || payload.kind === 'event_deleted') {
        if (
          payload.year === viewYear
        ) {
          shouldRefreshYear = true;
        }
      }

      if (payload.kind === 'event_updated') {
        const affectsOldView =
          payload.old_year === viewYear;

        const affectsNewView =
          payload.year === viewYear;

        if (affectsOldView || affectsNewView) {
          shouldRefreshYear = true;
        }
      }

      if (shouldRefreshMeta) {
        await fetchCalendarMeta();
      }

      if (shouldRefreshYear) {
        const refreshed = await fetchYearView(viewYear);

        if (selectedDay) {
          const selectedStillRelevant = selectedDay.year === viewYear;

          if (selectedStillRelevant) {
            const updatedDay = refreshed?.months?.flatMap(month => month.days).find(
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
  }, [socket, campaignID, viewYear, selectedDay, headers]);

  useEffect(() => {
    if (viewYear !== null) {
      fetchYearView(viewYear);
    }
  }, [viewYear, campaignID]);

  const fetchCalendarMeta = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const response = await axios.get(`/api/calendar/${campaignID}`, { headers });
      const data = response.data;

      if (data?.configured === false) {
        setCalendarMeta(null);
        setYearView(null);
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
      }
    } catch (error) {
      if (error.response?.status === 404) {
        setCalendarMeta(null);
        setYearView(null);
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
    } catch (error) {
      setSetupError(error.response?.data?.message || 'The calendar could not be created.');
    } finally {
      setSetupSaving(false);
    }
  };

  const fetchYearView = async (year) => {
    try {
      const response = await axios.get(
        `/api/calendar/${campaignID}/year-view`,
        {
          headers,
          params: { year }
        }
      );
      setYearView(response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching year view:', error);
    }
  };

  const handlePreviousYear = () => setViewYear(previous => previous - 1);

  const handleNextYear = () => setViewYear(previous => previous + 1);

  const handleSetTodayYear = () => {
    if (!calendarMeta?.current_date) return;
    setViewYear(calendarMeta.current_date.year);
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
    } catch (error) {
      console.error('Error advancing date:', error);
    }
  };

  const openDateEditor = () => {
    const currentDate = calendarMeta?.current_date;
    if (!currentDate) return;
    setDateDraft({
      year: currentDate.year,
      month_index: currentDate.month_index,
      day: currentDate.day,
      hour: currentDate.hour ?? 0,
      minute: currentDate.minute ?? 0,
    });
    setDateError('');
    setShowDateModal(true);
  };

  const saveCurrentDate = async (date) => {
    setDateSaving(true);
    setDateError('');
    try {
      const response = await axios.post(
        `/api/calendar/${campaignID}/date/set`,
        {
          year: Number(date.year),
          month_index: Number(date.month_index),
          day: Number(date.day),
          hour: Number(date.hour),
          minute: Number(date.minute),
        },
        { headers }
      );
      setCalendarMeta(response.data);
      setViewYear(response.data.current_date.year);
      setShowDateModal(false);
      setShowDayModal(false);
      setContextMenu(null);
    } catch (error) {
      setDateError(error.response?.data?.message || 'The current date could not be updated.');
    } finally {
      setDateSaving(false);
    }
  };

  const setDayAsCurrent = (day) => saveCurrentDate({
    ...calendarMeta.current_date,
    year: day.year,
    month_index: day.month_index,
    day: day.day,
  });

  const handleSaveDate = (event) => {
    event.preventDefault();
    saveCurrentDate(dateDraft);
  };

  const handleCreateEvent = async () => {
    if (!isDM || !newEventName || !selectedDay || viewYear === null) return;

    try {
      await axios.post(
        `/api/calendar/${campaignID}/events`,
        {
          name: newEventName,
          description: newEventDescription,
          is_player_visible: newEventVisible,
          year: selectedDay.year,
          month_index: selectedDay.month_index,
          day: selectedDay.day,
        },
        { headers }
      );

      setNewEventName('');
      setNewEventDescription('');
      setNewEventVisible(false);
      await fetchYearView(viewYear);
      await fetchCalendarMeta();
      setShowDayModal(false);
      setSelectedDay(null);
    } catch (error) {
      console.error('Error creating event:', error);
    }
  };

  const handleToggleEventVisibility = async (event) => {
    try {
      await axios.patch(`/api/calendar/events/${event.id}`, {
        is_player_visible: !event.is_player_visible,
      }, { headers });
      const updated = await fetchYearView(viewYear);
      const refreshedDay = updated?.months?.flatMap(month => month.days).find(day =>
        day.year === selectedDay.year && day.month_index === selectedDay.month_index && day.day === selectedDay.day
      );
      if (refreshedDay) setSelectedDay(refreshedDay);
      await fetchCalendarMeta();
    } catch (error) {
      console.error('Error changing event visibility:', error);
    }
  };

  const openDayModal = (dayObj) => {
    setSelectedDay(dayObj);
    setShowDayModal(true);
    setNewEventName('');
    setNewEventDescription('');
    setNewEventVisible(false);
  };

  const closeDayModal = () => {
    setShowDayModal(false);
    setSelectedDay(null);
    setNewEventName('');
    setNewEventDescription('');
    setNewEventVisible(false);
  };

  const monthLabel = (month) => month?.subtitle ? `${month.name} (${month.subtitle})` : month?.name || '';

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

  if (!calendarMeta || !yearView) {
    return (
      <Container className="calendar-page">
        <div className="calendar-loading">Loading calendar...</div>
      </Container>
    );
  }

  return (
    <Container fluid className="calendar-page">
      <div className="calendar-shell">

        <Row className="year-banner align-items-center calendar-year-toolbar">
          <Col xs="auto">
            <Button onClick={handlePreviousYear}>Previous Year</Button>
          </Col>
          <Col className="text-center">
            <h1>Year {yearView.year}</h1>
          </Col>
          <Col xs="auto" className="text-end">
            <Button onClick={handleNextYear}>Next Year</Button>
          </Col>
        </Row>

        <Row className="calendar-controls mb-3">
          <Col xs="auto">
            <a href="/timeline" className="calendar-timeline-button btn btn-primary">
              Timeline
            </a>
          </Col>
          <Col xs="auto">
            <Button variant="secondary" onClick={handleSetTodayYear}>
              Go to Current Year
            </Button>
          </Col>
          {isDM && (
            <>
              <Col xs="auto">
                <Button variant="outline-light" onClick={openDateEditor}>Set Date &amp; Time</Button>
              </Col>
              <Col xs="auto">
                <Button variant="warning" onClick={handleAdvanceDay}>
                  Advance 1 Day
                </Button>
              </Col>
            </>
          )}
          <Col className="text-end">
            {calendarMeta.current_date && (
              <div className="current-date-readout">
                Current Date: {calendarMeta.current_date.month_name} {calendarMeta.current_date.day}, Year {calendarMeta.current_date.year}
              </div>
            )}
          </Col>
        </Row>

        <div className="calendar-year-stack" aria-label={`Calendar year ${yearView.year}`}>
          {yearView.months.map((monthView) => (
            <section className="calendar-month-section" key={`${yearView.year}-${monthView.month_index}`} aria-labelledby={`calendar-month-${monthView.month_index}`}>
              <div className="month-banner">
                <h2 id={`calendar-month-${monthView.month_index}`}>{monthLabel(monthView.month)} <span>Month {monthView.month_index + 1}</span></h2>
              </div>
              <div className="calendar-weekday-row" style={{ gridTemplateColumns: `repeat(${monthView.columns.length}, 1fr)` }}>
                {monthView.columns.map((col, index) => (
                  <div key={index} className="calendar-weekday-cell">{col.short_name || col.name || col}</div>
                ))}
              </div>
              <div className="calendar-grid" style={{ gridTemplateColumns: `repeat(${monthView.columns.length}, 1fr)` }}>
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
                      onContextMenu={(event) => {
                        if (!isDM) return;
                        event.preventDefault();
                        setContextMenu({ x: event.clientX, y: event.clientY, day: dayObj });
                      }}
                      role="button"
                      aria-label={`${monthView.month.name} ${dayObj.day}, Year ${dayObj.year}`}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openDayModal(dayObj);
                        }
                      }}
                    >
                      <div className="day-header">
                        <div className="day-number">{dayObj.day}</div>
                        <div className="moon-row">
                          {dayObj.moons?.map((moon) => (
                            <span key={moon.name} className="moon-phase" title={`${moon.name}: ${moon.phase}`} aria-label={`${moon.name}: ${moon.phase}`}>
                              {renderMoonPhase(moon.phase)}
                            </span>
                          ))}
                        </div>
                      </div>
                      {dayObj.holidays?.length > 0 && <div className="holiday-list">{dayObj.holidays.map((holiday) => <div key={holiday.name} className="holiday-item">{holiday.name}</div>)}</div>}
                      <div className="event-list">{dayObj.events?.map((event) => <div key={event.id} className="event" style={{ borderLeft: `4px solid ${event.color || '#c084fc'}` }}><strong>{event.name}</strong>{event.description ? <div>{event.description}</div> : null}</div>)}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {contextMenu && (
          <div
            className="calendar-day-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseLeave={() => setContextMenu(null)}
          >
            <Button size="sm" onClick={() => setDayAsCurrent(contextMenu.day)}>
              Set as current day
            </Button>
          </div>
        )}

        <Modal show={showDateModal} onHide={() => setShowDateModal(false)} centered>
          <Form onSubmit={handleSaveDate}>
            <Modal.Header closeButton>
              <Modal.Title>Set Current Date &amp; Time</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <div className="calendar-date-fields">
                <Form.Group>
                  <Form.Label htmlFor="calendar-current-year">Year</Form.Label>
                  <Form.Control id="calendar-current-year" type="number" required value={dateDraft.year} onChange={(event) => setDateDraft((current) => ({ ...current, year: event.target.value }))} />
                </Form.Group>
                <Form.Group>
                  <Form.Label htmlFor="calendar-current-month">Month</Form.Label>
                  <Form.Select id="calendar-current-month" required value={dateDraft.month_index} onChange={(event) => setDateDraft((current) => ({ ...current, month_index: event.target.value, day: 1 }))}>
                    {(calendarMeta.months || []).map((month, index) => <option key={index} value={index}>{month.name}</option>)}
                  </Form.Select>
                </Form.Group>
                <Form.Group>
                  <Form.Label htmlFor="calendar-current-day">Day</Form.Label>
                  <Form.Control id="calendar-current-day" type="number" required min="1" max={calendarMeta.months?.[Number(dateDraft.month_index)]?.length || undefined} value={dateDraft.day} onChange={(event) => setDateDraft((current) => ({ ...current, day: event.target.value }))} />
                </Form.Group>
                <Form.Group>
                  <Form.Label htmlFor="calendar-current-hour">Hour</Form.Label>
                  <Form.Control id="calendar-current-hour" type="number" required min="0" max={(calendarMeta.hours_in_day || 24) - 1} value={dateDraft.hour} onChange={(event) => setDateDraft((current) => ({ ...current, hour: event.target.value }))} />
                </Form.Group>
                <Form.Group>
                  <Form.Label htmlFor="calendar-current-minute">Minute</Form.Label>
                  <Form.Control id="calendar-current-minute" type="number" required min="0" max={(calendarMeta.minutes_in_hour || 60) - 1} value={dateDraft.minute} onChange={(event) => setDateDraft((current) => ({ ...current, minute: event.target.value }))} />
                </Form.Group>
              </div>
              {dateError ? <div className="calendar-setup-error mt-3" role="alert">{dateError}</div> : null}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" type="button" onClick={() => setShowDateModal(false)}>Cancel</Button>
              <Button type="submit" disabled={dateSaving}>{dateSaving ? 'Saving…' : 'Set Current Date'}</Button>
            </Modal.Footer>
          </Form>
        </Modal>

        <Modal show={showDayModal} onHide={closeDayModal} centered>
          <Modal.Header closeButton>
            <Modal.Title>
              {selectedDay ? `${monthLabel(calendarMeta.months?.[selectedDay.month_index])} ${selectedDay.day}, Year ${selectedDay.year}` : 'Day Details'}
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
                    {isDM && <button type="button" className="btn btn-link btn-sm p-0" onClick={() => handleToggleEventVisibility(event)}>{event.is_player_visible ? 'Visible to players · make private' : 'DM only · show to players'}</button>}
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
                <Form.Check id="calendar-event-visible-to-players" className="mt-2" type="checkbox" label="Visible to players" checked={newEventVisible} onChange={event => setNewEventVisible(event.target.checked)} />
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeDayModal}>Close</Button>
            {isDM && (
              <>
                <Button variant="outline-primary" onClick={() => setDayAsCurrent(selectedDay)}>Set as Current Day</Button>
                <Button onClick={handleCreateEvent}>Save Event</Button>
              </>
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
      return '🌑';
    case 'waxing-crescent':
      return '🌒';
    case 'first-quarter':
      return '🌓';
    case 'waxing-gibbous':
      return '🌔';
    case 'full':
      return '🌕';
    case 'waning-gibbous':
      return '🌖';
    case 'last-quarter':
      return '🌗';
    case 'waning-crescent':
      return '🌘';
    default:
      return '🌑';
  }
}

export default Calendar;
