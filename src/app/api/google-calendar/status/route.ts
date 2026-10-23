import { auth } from "@/auth";
import { getGoogleCalendarConnection, googleCalendarAvailable, hasCalendarScope } from "@/lib/googleCalendarConnection";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const connection = await getGoogleCalendarConnection(session.user.id);
  return Response.json({
    connected: Boolean(connection && hasCalendarScope(connection.scope)),
    email: connection?.email ?? null,
    available: googleCalendarAvailable(),
  }, { headers: { "Cache-Control": "no-store" } });
}
