import test from "node:test";
import assert from "node:assert/strict";
import { rememberCoordinateSession, recallCoordinateSession, forgetCoordinateSession } from "../lib/coordinate-session.ts";

test("private comparison resumes from memory and stays bound to its endpoint", () => {
  const session = { id: "j".repeat(30), accessToken: "s".repeat(43), expiresAt: new Date(Date.now()+60000).toISOString(),
    latitude: 25.5, longitude: -80.8, endpoint: "https://worker.example" };
  assert.equal(rememberCoordinateSession(session), true);
  assert.deepEqual(recallCoordinateSession(session.endpoint), session);
  const copy = recallCoordinateSession(session.endpoint);
  copy.accessToken = "changed";
  assert.equal(recallCoordinateSession(session.endpoint).accessToken, session.accessToken);
  assert.equal(recallCoordinateSession("https://different-worker.example"), null);
  assert.equal(rememberCoordinateSession({ ...session, expiresAt: "2000-01-01" }), false);
  assert.equal(rememberCoordinateSession({ ...session, accessToken: "NASA.JWT.credential-must-never-be-retained" }), false);
  rememberCoordinateSession(session);
  forgetCoordinateSession();
  assert.equal(recallCoordinateSession(session.endpoint), null);
});
