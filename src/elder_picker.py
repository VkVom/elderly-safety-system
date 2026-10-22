"""
Dynamic elder/caretaker picker — shared by EVERY test & live entrypoint.

The elder is the anchor of the data model: choosing an elder automatically
resolves their linked caretaker (`users/{caretakerId}`) and that caretaker's Expo
push token, so every path (direct injection, webcam, phone IP-camera, real push
test, tier-flow test) routes to the right phone with zero configuration edits.

Selection resolution order for a `--elder` argument:
  1. Exact UID
  2. Pairing code (SAFE-XXXX)
  3. Case-insensitive name substring (multiple matches -> numbered sub-menu)
  4. No argument + interactive terminal -> numbered menu of all linked elders

`--caretaker <UID>` is a debug/demo escape hatch: it force-routes alert records
to that caretaker WITHOUT touching the stored pairing in Firestore.
"""

import sys
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from .escalation import ElderContext, get_firestore_db


class PickerError(Exception):
    """Raised when an elder cannot be resolved (no cloud, bad selection, etc.)."""


@dataclass
class ElderChoice:
    uid: str
    name: str
    room: str = "Unknown"
    pairing_code: str = ""
    phone: Optional[str] = None
    # Effective caretaker routing (after any --caretaker override).
    caretaker_id: Optional[str] = None
    caretaker_name: Optional[str] = None
    caretaker_token: Optional[str] = None
    token_updated: Optional[str] = None
    linked: bool = False          # elder has a (non-overridden) linked caretaker
    overridden: bool = False      # routing was force-set via --caretaker

    @property
    def has_token(self) -> bool:
        return bool(self.caretaker_token)


def mask_token(token: Optional[str]) -> str:
    if not token:
        return "-"
    return f"{token[:14]}...{token[-4:]}" if len(token) > 20 else token


def _profile_tokens(data: dict) -> List[str]:
    """Same token resolution rule as FirestoreExpoPushNotifier."""
    tokens = []
    if data.get("expoPushToken"):
        tokens.append(data["expoPushToken"])
    if data.get("pushToken"):
        tokens.append(data["pushToken"])
    tokens.extend(data.get("pushTokens") or [])
    return tokens


def _fetch_caretaker(db, uid: Optional[str]) -> dict:
    if not uid:
        return {}
    snap = db.collection("users").document(uid).get()
    return snap.to_dict() or {} if snap.exists else {}


def load_elders(db) -> List[ElderChoice]:
    """All elder users with their linked caretaker + token status resolved."""
    choices: List[ElderChoice] = []
    docs = db.collection("users").where("role", "==", "elder").stream()
    for d in docs:
        u = d.to_dict() or {}
        c_id = u.get("caretakerId")
        c = _fetch_caretaker(db, c_id) if c_id else {}
        tokens = _profile_tokens(c)
        choices.append(ElderChoice(
            uid=d.id,
            name=u.get("name") or "Resident",
            room=u.get("roomLocation") or "Unknown",
            pairing_code=u.get("pairingCode") or "",
            phone=u.get("phone"),
            caretaker_id=c_id,
            caretaker_name=u.get("caretakerName") or c.get("name"),
            caretaker_token=tokens[0] if tokens else None,
            token_updated=c.get("notificationsUpdatedAt"),
            linked=bool(c_id),
        ))
    choices.sort(key=lambda c: (c.name or "").lower())
    return choices


def print_elders_table(choices: List[ElderChoice]) -> None:
    if not choices:
        print("No elder users found. Sign up an elder in the app first.")
        return
    print(f"{'#':<4} {'NAME':<24} {'UID':<30} {'ROOM':<10} {'CODE':<11} CARETAKER (token)")
    for i, c in enumerate(choices, 1):
        caretaker = f"{c.caretaker_name or '-'}"
        if c.caretaker_id and c.has_token:
            caretaker += " (token ok)"
        elif c.caretaker_id:
            caretaker += " (no token!)"
        print(f"{i:<4} {c.name[:23]:<24} {c.uid:<30} {str(c.room)[:9]:<10} "
              f"{c.pairing_code:<11} {caretaker}")


def _menu(choices: List[ElderChoice]) -> ElderChoice:
    while True:
        raw = input("Pick elder # (or q to cancel): ").strip()
        if raw.lower() in ("q", "quit", "exit", ""):
            raise PickerError("cancelled")
        if raw.isdigit() and 1 <= int(raw) <= len(choices):
            return choices[int(raw) - 1]
        print(f"  enter a number between 1 and {len(choices)}")


def _match(selection: str, choices: List[ElderChoice]) -> List[ElderChoice]:
    """Resolve by UID (exact) -> pairing code -> name substring (all matches)."""
    by_uid = [c for c in choices if c.uid == selection]
    if by_uid:
        return by_uid
    code = selection.strip().upper()
    by_code = [c for c in choices if c.pairing_code.upper() == code]
    if by_code:
        return by_code
    needle = selection.strip().lower()
    return [c for c in choices if needle in (c.name or "").lower()]


