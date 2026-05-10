import { z } from "zod";

import { ayaNotFound, badArg } from "../errors.js";
import type { Helper } from "../helper.js";
import { ayaIdFromSurahAya, surahAyaFromId } from "../quran.js";
import { ResponseFormatInput } from "../schemas.js";
import { arabize, header, renderResponse, type RenderedResponse } from "../format.js";

export const getAyaInputShape = {
    aya_id: z.number().int().min(1).max(6236).optional().describe("Cumulative aya id, 1..6236. Mutually exclusive with surah/aya."),
    surah: z.number().int().min(1).max(114).optional().describe("Surah number 1..114. Pair with `aya`."),
    aya: z.number().int().min(1).optional().describe("Aya number within the surah, 1..N. Pair with `surah`."),
    ...ResponseFormatInput,
};
export const getAyaInput = z.object(getAyaInputShape).strict();

export interface GetAyaOutput {
    aya_id: number;
    surah: number;
    surah_name: string;
    aya: number;
    body: string | null;
    amiri: string | null;
    majma: string | null;
}

export async function runGetAya(
    helper: Helper,
    args: z.infer<typeof getAyaInput>,
): Promise<RenderedResponse<GetAyaOutput>> {
    let resolvedId: number;
    if (args.aya_id !== undefined) {
        resolvedId = args.aya_id;
    } else if (args.surah !== undefined && args.aya !== undefined) {
        const id = ayaIdFromSurahAya(args.surah, args.aya);
        if (id === null) throw ayaNotFound(`surah=${args.surah} aya=${args.aya}`);
        resolvedId = id;
    } else {
        throw badArg("Provide either aya_id or both surah and aya.");
    }

    const sa = surahAyaFromId(resolvedId);
    if (!sa) throw ayaNotFound(String(resolvedId));

    const raw = await helper.request<{
        aya_id: number;
        found: boolean;
        body: string | null;
        amiri: string | null;
        majma: string | null;
    }>("get_aya", { aya_id: resolvedId });

    if (!raw.found) throw ayaNotFound(String(resolvedId));

    const out: GetAyaOutput = {
        aya_id: resolvedId,
        surah: sa.surah,
        surah_name: sa.surah_name,
        aya: sa.aya,
        body: raw.body,
        amiri: raw.amiri,
        majma: raw.majma,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, `${data.surah_name} ${arabize(data.surah)}:${arabize(data.aya)}`)];
        if (data.body) {
            lines.push("", header(3, "بالرسم الإملائي"));
            lines.push(data.body);
        }
        if (data.amiri) {
            lines.push("", header(3, "بالرسم العثماني (Amiri)"));
            lines.push(data.amiri);
        }
        return lines.join("\n");
    });
}
