import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'Session listing is not implemented yet',
    },
    { status: 501 }
  );
}
