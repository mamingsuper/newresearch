import { edgeFetch, publicEdgeFetch, supabase } from "./supabase";

export interface ProgramSubmission {
  conferenceName: string;
  acronym: string;
  year: number;
  discipline: string;
  officialUrl: string;
  programUrl?: string;
  file?: File;
  notes?: string;
  attested: boolean;
}

export const programs = {
  async submit(data: ProgramSubmission): Promise<{ ok: true; submissionId: string } | { ok: false; error: string }> {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    let storagePath = "";
    const body: Record<string, unknown> = {
      conferenceName: data.conferenceName,
      acronym: data.acronym,
      year: data.year,
      discipline: data.discipline,
      officialConferenceUrl: data.officialUrl,
      notes: data.notes ?? "",
      rightsAttested: data.attested,
    };

    if (data.file) {
      if (!user) return { ok: false, error: "AUTH_REQUIRED" };
      const submissionId = crypto.randomUUID();
      storagePath = `${user.id}/${submissionId}/${data.file.name}`;
      const bytes = await data.file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
      const { error } = await supabase.storage.from("program-submissions").upload(storagePath, data.file, {
        contentType: data.file.type,
        upsert: false,
      });
      if (error) return { ok: false, error: error.message };
      Object.assign(body, {
        kind: "file",
        storagePath,
        fileName: data.file.name,
        fileSizeBytes: data.file.size,
        mimeType: data.file.type,
        sha256,
      });
    } else {
      Object.assign(body, { kind: "url", programUrl: data.programUrl });
    }

    const response = user
      ? await edgeFetch("submit-program", { method: "POST", body: JSON.stringify(body) })
      : await publicEdgeFetch("submit-program", { method: "POST", body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (storagePath) await supabase.storage.from("program-submissions").remove([storagePath]);
      return { ok: false, error: payload?.error?.code ?? "SUBMISSION_UNAVAILABLE" };
    }
    return { ok: true, submissionId: String(payload?.data?.submissionId ?? "") };
  },
};
