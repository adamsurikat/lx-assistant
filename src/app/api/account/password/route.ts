import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { changePassword } from "@/lib/localAuth";
import { authErrorResponse, readAuthJson } from "@/lib/authRequest";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { passwordHash: true } });
  return Response.json({ passwordSet: Boolean(user.passwordHash) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await readAuthJson(request);
    await changePassword(session.user.id, body.currentPassword, body.password);
    return Response.json({ ok: true });
  } catch (error) { return authErrorResponse(error); }
}
