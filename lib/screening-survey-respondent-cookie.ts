import type { NextResponse } from "next/server";
import { z } from "zod";

export const SCREENING_SURVEY_RESPONDENT_COOKIE_NAME = "live_screening_survey_respondent";
export const SCREENING_SURVEY_RESPONDENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const screeningSurveyRespondentProfileSchema = z.object({
  participantName: z.string().trim().min(1).max(200).nullable(),
  participantEmail: z.string().trim().email().nullable(),
  healthSystemId: z.string().trim().min(1).max(191).nullable(),
  healthSystemName: z.string().trim().min(1).max(200)
});

export type ScreeningSurveyRespondentProfile = z.infer<typeof screeningSurveyRespondentProfileSchema>;

export function parseScreeningSurveyRespondentProfileCookie(
  value: string | null | undefined
): ScreeningSurveyRespondentProfile | null {
  if (!value) return null;

  try {
    return screeningSurveyRespondentProfileSchema.parse(
      JSON.parse(decodeURIComponent(value))
    );
  } catch {
    return null;
  }
}

export function serializeScreeningSurveyRespondentProfileCookie(
  profile: ScreeningSurveyRespondentProfile
) {
  return encodeURIComponent(
    JSON.stringify(screeningSurveyRespondentProfileSchema.parse(profile))
  );
}

export function setScreeningSurveyRespondentProfileCookie(
  response: NextResponse,
  profile: ScreeningSurveyRespondentProfile
) {
  response.cookies.set({
    name: SCREENING_SURVEY_RESPONDENT_COOKIE_NAME,
    value: serializeScreeningSurveyRespondentProfileCookie(profile),
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SCREENING_SURVEY_RESPONDENT_COOKIE_MAX_AGE_SECONDS
  });
}
