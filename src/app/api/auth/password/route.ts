import { setPasswordWithToken } from "@/lib/localAuth";
import { authErrorResponse, readAuthJson } from "@/lib/authRequest";

export async function POST(request: Request) {
  try {
    const body = await readAuthJson(request);
    await setPasswordWithToken(body.token, body.password);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return authErrorResponse(error); }
}