def pick_elder(
    selection: Optional[str] = None,
    caretaker_override: Optional[str] = None,
    interactive: bool = True,
    db=None,
) -> Tuple[ElderChoice, object]:
    """
    Resolve an elder (and their caretaker) from the live Firestore directory.

    Returns (ElderChoice, db). Raises PickerError with a human-readable reason
    when nothing can be resolved (parents can print it and exit non-zero).
    """
    if db is None:
        try:
            db = get_firestore_db()
        except Exception as e:
            raise PickerError(f"Firestore unavailable ({e}). Check firebase-service-account.json.")

    choices = load_elders(db)
    if not choices:
        raise PickerError("No elder accounts exist yet — create an elder profile in the app first.")

    if selection:
        matches = _match(selection, choices)
        if not matches:
            raise PickerError(
                f"No elder matches '{selection}'. Use a UID, a SAFE-XXXX code, or a name.")
        if len(matches) == 1:
            choice = matches[0]
        elif interactive and sys.stdin.isatty():
            print(f"'{selection}' matches {len(matches)} elders:")
            print_elders_table(matches)
            choice = _menu(matches)
        else:
            names = ", ".join(f"{c.name} ({c.uid})" for c in matches)
            raise PickerError(f"'{selection}' is ambiguous: {names}")
    elif interactive and sys.stdin.isatty():
        print("\nLinked Elders:")
        print_elders_table(choices)
        print()
        choice = _menu(choices)
    elif len(choices) == 1:
        choice = choices[0]  # non-interactive convenience: only one elder exists
    else:
        names = ", ".join(f"{c.name} ({c.uid}, {c.pairing_code})" for c in choices)
        raise PickerError(
            f"Multiple elders exist — pass --elder <UID|SAFE-XXXX|name>. Elders: {names}")

    # --caretaker override: force routing without changing stored pairing.
    if caretaker_override:
        c = _fetch_caretaker(db, caretaker_override)
        if not c:
            raise PickerError(f"--caretaker {caretaker_override}: no such user document.")
        tokens = _profile_tokens(c)
        choice.caretaker_id = caretaker_override
        choice.caretaker_name = c.get("name") or choice.caretaker_name
        choice.caretaker_token = tokens[0] if tokens else None
        choice.token_updated = c.get("notificationsUpdatedAt")
        choice.overridden = True

    return choice, db


def routing_banner(choice: ElderChoice) -> str:
    """One-glance routing summary printed by every entrypoint before it runs."""
    caretaker = f"{choice.caretaker_name or 'UNKNOWN'}"
    if choice.caretaker_id:
        caretaker += f" ({choice.caretaker_id})"
    note = ""
    if choice.overridden:
        note = "  [--caretaker override]"
    elif not choice.caretaker_id:
        note = "  [NO caretaker linked — alerts will not reach a phone!]"
    elif not choice.has_token:
        note = "  [caretaker has NO push token — open the app on their phone once]"
    updated = f"  (token updated {choice.token_updated})" if choice.token_updated else ""
    return (
        f"Elder     : {choice.name} ({choice.uid})  Room {choice.room}  Code {choice.pairing_code or '-'}\n"
        f"Caretaker : {caretaker}{note}\n"
        f"Push token: {mask_token(choice.caretaker_token)}{updated}"
    )


def to_elder_context(choice: ElderChoice):
    """Build the escalation ElderContext for the chosen elder/caretaker pair."""
    return ElderContext(
        elder_id=choice.uid,
        elder_name=choice.name,
        room_location=choice.room,
        assigned_caretaker_id=choice.caretaker_id,
        elder_phone=choice.phone,
    )


def local_elder_context(local_label: Optional[str] = None) -> ElderContext:
    """Build a non-routed placeholder context for offline camera pipeline checks."""
    label = (str(local_label).strip() if local_label else "") or "ELDER_LOCAL_TEST"
    return ElderContext(
        elder_id=label,
        elder_name="Local Test Resident",
        room_location="Local Camera",
        assigned_caretaker_id=None,
    )


def resolve_live_elder(selection: Optional[str], caretaker_override: Optional[str],
                       local_only: bool = False):
    """Resolve production routing, or avoid all Firebase lookup in local-only mode."""
    if local_only:
        return local_elder_context(selection), None, None
    choice, db = pick_elder(selection=selection, caretaker_override=caretaker_override)
    return to_elder_context(choice), choice, db


# Quick manual check:  python -m src.elder_picker [selection]
if __name__ == "__main__":
    sel = sys.argv[1] if len(sys.argv) > 1 else None
    try:
        chosen, _db = pick_elder(selection=sel)
    except PickerError as e:
        print(f"[picker] {e}")
        raise SystemExit(1)
    print()
    print(routing_banner(chosen))
