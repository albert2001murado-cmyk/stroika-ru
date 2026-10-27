import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  EMPTY_VERIFICATION_FORM,
  VERIFICATION_CATEGORIES,
  verificationFormError,
  type VerificationForm,
  type VerificationState,
} from "./accountVerification";
import { verificationApi } from "./verificationClient";
import { normalizeRussianPhone } from "./phone";

export function useVerificationApplication(
  user: User | null,
  profile: Record<string, unknown> | null,
  endpoint: string,
) {
  const uid = user?.uid || "";
  const [draft, setDraft] = useState({
    uid: "",
    value: { ...EMPTY_VERIFICATION_FORM },
  });
  const [result, setResult] = useState<{
    uid: string;
    value: VerificationState;
  } | null>(null);
  const [loading, setLoading] = useState(true),
    [sending, setSending] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    submitting = useRef(false),
    dirty = useRef(new Set<string>()),
    hydrated = useRef("");
  const state = result?.uid === uid ? result.value : null;
  const form = draft.uid === uid ? draft.value : { ...EMPTY_VERIFICATION_FORM };
  const load = useCallback(async () => {
    const current = ++generation.current;
    if (!user) {
      setResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const value = await verificationApi<VerificationState>(user, endpoint);
      if (current === generation.current) setResult({ uid: user.uid, value });
    } catch (failure) {
      if (current === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Не удалось загрузить проверку.",
        );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [uid, endpoint]);
  useEffect(() => {
    dirty.current.clear();
    hydrated.current = "";
    submitting.current = false;
    setDraft({ uid, value: { ...EMPTY_VERIFICATION_FORM } });
    setResult(null);
    setSending(false);
    setError("");
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  useEffect(() => {
    const request = state?.request,
      fillRequest = Boolean(request && request.id !== hydrated.current);
    if (fillRequest) hydrated.current = request!.id;
    setDraft((previous) => {
      const value =
        previous.uid === uid ? previous.value : { ...EMPTY_VERIFICATION_FORM };
      return {
        uid,
        value: {
          ...value,
          name: fillRequest
            ? request!.name
            : dirty.current.has("name")
              ? value.name
              : String(profile?.displayName || user?.displayName || ""),
          city: fillRequest
            ? request!.city
            : dirty.current.has("city")
              ? value.city
              : String(profile?.city || ""),
          phone: normalizeRussianPhone(String(profile?.phone || "")),
          ...(fillRequest
            ? {
                role: request!.role,
                category: VERIFICATION_CATEGORIES.includes(request!.category)
                  ? request!.category
                  : VERIFICATION_CATEGORIES[0],
                experience: request!.experience,
                message: request!.message,
              }
            : {}),
        },
      };
    });
  }, [
    uid,
    state?.request?.id,
    profile?.phone,
    profile?.displayName,
    profile?.city,
    user?.displayName,
  ]);
  function change(key: keyof VerificationForm, value: string) {
    dirty.current.add(key);
    setDraft((previous) => ({
      uid,
      value: {
        ...(previous.uid === uid ? previous.value : EMPTY_VERIFICATION_FORM),
        [key]: value,
      },
    }));
  }
  async function submit() {
    if (!user || submitting.current || !state || loading) return;
    const failure = verificationFormError(form);
    if (failure) {
      setError(failure);
      return;
    }
    submitting.current = true;
    setSending(true);
    setError("");
    const current = generation.current;
    try {
      const value = await verificationApi<VerificationState>(
        user,
        endpoint,
        form,
      );
      if (current === generation.current) setResult({ uid: user.uid, value });
    } catch (failure) {
      if (current === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Не удалось отправить заявку.",
        );
    } finally {
      if (current === generation.current) {
        submitting.current = false;
        setSending(false);
      }
    }
  }
  return { form, state, loading, sending, error, change, submit, load };
}
