import {authorize} from '../../../../../../lib/authorize'  // Importing the authorization function
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { user_id, eventDetails, includeMeetLink,gmail } = await req.json(); // Get event details and user ID from request body
    // console.log('Request Body:', { user_id, eventDetails, includeMeetLink }); // Log the request body for debugging
    // Step 1: Authorize and get the calendar instance
    const calendar = await authorize(user_id,gmail);
    const startDateTime = new Date(eventDetails.startDateTime).toISOString();  // Make sure it includes the offset
    const endDateTime = new Date(eventDetails.endDateTime).toISOString(); 
    // Step 2: Prepare the event data
    const event = {
      summary: eventDetails.summary,
      location: eventDetails.location || 'N/A',  // Set default if location is empty
      description: eventDetails.description || 'No description provided',  // Set default description
      start: {
        dateTime: startDateTime,  // ISO String format (e.g., "2025-05-10T09:00:00-07:00")
        timeZone: eventDetails.timeZone,
      },
      end: {
        dateTime: endDateTime,  // ISO String format (e.g., "2025-05-10T10:00:00-07:00")
        timeZone: eventDetails.timeZone,
      },
      attendees: eventDetails.attendees.length > 0 ? eventDetails.attendees.map((email) => ({ email })) : undefined, // Only include attendees if there are any
      reminders: {
        useDefault: true,  // Use default reminders
      },
      sendUpdates: 'all',  // Sends invites to attendees automatically
    };

    // Log the event payload to check for missing fields
    console.log('Event Payload:', JSON.stringify(event, null, 2));

    // Step 3: Conditionally add a Google Meet link if requested
    if (includeMeetLink) {
      event.conferenceData = {
        createRequest: {
          requestId: `sample-${new Date().getTime()}`,  // Unique request ID
          conferenceSolutionKey: {
            type: 'hangoutsMeet',  // Use Google Meet
          },
        },
      };
    }

    // Step 4: Insert event into Google Calendar
    const response = await calendar.events.insert({
      calendarId: 'primary',  // Use 'primary' for the user's primary calendar
      requestBody: event,
      conferenceDataVersion: 1,  // Required if you're creating a Meet link
      sendUpdates: 'all',  // Notify attendees
    });

    // Log the response to check for additional details
    console.log('Response:', response);

    // Step 5: Return response with success message and event details
    return NextResponse.json({
      message: 'Event created successfully!',
      eventLink: response.data.hangoutLink || null,  // If a Meet link was created, send it back
      eventDetails: response.data,  // Return the created event details
    }, { status: 200 });

  } catch (error) {
    // Log the error for debugging
    console.error('Error creating event:', error);

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
