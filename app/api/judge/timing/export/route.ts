import { requireUser } from "../../../../../lib/auth.server";
import { query } from "../../../../../lib/db";

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin", "readonly"]);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const bib = url.searchParams.get("bib")?.trim() ?? "";
  if (bib && !/^\d+$/.test(bib)) {
    return Response.json({ error: "BIB must be numeric" }, { status: 400 });
  }

  const result = await query(
    `SELECT r.id AS "raceSessionId",p.bib,p.name AS "participantName",
      u.staff_id AS "judgeStaffId",u.name AS "judgeName",r.state,
      r.is_ooc AS "isOoc",r.manual_started_at AS "manualStartedAt",
      r.finished_at AS "finishedAt",
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'stageId',s.stage_id,'stageName',s.stage_name,'boundaryAt',s.boundary_at,
          'cumulativeMs',s.cumulative_ms,'segmentMs',s.segment_ms,
          'revisionState',s.revision_state
        ) ORDER BY s.boundary_at,s.created_at)
        FROM race_splits s WHERE s.race_session_id=r.id
      ),'[]'::jsonb) AS splits,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'stationNumber',o.station_number,'outcome',o.outcome,
          'penaltySeconds',o.penalty_seconds,'note',o.note,'createdAt',o.created_at
        ) ORDER BY o.created_at)
        FROM station_outcomes o WHERE o.race_session_id=r.id
      ),'[]'::jsonb) AS outcomes,
      (
        SELECT jsonb_build_object(
          'sequence',c.sequence,'response',c.response,'tapObservedAt',c.tap_observed_at,
          'correctCount',c.correct_count,'percentage',c.percentage,
          'penaltySeconds',c.penalty_seconds,'bonusSeconds',c.bonus_seconds,
          'recallDurationMs',c.recall_duration_ms
        ) FROM cognitive_attempts c WHERE c.race_session_id=r.id
        ORDER BY c.created_at DESC LIMIT 1
      ) AS cognitive
     FROM race_sessions r
     JOIN participants p ON p.id=r.participant_id
     JOIN users u ON u.id=r.judge_id
     WHERE r.event_id=$1 AND ($2='' OR p.bib=$2)
     ORDER BY r.started_at DESC`,
    [auth.user.eventId, bib],
  );

  if (format === "json") {
    return Response.json({ exportedAt: new Date().toISOString(), races: result.rows });
  }

  const header = [
    "raceSessionId", "bib", "participantName", "judgeStaffId", "judgeName",
    "state", "isOoc", "manualStartedAt", "finishedAt", "splitsJson",
    "outcomesJson", "cognitiveJson",
  ];
  const rows = result.rows.map((race) => [
    race.raceSessionId, race.bib, race.participantName, race.judgeStaffId,
    race.judgeName, race.state, race.isOoc, race.manualStartedAt, race.finishedAt,
    JSON.stringify(race.splits), JSON.stringify(race.outcomes), JSON.stringify(race.cognitive),
  ].map(csvCell).join(","));
  return new Response([header.join(","), ...rows].join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hyfit-manual-timing-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
