import { NextResponse } from 'next/server';
import { authorize } from '../../../../../lib/authorize'; // adjust path if needed

export async function POST(req) {
  try {
    const body = await req.json();
    const { user_id, gmail } = body;

    await authorize(user_id, gmail);

    // Just return a success response for test
    return NextResponse.json({ message: 'Authorized successfully' });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
