import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const GROUP_API_VERSION = 2;

type AdminPermission = "editInfo" | "inviteMembers" | "kickMembers" | "manageTags";
type AdminPermissionSet = Record<AdminPermission, boolean>;

const FULL_PERMISSIONS: AdminPermissionSet = {
  editInfo: true,
  inviteMembers: true,
  kickMembers: true,
  manageTags: true,
};

class GroupActionError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function bearerToken(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, any>) }
    : {};
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))]
    : [];
}

function cleanTargetUid(value: unknown) {
  return String(value || "").trim().slice(0, 128);
}

function sanitizePermissions(value: unknown): AdminPermissionSet {
  const source = objectRecord(value);
  return {
    editInfo: source.editInfo === true,
    inviteMembers: source.inviteMembers === true,
    kickMembers: source.kickMembers === true,
    manageTags: source.manageTags === true,
  };
}

function hasPermission(data: Record<string, any>, uid: string, permission: AdminPermission) {
  if (data.ownerId === uid) return true;
  const admins = stringList(data.adminIds);
  if (!admins.includes(uid)) return false;

  const permissions = objectRecord(data.adminPermissions);
  // Старые группы не содержат adminPermissions. Сохраняем прежние права их администраторов.
  if (!Object.prototype.hasOwnProperty.call(permissions, uid)) return true;
  return objectRecord(permissions[uid])[permission] === true;
}

