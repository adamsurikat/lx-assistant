import { auth } from "@/auth";
import { createUserByAdmin, listUsersForAdmin } from "@/lib/localAuth";
import { authErrorResponse, readAuthJson } from "@/lib/authRequest";

export async function GET() {
  try {
    const session = await auth();
    const users = await listUsersForAdmin(session?.user?.id);
    return Response.json({ users }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const body = await readAuthJson(request);
    const { user, token, expiresAt } = await createUserByAdmin(session?.user?.id, body);
    // Keep the token in a fragment so it is not sent in requests or referrers.
    const setupPath = `/set-password#${new URLSearchParams({ token })}`;
    return Response.json({ user, setupPath, expiresAt }, {
      status: 201, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return authErrorResponse(error); }
}
