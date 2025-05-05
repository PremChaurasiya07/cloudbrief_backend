import authorize from '../route';  // Importing the authorization function
import { NextResponse } from 'next/server';

export async function DELETE(req) {
  try {
    const { user_id, eventId,gmail } = await req.json(); // Get the user ID and event ID from the request body

    // Step 1: Authorize and get the calendar instance
    const calendar = await authorize(user_id,gmail);

    // Step 2: Delete the event by its ID
    await calendar.events.delete({
      calendarId: 'primary',  // Use 'primary' for the user's primary calendar
      eventId: eventId,  // The ID of the event to be deleted
    });

    // Step 3: Return success message
    return NextResponse.json({
      message: 'Event deleted successfully!',
    }, { status: 200 });

  } catch (error) {
    // Log the error for debugging
    console.error('Error deleting event:', error);

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