export async function POST(request: NextRequest) {
  try {
    const token = bearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Нужно войти в аккаунт." }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    const body = await request.json();
    const chatId = String(body?.chatId || "").trim();
    const action = String(body?.action || "update").trim();
    if (!chatId) {
      return NextResponse.json({ error: "Группа не указана." }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("chats").doc(chatId);
    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new GroupActionError("Группа не найдена.", 404);

      const data = snapshot.data() || {};
      if (data.chatType !== "group" && data.isGroup !== true) {
        throw new GroupActionError("Группа не найдена.", 404);
      }

      const participantIds = stringList(data.participantIds);
      const admins = stringList(data.adminIds);
      const isOwner = data.ownerId === decoded.uid;
      if (!participantIds.includes(decoded.uid)) {
        throw new GroupActionError("Вы больше не состоите в этой группе.", 403);
      }

      const commonUpdate = { updatedAt: FieldValue.serverTimestamp() };

      if (action === "update") {
        if (!hasPermission(data, decoded.uid, "editInfo")) {
          throw new GroupActionError("Нет доступа к изменению названия и аватара.", 403);
        }
        const title = String(body?.title || "").trim().slice(0, 80);
        if (title.length < 2) {
          throw new GroupActionError("Введите название группы.", 400);
        }
        transaction.update(ref, {
          groupTitle: title,
          groupAvatarUrl: String(body?.avatarUrl || "").trim().slice(0, 1200),
          groupAvatarPath: String(body?.avatarPath || "").trim().slice(0, 600),
          ...commonUpdate,
        });
        return { ok: true };
      }

      if (action === "new-invite") {
        if (!hasPermission(data, decoded.uid, "inviteMembers")) {
          throw new GroupActionError("Нет доступа к приглашению участников.", 403);
        }
        const inviteToken = randomUUID().replaceAll("-", "");
        transaction.update(ref, { inviteToken, inviteEnabled: true, ...commonUpdate });
        return { ok: true, inviteToken };
      }

      if (action === "set-admin") {
        if (!isOwner) throw new GroupActionError("Назначать администраторов может только владелец.", 403);
        const targetUid = cleanTargetUid(body?.targetUid);
        if (!targetUid || !participantIds.includes(targetUid)) {
          throw new GroupActionError("Участник не найден.", 404);
        }
        if (targetUid === data.ownerId) {
          throw new GroupActionError("Владелец уже имеет все права.", 400);
        }

        const enabled = body?.enabled === true;
        const nextAdmins = enabled
          ? [...new Set([...admins, targetUid])]
          : admins.filter((uid) => uid !== targetUid);
        const adminPermissions = objectRecord(data.adminPermissions);
        if (enabled) adminPermissions[targetUid] = sanitizePermissions(body?.permissions || FULL_PERMISSIONS);
        else delete adminPermissions[targetUid];

        transaction.update(ref, { adminIds: nextAdmins, adminPermissions, ...commonUpdate });
        return { ok: true };
      }

      if (action === "set-admin-permissions") {
        if (!isOwner) throw new GroupActionError("Права администраторов меняет только владелец.", 403);
        const targetUid = cleanTargetUid(body?.targetUid);
        if (!targetUid || targetUid === data.ownerId || !admins.includes(targetUid)) {
          throw new GroupActionError("Администратор не найден.", 404);
        }
        const adminPermissions = objectRecord(data.adminPermissions);
        adminPermissions[targetUid] = sanitizePermissions(body?.permissions);
        transaction.update(ref, { adminPermissions, ...commonUpdate });
        return { ok: true };
      }

      if (action === "set-tag") {
        if (!hasPermission(data, decoded.uid, "manageTags")) {
          throw new GroupActionError("Нет доступа к тегам участников.", 403);
        }
        const targetUid = cleanTargetUid(body?.targetUid);
        if (!targetUid || !participantIds.includes(targetUid)) {
          throw new GroupActionError("Участник не найден.", 404);
        }
        const tag = String(body?.tag || "").replace(/\s+/g, " ").trim().slice(0, 24);
        const memberTags = objectRecord(data.memberTags);
        if (tag) memberTags[targetUid] = tag;
        else delete memberTags[targetUid];
        transaction.update(ref, { memberTags, ...commonUpdate });
        return { ok: true };
      }

      if (action === "kick") {
        if (!hasPermission(data, decoded.uid, "kickMembers")) {
          throw new GroupActionError("Нет доступа к удалению участников.", 403);
        }
        const targetUid = cleanTargetUid(body?.targetUid);
        if (!targetUid || !participantIds.includes(targetUid)) {
          throw new GroupActionError("Участник не найден.", 404);
        }
        if (targetUid === decoded.uid || targetUid === data.ownerId) {
          throw new GroupActionError("Для этого действия используйте выход из группы.", 400);
        }
        if (!isOwner && admins.includes(targetUid)) {
          throw new GroupActionError("Администратора может удалить только владелец.", 403);
        }

        const nextParticipantIds = participantIds.filter((uid) => uid !== targetUid);
        const participants = objectRecord(data.participants);
        const users = objectRecord(data.users);
        const adminPermissions = objectRecord(data.adminPermissions);
        const memberTags = objectRecord(data.memberTags);
        delete participants[targetUid];
        delete users[targetUid];
        delete adminPermissions[targetUid];
        delete memberTags[targetUid];

        transaction.update(ref, {
          participantIds: nextParticipantIds,
          participants,
          users,
          adminIds: admins.filter((uid) => uid !== targetUid),
          adminPermissions,
          memberTags,
          memberCount: nextParticipantIds.length,
          ...commonUpdate,
        });
        return { ok: true };
      }

      if (action === "leave") {
        const nextParticipantIds = participantIds.filter((uid) => uid !== decoded.uid);
        const participants = objectRecord(data.participants);
        const users = objectRecord(data.users);
        const adminPermissions = objectRecord(data.adminPermissions);
        const memberTags = objectRecord(data.memberTags);
        delete participants[decoded.uid];
        delete users[decoded.uid];
        delete adminPermissions[decoded.uid];
        delete memberTags[decoded.uid];

        let nextOwnerId = String(data.ownerId || "");
        let nextAdmins = admins.filter((uid) => uid !== decoded.uid && nextParticipantIds.includes(uid));
        if (isOwner) {
          nextOwnerId = nextAdmins[0] || nextParticipantIds[0] || "";
          if (nextOwnerId) {
            nextAdmins = [...new Set([nextOwnerId, ...nextAdmins])];
            adminPermissions[nextOwnerId] = { ...FULL_PERMISSIONS };
          }
        }

        transaction.update(ref, {
          participantIds: nextParticipantIds,
          participants,
          users,
          ownerId: nextOwnerId,
          adminIds: nextAdmins,
          adminPermissions,
          memberTags,
          memberCount: nextParticipantIds.length,
          inviteEnabled: nextParticipantIds.length > 0 ? data.inviteEnabled !== false : false,
          archived: nextParticipantIds.length === 0,
          ...commonUpdate,
        });
        return { ok: true, newOwnerId: nextOwnerId || null };
      }

      throw new GroupActionError("Неизвестное действие.", 400);
    });

    return NextResponse.json({ ...result, apiVersion: GROUP_API_VERSION });
  } catch (error) {
    if (error instanceof GroupActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("group update error", error);
    return NextResponse.json({ error: "Не получилось сохранить настройки группы." }, { status: 500 });
  }
}
