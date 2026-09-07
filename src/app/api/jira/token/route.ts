import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraEmail: true, jiraSiteUrl: true, jiraApiTokenCipher: true },
  });

  return NextResponse.json({
    jiraEmail: user?.jiraEmail ?? null,
    jiraSiteUrl: user?.jiraSiteUrl ?? null,
    connected: Boolean(user?.jiraApiTokenCipher),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    jiraEmail?: string;
    apiToken?: string;
    siteUrl?: string;
  };

  if (!body.jiraEmail || !body.siteUrl) {
    return NextResponse.json(
      { error: "jiraEmail and siteUrl are required" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraApiTokenCipher: true },
  });

  if (!body.apiToken && !existing?.jiraApiTokenCipher) {
    return NextResponse.json({ error: "apiToken is required" }, { status: 400 });
  }

  let siteUrl: string;
  try {
    siteUrl = new URL(body.siteUrl).origin;
  } catch {
    return NextResponse.json({ error: "siteUrl must be a valid URL" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      jiraEmail: body.jiraEmail,
      jiraSiteUrl: siteUrl,
      // Only overwrite the stored token if a new one was provided, so users
      // can update their email/site URL without re-entering the API token.
      ...(body.apiToken ? { jiraApiTokenCipher: encryptSecret(body.apiToken) } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { jiraEmail: null, jiraSiteUrl: null, jiraApiTokenCipher: null },
  });

  return NextResponse.json({ ok: true });
}
