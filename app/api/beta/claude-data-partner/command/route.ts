import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db';
import { runFreetextCommand } from '@/lib/claude-data-partner/index';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { input?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = typeof body.input === 'string' ? body.input.trim() : '';
  if (!input) {
    return NextResponse.json({ error: 'Command input is required' }, { status: 400 });
  }

  if (input.length > 2000) {
    return NextResponse.json({ error: 'Command too long (max 2000 characters)' }, { status: 400 });
  }

  try {
    const changeSet = await runFreetextCommand({ input, prisma });
    return NextResponse.json({ changeSet });
  } catch (error) {
    console.error('claude_data_partner_command_error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Command failed' },
      { status: 500 }
    );
  }
}
