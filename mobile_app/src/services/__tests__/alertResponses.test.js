jest.mock("firebase/firestore", () => ({
  arrayUnion: (value) => value,
  doc: jest.fn(),
  runTransaction: jest.fn(),
}));
jest.mock("../../config/firebase", () => ({
  db: {},
  isFirebaseConfigured: true,
}));

import {
  buildAlertResponsePatch,
  buildElderSafePatch,
  classifyVolunteerAlert,
  getVolunteerUpdateLabel,
} from "../alertResponses";

const baseAlert = {
  id: "alert-1",
  status: "CREATED",
  assignedCaretakerId: "caretaker-1",
  escalatedToVolunteers: true,
};

describe("buildAlertResponsePatch", () => {
  it("keeps the alert open when the volunteer accepts", () => {
    const result = buildAlertResponsePatch(
      baseAlert,
      { uid: "volunteer-1", role: "volunteer", name: "Sam" },
      "accept",
      "2026-10-21T00:00:00.000Z",
      "event-1"
    );

    expect(result.patch).toMatchObject({
      volunteerResponse: {
        uid: "volunteer-1",
        name: "Sam",
        status: "ON_THE_WAY",
      },
      acknowledgedBy: "volunteer-1",
    });
    expect(result.patch.status).toBeUndefined();
    expect(result.patch.responseEvent).toMatchObject({
      action: "accept",
      actorUid: "volunteer-1",
      actorRole: "volunteer",
    });
  });

  describe("classifyVolunteerAlert", () => {
    it("keeps a volunteer response active when the caretaker also responds", () => {
      expect(classifyVolunteerAlert({
        ...baseAlert,
        caretakerResponse: { uid: "caretaker-1", status: "ON_THE_WAY" },
        volunteerResponse: { uid: "volunteer-1", status: "ON_THE_WAY" },
      }, "volunteer-1", true)).toBe("responding");
    });

    it("moves a caretaker-handled alert to recent updates for volunteers", () => {
      expect(classifyVolunteerAlert({
        ...baseAlert,
        caretakerResponse: { uid: "caretaker-1", status: "ON_THE_WAY" },
      }, "volunteer-1", true)).toBe("handled");
    });

    it("keeps an accepted volunteer response visible while off duty", () => {
      expect(classifyVolunteerAlert({
        ...baseAlert,
        volunteerResponse: { uid: "volunteer-1", status: "ARRIVED" },
      }, "volunteer-1", false)).toBe("responding");
    });

    it("hides unclaimed alerts while the volunteer is off duty", () => {
      expect(classifyVolunteerAlert(baseAlert, "volunteer-1", false)).toBe("hidden");
    });

    it("moves closed alerts to recent updates", () => {
      expect(classifyVolunteerAlert({
        ...baseAlert,
        status: "RESOLVED",
      }, "volunteer-1", true)).toBe("closed");
    });
  });

  it("preserves an en-route volunteer when the caretaker also accepts", () => {
    const alert = {
      ...baseAlert,
      volunteerResponse: {
        uid: "volunteer-1",
        name: "Sam",
        role: "volunteer",
        status: "ON_THE_WAY",
      },
    };

    const result = buildAlertResponsePatch(
      alert,
      { uid: "caretaker-1", role: "caretaker", name: "Asha" },
      "accept",
      "2026-10-21T00:01:00.000Z",
      "event-2"
    );

    expect(result.patch.caretakerResponse).toMatchObject({
      uid: "caretaker-1",
      name: "Asha",
      status: "ON_THE_WAY",
    });
    expect(alert.volunteerResponse.status).toBe("ON_THE_WAY");
    expect(result.patch.status).toBeUndefined();
  });

  it("does not allow volunteers to accept after the caretaker has taken the alert", () => {
    expect(() => buildAlertResponsePatch(
      {
        ...baseAlert,
        caretakerResponse: { uid: "caretaker-1", status: "ON_THE_WAY" },
      },
      { uid: "volunteer-1", role: "volunteer" },
      "accept",
      "2026-10-21T00:02:00.000Z",
      "event-3"
    )).toThrow("The caretaker is already responding to this alert.");
  });

  it("records arrival without resolving the alert", () => {
    const result = buildAlertResponsePatch(
      {
        ...baseAlert,
        volunteerResponse: {
          uid: "volunteer-1",
          name: "Sam",
          role: "volunteer",
          status: "ON_THE_WAY",
        },
      },
      { uid: "volunteer-1", role: "volunteer", name: "Sam" },
      "arrive",
      "2026-10-21T00:03:00.000Z",
      "event-4"
    );

    expect(result.patch.volunteerResponse.status).toBe("ARRIVED");
    expect(result.patch.status).toBeUndefined();
  });

  it("keeps the alert open when a responder stands down", () => {
    const result = buildAlertResponsePatch(
      {
        ...baseAlert,
        volunteerResponse: {
          uid: "volunteer-1",
          name: "Sam",
          role: "volunteer",
          status: "ON_THE_WAY",
        },
      },
      { uid: "volunteer-1", role: "volunteer", name: "Sam" },
      "stand_down",
      "2026-10-21T00:03:30.000Z",
      "event-5"
    );

    expect(result.patch.volunteerResponse.status).toBe("STOOD_DOWN");
    expect(result.patch.status).toBeUndefined();
  });

  it("closes an alert only when a responder explicitly resolves it", () => {
    const result = buildAlertResponsePatch(
      {
        ...baseAlert,
        volunteerResponse: {
          uid: "volunteer-1",
          name: "Sam",
          role: "volunteer",
          status: "ARRIVED",
        },
      },
      { uid: "volunteer-1", role: "volunteer", name: "Sam" },
      "resolve",
      "2026-10-21T00:04:00.000Z",
      "event-6"
    );

    expect(result.patch).toMatchObject({
      status: "RESOLVED",
      resolvedByUid: "volunteer-1",
      resolvedByRole: "volunteer",
    });
  });

  it("does not allow a responder to close the alert before marking arrived", () => {
    expect(() => buildAlertResponsePatch(
      {
        ...baseAlert,
        caretakerResponse: {
          uid: "caretaker-1",
          name: "Asha",
          role: "caretaker",
          status: "ON_THE_WAY",
        },
      },
      { uid: "caretaker-1", role: "caretaker", name: "Asha" },
      "resolve",
      "2026-10-21T00:04:00.000Z",
      "event-10"
    )).toThrow("Mark yourself as arrived before confirming the resident is safe.");
  });

  it("records an elder safety confirmation and closes an emergency without erasing responder state", () => {
    const alert = {
      ...baseAlert,
      elderId: "elder-1",
      volunteerResponse: { uid: "volunteer-1", status: "ON_THE_WAY" },
    };
    const result = buildElderSafePatch(
      alert,
      { uid: "elder-1", role: "elder", name: "Ravi" },
      "2026-10-21T00:05:00.000Z",
      "event-7"
    );

    expect(result).toMatchObject({
      status: "RESOLVED",
      resolvedByUid: "elder-1",
      resolvedByRole: "elder",
      elderConfirmation: { status: "SAFE", uid: "elder-1" },
      responseEvent: { action: "mark_safe", actorRole: "elder" },
    });
    expect(alert.volunteerResponse.status).toBe("ON_THE_WAY");
  });

  it("keeps automatic warning recovery distinct from resolving an emergency", () => {
    expect(buildElderSafePatch(
      { ...baseAlert, elderId: "elder-1", status: "WARNING" },
      { uid: "elder-1", role: "elder" },
      "2026-10-21T00:05:00.000Z",
      "event-8"
    ).status).toBe("AUTO_CANCELLED");
  });

  it("does not allow an elder to mark another resident's alert safe", () => {
    expect(() => buildElderSafePatch(
      { ...baseAlert, elderId: "elder-2" },
      { uid: "elder-1", role: "elder" },
      "2026-10-21T00:05:00.000Z",
      "event-9"
    )).toThrow("Only the resident who owns this alert can mark it safe.");
  });
});

describe("getVolunteerUpdateLabel", () => {
  it("labels a closed alert without relying on screen-local status globals", () => {
    expect(getVolunteerUpdateLabel({
      status: "RESOLVED",
      resolvedByName: "Asha",
    }, "volunteer-1")).toBe("Alert closed · Asha");
  });

  it("describes another active responder", () => {
    expect(getVolunteerUpdateLabel({
      status: "CONFIRMED",
      volunteerResponse: { uid: "volunteer-2", name: "Sam", status: "ON_THE_WAY" },
    }, "volunteer-1")).toBe("Sam is responding");
  });
});
