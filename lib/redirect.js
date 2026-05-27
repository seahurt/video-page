import { NextResponse } from "next/server";

export function redirectTo(path) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: path
    }
  });
}
