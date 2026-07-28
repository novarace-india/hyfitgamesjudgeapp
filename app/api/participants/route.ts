import { getParticipantResponse } from "../../participant-sync.server";

export async function GET(request: Request) {
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";

  try {
    return Response.json(await getParticipantResponse(forceRefresh), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("Participant sync failed", error);
    return Response.json(
      {
        error: "Participant data is temporarily unavailable",
      },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
