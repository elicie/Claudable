import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { hashPassword, createSessionCookie } from '@/lib/services/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';
    const passwordRaw = typeof body.password === 'string' ? body.password : '';
    const nameRaw = typeof body.name === 'string' ? body.name.trim() : '';

    if (!emailRaw || !passwordRaw) {
      return NextResponse.json(
        { success: false, error: 'email and password are required' },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: emailRaw.toLowerCase() },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Email is already registered' },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(passwordRaw);

    const user = await prisma.user.create({
      data: {
        email: emailRaw.toLowerCase(),
        name: nameRaw || null,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    await createSessionCookie(user.id);

    return NextResponse.json(
      { success: true, data: user },
      { status: 201 },
    );
  } catch (error) {
    console.error('[API] Failed to sign up:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sign up',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

