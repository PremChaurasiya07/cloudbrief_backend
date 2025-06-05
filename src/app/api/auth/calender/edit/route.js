import {authorize} from '../../../../../../lib/authorize'   // Importing the authorization function
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { user_id, eventId, eventDetails, includeMeetLink, gmail } = await req.json(); // Get the user ID, event ID, and event details from request body

    // Step 1: Authorize and get the calendar instance
    const calendar = await authorize(user_id, gmail);

    // Ensure attendees are provided and each one has a valid email
    const attendees = eventDetails.attendees && Array.isArray(eventDetails.attendees)
      ? eventDetails.attendees.filter(attendee => attendee && attendee.email) // Filter out invalid attendees
      : [];

    // If attendees are present but emails are missing, log an error and return a response
    if (attendees.length > 0 && attendees.some(attendee => !attendee.email)) {
      console.error('Some attendees are missing email addresses');
      return NextResponse.json({ error: 'Some attendees are missing email addresses' }, { status: 400 });
    }

    // Validate that startDateTime and endDateTime are provided
    if (!eventDetails.startDateTime || !eventDetails.endDateTime) {
      return NextResponse.json({ error: 'Start and end times are required' }, { status: 400 });
    }

    const startDateTime = new Date(eventDetails.startDateTime).toISOString();  // Make sure it includes the offset
    const endDateTime = new Date(eventDetails.endDateTime).toISOString(); 

    // Step 2: Prepare the event data to update
    const updatedEvent = {
      summary: eventDetails.summary,
      location: eventDetails.location || '',  // Default to empty if location is not provided
      description: eventDetails.description || '',  // Default to empty if description is not provided
      start: {
        dateTime: startDateTime,  // ISO String format (e.g., "2025-05-10T09:00:00-07:00")
        timeZone: eventDetails.timeZone || 'UTC',  // Default to UTC if timeZone is not provided
      },
      end: {
        dateTime: endDateTime,  // ISO String format (e.g., "2025-05-10T10:00:00-07:00")
        timeZone: eventDetails.timeZone || 'UTC',  // Default to UTC if timeZone is not provided
      },
      attendees, // Attendees are now safely handled
      reminders: {
        useDefault: true,  // Use default reminders
      },
      sendUpdates: 'all',  // Sends invites to attendees automatically
    };

    // Step 3: Conditionally add a Google Meet link if requested
    if (includeMeetLink) {
      updatedEvent.conferenceData = {
        createRequest: {
          requestId: `sample-${new Date().getTime()}`,  // Unique request ID
          conferenceSolutionKey: {
            type: 'hangoutsMeet',  // Use Google Meet
          },
        },
      };
    }

    // Step 4: Log the updated event data (for debugging purposes)
    console.log('Updating event with data:', updatedEvent);

    // Step 5: Update the event in Google Calendar
    const response = await calendar.events.update({
      calendarId: 'primary',  // Use 'primary' for the user's primary calendar
      eventId: eventId,  // The ID of the event to be updated
      requestBody: updatedEvent,
      conferenceDataVersion: 1,  // Required if you're creating a Meet link
      sendUpdates: 'all',  // Notify attendees
    });

    // Step 6: Log the response for debugging purposes
    console.log('Google Calendar update response:', response);

    // Step 7: Return response with success message and event details
    return NextResponse.json({
      message: 'Event updated successfully!',
      eventLink: response.data.hangoutLink || null,  // If a Meet link was updated, send it back
      eventDetails: response.data,  // Return the updated event details
    }, { status: 200 });

  } catch (error) {
    // Step 8: Handle errors
    console.error('Error updating event:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
