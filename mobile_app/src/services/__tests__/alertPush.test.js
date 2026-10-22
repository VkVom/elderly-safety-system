import { buildAlertStatusPush, buildEmergencyPush } from "../alertPush";

describe("buildEmergencyPush", () => {
  it("builds the emergency payload the Expo push API expects", () => {
    const payload = buildEmergencyPush({
      token: "ExponentPushToken[abc]",
      alertId: "a1",
      elderId: "e1",
      elderName: "Rahul",
      roomLocation: "room111",
      eventType: "MANUAL_SOS",
      tier: 2,
      elderPhone: "+911",
      assignedCaretakerId: "c1",
    });

    expect(payload).toMatchObject({
      to: "ExponentPushToken[abc]",
      title: "Emergency: Rahul",
      body: "SOS in room111",
      sound: "default",
      priority: "high",
      channelId: "emergency-alerts-v4",
      interruptionLevel: "time-sensitive",
      data: {
        alertId: "a1",
        elderId: "e1",
        eventType: "MANUAL_SOS",
        tier: 2,
        elderPhone: "+911",
        assignedCaretakerId: "c1",
      },
    });
  });

  describe("buildAlertStatusPush", () => {
    it("routes an elder status update back to the correct alert", () => {
      expect(buildAlertStatusPush({
        token: "ExponentPushToken[abc]",
        alertId: "alert-2",
        elderId: "elder-1",
        elderName: "Resident",
        statusMessage: "The resident marked themselves safe.",
        status: "RESOLVED",
      })).toMatchObject({
        to: "ExponentPushToken[abc]",
        title: "Alert update: Resident",
        body: "The resident marked themselves safe.",
        priority: "high",
        data: { alertId: "alert-2", elderId: "elder-1", status: "RESOLVED" },
      });
    });
  });

  it("defaults to an emergency tier and readable fallbacks", () => {
    const payload = buildEmergencyPush({ token: "t", alertId: "a", eventType: "FALL_IMPACT" });
    expect(payload.data.tier).toBe(2);
    expect(payload.title).toBe("Emergency: Resident");
    expect(payload.body).toBe("FALL_IMPACT in their room");
  });
});
