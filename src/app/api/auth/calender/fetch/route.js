// /app/api/auth/calendar/route.js


import { NextResponse } from 'next/server';
import authorize from '../route';

export async function POST(req) {
  const { user_id,gmail } = await req.json();


  try {
    const calendar = await authorize(user_id,gmail);

    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = result.data.items || [];

    return NextResponse.json({ events });
  } catch (err) {
    console.error('Calendar error:', err);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
