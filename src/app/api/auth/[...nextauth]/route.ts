import { handlers } from "@/auth";
import { NextRequest } from "next/server";
import { requestOrigin } from "@/lib/authRequest";

function publicRequest(request: NextRequest) {
  // Docker's internal Next URL can be localhost even for LAN requests.
  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, requestOrigin(request));
  return new NextRequest(url, request);
}

export function GET(request: NextRequest) { return handlers.GET(publicRequest(request)); }
export function POST(request: NextRequest) { return handlers.POST(publicRequest(request)); }
