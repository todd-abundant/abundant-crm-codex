import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db';
import { applyChangeSet } from '@/lib/claude-data-partner/index';
import { READONLY_TABLES } from '@/lib/claude-data-partner/index';
import type { ChangeSet } from '@/lib/claude-data-partner/types';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { changeSet?: ChangeSet };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const changeSet = body.changeSet;
  if (!changeSet || !Array.isArray(changeSet.groups)) {
    return NextResponse.json({ error: 'changeSet is required' }, { status: 400 });
  }

  // Server-side safety: validate that no approved changes target readonly tables
  for (const group of changeSet.groups) {
    for (const change of group.changes) {
      if (!change.userApproved) continue;
      if (READONLY_TABLES.includes(change.table as never)) {
        return NextResponse.json(
          { error: `Writes to "${change.table}" are not permitted.` },
          { status: 400 }
        );
      }
    }
  }

  try {
    const writeLog = await applyChangeSet({
      changeSet,
      prisma,
      actorId: user.id,
      actorName: user.name || user.email,
    });
    return NextResponse.json({ writeLog });
  } catch (error) {
    console.error('claude_data_partner_apply_error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Apply failed' },
      { status: 500 }
    );
  }
}
