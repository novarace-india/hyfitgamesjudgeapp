import { getParticipantResponse } from "../../participant-sync.server";
import { requireUser } from "../../../lib/auth.server";
import { query } from "../../../lib/db";

export async function GET(request: Request) {
  if (process.env.DATABASE_URL) {
    const auth = await requireUser(request, ["super_admin","event_admin","judge","checkin","readonly"]);
    if ("error" in auth) return auth.error;
    const result = await query(
      `SELECT p.id,p.bib,p.name,p.category,p.contest_id AS "contestId",p.wave,
       CASE WHEN EXISTS(SELECT 1 FROM race_sessions r WHERE r.participant_id=p.id AND r.state='active') THEN 'On course' ELSE 'Ready' END AS status
       FROM participants p WHERE p.event_id=$1 ORDER BY p.bib`,
      [auth.user.eventId],
    );
    const now = new Date();
    return Response.json({
      participants: result.rows.map((participant) => ({
        ...participant,
        avatar: String(participant.name).split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""),
      })),
      sync: {
        source: "raceresult",
        fetchedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60000).toISOString(),
        rejectedCount: 0,
        stale: false,
      },
    }, { headers: { "cache-control": "no-store" } });
  }
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
