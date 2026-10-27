export async function POST() {
  return Response.json(
    { error: "Self-registration is disabled. Ask the administrator to create your account." },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
