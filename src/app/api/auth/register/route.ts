import { registerUser } from "@/lib/localAuth";
import { authErrorResponse, readAuthJson } from "@/lib/authRequest";

export async function POST(request: Request) {
  try {
    await registerUser(await readAuthJson(request));
    return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return authErrorResponse(error); }
}
